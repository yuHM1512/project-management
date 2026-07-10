// API Base URL
const API_BASE = '/api';

// Avatar error fallback — called via onerror on every <img> avatar tag
function onAvatarError(img, fallbackClass) {
    img.onerror = null; // prevent infinite loop
    const name = (img.alt && img.alt !== 'Avatar') ? img.alt : (img.dataset.name || '?');
    const initials = name.split(' ').filter(Boolean).map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('') || '?';
    const cls = fallbackClass || img.dataset.fallbackClass || 'user-avatar';

    if (cls === '__parent__') {
        // img is inside a styled wrapper — just put initials in the parent
        img.parentNode.textContent = initials;
    } else {
        const div = document.createElement('div');
        div.className = cls;
        if (img.style.cssText) div.style.cssText = img.style.cssText;
        div.textContent = initials;
        img.parentNode.replaceChild(div, img);
    }
}

// Version Management - Auto update check
(function () {
    'use strict';

    function getCurrentVersion() {
        const scripts = document.getElementsByTagName('script');
        for (const script of scripts) {
            if (script.src && script.src.includes('app.v2.js')) {
                const url = new URL(script.src, window.location.origin);
                return url.searchParams.get('v') || null;
            }
        }
        return null;
    }

    async function checkForUpdate() {
        try {
            const response = await fetch(`${API_BASE}/version/js?t=${Date.now()}`);
            if (!response.ok) return;

            const data = await response.json();
            const serverVersion = data.version;
            if (!serverVersion) return;

            const currentVersion = getCurrentVersion();
            const storedVersion = localStorage.getItem('app_js_version');
            if (!storedVersion) {
                localStorage.setItem('app_js_version', serverVersion);
                return;
            }

            if (currentVersion && serverVersion !== currentVersion) {
                const reloadKey = `app_reload_attempted_${serverVersion}`;
                if (sessionStorage.getItem(reloadKey)) {
                    localStorage.setItem('app_js_version', serverVersion);
                    return;
                }

                sessionStorage.setItem(reloadKey, 'true');
                localStorage.setItem('app_js_version', serverVersion);
                const shouldReload = confirm('Có phiên bản mới của ứng dụng. Bạn có muốn tải lại ngay bây giờ?');
                if (shouldReload) {
                    window.location.reload();
                } else {
                    setTimeout(() => window.location.reload(), 30000);
                }
            } else if (serverVersion) {
                localStorage.setItem('app_js_version', data.version);
            }
        } catch (error) {
            console.debug('Version check failed:', error);
        }
    }

    const currentVersion = getCurrentVersion();
    if (currentVersion) {
        localStorage.setItem('app_js_current_version', currentVersion);
    }

    setInterval(checkForUpdate, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkForUpdate();
    });
    window.addEventListener('focus', checkForUpdate);
})();

// State
let currentView = 'dashboard';
let currentProjectId = null;
let projects = [];
let tasks = [];
let dashboardTasks = [];
let filteredTasks = [];
let users = [];
let mtclItems = [];
let currentMtclId = null;
let currentUser = null;
let authToken = null;
let currentProjectIsOwner = false;
let currentProject = null;
let currentTaskData = null;
let taskModalReadOnly = false;
let taskSeriesIndex = new Map();
let activeTaskSeriesKey = null;
let currentPersonalSection = 'account';
let currentAccountTab = 'profile';
let currentSettingsTab = 'users';
let projectObjectiveItems = [];
let currentProjectObjectiveFilter = '';
let workLogs = [];
let currentWorkLogId = null;
let workLogEditor = null;
let isWorkLogSectionInitialized = false;
let myWorkLogTasks = [];
let linkingSubtaskId = null;
let workLogSubtasksCache = {};
let notes = [];
let currentNoteId = null;
let notesEditor = null;
let isNotesSectionInitialized = false;
let noteTabsInitialized = false;
let meetings = [];
let currentMeetingId = null;
let meetingTabsInitialized = false;
let meetingContentEditor = null;
let activeMeetingContentType = null;
let meetingContentData = {};
let worklogTabsInitialized = false;
let todos = [];
let dashboardMonth = new Date();
let quarterlyYear = new Date().getFullYear();
let timelineTooltip = null;
let projectMembers = [];
let selectedProjectMemberId = null;
let projectModalTeamMembers = [];
let projectModalOwnerId = null;
let notificationsIndex = new Map();

const AT_RISK_DAYS_THRESHOLD = 5;
const AT_RISK_PROGRESS_THRESHOLD = 0.7;
const TILE_COLORS = [
    { bg: '#eef2ff', text: '#312e81' },
    { bg: '#ecfccb', text: '#365314' },
    { bg: '#dbeafe', text: '#1e3a8a' },
    { bg: '#fee2e2', text: '#7f1d1d' },
    { bg: '#fef9c3', text: '#78350f' },
    { bg: '#cffafe', text: '#134e4a' },
    { bg: '#fde68a', text: '#78350f' },
    { bg: '#f5d0fe', text: '#701a75' }
];

function getRouteFromURL() {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);

    if (path === '/' || path === '/dashboard') {
        return { view: 'dashboard' };
    } else if (path === '/projects') {
        return { view: 'projects' };
    } else if (path === '/board') {
        const projectId = searchParams.get('project');
        return {
            view: 'board',
            projectId: projectId ? parseInt(projectId, 10) : null
        };
    } else if (path === '/notifications') {
        return { view: 'notifications' };
    } else if (path === '/meeting-dashboard') {
        const meetingId = searchParams.get('meeting_id');
        const sessionId = searchParams.get('session_id');
        return {
            view: 'personal',
            personalSection: 'meeting',
            meetingDashboard: true,
            routeMeetingId: meetingId ? parseInt(meetingId, 10) : null,
            routeSessionId: sessionId ? parseInt(sessionId, 10) : null
        };
    } else if (path === '/settings' || path === '/users') {
        return {
            view: 'settings',
            settingsTab: searchParams.get('tab') || 'users'
        };
    } else if (path.startsWith('/personal')) {
        const section = searchParams.get('section') || 'account';
        const create = searchParams.get('create') === 'true';
        const projectId = searchParams.get('project_id');
        const taskId = searchParams.get('task_id');
        const subtaskId = searchParams.get('subtask_id');
        const meetingId = searchParams.get('meeting_id');
        const sessionId = searchParams.get('session_id');
        return {
            view: 'personal',
            personalSection: section,
            createWorkLog: create,
            workLogProjectId: projectId ? parseInt(projectId, 10) : null,
            workLogTaskId: taskId ? parseInt(taskId, 10) : null,
            workLogSubtaskId: subtaskId ? parseInt(subtaskId, 10) : null,
            routeMeetingId: meetingId ? parseInt(meetingId, 10) : null,
            routeSessionId: sessionId ? parseInt(sessionId, 10) : null,
        };
    }

    return { view: 'dashboard' };
}

function updateURL(view, params = {}) {
    let path = '/dashboard';
    const searchParams = new URLSearchParams();

    switch (view) {
        case 'dashboard':
            path = '/dashboard';
            break;
        case 'projects':
            path = '/projects';
            break;
        case 'board':
            path = '/board';
            if (params.projectId) searchParams.set('project', params.projectId);
            break;
        case 'notifications':
            path = '/notifications';
            break;
        case 'settings':
            path = '/settings';
            if (params.settingsTab) searchParams.set('tab', params.settingsTab);
            break;
        case 'personal':
            path = '/personal';
            if (params.personalSection) searchParams.set('section', params.personalSection);
            if (params.createWorkLog) searchParams.set('create', 'true');
            if (params.workLogProjectId) searchParams.set('project_id', params.workLogProjectId);
            if (params.workLogTaskId) searchParams.set('task_id', params.workLogTaskId);
            if (params.workLogSubtaskId) searchParams.set('subtask_id', params.workLogSubtaskId);
            if (params.meetingId) searchParams.set('meeting_id', params.meetingId);
            if (params.sessionId) searchParams.set('session_id', params.sessionId);
            break;
        case 'meetingDashboard':
            path = '/meeting-dashboard';
            if (params.meetingId) searchParams.set('meeting_id', params.meetingId);
            if (params.sessionId) searchParams.set('session_id', params.sessionId);
            break;
        default:
            path = '/dashboard';
    }

    const queryString = searchParams.toString();
    const newURL = queryString ? `${path}?${queryString}` : path;
    window.history.pushState({ view, ...params }, '', newURL);
}

async function navigateToRoute(route) {
    const { view, projectId, personalSection, settingsTab, createWorkLog, workLogProjectId, workLogTaskId, workLogSubtaskId, meetingDashboard, routeMeetingId, routeSessionId } = route;
    if (!meetingDashboard) {
        const dashboardOverlay = document.getElementById('pmDashboardOverlay');
        if (dashboardOverlay) dashboardOverlay.style.display = 'none';
    }

    if (projectId !== undefined) {
        currentProjectId = projectId;
    }
    if (personalSection !== undefined) {
        currentPersonalSection = personalSection;
    }
    if (settingsTab !== undefined) {
        currentSettingsTab = settingsTab;
    }

    switchView(view, false);

    if (view === 'board' && projectId) {
        const projectSelect = document.getElementById('projectSelect');
        if (projectSelect) {
            projectSelect.value = projectId;
            selectProject(projectId, true);
        }
    }

    if (view === 'personal' && personalSection === 'work' && createWorkLog && workLogProjectId && workLogTaskId && workLogSubtaskId) {
        await new Promise(resolve => setTimeout(resolve, 100));
        await ensureWorkLogSection();
        setWorklogTab('form', { skipReset: true });
        resetWorkLogForm(false);
        populateWorkLogSelectors(workLogProjectId, workLogTaskId);
        await populateWorkLogSubtasks(workLogTaskId, workLogSubtaskId);

        try {
            const subtasks = await apiCall(`/subtasks/task/${workLogTaskId}`);
            if (Array.isArray(subtasks)) {
                const subtask = subtasks.find(s => s.id === workLogSubtaskId);
                if (subtask?.title) {
                    const titleInput = document.getElementById('workLogTitle');
                    if (titleInput) {
                        titleInput.value = subtask.title;
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to fetch subtask title, continuing without pre-fill:', error);
        }

        linkingSubtaskId = workLogSubtaskId;
        setTimeout(() => {
            const titleInput = document.getElementById('workLogTitle');
            if (titleInput) {
                titleInput.focus();
                titleInput.select();
            }
        }, 300);
    }

    if (view === 'personal' && personalSection === 'meeting' && meetingDashboard && routeMeetingId) {
        await new Promise(resolve => setTimeout(resolve, 100));
        await openMeetingDashboardRoute(routeMeetingId, routeSessionId, false);
    }

    // Deep-link đến popup nhập nội dung phiên họp (từ notification hoặc reload trang)
    if (view === 'personal' && personalSection === 'meeting' && !meetingDashboard && routeMeetingId && routeSessionId) {
        showMeetingMode('periodic');
        await new Promise(resolve => setTimeout(resolve, 100));
        await _openPmSessionDetail(routeMeetingId, routeSessionId);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    if (!(await initAuth())) return;
    syncEditorialIcons();
    initTimelineTooltip();
    initThreadImageViewer();
    initEventListeners();
    updateTaskButtonState();
    const route = getRouteFromURL();
    navigateToRoute(route);
    window.addEventListener('popstate', () => {
        navigateToRoute(getRouteFromURL());
    });
    await Promise.all([loadProjects(), loadDashboard(), loadUsers(), loadNotificationCount(), loadProjectTypes()]);
});

function syncEditorialIcons() {
    const emojiBtn = document.getElementById('emojiPickerBtn');
    if (emojiBtn) {
        emojiBtn.innerHTML = '<span class="material-symbols-outlined">sentiment_satisfied</span>';
        emojiBtn.setAttribute('title', 'Chèn emoji');
    }

    const attachmentBtn = document.getElementById('btnCommentAttachment');
    if (attachmentBtn) {
        attachmentBtn.innerHTML = '<span class="material-symbols-outlined">attach_file</span> Đính kèm';
    }

    const printBtn = document.querySelector('#meetingReportModal .btn-secondary[onclick="window.print()"]');
    if (printBtn) {
        printBtn.innerHTML = '<span class="material-symbols-outlined">print</span> In biên bản';
    }
}

async function initAuth() {
    authToken = localStorage.getItem('pm_token');
    if (!authToken) {
        window.location.href = '/login';
        return false;
    }

    const me = await apiCall('/auth/me');
    if (!me) {
        forceLogout();
        return false;
    }

    currentUser = me;
    updateUserBadge();
    return true;
}

function updateUserBadge() {
    const avatar = document.getElementById('userAvatar');
    const nameLabel = document.getElementById('userDisplayName');
    if (!currentUser) return;
    
    // Hiển thị avatar nếu có
    if (avatar) {
        if (currentUser.avatar_url) {
            avatar.innerHTML = `<img src="${currentUser.avatar_url}" alt="${escapeHtml(currentUser.full_name || currentUser.username || 'U')}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="onAvatarError(this,'__parent__')">`;
        } else {
            const initials = (currentUser.full_name || currentUser.username || 'U')
                .split(' ')
                .map(part => part.charAt(0).toUpperCase())
                .slice(0, 2)
                .join('');
            avatar.textContent = initials || '👤';
        }
    }
    if (nameLabel) {
        nameLabel.textContent = currentUser.full_name || currentUser.username;
    }
    
    // Show/hide admin features
    const adminOnly = document.querySelectorAll('.admin-only');
    const isAdmin = currentUser.role === 'admin';
    adminOnly.forEach(el => {
        el.style.display = isAdmin ? '' : 'none';
    });
}

function forceLogout() {
    localStorage.removeItem('pm_token');
    window.location.href = '/login';
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed ? 'true' : 'false');
}

function getSidebarSectionState() {
    try {
        return JSON.parse(localStorage.getItem('sidebarSectionCollapsed') || '{}');
    } catch (error) {
        console.warn('Failed to parse sidebar section state', error);
        return {};
    }
}

function applySidebarSectionState(sectionName, isCollapsed) {
    const section = document.querySelector(`.sidebar-section[data-section="${sectionName}"]`);
    const toggle = document.querySelector(`[data-section-toggle="${sectionName}"]`);
    if (!section || !toggle) return;

    section.classList.toggle('is-collapsed', isCollapsed);
    toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
}

function toggleSidebarSection(sectionName) {
    const section = document.querySelector(`.sidebar-section[data-section="${sectionName}"]`);
    if (!section) return;

    const isCollapsed = !section.classList.contains('is-collapsed');
    applySidebarSectionState(sectionName, isCollapsed);

    const sectionState = getSidebarSectionState();
    sectionState[sectionName] = isCollapsed;
    localStorage.setItem('sidebarSectionCollapsed', JSON.stringify(sectionState));
}

function initSidebarSectionToggles() {
    const sectionState = getSidebarSectionState();

    document.querySelectorAll('[data-section-toggle]').forEach(toggle => {
        const sectionName = toggle.getAttribute('data-section-toggle');
        applySidebarSectionState(sectionName, Boolean(sectionState[sectionName]));
        toggle.addEventListener('click', () => toggleSidebarSection(sectionName));
    });
}

// Event Listeners
function initEventListeners() {
    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }
    
    // Load sidebar state from localStorage
    const sidebarState = localStorage.getItem('sidebarCollapsed');
    if (sidebarState === 'true') {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.add('collapsed');
        }
    }

    initSidebarSectionToggles();
    
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.getAttribute('data-view');
            switchView(view);
        });
    });
    document.getElementById('logoLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.history.pushState({ view: 'dashboard' }, '', '/');
        switchView('dashboard', false);
    });

    // Project buttons
    document.getElementById('btnNewProject').addEventListener('click', () => openProjectModal());
    document.getElementById('btnCreateProject').addEventListener('click', () => openProjectModal());
    document.getElementById('closeProjectModal').addEventListener('click', () => closeProjectModal());
    document.getElementById('cancelProject').addEventListener('click', () => closeProjectModal());
    document.getElementById('projectForm').addEventListener('submit', handleProjectSubmit);
    document.getElementById('projectObjectiveFilter')?.addEventListener('change', handleProjectObjectiveFilterChange);
    document.getElementById('projectObjectiveGroup')?.addEventListener('change', syncProjectObjectiveSelection);
    localizeProjectModal();

    // Task buttons
    document.getElementById('btnCreateTask').addEventListener('click', () => openTaskModal());
    document.getElementById('closeTaskModal').addEventListener('click', () => closeTaskModal());
    document.getElementById('cancelTask').addEventListener('click', () => closeTaskModal());
    document.getElementById('taskForm').addEventListener('submit', handleTaskSubmit);
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            forceLogout();
        });
    }
    const addSubtaskBtn = document.getElementById('btnAddSubtask');
    if (addSubtaskBtn) {
        addSubtaskBtn.addEventListener('click', handleAddSubtask);
    }
    const subtaskUploadInput = document.getElementById('subtaskUploadInput');
    if (subtaskUploadInput) {
        subtaskUploadInput.addEventListener('change', handleSubtaskUpload);
    }
    document.getElementById('acknowledgeTaskBtn')?.addEventListener('click', acknowledgeCurrentTask);
    document.getElementById('completeTaskBtn')?.addEventListener('click', completeCurrentTask);
    ['taskFrequency', 'taskPeriodStart', 'taskPeriodEnd', 'taskRepeatUntil'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', handleTaskScheduleChange);
    });
    ['taskOneTimeFrom', 'taskOneTimeTo'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', updateTaskPeriodPreview);
    });
    document.getElementById('taskTypeToggle')?.addEventListener('click', e => {
        const btn = e.target.closest('.task-type-btn');
        if (!btn) return;
        _setTaskType(btn.dataset.type);
    });
    document.getElementById('assigneeDropdownToggle')?.addEventListener('click', (event) => {
        event.stopPropagation();
        document.getElementById('taskAssigneesContainer')?.classList.toggle('open');
    });
    document.getElementById('taskAssigneesContainer')?.addEventListener('click', (event) => {
        event.stopPropagation();
    });
    document.getElementById('memberPickerToggle')?.addEventListener('click', (event) => {
        event.stopPropagation();
        document.getElementById('projectMemberPickerContainer')?.classList.toggle('open');
    });
    document.getElementById('projectMemberPickerContainer')?.addEventListener('click', (event) => {
        event.stopPropagation();
    });
    document.addEventListener('click', () => {
        document.getElementById('taskAssigneesContainer')?.classList.remove('open');
        document.getElementById('projectMemberPickerContainer')?.classList.remove('open');
    });
    
    // Comments
    document.getElementById('btnAddComment')?.addEventListener('click', handleAddComment);
    document.getElementById('btnCommentAttachment')?.addEventListener('click', () => {
        document.getElementById('commentAttachmentInput')?.click();
    });
    document.getElementById('commentAttachmentInput')?.addEventListener('change', handleCommentAttachmentPreview);

    // Project select
    document.getElementById('projectSelect').addEventListener('change', (e) => {
        const selectedId = e.target.value ? parseInt(e.target.value) : null;
        if (selectedId) {
            selectProject(selectedId);
        } else {
            currentProjectId = null;
            currentProject = null;
            currentProjectIsOwner = false;
            updateRecentProjectsVisibility();
            updateTaskButtonState();
            stopThreadPolling();
            document.getElementById('projectSummarySection').style.display = 'none';
        }
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearchInput);
    }

    // Modal close on backdrop click
    document.getElementById('projectModal').addEventListener('click', (e) => {
        if (e.target.id === 'projectModal') closeProjectModal();
    });
    document.getElementById('taskModal').addEventListener('click', (e) => {
        if (e.target.id === 'taskModal') closeTaskModal();
    });
    document.getElementById('userModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'userModal') closeUserModal();
    });
    document.getElementById('mtclModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'mtclModal') closeMtclModal();
    });
    document.getElementById('recurringTasksModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'recurringTasksModal') closeRecurringTasksModal();
    });
    document.getElementById('closeRecurringTasksModal')?.addEventListener('click', closeRecurringTasksModal);

    // User management
    document.getElementById('btnCreateUser')?.addEventListener('click', () => openCreateUserModal());
    document.getElementById('closeUserModal')?.addEventListener('click', () => closeUserModal());
    document.getElementById('cancelUser')?.addEventListener('click', () => closeUserModal());
    document.getElementById('userForm')?.addEventListener('submit', handleUserSubmit);
    document.getElementById('userAvatarInput')?.addEventListener('change', handleAvatarPreview);
    document.getElementById('btnAddUserFieldGroup')?.addEventListener('click', () => addUserFieldGroupRow());
    document.getElementById('closeMtclModal')?.addEventListener('click', closeMtclModal);
    document.getElementById('cancelMtcl')?.addEventListener('click', closeMtclModal);
    document.getElementById('mtclForm')?.addEventListener('submit', handleMtclSubmit);

    // Board tabs
    document.querySelectorAll('.board-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.getAttribute('data-tab');
            switchBoardTab(tabName);
        });
    });

    // Thread
    document.getElementById('btnSendThread')?.addEventListener('click', handleSendThread);
    const threadInput = document.getElementById('threadInput');
    if (threadInput) {
        threadInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !isMentionDropdownVisible()) {
                e.preventDefault();
                handleSendThread();
            }
        });
        threadInput.addEventListener('input', handleThreadInput);
        threadInput.addEventListener('keydown', handleThreadInputKeydown);
        threadInput.addEventListener('paste', handleThreadPaste);
    }

    initPersonalNavigation();
    initSettingsNavigation();

    document.getElementById('closeWorkLogLinkModal')?.addEventListener('click', closeWorkLogLinkModal);
    document.getElementById('workLogLinkModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'workLogLinkModal') closeWorkLogLinkModal();
    });

    document.getElementById('dashboardPrevMonth')?.addEventListener('click', async () => {
        dashboardMonth.setMonth(dashboardMonth.getMonth() - 1);
        renderDashboardCalendar();
        await loadTodos(dashboardMonth);
    });
    document.getElementById('dashboardNextMonth')?.addEventListener('click', async () => {
        dashboardMonth.setMonth(dashboardMonth.getMonth() + 1);
        renderDashboardCalendar();
        await loadTodos(dashboardMonth);
    });
    document.getElementById('prevYearBtn')?.addEventListener('click', () => {
        quarterlyYear--;
        renderGanttChartQuy();
    });
    document.getElementById('nextYearBtn')?.addEventListener('click', () => {
        quarterlyYear++;
        renderGanttChartQuy();
    });
}

function handleSearchInput(event) {
    const keyword = (event.target.value || '').trim().toLowerCase();
    filteredTasks = keyword
        ? tasks.filter(task => {
            const tags = (task.tags || '').toLowerCase();
            const title = (task.title || '').toLowerCase();
            const description = (task.description || '').toLowerCase();
            return tags.includes(keyword) || title.includes(keyword) || description.includes(keyword);
        })
        : [...tasks];
    updateProjectSummaryProgress();
    
    // Render based on active tab
    const statusTab = document.getElementById('boardTabStatus');
    const timelineTab = document.getElementById('boardTabTimeline');
    const overviewTab = document.getElementById('boardTabOverview');
    const workloadTab = document.getElementById('boardTabWorkload');
    
    if (statusTab && statusTab.classList.contains('active')) {
        renderTasks();
    }
    if (timelineTab && timelineTab.classList.contains('active')) {
        renderGanttChartQuy();
    }
    if (overviewTab && overviewTab.classList.contains('active')) {
        renderTaskOverviewBoard();
    }
    if (workloadTab && workloadTab.classList.contains('active')) {
        renderTeamWorkloadBoard();
    }
}

// View Switching
function switchView(view, shouldUpdateURL = true) {
    currentView = view;
    syncViewBodyState(view);
    
    // Update nav
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    const navLink = document.querySelector(`[data-view="${view}"]`);
    if (navLink) {
        navLink.classList.add('active');
    }
    const headerNotifBtn = document.getElementById('headerNotifBtn');
    if (headerNotifBtn) headerNotifBtn.classList.toggle('active', view === 'notifications');

    // Update content
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        v.hidden = true;
    });
    const activeView = document.getElementById(`${view}View`);
    if (activeView) {
        activeView.classList.add('active');
        activeView.hidden = false;
    }
    updateRecentProjectsVisibility();
    
    // Update title
    const titles = {
        dashboard: 'Dashboard',
        projects: 'Projects',
        personal: 'Personal',
        board: 'Board',
        settings: 'Settings',
        notifications: 'Notifications'
    };

    if (shouldUpdateURL) {
        const routeParams = {};
        if (view === 'board' && currentProjectId) {
            routeParams.projectId = currentProjectId;
        }
        if (view === 'personal') {
            routeParams.personalSection = currentPersonalSection || 'account';
        }
        if (view === 'settings') {
            routeParams.settingsTab = currentSettingsTab || 'users';
        }
        updateURL(view, routeParams);
    }
    
    // Load data for specific views
    document.getElementById('pageTitle').textContent = titles[view] || 'Dashboard';
    
    // Load view-specific data
    if (view === 'dashboard') {
        loadDashboard();
    } else if (view === 'projects') {
        loadProjects();
    } else if (view === 'notifications') {
        loadNotifications();
    } else if (view === 'board') {
        // Đảm bảo tab Status active mặc định
        switchBoardTab('status');
        if (currentProjectId) {
            loadTasks(currentProjectId, false);
        }
        updateProjectSummaryInfo();
    } else if (view === 'personal') {
        stopThreadPolling();
        stopActivityPolling();
        document.getElementById('projectSummarySection').style.display = 'none';
        showPersonalSection(currentPersonalSection || 'account', true, shouldUpdateURL);
    } else if (view === 'settings') {
        stopThreadPolling();
        stopActivityPolling();
        document.getElementById('projectSummarySection').style.display = 'none';
        showPersonalSection(currentPersonalSection || 'account', false, false);
        showSettingsTab(currentSettingsTab || 'users', shouldUpdateURL);
    } else {
        stopThreadPolling(); // Dừng polling khi chuyển sang view khác
        stopActivityPolling(); // Dừng activity polling
        document.getElementById('projectSummarySection').style.display = 'none';
        showPersonalSection(currentPersonalSection || 'account', false, false);
    }
}

function initPersonalNavigation() {
    const personalList = document.getElementById('personalList');
    if (personalList) {
        personalList.addEventListener('click', (event) => {
            const link = event.target.closest('[data-personal]');
            if (!link) return;
            event.preventDefault();
            const section = link.getAttribute('data-personal') || 'account';
            currentPersonalSection = section;
            switchView('personal');
            showPersonalSection(section);
        });
    }
    const accountForm = document.getElementById('accountForm');
    accountForm?.addEventListener('submit', handleAccountSubmit);
    
    const changePasswordForm = document.getElementById('changePasswordForm');
    changePasswordForm?.addEventListener('submit', handleChangePassword);
    const avatarInput = document.getElementById('accountAvatarUrl');
    avatarInput?.addEventListener('input', (e) => updateAccountAvatarPreview(e.target.value));
    document.getElementById('accountTabs')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-account-tab]');
        if (!button) return;
        setAccountTab(button.getAttribute('data-account-tab') || 'profile');
    });
    document.getElementById('btnOpenRecurringAdminReport')?.addEventListener('click', openRecurringAdminReport);

    document.getElementById('btnNewWorkLog')?.addEventListener('click', resetWorkLogForm);
    document.getElementById('workLogForm')?.addEventListener('submit', handleWorkLogSubmit);
    document.getElementById('btnResetWorkLog')?.addEventListener('click', resetWorkLogForm);
    document.getElementById('btnDeleteWorkLog')?.addEventListener('click', handleDeleteWorkLog);
    document.getElementById('workLogAttachmentInput')?.addEventListener('change', handleWorkLogAttachmentUpload);
    document.getElementById('workLogProject')?.addEventListener('change', handleWorkLogProjectChange);
    document.getElementById('workLogTask')?.addEventListener('change', handleWorkLogTaskChange);

    document.getElementById('btnNewNote')?.addEventListener('click', resetNoteForm);
    document.getElementById('noteForm')?.addEventListener('submit', handleNoteSubmit);
    document.getElementById('btnDeleteNote')?.addEventListener('click', handleDeleteNote);

    document.getElementById('meetingForm')?.addEventListener('submit', handleMeetingSubmit);
    document.getElementById('btnResetMeeting')?.addEventListener('click', () => resetMeetingForm(true));
    document.getElementById('btnDeleteMeeting')?.addEventListener('click', handleDeleteMeeting);
    document.getElementById('meetingEmployee')?.addEventListener('change', handleMeetingEmployeeChange);
    document.getElementById('closeMeetingContentModal')?.addEventListener('click', closeMeetingContentEditor);
    document.getElementById('cancelMeetingContent')?.addEventListener('click', closeMeetingContentEditor);
    document.getElementById('saveMeetingContent')?.addEventListener('click', saveMeetingContent);
    document.getElementById('meetingContentModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'meetingContentModal') closeMeetingContentEditor();
    });
    document.getElementById('closeMeetingReportModal')?.addEventListener('click', closeMeetingReportModal);
    document.getElementById('btnCloseMeetingReport')?.addEventListener('click', closeMeetingReportModal);
    document.getElementById('btnEditMeetingFromReport')?.addEventListener('click', editMeetingFromReport);
    document.getElementById('btnMeetingReportFullscreen')?.addEventListener('click', toggleMeetingReportFullscreen);
    document.querySelectorAll('.meeting-content-checkbox').forEach((checkbox) => {
        checkbox.addEventListener('change', () => setMeetingContentSelected(checkbox.value, checkbox.checked));
    });

    document.getElementById('todoForm')?.addEventListener('submit', handleTodoSubmit);
    document.getElementById('btnAddTodoRow')?.addEventListener('click', addTodoRow);
    addTodoRow();
    const todoDateInput = document.getElementById('todoDate');
    if (todoDateInput) {
        if (!todoDateInput.value) {
            todoDateInput.value = new Date().toISOString().slice(0, 10);
        }
        todoDateInput.addEventListener('change', async () => {
            const referenceDate = todoDateInput.value ? new Date(todoDateInput.value) : new Date();
            await loadTodos(referenceDate);
            renderTodoDayList();
        });
    }

    showPersonalSection(currentPersonalSection, false, false);
}

function syncViewBodyState(view = currentView) {
    document.body.dataset.currentView = view || '';
    document.body.dataset.personalSection = view === 'personal' ? (currentPersonalSection || 'account') : '';
}

function updateRecentProjectsVisibility() {
    const recentProjectsSection = document.getElementById('recentProjectsSection');
    if (!recentProjectsSection) return;
    recentProjectsSection.hidden = currentView !== 'dashboard';
    recentProjectsSection.style.display = currentView === 'dashboard' ? '' : 'none';
}

function initSettingsNavigation() {
    const tabbar = document.getElementById('settingsTabbar');
    if (!tabbar) return;

    tabbar.addEventListener('click', (event) => {
        const button = event.target.closest('[data-settings-tab]');
        if (!button) return;
        const tab = button.getAttribute('data-settings-tab') || 'users';
        showSettingsTab(tab);
    });
}

function showSettingsTab(tab = 'users', shouldUpdateURL = true) {
    currentSettingsTab = tab;
    updateRecentProjectsVisibility();
    document.getElementById('projectSummarySection')?.style.setProperty('display', 'none');

    document.querySelectorAll('.settings-tab').forEach((button) => {
        button.classList.toggle('active', button.getAttribute('data-settings-tab') === tab);
    });

    document.querySelectorAll('.settings-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`settingsPanel${tab.charAt(0).toUpperCase()}${tab.slice(1)}`)?.classList.add('active');

    if (shouldUpdateURL && currentView === 'settings') {
        updateURL('settings', { settingsTab: tab });
    }

    if (tab === 'users' && currentUser?.role === 'admin') {
        loadUsersList();
    }
    if (tab === 'mtcl') {
        loadMtclList();
    }
    if (tab === 'tracking') {
        loadRecurringTasksMatrix();
    }
}

function showPersonalSection(section = 'account', highlightNav = true, shouldUpdateURL = true) {
    currentPersonalSection = section;
    syncViewBodyState(currentView);
    updateRecentProjectsVisibility();
    document.getElementById('projectSummarySection')?.style.setProperty('display', 'none');
    if (shouldUpdateURL && currentView === 'personal') {
        updateURL('personal', { personalSection: section });
    }
    document.querySelectorAll('#personalList .personal-link').forEach(link => {
        const linkSection = link.getAttribute('data-personal');
        if (highlightNav) {
            link.classList.toggle('active', linkSection === section);
        } else {
            link.classList.remove('active');
        }
    });
    const sectionMap = {
        todos: document.getElementById('personalSectionTodos'),
        meeting: document.getElementById('personalSectionMeeting'),
        notes: document.getElementById('personalSectionNotes'),
        work: document.getElementById('personalSectionWork'),
        account: document.getElementById('personalSectionAccount')
    };
    Object.entries(sectionMap).forEach(([key, element]) => {
        if (!element) return;
        element.classList.toggle('active', key === section);
    });
    if (section === 'account') {
        populateAccountForm();
        ensureAccountSection();
    } else if (section === 'todos') {
        ensureTodosSection();
    } else if (section === 'work') {
        ensureWorkLogSection();
    } else if (section === 'notes') {
        ensureNotesSection();
    } else if (section === 'meeting') {
        ensureMeetingSection();
    }
    updatePersonalSectionHeader(section);
}

function updatePersonalSectionHeader(section) {
    const title = document.querySelector('#personalView .view-title-stack h2');
    const description = document.querySelector('#personalView .view-title-stack p');
    const pageTitle = document.getElementById('pageTitle');
    const copy = {
        todos: {
            title: 'To-do List',
            description: 'Lên lịch công việc cá nhân theo ngày và theo dõi phần việc cần xử lý.'
        },
        meeting: {
            title: 'Meeting',
            description: 'Quản lý danh sách cuộc họp, nội dung trao đổi và phần chuẩn bị trước họp.'
        },
        notes: {
            title: 'My Notes',
            description: 'Ghi chú nhanh, lưu ý công việc và nội dung cần theo dõi riêng.'
        },
        work: {
            title: 'Work Log',
            description: 'Ghi nhận nhật ký công việc, liên kết dự án/task và lưu bằng chứng thực hiện.'
        },
        account: {
            title: 'Account',
            description: 'Cập nhật hồ sơ cá nhân, thông tin đơn vị và thiết lập tài khoản.'
        }
    };
    const current = copy[section] || copy.account;
    if (title) title.textContent = current.title;
    if (description) description.textContent = current.description;
    if (pageTitle && currentView === 'personal') pageTitle.textContent = current.title;
}

async function ensureMeetingSection() {
    // Always reset to one-off mode when navigating to the meeting section
    showMeetingMode('one');
    if (!meetingTabsInitialized) {
        initMeetingTabs();
    }
    const createTab = document.getElementById('btnCreateMeetingTab');
    const isAdmin = currentUser?.role === 'admin';
    if (createTab) {
        createTab.style.display = isAdmin ? '' : 'none';
    }
    if (isAdmin && users.length === 0) {
        await loadUsers();
    }
    updateMeetingEmployeeOptions();
    await loadMeetings();
    if (isAdmin && !currentMeetingId) {
        resetMeetingForm(false);
    }
}

function initMeetingTabs() {
    document.querySelectorAll('.meeting-tab').forEach((tab) => {
        tab.addEventListener('click', () => setMeetingTab(tab.getAttribute('data-meeting-tab') || 'list'));
    });
    meetingTabsInitialized = true;
}

function setMeetingTab(tabName) {
    document.querySelectorAll('.meeting-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.getAttribute('data-meeting-tab') === tabName);
    });
    document.querySelectorAll('.meeting-tab-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`meetingTab${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}`)?.classList.add('active');
}

async function loadMeetings() {
    const data = await apiCall('/meetings/');
    if (data) {
        meetings = data;
        renderMeetingList();
    }
}

function renderMeetingList() {
    const container = document.getElementById('meetingList');
    if (!container) return;
    if (!meetings.length) {
        container.innerHTML = '<div class="empty-state">Chưa có cuộc họp nào.</div>';
        return;
    }
    container.innerHTML = meetings.map((meeting) => {
        const active = meeting.id === currentMeetingId ? 'active' : '';
        const timeText = formatMeetingDateTime(meeting.time);
        const employeeName = meeting.employee_name || meeting.employee_username || `User #${meeting.employee_id}`;
        const contents = Array.isArray(meeting.contents) && meeting.contents.length
            ? meeting.contents.map(getMeetingContentLabel).join(', ')
            : 'Chưa chọn nội dung';
        return `
            <div class="meeting-item ${active}" onclick="openMeetingReport(${meeting.id})">
                <div class="meeting-item-title">${escapeHtml(employeeName)}</div>
                <div class="meeting-item-meta">
                    <span>${escapeHtml(timeText)}</span>
                    <span>${escapeHtml(meeting.location || '--')}</span>
                    <span>${escapeHtml(contents)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function updateMeetingEmployeeOptions() {
    const select = document.getElementById('meetingEmployee');
    if (!select) return;
    const selectedValue = select.value;
    const currentDepartment = (currentUser?.department || '').trim();
    const eligibleUsers = users.filter((user) => {
        if (user.id === currentUser?.id) return false;
        if (!currentDepartment) return true;
        return (user.department || '').trim() === currentDepartment;
    });
    select.innerHTML = '<option value="">-- Chọn nhân viên --</option>' + eligibleUsers.map((user) => {
        const label = [user.full_name || user.username || `User #${user.id}`, user.position, user.team]
            .filter(Boolean)
            .join(' - ');
        return `<option value="${user.id}">${escapeHtml(label)}</option>`;
    }).join('');
    if (selectedValue && eligibleUsers.some((user) => String(user.id) === String(selectedValue))) {
        select.value = selectedValue;
    }
}

function resetMeetingForm(focusForm = true) {
    currentMeetingId = null;
    meetingContentData = {};
    document.getElementById('meetingForm')?.reset();
    const idInput = document.getElementById('meetingId');
    if (idInput) idInput.value = '';
    const timeInput = document.getElementById('meetingTime');
    if (timeInput) timeInput.value = toDatetimeLocalValue(new Date());
    const departmentInput = document.getElementById('meetingDepartment');
    if (departmentInput) departmentInput.value = currentUser?.department || '';
    const teamInput = document.getElementById('meetingTeam');
    if (teamInput) teamInput.value = '';
    document.querySelectorAll('.meeting-content-checkbox').forEach((checkbox) => {
        checkbox.checked = false;
        updateMeetingContentItemState(checkbox.value, false);
    });
    const status = document.getElementById('meetingFooterStatus');
    if (status) {
        status.textContent = '';
        status.classList.remove('success', 'error');
    }
    document.getElementById('btnDeleteMeeting')?.style.setProperty('display', 'none');
    renderMeetingList();
    if (focusForm && currentUser?.role === 'admin') setMeetingTab('create');
}

function handleMeetingEmployeeChange() {
    const employeeId = Number(document.getElementById('meetingEmployee')?.value);
    const employee = users.find((user) => user.id === employeeId);
    const teamInput = document.getElementById('meetingTeam');
    if (teamInput) teamInput.value = employee?.team || '';
}

function toggleMeetingContent(type) {
    const checkbox = document.querySelector(`.meeting-content-item[data-content-type="${type}"] .meeting-content-checkbox`);
    if (!checkbox) return;
    checkbox.checked = !checkbox.checked;
    setMeetingContentSelected(type, checkbox.checked);
}

function setMeetingContentSelected(type, selected) {
    updateMeetingContentItemState(type, selected);
    if (selected && !meetingContentData[type]) {
        meetingContentData[type] = '';
    }
    if (!selected) {
        delete meetingContentData[type];
    }
}

function updateMeetingContentItemState(type, selected) {
    const item = document.querySelector(`.meeting-content-item[data-content-type="${type}"]`);
    const editButton = document.querySelector(`.btn-edit-content[data-content-type="${type}"]`);
    item?.classList.toggle('selected', selected);
    if (editButton) editButton.style.display = selected ? 'inline-flex' : 'none';
}

function initMeetingContentEditor() {
    if (meetingContentEditor || typeof Quill === 'undefined') return;
    const editorEl = document.getElementById('meetingContentEditor');
    if (!editorEl) return;
    meetingContentEditor = new Quill(editorEl, {
        theme: 'snow',
        placeholder: 'Nhập nội dung trao đổi...',
        modules: {
            toolbar: [
                [{ header: [1, 2, false] }],
                ['bold', 'italic', 'underline'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['link', 'blockquote'],
                ['clean']
            ]
        }
    });
}

function openMeetingContentEditor(type) {
    activeMeetingContentType = type;
    initMeetingContentEditor();
    document.getElementById('meetingContentModalTitle').textContent = getMeetingContentLabel(type);
    document.getElementById('meetingContentSubtitle').textContent = 'Chuẩn bị nội dung chi tiết cho hạng mục này.';
    const suggestions = MEETING_CONTENT_SUGGESTIONS[type] || [];
    document.getElementById('meetingSuggestions').innerHTML = suggestions
        .map((suggestion) => `<button type="button" class="meeting-suggestion-item" onclick="insertMeetingSuggestion('${type}', '${escapeHtml(suggestion).replace(/'/g, '&#39;')}')">${escapeHtml(suggestion)}</button>`)
        .join('');
    if (meetingContentEditor) {
        meetingContentEditor.root.innerHTML = meetingContentData[type] || '';
    }
    document.getElementById('meetingContentModal')?.classList.add('active');
}

function insertMeetingSuggestion(type, suggestion) {
    initMeetingContentEditor();
    const text = String(suggestion || '');
    if (meetingContentEditor) {
        meetingContentEditor.clipboard.dangerouslyPasteHTML(meetingContentEditor.getLength() - 1, `<p>${escapeHtml(text)}</p>`);
    }
}

function saveMeetingContent() {
    if (!activeMeetingContentType) return;
    meetingContentData[activeMeetingContentType] = meetingContentEditor ? meetingContentEditor.root.innerHTML : '';
    closeMeetingContentEditor();
}

function closeMeetingContentEditor() {
    activeMeetingContentType = null;
    document.getElementById('meetingContentModal')?.classList.remove('active');
}

async function handleMeetingSubmit(event) {
    event.preventDefault();
    if (currentUser?.role !== 'admin') {
        alert('Chỉ admin được tạo hoặc chỉnh sửa cuộc họp.');
        return;
    }
    const employeeId = Number(document.getElementById('meetingEmployee')?.value);
    if (!employeeId) {
        alert('Vui lòng chọn nhân viên.');
        return;
    }
    const contents = Array.from(document.querySelectorAll('.meeting-content-checkbox:checked')).map((checkbox) => checkbox.value);
    const payload = {
        time: new Date(document.getElementById('meetingTime')?.value || new Date()).toISOString(),
        location: document.getElementById('meetingLocation')?.value || 'Phòng họp',
        department: document.getElementById('meetingDepartment')?.value || currentUser?.department || null,
        employee_id: employeeId,
        team: document.getElementById('meetingTeam')?.value || null,
        contents,
        content_data: meetingContentData
    };
    const status = document.getElementById('meetingFooterStatus');
    if (status) {
        status.textContent = 'Đang lưu...';
        status.classList.remove('success', 'error');
    }
    const result = currentMeetingId
        ? await apiCall(`/meetings/${currentMeetingId}`, 'PUT', payload)
        : await apiCall('/meetings/', 'POST', payload);
    if (result) {
        currentMeetingId = result.id;
        await loadMeetings();
        populateMeetingForm(result);
        if (status) {
            status.textContent = 'Đã lưu cuộc họp.';
            status.classList.add('success');
            setTimeout(() => status.textContent = '', 2000);
        }
    } else if (status) {
        status.textContent = 'Lưu thất bại.';
        status.classList.add('error');
    }
}

function populateMeetingForm(meeting) {
    currentMeetingId = meeting.id;
    meetingContentData = meeting.content_data || {};
    document.getElementById('meetingId')?.setAttribute('value', String(meeting.id));
    const timeInput = document.getElementById('meetingTime');
    if (timeInput) timeInput.value = toDatetimeLocalValue(meeting.time);
    const locationInput = document.getElementById('meetingLocation');
    if (locationInput) locationInput.value = meeting.location || 'Phòng họp';
    const departmentInput = document.getElementById('meetingDepartment');
    if (departmentInput) departmentInput.value = meeting.department || currentUser?.department || '';
    updateMeetingEmployeeOptions();
    const employeeInput = document.getElementById('meetingEmployee');
    if (employeeInput) employeeInput.value = String(meeting.employee_id || '');
    const teamInput = document.getElementById('meetingTeam');
    if (teamInput) teamInput.value = meeting.team || '';
    const selectedContents = new Set(Array.isArray(meeting.contents) ? meeting.contents : []);
    document.querySelectorAll('.meeting-content-checkbox').forEach((checkbox) => {
        checkbox.checked = selectedContents.has(checkbox.value);
        updateMeetingContentItemState(checkbox.value, checkbox.checked);
    });
    document.getElementById('btnDeleteMeeting')?.style.setProperty('display', 'inline-flex');
    renderMeetingList();
}

async function handleDeleteMeeting() {
    if (!currentMeetingId) return;
    if (!confirm('Bạn chắc chắn muốn xoá cuộc họp này?')) return;
    const result = await apiCall(`/meetings/${currentMeetingId}`, 'DELETE');
    if (result) {
        await loadMeetings();
        resetMeetingForm(false);
        setMeetingTab('list');
    }
}

function openMeetingReport(meetingId) {
    const meeting = meetings.find((item) => item.id === meetingId);
    if (!meeting) return;
    currentMeetingId = meeting.id;
    renderMeetingReport(meeting);
    document.getElementById('btnEditMeetingFromReport')?.style.setProperty('display', currentUser?.role === 'admin' ? 'inline-flex' : 'none');
    document.getElementById('meetingReportModal')?.classList.add('active');
    renderMeetingList();
}

function closeMeetingReportModal() {
    resetMeetingReportFullscreen();
    document.getElementById('meetingReportModal')?.classList.remove('active');
}

function editMeetingFromReport() {
    const meeting = meetings.find((item) => item.id === currentMeetingId);
    if (!meeting) return;
    closeMeetingReportModal();
    populateMeetingForm(meeting);
    setMeetingTab('create');
}

function toggleMeetingReportFullscreen() {
    const modal = document.getElementById('meetingReportModal');
    if (!modal) return;
    const isFullscreen = modal.classList.toggle('meeting-report-fullscreen');
    updateMeetingReportFullscreenControl(isFullscreen);
}

function resetMeetingReportFullscreen() {
    const modal = document.getElementById('meetingReportModal');
    modal?.classList.remove('meeting-report-fullscreen');
    updateMeetingReportFullscreenControl(false);
}

function updateMeetingReportFullscreenControl(isFullscreen) {
    const icon = document.getElementById('meetingReportFullscreenIcon');
    const label = document.getElementById('meetingReportFullscreenLabel');
    if (icon) icon.textContent = isFullscreen ? 'close_fullscreen' : 'open_in_full';
    if (label) label.textContent = isFullscreen ? 'Thu gọn' : 'Toàn màn hình';
}

function renderMeetingReport(meeting) {
    const container = document.getElementById('meetingReportContent');
    if (!container) return;
    const contents = Array.isArray(meeting.contents) ? meeting.contents : [];
    const contentData = meeting.content_data || {};
    const employeeName = meeting.employee_name || meeting.employee_username || `User #${meeting.employee_id}`;
    const creatorName = meeting.creator_name || '--';
    const meetingDate = formatMeetingDate(meeting.time);
    const meetingTime = formatMeetingTime(meeting.time);
    const docId = `BBHCN-${String(meeting.id || '').padStart(4, '0')}`;
    container.innerHTML = `
        <header class="report-official-header">
            <div class="report-org-info">
                <div>PROJECT MANAGEMENT SYSTEM</div>
                <div>ONE-ON-ONE MEETING</div>
            </div>
            <div class="report-doc-id">
                <div>Mã biên bản: ${escapeHtml(docId)}</div>
                <div>Ngày lập: ${escapeHtml(formatMeetingDate(new Date()))}</div>
            </div>
        </header>

        <section class="report-title-section">
            <h1>BIÊN BẢN HỌP CÁ NHÂN</h1>
            <p>Ghi nhận nội dung trao đổi, đánh giá và các thỏa thuận sau buổi họp</p>
        </section>

        <table class="report-meta-table">
            <tbody>
                <tr>
                    <td class="report-meta-label">Nhân viên</td>
                    <td class="report-meta-value">${escapeHtml(employeeName)}</td>
                    <td class="report-meta-label">Người tạo</td>
                    <td class="report-meta-value">${escapeHtml(creatorName)}</td>
                </tr>
                <tr>
                    <td class="report-meta-label">Ngày họp</td>
                    <td class="report-meta-value">${escapeHtml(meetingDate)}</td>
                    <td class="report-meta-label">Giờ họp</td>
                    <td class="report-meta-value">${escapeHtml(meetingTime)}</td>
                </tr>
                <tr>
                    <td class="report-meta-label">Địa điểm</td>
                    <td class="report-meta-value">${escapeHtml(meeting.location || '--')}</td>
                    <td class="report-meta-label">Đơn vị</td>
                    <td class="report-meta-value">${escapeHtml(meeting.department || '--')}</td>
                </tr>
                <tr>
                    <td class="report-meta-label">Bộ phận</td>
                    <td class="report-meta-value" colspan="3">${escapeHtml(meeting.team || '--')}</td>
                </tr>
            </tbody>
        </table>

        <div class="report-content-sections">
            ${contents.length ? contents.map((type, index) => `
                <section class="report-section">
                    <div class="report-section-header">
                        <span class="report-section-index">${index + 1}</span>
                        <h3>${escapeHtml(getMeetingContentLabel(type).replace(/^\d+\.\s*/, ''))}</h3>
                    </div>
                    <div class="report-section-body">${sanitizeMeetingReportHtml(contentData[type])}</div>
                </section>
            `).join('') : '<div class="empty-state">Chưa có nội dung họp.</div>'}
        </div>

        <div class="report-signature-section">
            <div class="report-signature-box">
                <div class="report-signature-label">Người tạo biên bản</div>
                <div class="report-signature-name">${escapeHtml(creatorName)}</div>
            </div>
            <div class="report-signature-box">
                <div class="report-signature-label">Nhân viên</div>
                <div class="report-signature-name">${escapeHtml(employeeName)}</div>
            </div>
        </div>
    `;
}

function getMeetingContentLabel(type) {
    return MEETING_CONTENT_LABELS[type] || type;
}

function sanitizeMeetingReportHtml(value) {
    const html = String(value || '').trim();
    if (!html) return '<p>Chưa có nội dung chi tiết.</p>';

    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('script, style, iframe, object, embed').forEach((node) => node.remove());
    template.content.querySelectorAll('*').forEach((node) => {
        [...node.attributes].forEach((attr) => {
            if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
        });
    });
    return template.innerHTML || '<p>Chưa có nội dung chi tiết.</p>';
}

function formatMeetingDate(value) {
    const date = value instanceof Date ? value : new Date(String(value || '').replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function formatMeetingTime(value) {
    const date = value instanceof Date ? value : new Date(String(value || '').replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatMeetingDateTime(value) {
    if (!value) return '--';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function toDatetimeLocalValue(value) {
    const date = value instanceof Date ? value : new Date(String(value || '').replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '';
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
}

const MEETING_CONTENT_LABELS = {
    kpi: '1. Xem xét KPI',
    strengths: '2. Điểm tốt',
    improvements: '3. Điểm cần cải thiện',
    development: '4. Định hướng phát triển',
    feedback: '5. Ý kiến nhân viên'
};

const MEETING_CONTENT_SUGGESTIONS = {
    kpi: ['Kết quả KPI nổi bật trong kỳ?', 'Chỉ số nào đang thấp hơn mục tiêu?', 'Hành động tiếp theo để cải thiện KPI?'],
    strengths: ['Điểm mạnh cần ghi nhận?', 'Đóng góp nào tạo tác động tốt?', 'Năng lực nào nên tiếp tục phát huy?'],
    improvements: ['Rào cản chính hiện tại?', 'Kỹ năng hoặc quy trình nào cần cải thiện?', 'Cần hỗ trợ gì từ quản lý?'],
    development: ['Mục tiêu phát triển trong kỳ tới?', 'Khóa học hoặc mentor phù hợp?', 'Cơ hội thử thách mới nào nên giao?'],
    feedback: ['Nhân viên có đề xuất gì?', 'Mức độ hài lòng với công việc?', 'Điều gì cần thay đổi trong phối hợp?']
};

function populateAccountForm() {
    if (!currentUser) return;
    const emailInput = document.getElementById('accountEmail');
    const fullNameInput = document.getElementById('accountFullName');
    const avatarInput = document.getElementById('accountAvatarUrl');
    const deptInput = document.getElementById('accountDepartment');
    const teamInput = document.getElementById('accountTeam');
    if (!emailInput) return;
    emailInput.value = currentUser.email || '';
    if (fullNameInput) fullNameInput.value = currentUser.full_name || '';
    if (avatarInput) {
        avatarInput.value = currentUser.avatar_url || '';
    }
    if (deptInput) deptInput.value = currentUser.department || '';
    if (teamInput) teamInput.value = currentUser.team || '';
    updateAccountAvatarPreview(currentUser.avatar_url || '');
}

function updateAccountAvatarPreview(url) {
    const img = document.getElementById('accountAvatarPreviewImg');
    if (!img) return;
    const fallback = 'https://placehold.co/120x120?text=Avatar';
    if (url && url.trim()) {
        img.src = url.trim();
    } else {
        img.src = fallback;
    }
}

function ensureAccountSection() {
    const reportBtn = document.getElementById('btnOpenRecurringAdminReport');
    if (reportBtn) {
        reportBtn.style.display = currentUser?.role === 'admin' ? 'inline-flex' : 'none';
    }
    setAccountTab(currentAccountTab || 'profile', false);
}

function setAccountTab(tab = 'profile', shouldFocus = true) {
    currentAccountTab = tab;
    document.querySelectorAll('#accountTabs .account-tab').forEach((button) => {
        button.classList.toggle('active', button.getAttribute('data-account-tab') === tab);
    });
    document.querySelectorAll('#personalSectionAccount .account-tab-panel').forEach((panel) => {
        panel.classList.remove('active');
    });
    document.getElementById(`accountTab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`)?.classList.add('active');

    if (tab === 'profile') {
        populateAccountForm();
    } else if (tab === 'recurring') {
        loadAccountRecurringTasks(shouldFocus);
    }
}

async function loadAccountRecurringTasks(shouldFocus = false) {
    if (!currentUser) return;
    recurringTasksUserId = currentUser.id;
    recurringTasksRenderTarget = 'account';
    recurringTasksReadOnly = false;
    activeRecurringFreq = activeRecurringFreq || 'weekly';
    await loadRecurringTasks(currentUser.id, {
        endpoint: '/recurring-tasks/me',
        focusInput: shouldFocus
    });
}

function openRecurringAdminReport() {
    if (currentUser?.role !== 'admin') return;
    currentSettingsTab = 'tracking';
    switchView('settings');
    showSettingsTab('tracking');
}

async function handleAccountSubmit(event) {
    event.preventDefault();
    if (!currentUser) return;
    const statusEl = document.getElementById('accountStatus');
    const emailValue = document.getElementById('accountEmail')?.value?.trim() || '';
    const fullNameValue = document.getElementById('accountFullName')?.value?.trim() || '';
    const avatarValue = document.getElementById('accountAvatarUrl')?.value?.trim() || '';
    const departmentValue = document.getElementById('accountDepartment')?.value?.trim() || '';
    const teamValue = document.getElementById('accountTeam')?.value?.trim() || '';

    const payload = {};
    if (emailValue && emailValue !== (currentUser.email || '')) {
        payload.email = emailValue;
    }
    if (fullNameValue !== (currentUser.full_name || '')) {
        payload.full_name = fullNameValue || null;
    }
    if (avatarValue && avatarValue !== (currentUser.avatar_url || '')) {
        payload.avatar_url = avatarValue;
    }
    if (departmentValue !== (currentUser.department || '')) {
        payload.department = departmentValue || null;
    }
    if (teamValue !== (currentUser.team || '')) {
        payload.team = teamValue || null;
    }

    if (Object.keys(payload).length === 0) {
        if (statusEl) {
            statusEl.textContent = 'Không có thay đổi để lưu.';
            setTimeout(() => statusEl.textContent = '', 2000);
        }
        return;
    }

    if (statusEl) {
        statusEl.textContent = 'Đang lưu...';
    }
    const result = await apiCall('/users/me', 'PUT', payload);
    if (result) {
        currentUser = result;
        populateAccountForm();
        updateUserBadge();
        if (statusEl) {
            statusEl.textContent = 'Đã lưu!';
            setTimeout(() => {
                statusEl.textContent = '';
            }, 2000);
        }
    } else if (statusEl) {
        statusEl.textContent = 'Lưu thất bại, vui lòng thử lại.';
    }
}

async function handleChangePassword(event) {
    event.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const statusEl = document.getElementById('passwordStatus');
    
    // Validate
    if (!currentPassword || !newPassword || !confirmPassword) {
        if (statusEl) statusEl.textContent = 'Vui lòng điền đầy đủ thông tin';
        return;
    }
    
    if (newPassword.length < 6) {
        if (statusEl) statusEl.textContent = 'Mật khẩu mới phải có ít nhất 6 ký tự';
        return;
    }
    
    if (newPassword !== confirmPassword) {
        if (statusEl) statusEl.textContent = 'Mật khẩu mới và xác nhận không khớp';
        return;
    }
    
    try {
        if (statusEl) statusEl.textContent = 'Đang xử lý...';
        
        const response = await apiCall('/users/me/change-password', 'POST', {
            current_password: currentPassword,
            new_password: newPassword
        });
        
        if (response && response.message) {
            if (statusEl) {
                statusEl.textContent = '✓ Đổi mật khẩu thành công!';
                statusEl.style.color = 'var(--success-color)';
            }
            
            // Reset form
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
            
            // Clear status after 3 seconds
            setTimeout(() => {
                if (statusEl) {
                    statusEl.textContent = '';
                    statusEl.style.color = '';
                }
            }, 3000);
        }
    } catch (error) {
        console.error('Error changing password:', error);
        if (statusEl) {
            statusEl.textContent = error.message || 'Có lỗi xảy ra khi đổi mật khẩu';
            statusEl.style.color = 'var(--danger-color)';
        }
    }
}

async function ensureWorkLogSection() {
    if (!isWorkLogSectionInitialized) {
        initWorkLogEditor();
        isWorkLogSectionInitialized = true;
    }
    if (!worklogTabsInitialized) {
        initWorklogTabs();
    }
    if (!projects.length) {
        await loadProjects();
    }
    await loadMyTasksForWorkLog();
    await loadWorkLogs();
    const result = populateWorkLogSelectors() || {};
    populateWorkLogSubtasks(result.taskId || null, null);
    if (currentWorkLogId) {
        const existing = workLogs.find(log => log.id === currentWorkLogId);
        if (existing) {
            populateWorkLogForm(existing);
        } else {
            resetWorkLogForm();
        }
    } else if (workLogs.length) {
        selectWorkLog(workLogs[0].id);
    } else {
        resetWorkLogForm();
    }
    setWorklogTab('list');
}

async function ensureTodosSection() {
    const dateInput = document.getElementById('todoDate');
    const referenceDate = dateInput?.value ? new Date(dateInput.value) : new Date();
    await loadTodos(referenceDate);
    renderTodoDayList();
}

function addTodoRow() {
    const container = document.getElementById('todoRows');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'todo-row';
    row.innerHTML = `
        <div class="form-group">
            <label>Tên công việc</label>
            <input type="text" class="todo-title" placeholder="Nhập tên công việc" required>
        </div>
        <div class="form-group">
            <label>Mô tả</label>
            <textarea class="todo-desc" placeholder="Mô tả ngắn..."></textarea>
        </div>
        <div class="todo-row-remove">
            <button type="button" class="btn-secondary" onclick="this.closest('.todo-row').remove()">Xóa</button>
        </div>
    `;
    container.appendChild(row);
}

async function handleTodoSubmit(event) {
    event.preventDefault();
    const dateInput = document.getElementById('todoDate');
    if (!dateInput || !dateInput.value) {
        alert('Vui lòng chọn ngày');
        return;
    }
    const rows = document.querySelectorAll('#todoRows .todo-row');
    const entries = [];
    rows.forEach(row => {
        const title = row.querySelector('.todo-title')?.value?.trim();
        const description = row.querySelector('.todo-desc')?.value?.trim();
        if (title) {
            entries.push({
                title,
                description: description || null,
                planned_date: new Date(dateInput.value).toISOString()
            });
        }
    });
    if (!entries.length) {
        alert('Vui lòng nhập ít nhất một công việc');
        return;
    }
    const status = document.getElementById('todoStatus');
    if (status) status.textContent = 'Đang lưu...';
    const result = await apiCall('/todos/bulk', 'POST', entries);
    if (result) {
        document.getElementById('todoRows').innerHTML = '';
        addTodoRow();
        await loadTodos(new Date(dateInput.value));
        renderTodoDayList();
        if (status) {
            status.textContent = 'Đã lưu!';
            setTimeout(() => status.textContent = '', 2000);
        }
    } else if (status) {
        status.textContent = 'Lưu thất bại.';
    }
}

async function loadTodos(referenceDate = null) {
    let baseDate;
    if (referenceDate) {
        baseDate = new Date(referenceDate);
    } else if (dashboardMonth) {
        baseDate = new Date(dashboardMonth);
    } else {
        baseDate = new Date();
    }
    baseDate.setHours(0, 0, 0, 0);
    const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
    const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 23, 59, 59, 999);
    const data = await apiCall(`/todos/?start_date=${start.toISOString()}&end_date=${end.toISOString()}`);
    if (data) {
        todos = data;
        renderDashboardCalendar();
    }
    return data;
}

function renderTodoDayList() {
    const container = document.querySelector('.todo-day-list');
    if (!container) return;
    const dateInput = document.getElementById('todoDate');
    if (!dateInput || !dateInput.value) {
        container.innerHTML = '<div class="empty-state">Chọn ngày để xem to-do.</div>';
        return;
    }
    const selectedDate = new Date(dateInput.value);
    const list = todos.filter(todo => {
        const todoDate = new Date(todo.planned_date);
        return todoDate.toDateString() === selectedDate.toDateString();
    });
    if (!list.length) {
        container.innerHTML = '<div class="empty-state">Chưa có công việc nào cho ngày này.</div>';
        return;
    }
    container.innerHTML = list.map(todo => `
        <div class="todo-day-item ${todo.is_done ? 'done' : ''}">
            <div>
                <strong>${escapeHtml(todo.title)}</strong>
                ${todo.description ? `<div>${escapeHtml(todo.description)}</div>` : ''}
            </div>
            <button class="btn-secondary" onclick="toggleTodoDone(${todo.id})">${todo.is_done ? 'Hoàn tác' : 'Done'}</button>
        </div>
    `).join('');
}

async function toggleTodoDone(todoId) {
    const result = await apiCall(`/todos/${todoId}/toggle`, 'POST');
    if (result) {
        const dateInput = document.getElementById('todoDate');
        const referenceDate = dateInput?.value ? new Date(dateInput.value) : dashboardMonth;
        await loadTodos(referenceDate);
        renderTodoDayList();
    }
}

function getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function renderDashboardCalendar(taskList = dashboardTasks, todoList = todos) {
    const grid = document.getElementById('dashboardCalendarGrid');
    const header = document.getElementById('dashboardCurrentMonth');
    if (!grid || !header) return;

    const year = dashboardMonth.getFullYear();
    const month = dashboardMonth.getMonth();

    header.textContent = dashboardMonth.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay(); // 0 = CN, 1 = T2, ..., 6 = T7

    grid.innerHTML = '';
    
    // Header row với tên các ngày trong tuần
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    dayNames.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day header';
        dayHeader.textContent = day;
        grid.appendChild(dayHeader);
    });

    // Tính toán ngày bắt đầu của tuần đầu tiên (có thể là ngày của tháng trước)
    const weekStart = new Date(firstDay);
    weekStart.setDate(weekStart.getDate() - startWeekday);

    // Tạo các tuần (mỗi tuần là 7 ngày)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let currentDate = new Date(weekStart);
    const totalDays = Math.ceil((daysInMonth + startWeekday) / 7) * 7; // Tổng số ngày cần hiển thị (làm tròn lên để đủ tuần)

    for (let i = 0; i < totalDays; i++) {
        const date = new Date(currentDate);
        const dayKey = getLocalDateKey(date);
        const isCurrentMonth = date.getMonth() === month;
        
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        
        if (!isCurrentMonth) {
            dayElement.classList.add('other-month');
        }
        
        if (date.toDateString() === today.toDateString()) {
            dayElement.classList.add('today');
        }
        
        // Hiển thị số ngày
        const label = document.createElement('div');
        label.className = 'calendar-date';
        label.textContent = date.getDate();
        dayElement.appendChild(label);

        // Chỉ hiển thị tasks và todos cho ngày trong tháng hiện tại
        if (isCurrentMonth) {
            const dayTasks = taskList.filter(task => task.due_date && getLocalDateKey(task.due_date) === dayKey);
            const dayTodos = todoList.filter(todo => todo.planned_date && getLocalDateKey(todo.planned_date) === dayKey);

            // Thêm tasks vào ngày
            dayTasks.forEach(task => {
                const classes = ['calendar-event'];
                const dueDate = task.due_date ? new Date(task.due_date) : null;
                if (dueDate) dueDate.setHours(0, 0, 0, 0);

                if (task.status === 'done') {
                    classes.push('done');
                } else if (dueDate && dueDate < today) {
                    classes.push('late');
                } else {
                    classes.push('in-progress');
                }

                const event = document.createElement('div');
                event.className = classes.join(' ');
                event.innerHTML = `<span>${escapeHtml(task.title)}</span>`;
                event.addEventListener('click', () => openTaskModal(task, !canEditTask(task)));
                dayElement.appendChild(event);
            });

            // Thêm todos vào ngày
            dayTodos.forEach(todo => {
                const todoDate = new Date(todo.planned_date);
                todoDate.setHours(0, 0, 0, 0);

                const classes = ['calendar-event'];
                if (todo.is_done) {
                    classes.push('done');
                } else if (todoDate < today) {
                    classes.push('late');
                } else {
                    classes.push('in-progress');
                }
                
                const event = document.createElement('div');
                event.className = classes.join(' ');
                event.innerHTML = `
                    <span>${escapeHtml(todo.title)}</span>
                    <button onclick="toggleTodoDone(${todo.id}); event.stopPropagation();">${todo.is_done ? '↺' : '✓'}</button>
                `;
                dayElement.appendChild(event);
            });
        }

        grid.appendChild(dayElement);
        
        // Chuyển sang ngày tiếp theo
        currentDate.setDate(currentDate.getDate() + 1);
    }
}

function initWorkLogEditor() {
    if (workLogEditor || typeof Quill === 'undefined') return;
    const editorEl = document.getElementById('workLogEditor');
    if (!editorEl) return;
    workLogEditor = new Quill(editorEl, {
        theme: 'snow',
        placeholder: 'Ghi chú, tài liệu, checklist...',
        modules: {
            toolbar: [
                [{ header: [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['link', 'blockquote', 'code-block'],
                ['clean']
            ]
        }
    });
}

async function loadWorkLogs() {
    const data = await apiCall('/work-logs/');
    if (data) {
        workLogs = data;
        renderWorkLogList();
    }
}

async function loadMyTasksForWorkLog() {
    if (!projects.length) { myWorkLogTasks = []; return; }
    const results = await Promise.all(
        projects.map(p => apiCall(`/tasks/?project_id=${p.id}&assigned_only=false`))
    );
    const seen = new Set();
    myWorkLogTasks = results
        .filter(r => Array.isArray(r))
        .flat()
        .filter(t => seen.has(t.id) ? false : seen.add(t.id));
}

async function fetchSubtasksForTask(taskId) {
    if (!taskId) return [];
    if (workLogSubtasksCache[taskId]) {
        return workLogSubtasksCache[taskId];
    }
    const data = await apiCall(`/subtasks/task/${taskId}`);
    if (data) {
        workLogSubtasksCache[taskId] = data;
        return data;
    }
    return [];
}

async function populateWorkLogSubtasks(taskId, selectedSubtaskId = null) {
    const subtaskSelect = document.getElementById('workLogSubtask');
    if (!subtaskSelect) return;
    if (!taskId) {
        subtaskSelect.innerHTML = '<option value="">-- Chưa gán --</option>';
        subtaskSelect.disabled = true;
        subtaskSelect.value = '';
        return;
    }
    subtaskSelect.disabled = false;
    const subtasks = await fetchSubtasksForTask(taskId);
    subtaskSelect.innerHTML = '<option value="">-- Chưa gán --</option>' +
        subtasks.map(sub => `<option value="${sub.id}" ${selectedSubtaskId && sub.id === Number(selectedSubtaskId) ? 'selected' : ''}>${escapeHtml(sub.title)}</option>`).join('');
}

function renderWorkLogList() {
    const container = document.getElementById('workLogList');
    if (!container) return;
    if (!workLogs.length) {
        container.innerHTML = '<div class="empty-state">Chưa có Work Log nào.</div>';
        return;
    }
    container.innerHTML = workLogs.map(log => {
        const active = log.id === currentWorkLogId ? 'active' : '';
        const summary = stripHtml(log.content || '').slice(0, 80);
        const dateStr = log.updated_at ? formatDateDisplay(log.updated_at) : formatDateDisplay(log.created_at);
        const subtaskLabel = log.subtask_id ? `Subtask #${log.subtask_id}` : (log.task_id ? `Task #${log.task_id}` : 'Chưa gán');
        const color = TILE_COLORS[log.id % TILE_COLORS.length];
        return `
            <div class="worklog-item ${active}" onclick="selectWorkLog(${log.id})" style="background:${color.bg}; color:${color.text};">
                <div class="worklog-item-title">${escapeHtml(log.title)}</div>
                <div class="worklog-item-meta">
                    <span>${log.project_id ? `PJ #${log.project_id}` : 'Không gán'}</span>
                    <span>${dateStr}</span>
                </div>
                <div class="worklog-item-meta">
                    <span>${subtaskLabel}</span>
                </div>
                ${summary ? `<div class="worklog-item-summary">${escapeHtml(summary)}...</div>` : ''}
            </div>
        `;
    }).join('');
}

function updateWorkLogState(updatedLog) {
    const index = workLogs.findIndex(log => log.id === updatedLog.id);
    if (index >= 0) {
        workLogs[index] = updatedLog;
    } else {
        workLogs.unshift(updatedLog);
    }
}

function populateWorkLogSelectors(selectedProjectId = null, selectedTaskId = null) {
    const projectSelect = document.getElementById('workLogProject');
    const taskSelect = document.getElementById('workLogTask');
    if (!projectSelect || !taskSelect) return;
    const currentProjectValue = selectedProjectId ?? (projectSelect.value ? Number(projectSelect.value) : null);
    projectSelect.innerHTML = '<option value="">-- Chưa gán --</option>' +
        projects.map(project => `<option value="${project.id}" ${project.id === Number(currentProjectValue) ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('');
    
    const desiredTaskId = selectedTaskId ?? (taskSelect.value ? Number(taskSelect.value) : null);
    const tasksToRender = currentProjectValue
        ? myWorkLogTasks.filter(task => task.project_id === Number(currentProjectValue))
        : myWorkLogTasks;
    taskSelect.innerHTML = '<option value="">-- Chưa gán --</option>' +
        tasksToRender.map(task => `<option value="${task.id}" ${desiredTaskId && task.id === Number(desiredTaskId) ? 'selected' : ''}>${escapeHtml(task.title)}</option>`).join('');
    if (desiredTaskId) {
        taskSelect.value = desiredTaskId;
    }
    return {
        projectId: currentProjectValue ? Number(currentProjectValue) : null,
        taskId: desiredTaskId ? Number(desiredTaskId) : null
    };
}

function handleWorkLogProjectChange() {
    const projectSelect = document.getElementById('workLogProject');
    const selectedProject = projectSelect?.value ? Number(projectSelect.value) : null;
    const result = populateWorkLogSelectors(selectedProject, null) || {};
    populateWorkLogSubtasks(result.taskId || null, null);
}

function resetWorkLogForm() {
    currentWorkLogId = null;
    const idInput = document.getElementById('workLogId');
    if (idInput) idInput.value = '';
    const titleInput = document.getElementById('workLogTitle');
    if (titleInput) titleInput.value = '';
    const projectSelect = document.getElementById('workLogProject');
    const taskSelect = document.getElementById('workLogTask');
    if (projectSelect) projectSelect.value = '';
    if (taskSelect) taskSelect.value = '';
    populateWorkLogSubtasks(null, null);
    if (workLogEditor) {
        workLogEditor.setContents([]);
    }
    updateWorkLogAttachmentState(false);
    const status = document.getElementById('workLogStatus');
    if (status) status.textContent = '';
    const deleteBtn = document.getElementById('btnDeleteWorkLog');
    if (deleteBtn) deleteBtn.style.display = 'none';
    setWorklogTab('form');
}

function populateWorkLogForm(worklog) {
    currentWorkLogId = worklog.id;
    const idInput = document.getElementById('workLogId');
    if (idInput) idInput.value = worklog.id;
    const titleInput = document.getElementById('workLogTitle');
    if (titleInput) titleInput.value = worklog.title;
    const result = populateWorkLogSelectors(worklog.project_id, worklog.task_id) || {};
    populateWorkLogSubtasks(result.taskId || worklog.task_id || null, worklog.subtask_id || null);
    if (workLogEditor) {
        workLogEditor.root.innerHTML = worklog.content || '';
    }
    renderWorkLogAttachments(worklog);
    updateWorkLogAttachmentState(true);
    const deleteBtn = document.getElementById('btnDeleteWorkLog');
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';
    setWorklogTab('form');
}

function updateWorkLogAttachmentState(enabled) {
    const input = document.getElementById('workLogAttachmentInput');
    if (input) input.disabled = !enabled;
    if (!enabled) {
        const attachments = document.getElementById('workLogAttachments');
        if (attachments) attachments.innerHTML = '<div class="empty-state">Lưu work log để upload file.</div>';
    }
}

function renderWorkLogAttachments(worklog) {
    const container = document.getElementById('workLogAttachments');
    if (!container) return;
    const attachments = worklog.attachments || [];
    if (!attachments.length) {
        container.innerHTML = '<div class="empty-state">Chưa có file đính kèm.</div>';
        return;
    }
    container.innerHTML = attachments.map(file => `
        <div class="worklog-attachment-item">
            <a href="${file.url}" target="_blank" rel="noopener">${escapeHtml(file.name || 'Tệp đính kèm')}</a>
            <span>${Math.round((file.size || 0) / 1024)} KB</span>
        </div>
    `).join('');
}

function handleWorkLogTaskChange() {
    const taskSelect = document.getElementById('workLogTask');
    const taskId = taskSelect?.value ? Number(taskSelect.value) : null;
    populateWorkLogSubtasks(taskId, null);
}

async function handleWorkLogSubmit(event) {
    event.preventDefault();
    if (!workLogEditor) return;
    const title = document.getElementById('workLogTitle')?.value?.trim();
    if (!title) {
        alert('Vui lòng nhập tên Work Log');
        return;
    }
    const projectId = document.getElementById('workLogProject')?.value;
    const taskId = document.getElementById('workLogTask')?.value;
    const subtaskId = document.getElementById('workLogSubtask')?.value;
    const payload = {
        title,
        content: workLogEditor.root.innerHTML,
        project_id: projectId ? Number(projectId) : null,
        task_id: taskId ? Number(taskId) : null,
        subtask_id: subtaskId ? Number(subtaskId) : null
    };
    const status = document.getElementById('workLogStatus');
    if (status) status.textContent = 'Đang lưu...';
    let result;
    if (currentWorkLogId) {
        result = await apiCall(`/work-logs/${currentWorkLogId}`, 'PUT', payload);
    } else {
        result = await apiCall('/work-logs/', 'POST', payload);
    }
    if (result) {
        currentWorkLogId = result.id;
        await loadWorkLogs();
        const updated = workLogs.find(log => log.id === currentWorkLogId);
        if (updated) populateWorkLogForm(updated);
        if (status) {
            status.textContent = 'Đã lưu!';
            setTimeout(() => status.textContent = '', 2000);
        }
    } else if (status) {
        status.textContent = 'Lưu thất bại.';
    }
}

async function handleDeleteWorkLog() {
    if (!currentWorkLogId) return;
    if (!confirm('Bạn chắc chắn muốn xóa Work Log này?')) return;
    const status = document.getElementById('workLogStatus');
    if (status) status.textContent = 'Đang xóa...';
    const result = await apiCall(`/work-logs/${currentWorkLogId}`, 'DELETE');
    if (result) {
        currentWorkLogId = null;
        await loadWorkLogs();
        resetWorkLogForm();
        if (status) status.textContent = '';
    }
}

async function handleWorkLogAttachmentUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    if (!currentWorkLogId) {
        alert('Vui lòng lưu Work Log trước khi upload file.');
        event.target.value = '';
        return;
    }
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const result = await apiCall(`/work-logs/${currentWorkLogId}/attachments`, 'POST', formData);
        if (result) {
            updateWorkLogState(result);
            if (result.id === currentWorkLogId) {
                renderWorkLogAttachments(result);
            }
            renderWorkLogList();
        }
    }
    event.target.value = '';
}

function selectWorkLog(workLogId) {
    const log = workLogs.find(item => item.id === workLogId);
    if (!log) return;
    populateWorkLogForm(log);
    renderWorkLogList();
    setWorklogTab('form');
}

function initWorklogTabs() {
    const tabs = document.querySelectorAll('.worklog-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            setWorklogTab(tab.getAttribute('data-worklog-tab'));
        });
    });
    worklogTabsInitialized = true;
}

function setWorklogTab(tabName) {
    document.querySelectorAll('.worklog-tab').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-worklog-tab') === tabName);
    });
    document.querySelectorAll('.worklog-tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    const target = document.getElementById(`worklogTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    if (target) {
        target.classList.add('active');
    }
}

async function ensureNotesSection() {
    if (!isNotesSectionInitialized) {
        initNotesEditor();
        isNotesSectionInitialized = true;
    }
    if (!noteTabsInitialized) {
        initNoteTabs();
    }
    await loadNotes();
    if (currentNoteId) {
        const existing = notes.find(note => note.id === currentNoteId);
        if (existing) {
            populateNoteForm(existing);
            return;
        }
        currentNoteId = null;
    }
    resetNoteForm(false);
}

function initNoteTabs() {
    const tabs = document.querySelectorAll('.note-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            setNoteTab(tab.getAttribute('data-note-tab'));
        });
    });
    noteTabsInitialized = true;
}

function setNoteTab(tabName) {
    document.querySelectorAll('.note-tab').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-note-tab') === tabName);
    });
    document.querySelectorAll('.note-tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    const activePanel = document.getElementById(`noteTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    if (activePanel) {
        activePanel.classList.add('active');
    }
}

function initNotesEditor() {
    if (notesEditor || typeof Quill === 'undefined') return;
    const editorEl = document.getElementById('noteEditor');
    if (!editorEl) return;
    notesEditor = new Quill(editorEl, {
        theme: 'snow',
        placeholder: 'Nội dung ghi chú...',
        modules: {
            toolbar: [
                [{ header: [1, 2, false] }],
                ['bold', 'italic', 'underline'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['link', 'blockquote', 'code-block'],
                ['clean']
            ]
        }
    });
}

async function loadNotes() {
    const data = await apiCall('/notes/');
    if (data) {
        notes = data;
        renderNoteList();
    }
}

function renderNoteList() {
    const container = document.getElementById('noteList');
    if (!container) return;
    if (!notes.length) {
        container.innerHTML = '<div class="empty-state">Chưa có ghi chú nào.</div>';
        return;
    }
    container.innerHTML = notes.map(note => {
        const active = note.id === currentNoteId ? 'active' : '';
        const dateStr = note.note_date ? formatDateDisplay(note.note_date) : 'Chưa đặt ngày';
        const summary = stripHtml(note.content || '').slice(0, 80);
        const color = TILE_COLORS[note.id % TILE_COLORS.length];
        return `
            <div class="note-item ${active}" onclick="selectNote(${note.id})" style="background:${color.bg}; color:${color.text};">
                <div class="note-item-title">${escapeHtml(note.title)}</div>
                <div class="note-item-meta">
                    <span>${dateStr}</span>
                </div>
                ${summary ? `<div class="note-item-summary">${escapeHtml(summary)}...</div>` : ''}
            </div>
        `;
    }).join('');
}

function resetNoteForm(focusForm = true) {
    currentNoteId = null;
    document.getElementById('noteId')?.setAttribute('value', '');
    const titleInput = document.getElementById('noteTitle');
    if (titleInput) titleInput.value = '';
    const dateInput = document.getElementById('noteDate');
    if (dateInput) dateInput.value = '';
    if (notesEditor) {
        notesEditor.setContents([]);
    }
    const status = document.getElementById('noteStatus');
    if (status) status.textContent = '';
    const deleteBtn = document.getElementById('btnDeleteNote');
    if (deleteBtn) deleteBtn.style.display = 'none';
    setNoteTab(focusForm ? 'form' : 'list');
}

function populateNoteForm(note) {
    currentNoteId = note.id;
    document.getElementById('noteId')?.setAttribute('value', note.id);
    const titleInput = document.getElementById('noteTitle');
    if (titleInput) titleInput.value = note.title;
    const dateInput = document.getElementById('noteDate');
    if (dateInput && note.note_date) {
        dateInput.value = new Date(note.note_date).toISOString().slice(0, 10);
    } else if (dateInput) {
        dateInput.value = '';
    }
    if (notesEditor) {
        notesEditor.root.innerHTML = note.content || '';
    }
    const deleteBtn = document.getElementById('btnDeleteNote');
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';
    setNoteTab('form');
}

async function handleNoteSubmit(event) {
    event.preventDefault();
    const title = document.getElementById('noteTitle')?.value?.trim();
    if (!title) {
        alert('Vui lòng nhập tên note');
        return;
    }
    const dateValue = document.getElementById('noteDate')?.value;
    const payload = {
        title,
        note_date: dateValue ? new Date(dateValue).toISOString() : null,
        content: notesEditor ? notesEditor.root.innerHTML : ''
    };
    const status = document.getElementById('noteStatus');
    if (status) status.textContent = 'Đang lưu...';
    let result;
    if (currentNoteId) {
        result = await apiCall(`/notes/${currentNoteId}`, 'PUT', payload);
    } else {
        result = await apiCall('/notes/', 'POST', payload);
    }
    if (result) {
        currentNoteId = result.id;
        await loadNotes();
        const existing = notes.find(note => note.id === currentNoteId);
        if (existing) populateNoteForm(existing);
        if (status) {
            status.textContent = 'Đã lưu!';
            setTimeout(() => status.textContent = '', 2000);
        }
    } else if (status) {
        status.textContent = 'Lưu thất bại.';
    }
}

async function handleDeleteNote() {
    if (!currentNoteId) return;
    if (!confirm('Bạn chắc chắn muốn xoá note này?')) return;
    const status = document.getElementById('noteStatus');
    if (status) status.textContent = 'Đang xoá...';
    const result = await apiCall(`/notes/${currentNoteId}`, 'DELETE');
    if (result) {
        currentNoteId = null;
        await loadNotes();
        resetNoteForm();
        if (status) status.textContent = '';
    }
}

function selectNote(noteId) {
    const note = notes.find(item => item.id === noteId);
    if (!note) return;
    populateNoteForm(note);
    renderNoteList();
}

function openWorkLogFromSubtask(workLogId, focus = true) {
    currentWorkLogId = workLogId;
    currentPersonalSection = 'work';
    if (focus) {
        switchView('personal');
    } else {
        window.open(`/worklogs/${workLogId}`, '_blank');
    }
}

function renderWorkLogLinkList() {
    const container = document.getElementById('workLogLinkList');
    if (!container) return;
    if (!workLogs.length) {
        container.innerHTML = '<div class="empty-state">Chưa có Work Log nào.</div>';
        return;
    }
    container.innerHTML = workLogs.map(log => `
        <div class="worklog-link-item">
            <div>
                <div class="worklog-item-title">${escapeHtml(log.title)}</div>
                <small>${formatDateDisplay(log.updated_at || log.created_at)} · ${log.subtask_id ? `Subtask #${log.subtask_id}` : log.task_id ? `Task #${log.task_id}` : 'Chưa gán'}</small>
            </div>
            <button class="btn-primary" onclick="linkWorkLogToSubtask(${log.id})">Chọn</button>
        </div>
    `).join('');
}

async function openWorkLogLinkModal(subtaskId) {
    linkingSubtaskId = subtaskId;
    await ensureWorkLogSection();
    renderWorkLogLinkList();
    document.getElementById('workLogLinkModal')?.classList.add('active');
}

function closeWorkLogLinkModal() {
    linkingSubtaskId = null;
    document.getElementById('workLogLinkModal')?.classList.remove('active');
}

async function linkWorkLogToSubtask(workLogId) {
    if (!linkingSubtaskId) return;
    const result = await apiCall(`/subtasks/${linkingSubtaskId}`, 'PUT', { work_log_id: workLogId });
    if (result) {
        await refreshCurrentTaskData();
        await loadWorkLogs();
        closeWorkLogLinkModal();
    }
}

async function unlinkWorkLogFromSubtask(subtaskId) {
    const result = await apiCall(`/subtasks/${subtaskId}`, 'PUT', { work_log_id: null });
    if (result) {
        await refreshCurrentTaskData();
        await loadWorkLogs();
    }
}


function showToast(msg, type = 'info') {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.15);max-width:360px;word-break:break-word;transition:opacity .3s;background:${type==='error'?'#ef4444':'#6366f1'};color:#fff;`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
}

// API Functions
async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {}
    };
    
    const token = localStorage.getItem('pm_token');
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
    if (!isFormData) {
        options.headers['Content-Type'] = 'application/json';
    }

    if (data) {
        options.body = isFormData ? data : JSON.stringify(data);
    }
    
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        if (response.status === 401) {
            forceLogout();
            return null;
        }
        if (!response.ok) {
            let errorDetail = '';
            try {
                const errorJson = await response.clone().json();
                if (errorJson?.detail) {
                    errorDetail = typeof errorJson.detail === 'string'
                        ? errorJson.detail
                        : JSON.stringify(errorJson.detail);
                } else if (Object.keys(errorJson || {}).length) {
                    errorDetail = JSON.stringify(errorJson);
                }
            } catch (_) {
                try {
                    errorDetail = await response.clone().text();
                } catch (_) {
                    // ignore
                }
            }
            const statusText = response.statusText || 'Error';
            throw new Error(`HTTP ${response.status} - ${statusText}${errorDetail ? `: ${errorDetail}` : ''}`);
        }
        if (response.status === 204) return {};
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        showToast('Lỗi: ' + error.message, 'error');
        return null;
    }
}

// Projects
async function loadProjects() {
    const data = await apiCall('/projects/');
    if (data) {
        projects = data;
        updateProjectObjectiveFilterOptions();
        renderProjects();
        updateProjectSelect();
    }
}

async function loadUsers() {
    const data = await apiCall('/users/');
    if (data) {
        users = data;
        updateAssigneesList();
    }
}

function updateAssigneesList() {
    const container = document.getElementById('taskAssigneesList');
    if (!container) return;

    // Show only project members when inside a project; fall back to all users
    const memberUsers = (projectMembers && projectMembers.length > 0)
        ? projectMembers.map(m => m.user).filter(u => u && u.id)
        : (users || []);

    if (memberUsers.length === 0) {
        container.innerHTML = '<div class="empty-state">Chưa có thành viên nào trong dự án này</div>';
        return;
    }

    container.innerHTML = memberUsers.map(user => {
        const name = escapeHtml(user.full_name || user.username);
        const employeeCode = escapeHtml(user.username || `U${user.id}`);
        const userId = user.id;
        return `
            <label class="assignee-checkbox">
                <input type="checkbox" value="${userId}" class="assignee-checkbox-input" data-user-id="${userId}">
                <span class="assignee-checkbox-label">
                    <span class="assignee-name-text">${name} (${employeeCode})</span>
                </span>
            </label>
        `;
    }).join('');
    container.querySelectorAll('.assignee-checkbox-input').forEach(checkbox => {
        checkbox.addEventListener('change', updateAssigneeDropdownLabel);
    });
    updateAssigneeDropdownLabel();
}

function updateAssigneeDropdownLabel() {
    const label = document.getElementById('assigneeDropdownLabel');
    if (!label) return;
    const checked = Array.from(document.querySelectorAll('.assignee-checkbox-input:checked'));
    if (!checked.length) {
        label.textContent = 'Chọn người thực hiện';
        return;
    }
    if (checked.length === 1) {
        const rowText = checked[0].closest('.assignee-checkbox')?.querySelector('.assignee-name-text')?.textContent || '1 người đã chọn';
        label.textContent = rowText;
        return;
    }
    label.textContent = `Đã chọn ${checked.length} người thực hiện`;
}

function renderProjects() {
    const container = document.getElementById('projectsGrid');
    if (!container) return;

    const filteredProjects = currentProjectObjectiveFilter
        ? projects.filter((project) => (project.objective_group || '') === currentProjectObjectiveFilter)
        : [...projects];

    if (filteredProjects.length === 0) {
        container.innerHTML = '<div class="empty-state">Không có dự án phù hợp với bộ lọc hiện tại.</div>';
        return;
    }

    const groupedProjects = filteredProjects.reduce((acc, project) => {
        const groupName = project.objective_group || 'Chưa gắn mục tiêu chất lượng';
        if (!acc[groupName]) {
            acc[groupName] = [];
        }
        acc[groupName].push(project);
        return acc;
    }, {});

    const sortedGroupNames = Object.keys(groupedProjects).sort((a, b) => a.localeCompare(b, 'vi'));
    container.innerHTML = sortedGroupNames.map((groupName) => `
        <section class="project-group-section">
            <div class="project-group-title">${escapeHtml(groupName)}</div>
            <div class="projects-grid">
                ${groupedProjects[groupName]
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'))
                    .map((project) => renderProjectCard(project))
                    .join('')}
            </div>
        </section>
    `).join('');
}

function renderProjectCard(project) {
    return `
        <div class="project-card" onclick="if(!event.target.closest('.project-card-actions')) selectProject(${project.id})">
            <div class="project-card-actions">
                <button
                    type="button"
                    class="project-card-edit-btn"
                    aria-label="Chỉnh sửa dự án"
                    title="Chỉnh sửa dự án"
                    onclick="openProjectEditModal(${project.id})"
                >
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button
                    type="button"
                    class="project-card-delete-btn"
                    aria-label="Xoá dự án"
                    title="Xoá dự án"
                    onclick="deleteProject(${project.id})"
                >
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </div>
            <div class="project-card-header">
                <div class="project-color" style="background: ${project.color}"></div>
                <h3>${escapeHtml(project.name)}</h3>
            </div>
            <p>${escapeHtml(project.description || 'Chưa có mô tả')}</p>
            <div class="project-meta">
                <span>${escapeHtml(project.status || 'active')}</span>
                ${project.objective_description ? `<span>${escapeHtml(project.objective_description)}</span>` : ''}
            </div>
        </div>
    `;
}

function openProjectEditModal(projectId, event) {
    if (event) {
        event.stopPropagation();
    }
    const project = projects.find((item) => item.id === projectId);
    if (project) {
        openProjectModal(project);
    }
}

async function deleteProject(projectId) {
    const projectName = projects.find(p => p.id === projectId)?.name || `#${projectId}`;
    if (!confirm(`Xoá dự án "${projectName}"?\n\nToàn bộ task, sub task, work log, bình luận và dữ liệu liên quan sẽ bị xoá vĩnh viễn.`)) return;
    const result = await apiCall(`/projects/${projectId}`, 'DELETE');
    if (result) {
        projects = projects.filter(p => p.id !== projectId);
        if (currentProjectId === projectId) {
            currentProjectId = projects[0]?.id || null;
        }
        renderProjects();
    }
}

function updateProjectObjectiveFilterOptions() {
    const filterSelect = document.getElementById('projectObjectiveFilter');
    if (!filterSelect) return;

    const currentValue = currentProjectObjectiveFilter;
    const uniqueGroups = [...new Set(projects.map((project) => project.objective_group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));

    filterSelect.innerHTML = '<option value="">Tất cả mục tiêu chất lượng</option>' +
        uniqueGroups.map((groupName) => `<option value="${escapeHtml(groupName)}">${escapeHtml(groupName)}</option>`).join('');

    filterSelect.value = uniqueGroups.includes(currentValue) ? currentValue : '';
    currentProjectObjectiveFilter = filterSelect.value;
}

function handleProjectObjectiveFilterChange(event) {
    currentProjectObjectiveFilter = event.target.value || '';
    renderProjects();
}

// Function removed - sidebar projects list has been removed
// function renderProjectsSidebar() {
//     const container = document.getElementById('projectsList');
//     if (!container) return;
//     
//     container.innerHTML = projects.slice(0, 10).map(project => `
//         <li>
//             <a href="#" onclick="selectProject(${project.id}); return false;">
//                 <span style="color: ${project.color}">●</span> ${escapeHtml(project.name)}
//             </a>
//         </li>
//     `).join('');
// }

function updateProjectSelect() {
    const select = document.getElementById('projectSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">Select Project</option>' +
        projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

async function selectProject(projectId, skipViewSwitch = false) {
    currentProjectId = projectId;
    updateRecentProjectsVisibility();
    const projectSelectEl = document.getElementById('projectSelect');
    if (projectSelectEl) {
        projectSelectEl.value = projectId;
    }
    
    // Tìm trong cache trước
    let projectDetail = projects.find(p => p.id === projectId) || null;
    try {
        const freshProject = await apiCall(`/projects/${projectId}`);
        if (freshProject) {
            projectDetail = freshProject;
            const existingIndex = projects.findIndex(p => p.id === projectId);
            if (existingIndex >= 0) {
                projects[existingIndex] = freshProject;
            } else {
                projects.push(freshProject);
            }
        }
    } catch (error) {
        console.error('Failed to load project details:', error);
    }
    
    currentProject = projectDetail;
    currentProjectIsOwner = currentProject ? currentProject.owner_id === currentUser?.id : false;
    updateTaskButtonState();
    updateProjectSummaryInfo();
    
    if (!skipViewSwitch) {
        switchView('board');
    } else {
        updateURL('board', { projectId });
    }
    
    await loadTasks(projectId, false);
    await loadActivities(projectId);
    
    document.getElementById('projectSummarySection').style.display = 'grid';
}

async function createProject(projectData) {
    const data = await apiCall('/projects/', 'POST', projectData);
    if (data) {
        await syncProjectTeamMembers(data.id);
        await Promise.all([loadProjects(), loadDashboard()]);
        closeProjectModal();
    }
}

async function updateProject(projectId, projectData) {
    const data = await apiCall(`/projects/${projectId}`, 'PUT', projectData);
    if (data) {
        await syncProjectTeamMembers(projectId);
        await Promise.all([loadProjects(), loadDashboard()]);
        if (currentProjectId === projectId) {
            currentProject = data;
            updateProjectSummaryInfo();
            await loadProjectMembers(projectId);
        }
        closeProjectModal();
    }
}

// Tasks
function getTaskSeriesKey(task) {
    if (!task?.frequency) return null;
    if (task.series_id) return `series:${task.series_id}`;
    if (!task.repeat_until) return null;
    const assigneeKey = (task.assignees || [])
        .map(assignee => assignee.id)
        .sort((a, b) => a - b)
        .join(',');
    return [
        'legacy',
        task.project_id || '',
        task.title || '',
        task.description || '',
        task.frequency || '',
        task.repeat_until || '',
        assigneeKey
    ].join('|');
}

function sortTasksByPeriod(a, b) {
    return getTaskDueTime({ due_date: a.period_start || a.due_date || a.created_at })
        - getTaskDueTime({ due_date: b.period_start || b.due_date || b.created_at })
        || a.id - b.id;
}

function getSeriesRepresentative(occurrences) {
    const sorted = occurrences.slice().sort(sortTasksByPeriod);
    return sorted.find(task => task.status === 'in_progress')
        || sorted.find(task => task.status !== 'done')
        || sorted[sorted.length - 1];
}

function buildKanbanTaskItems(taskList) {
    const seriesBuckets = new Map();
    const singles = [];

    taskList.forEach(task => {
        const key = getTaskSeriesKey(task);
        if (!key) {
            singles.push({ type: 'task', task, status: task.status || 'todo' });
            return;
        }
        if (!seriesBuckets.has(key)) {
            seriesBuckets.set(key, []);
        }
        seriesBuckets.get(key).push(task);
    });

    taskSeriesIndex = new Map();
    const seriesItems = Array.from(seriesBuckets.entries()).flatMap(([key, occurrences]) => {
        if (occurrences.length <= 1) {
            const task = occurrences[0];
            return [{ type: 'task', task, status: task.status || 'todo' }];
        }
        const sorted = occurrences.slice().sort(sortTasksByPeriod);
        const representative = getSeriesRepresentative(sorted);
        const doneCount = sorted.filter(task => task.status === 'done').length;
        const inProgressCount = sorted.filter(task => task.status === 'in_progress').length;
        const item = {
            type: 'series',
            key,
            tasks: sorted,
            representative,
            status: representative?.status || 'todo',
            doneCount,
            inProgressCount,
            totalCount: sorted.length
        };
        taskSeriesIndex.set(key, item);
        return [item];
    });

    return [...singles, ...seriesItems].sort((a, b) => {
        const taskA = a.type === 'series' ? a.representative : a.task;
        const taskB = b.type === 'series' ? b.representative : b.task;
        return (taskA.position || 0) - (taskB.position || 0) || compareTasksByDueDate(taskA, taskB);
    });
}

async function loadTasks(projectId = null, assignedOnly = false) {
    // Build API endpoint
    let endpoint = '/tasks/?';
    if (projectId) {
        endpoint += `project_id=${projectId}&`;
    }
    endpoint += `assigned_only=${assignedOnly}`;
    
    const data = await apiCall(endpoint);
    if (data) {
        tasks = data;
        filteredTasks = [...tasks];
        updateProjectSummaryProgress();
        
        // Refresh activities if project is selected
        if (currentProjectId) {
            await loadActivities(currentProjectId);
        }
        
        // Render based on active tab
        const statusTab = document.getElementById('boardTabStatus');
        const timelineTab = document.getElementById('boardTabTimeline');
        const overviewTab = document.getElementById('boardTabOverview');
        const workloadTab = document.getElementById('boardTabWorkload');
        
        if (statusTab && statusTab.classList.contains('active')) {
            renderTasks();
        }
        if (timelineTab && timelineTab.classList.contains('active')) {
            renderGanttChart();
        }
        if (overviewTab && overviewTab.classList.contains('active')) {
            renderTaskOverviewBoard();
        }
        if (workloadTab && workloadTab.classList.contains('active')) {
            renderTeamWorkloadBoard();
        }

        // Thread tab is hidden from the board UI for now, so do not trigger thread loading here.
    }
}

function refreshCurrentProjectTasks() {
    if (currentProjectId) {
        return loadTasks(currentProjectId, false);
    }
    return Promise.resolve();
}

function updateTaskButtonState() {
    const btn = document.getElementById('btnCreateTask');
    if (!btn) return;
    if (currentProjectIsOwner) {
        btn.removeAttribute('disabled');
        btn.classList.remove('disabled');
    } else {
        btn.setAttribute('disabled', 'disabled');
        btn.classList.add('disabled');
    }
}

function renderTasks() {
    // Chỉ render nếu tab Status đang active
    const statusTab = document.getElementById('boardTabStatus');
    if (!statusTab || !statusTab.classList.contains('active')) {
        return;
    }
    
    const statuses = ['todo', 'in_progress', 'done'];
    const statusMap = {
        todo: 'tasksTodo',
        in_progress: 'tasksInProgress',
        done: 'tasksDone'
    };
    const countMap = {
        todo: 'countTodo',
        in_progress: 'countInProgress',
        done: 'countDone'
    };
    
    statuses.forEach(status => {
        const container = document.getElementById(statusMap[status]);
        if (!container) return;
        
        const groupedItems = buildKanbanTaskItems(filteredTasks);
        const statusTasks = groupedItems.filter(item => item.status === status);
        const countEl = document.getElementById(countMap[status]);
        if (countEl) {
            countEl.textContent = statusTasks.length;
        }
        
        container.innerHTML = statusTasks.map(item => item.type === 'series' ? createTaskSeriesCard(item) : createTaskCard(item.task)).join('');
        
        container.querySelectorAll('.task-card').forEach(card => {
            const canEdit = card.dataset.canEdit === 'true';
            card.draggable = canEdit;
            if (canEdit) {
                card.addEventListener('dragstart', handleDragStart);
                card.addEventListener('dragend', handleDragEnd);
            } else {
                card.addEventListener('dragstart', e => e.preventDefault());
            }
            card.addEventListener('click', handleTaskCardClick);
        });
        container.querySelectorAll('.task-series-card').forEach(card => {
            card.addEventListener('click', handleTaskSeriesCardClick);
        });
    });
    
    // Add drop zones
    document.querySelectorAll('.kanban-column').forEach(column => {
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('drop', handleDrop);
    });
}

function switchBoardTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.board-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('data-tab') === tabName) {
            tab.classList.add('active');
        }
    });
    
    // Update tab content
    document.querySelectorAll('.board-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const activeContent = document.getElementById(`boardTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    if (activeContent) {
        activeContent.classList.add('active');
    }
    
    // Render content based on active tab
    if (tabName === 'timeline') {
        stopThreadPolling();
        renderGanttChartQuy();
    } else if (tabName === 'status') {
        stopThreadPolling();
        renderTasks();
    } else if (tabName === 'overview') {
        stopThreadPolling();
        renderTaskOverviewBoard();
    } else if (tabName === 'workload') {
        stopThreadPolling();
        renderTeamWorkloadBoard();
    } else if (tabName === 'thread') {
        // Thread tab is intentionally hidden from the board UI until this flow is re-enabled.
        stopThreadPolling();
    }
}

function renderTaskOverviewBoard() {
    const container = document.getElementById('taskOverviewBoard');
    const tab = document.getElementById('boardTabOverview');
    if (!container || !tab || !tab.classList.contains('active')) return;

    if (!currentProject || filteredTasks.length === 0) {
        container.innerHTML = '<div class="board-insight-empty">Chưa có task nào để tổng hợp.</div>';
        return;
    }

    const weeklyTasks = [];
    const monthlyTasks = [];
    filteredTasks
        .slice()
        .sort(compareTasksByDueDate)
        .forEach((task) => {
            if (isTaskDueWithinDays(task, 7)) {
                weeklyTasks.push(task);
            } else {
                monthlyTasks.push(task);
            }
        });

    container.innerHTML = `
        <div class="board-insight-grid">
            ${createTaskInsightSection('Công việc tuần này', 'Ưu tiên các task gần hạn hoặc cần xử lý sớm.', weeklyTasks)}
            ${createTaskInsightSection('Kế hoạch tháng', 'Các task còn lại để theo dõi theo nhịp dài hơn.', monthlyTasks)}
        </div>
    `;

    attachBoardInsightTaskEvents(container);
}

function renderTeamWorkloadBoard() {
    const container = document.getElementById('teamWorkloadBoard');
    const tab = document.getElementById('boardTabWorkload');
    if (!container || !tab || !tab.classList.contains('active')) return;

    if (!currentProject || filteredTasks.length === 0) {
        container.innerHTML = '<div class="board-insight-empty">Chưa có task nào để phân theo nhân sự.</div>';
        return;
    }

    const members = new Map();
    filteredTasks.forEach((task) => {
        const assignees = task.assignees || [];
        if (!assignees.length) {
            if (!members.has('unassigned')) {
                members.set('unassigned', {
                    key: 'unassigned',
                    name: 'Chưa phân công',
                    subtitle: 'Task chưa có người phụ trách',
                    role: 'Unassigned',
                    tasks: []
                });
            }
            members.get('unassigned').tasks.push(task);
            return;
        }

        assignees.forEach((assignee) => {
            const key = `user-${assignee.id}`;
            if (!members.has(key)) {
                const memberMeta = projectMembers.find((member) => member.id === assignee.id);
                members.set(key, {
                    key,
                    name: assignee.full_name || assignee.username || `User ${assignee.id}`,
                    subtitle: [assignee.username, assignee.position].filter(Boolean).join(' · ') || 'Chưa cập nhật thông tin',
                    role: formatProjectMemberRole(memberMeta?.role || 'assignee'),
                    tasks: []
                });
            }
            members.get(key).tasks.push(task);
        });
    });

    const sortedMembers = Array.from(members.values()).sort((a, b) => {
        if (a.key === 'unassigned') return 1;
        if (b.key === 'unassigned') return -1;
        return a.name.localeCompare(b.name, 'vi');
    });

    container.innerHTML = sortedMembers.map((member) => {
        const weeklyTasks = member.tasks.filter((task) => isTaskDueWithinDays(task, 7)).sort(compareTasksByDueDate);
        const monthlyTasks = member.tasks.filter((task) => !isTaskDueWithinDays(task, 7)).sort(compareTasksByDueDate);
        return `
            <section class="workload-member-card">
                <div class="workload-member-head">
                    <div>
                        <h3>${escapeHtml(member.name)}</h3>
                        <p>${escapeHtml(member.subtitle)}</p>
                    </div>
                    <span>${escapeHtml(member.role)}</span>
                </div>
                <div class="workload-member-columns">
                    ${createMiniTaskColumn('Công việc tuần', weeklyTasks)}
                    ${createMiniTaskColumn('Công việc tháng', monthlyTasks)}
                </div>
            </section>
        `;
    }).join('');

    attachBoardInsightTaskEvents(container);
}

function createTaskInsightSection(title, description, taskList) {
    const insightItems = getCollapsedTaskItems(taskList);
    return `
        <section class="board-insight-card">
            <div class="board-insight-head">
                <div>
                    <h3>${escapeHtml(title)}</h3>
                    <p>${escapeHtml(description)}</p>
                </div>
                <strong>${insightItems.length}</strong>
            </div>
            <div class="board-insight-list">
                ${insightItems.length ? insightItems.map(createBoardInsightItemRow).join('') : '<div class="board-insight-empty compact">Không có task phù hợp.</div>'}
            </div>
        </section>
    `;
}

function createMiniTaskColumn(title, taskList) {
    const items = getCollapsedTaskItems(taskList);
    return `
        <div class="mini-task-column">
            <div class="mini-task-column-head">
                <span>${escapeHtml(title)}</span>
                <strong>${items.length}</strong>
            </div>
            <div class="mini-task-list">
                ${items.length ? items.map(createBoardInsightItemRow).join('') : '<div class="board-insight-empty compact">Chưa có task.</div>'}
            </div>
        </div>
    `;
}

function getCollapsedTaskItems(taskList) {
    const seriesMap = new Map();
    const singles = [];
    taskList.forEach(task => {
        const key = getTaskSeriesKey(task);
        if (!key) {
            singles.push({ type: 'task', task });
            return;
        }
        if (!seriesMap.has(key)) seriesMap.set(key, []);
        seriesMap.get(key).push(task);
    });

    const items = [...singles];
    seriesMap.forEach((group, key) => {
        if (group.length === 1) {
            items.push({ type: 'task', task: group[0] });
            return;
        }
        const sorted = group.slice().sort(sortTasksByPeriod);
        const representative = getSeriesRepresentative(sorted);
        const doneCount = sorted.filter(task => task.status === 'done').length;
        const inProgressCount = sorted.filter(task => task.status === 'in_progress').length;
        const series = {
            type: 'series',
            key,
            tasks: sorted,
            representative,
            status: representative?.status || 'todo',
            doneCount,
            inProgressCount,
            totalCount: sorted.length
        };
        taskSeriesIndex.set(key, series);
        items.push({ type: 'series', series });
    });

    return items.sort((a, b) => {
        const taskA = a.type === 'series' ? a.series.representative : a.task;
        const taskB = b.type === 'series' ? b.series.representative : b.task;
        return compareTasksByDueDate(taskA, taskB);
    });
}

function createBoardInsightItemRow(item) {
    if (item.type === 'series') {
        return createBoardInsightSeriesRow(item.series);
    }
    return createBoardInsightTaskRow(item.task);
}

function createBoardInsightSeriesRow(series) {
    const rep = series.representative || series.tasks[0];
    const statusInfo = getTaskInsightStatus(series.status);
    const frequencyText = getTaskFrequencyLabel(rep.frequency, rep.task_type);
    const periodText = getTaskPeriodText(rep);
    const encodedKey = encodeURIComponent(series.key);
    return `
        <button type="button" class="board-insight-task board-series-row" data-series-key="${encodedKey}">
            <div class="board-insight-task-main">
                <strong>${escapeHtml(rep.title || 'Task chưa đặt tên')}</strong>
                <p>${escapeHtml(rep.description || 'Công việc lặp lại')}</p>
            </div>
            <div class="board-insight-task-meta">
                <span class="task-insight-status status-${statusInfo.key}">${escapeHtml(statusInfo.label)}</span>
                <span>${escapeHtml(frequencyText)}</span>
                <span>${series.doneCount}/${series.totalCount} kỳ</span>
                <span>${escapeHtml(periodText)}</span>
            </div>
        </button>
    `;
}

function createWorkloadSeriesRow(group) {
    const rep = group[0];
    const done = group.filter(t => t.status === 'done').length;
    const freqLabel = { daily: 'Hằng ngày', weekly: 'Hằng tuần', monthly: 'Hằng tháng', quarterly: 'Hằng quý' }[rep.frequency] || rep.frequency || 'Lặp lại';
    const allDone = done === group.length;
    const anyInProgress = group.some(t => t.status === 'in_progress');
    const statusKey = allDone ? 'done' : anyInProgress ? 'in-progress' : 'todo';
    const statusLabel = allDone ? 'Hoàn thành' : anyInProgress ? 'Đang thực hiện' : 'Chưa thực hiện';
    const seriesDataId = `wl-series-${Math.random().toString(36).slice(2)}`;
    const groupJson = JSON.stringify(group).replace(/'/g, '&#39;');
    return `
        <button type="button" class="board-insight-task wl-series-row" data-series-group='${groupJson}' data-series-id="${seriesDataId}">
            <div class="board-insight-task-main">
                <strong>${escapeHtml(rep.title || 'Task chưa đặt tên')}</strong>
                <p class="wl-series-meta">🔁 ${escapeHtml(freqLabel)} · ${done}/${group.length} hoàn thành</p>
            </div>
            <div class="board-insight-task-meta">
                <span class="task-insight-status status-${statusKey}">${statusLabel}</span>
                <span class="wl-series-badge">${group.length} lần</span>
            </div>
        </button>
    `;
}

function createBoardInsightTaskRow(task) {
    const statusInfo = getTaskInsightStatus(task.status);
    const dueText = task.due_date ? formatDateDisplay(task.due_date) : 'Chưa có hạn';
    const description = task.description || 'Chưa có mô tả công việc.';
    return `
        <button type="button" class="board-insight-task" data-task-id="${task.id}">
            <div class="board-insight-task-main">
                <strong>${escapeHtml(task.title || 'Task chưa đặt tên')}</strong>
                <p>${escapeHtml(description)}</p>
            </div>
            <div class="board-insight-task-meta">
                <span class="task-insight-status status-${statusInfo.key}">${escapeHtml(statusInfo.label)}</span>
                <span>${escapeHtml(dueText)}</span>
            </div>
        </button>
    `;
}

function openWorkloadSeriesPopup(group, triggerEl) {
    closeWorkloadSeriesPopup();
    const overlay = document.createElement('div');
    overlay.className = 'wl-popup-overlay';
    overlay.onclick = closeWorkloadSeriesPopup;

    const rep = group[0];
    const freqLabel = { daily: 'Hằng ngày', weekly: 'Hằng tuần', monthly: 'Hằng tháng', quarterly: 'Hằng quý' }[rep.frequency] || rep.frequency || 'Lặp lại';
    const done = group.filter(t => t.status === 'done').length;

    const popup = document.createElement('div');
    popup.className = 'wl-series-popup';
    popup.innerHTML = `
        <div class="wl-popup-header">
            <div>
                <strong>${escapeHtml(rep.title)}</strong>
                <span class="wl-popup-freq">🔁 ${escapeHtml(freqLabel)}</span>
            </div>
            <button class="wl-popup-close" onclick="closeWorkloadSeriesPopup()">✕</button>
        </div>
        <div class="wl-popup-stats">${done} / ${group.length} hoàn thành</div>
        <div class="wl-popup-list">
            ${group.sort((a,b) => new Date(a.period_start||a.due_date||0) - new Date(b.period_start||b.due_date||0)).map(t => {
                const si = getTaskInsightStatus(t.status);
                const due = t.due_date ? formatDateDisplay(t.due_date) : (t.period_start ? formatDateDisplay(t.period_start) : 'Chưa có hạn');
                return `<button class="wl-popup-task board-insight-task" data-task-id="${t.id}">
                    <span class="wl-popup-task-title">${escapeHtml(t.title)}</span>
                    <span class="wl-popup-task-right">
                        <span class="task-insight-status status-${si.key}">${si.label}</span>
                        <span class="wl-popup-due">${escapeHtml(due)}</span>
                    </span>
                </button>`;
            }).join('')}
        </div>
    `;

    const rect = triggerEl.getBoundingClientRect();
    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    const pw = 360;
    let left = rect.right + 10;
    if (left + pw > window.innerWidth - 16) left = rect.left - pw - 10;
    if (left < 12) left = 12;
    let top = rect.top;
    const ph = Math.min(480, group.length * 56 + 120);
    if (top + ph > window.innerHeight - 16) top = window.innerHeight - ph - 16;
    if (top < 12) top = 12;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    popup.querySelectorAll('.board-insight-task[data-task-id]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            closeWorkloadSeriesPopup();
            openTaskModal(parseInt(btn.dataset.taskId));
        });
    });
}

function closeWorkloadSeriesPopup() {
    document.querySelectorAll('.wl-series-popup, .wl-popup-overlay').forEach(el => el.remove());
}

function getTaskInsightStatus(status) {
    const statusMap = {
        todo: { key: 'todo', label: 'Chưa thực hiện' },
        in_progress: { key: 'in-progress', label: 'Đang thực hiện' },
        done: { key: 'done', label: 'Hoàn thành' }
    };
    return statusMap[status] || { key: 'todo', label: status || 'Chưa rõ' };
}

function compareTasksByDueDate(a, b) {
    const dueA = getTaskDueTime(a);
    const dueB = getTaskDueTime(b);
    return dueA - dueB || String(a.title || '').localeCompare(String(b.title || ''), 'vi');
}

function getTaskDueTime(task) {
    if (!task?.due_date) return Number.MAX_SAFE_INTEGER;
    const date = new Date(String(task.due_date).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function isTaskDueWithinDays(task, days) {
    const dueTime = getTaskDueTime(task);
    if (dueTime === Number.MAX_SAFE_INTEGER) return false;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endWindow = startOfToday + (days * 24 * 60 * 60 * 1000);
    return dueTime >= startOfToday && dueTime <= endWindow;
}

function attachBoardInsightTaskEvents(container) {
    container.querySelectorAll('.board-insight-task').forEach((button) => {
        button.addEventListener('click', () => {
            const rawSeriesKey = button.dataset.seriesKey;
            if (rawSeriesKey) {
                openTaskSeriesModal(decodeURIComponent(rawSeriesKey));
                return;
            }
            if (button.classList.contains('wl-series-row')) {
                try {
                    const group = JSON.parse(button.dataset.seriesGroup || '[]');
                    if (group.length) { openWorkloadSeriesPopup(group, button); return; }
                } catch(e) {}
            }
            const taskId = Number(button.dataset.taskId);
            const task = tasks.find((item) => item.id === taskId);
            if (task) {
                openTaskModal(task, !canEditTask(task));
            }
        });
    });
}

function renderGanttChart() {
    const chart = document.getElementById('ganttChart');
    const timeline = document.getElementById('ganttTimeline');
    if (!chart || !timeline) return;
    
    // Chỉ render nếu tab Timeline đang active
    const timelineTab = document.getElementById('boardTabTimeline');
    if (!timelineTab || !timelineTab.classList.contains('active')) {
        return;
    }

    if (!currentProject || filteredTasks.length === 0) {
        chart.innerHTML = '<p class="text-muted">Chưa có task nào để hiển thị.</p>';
        timeline.innerHTML = '';
        return;
    }

    // Helper để parse date đúng cách (chuẩn hóa string như formatDateDisplay)
    function parseDate(dateValue) {
        if (!dateValue) return null;
        const normalized = String(dateValue).replace(' ', 'T');
        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const sortedTasks = [...filteredTasks].sort((a, b) => {
        const dateA = parseDate(a.created_at || a.due_date) || new Date();
        const dateB = parseDate(b.created_at || b.due_date) || new Date();
        return dateA - dateB;
    });

    const startDates = sortedTasks.map(task => parseDate(task.created_at || task.due_date) || new Date()).filter(Boolean);
    const dueDates = sortedTasks.map(task => parseDate(task.due_date)).filter(Boolean);
    
    if (dueDates.length === 0) {
        chart.innerHTML = '<p class="text-muted">Chưa có task nào đặt ngày hoàn thành.</p>';
        timeline.innerHTML = '';
        return;
    }

    const minDate = new Date(Math.min(...startDates.map(date => date.getTime())));
    const maxDate = new Date(Math.max(...dueDates.map(date => date.getTime())));

    const totalDays = Math.max(1, Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)));

    const timelineLabels = [];
    for (let i = 0; i <= totalDays; i += Math.max(1, Math.floor(totalDays / 6))) {
        const labelDate = new Date(minDate);
        labelDate.setDate(minDate.getDate() + i);
        timelineLabels.push(labelDate);
    }

    timeline.innerHTML = timelineLabels.map(date => {
        const offset = Math.min(100, Math.max(0, ((date - minDate) / (totalDays * 86400000)) * 100));
        return `<span class="gantt-timeline-label" style="left: ${offset}%">${formatDateDisplay(date)}</span>`;
    }).join('');

    chart.innerHTML = sortedTasks.map(task => {
        const start = parseDate(task.created_at || task.due_date) || new Date();
        const end = parseDate(task.due_date) || new Date(start.getTime() + 2 * 86400000);
        const startOffset = Math.max(0, (start - minDate) / (1000 * 60 * 60 * 24));
        const durationDays = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
        const leftPercent = (startOffset / totalDays) * 100;
        const widthPercent = (durationDays / totalDays) * 100;
        const color = getStatusColor(task.status);

        return `
            <div class="gantt-row">
                <div class="gantt-label">${escapeHtml(task.title)}</div>
                <div class="gantt-bars">
                    <div class="gantt-bar" style="left: ${leftPercent}%; width: ${widthPercent}%; background: ${color};">
                        ${formatDateDisplay(start)} - ${formatDateDisplay(end)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderGanttChartQuy() {
    const chart = document.getElementById('ganttChart');
    const yearDisplay = document.getElementById('currentYearDisplay');
    if (!chart) return;

    // Hide old elements replaced by new layout
    const oldTl = document.getElementById('ganttTimeline');
    if (oldTl) oldTl.style.display = 'none';
    const oldHdr = chart.closest('.gantt-section')?.querySelector('.gantt-task-header-row');
    if (oldHdr) oldHdr.style.display = 'none';

    if (yearDisplay) yearDisplay.textContent = `Năm ${quarterlyYear}`;

    if (!currentProject || filteredTasks.length === 0) {
        chart.innerHTML = '<p class="text-muted" style="padding:24px 0">Chưa có task nào để hiển thị.</p>';
        return;
    }

    function parseDate(v) {
        if (!v) return null;
        const d = new Date(String(v).replace(' ', 'T'));
        return isNaN(d.getTime()) ? null : d;
    }

    const today = new Date();
    const yearStart = new Date(quarterlyYear, 0, 1);
    const yearEnd   = new Date(quarterlyYear, 11, 31, 23, 59, 59, 999);
    const totalMs   = yearEnd - yearStart;

    function fracOfYear(date) {
        const t = Math.min(Math.max(date.getTime(), yearStart.getTime()), yearEnd.getTime());
        return (t - yearStart) / totalMs;
    }

    // Filter tasks overlapping the year
    const tasksInYear = filteredTasks.filter(task => {
        const end = parseDate(task.due_date);
        if (!end) return false;
        const start = parseDate(task.period_start || task.created_at) || end;
        return !(end < yearStart || start > yearEnd);
    });

    if (tasksInYear.length === 0) {
        chart.innerHTML = `<p class="text-muted" style="padding:24px 0">Không có task nào trong năm ${quarterlyYear}.</p>`;
        return;
    }

    // Group recurring tasks: by series_id if set, else fallback to title+frequency
    function _groupKey(task) {
        if (task.task_type === 'one_time') return null;
        if (!task.frequency) return null;          // standalone, no recurrence
        if (task.series_id) return `sid:${task.series_id}`;
        return `tf:${task.title}|${task.frequency}`;
    }

    const seriesGroups = {};
    tasksInYear.forEach(task => {
        const key = _groupKey(task);
        if (!key) return;
        if (!seriesGroups[key]) seriesGroups[key] = [];
        seriesGroups[key].push(task);
    });

    const seenGroups = new Set();
    const displayRows = [];
    tasksInYear.forEach(task => {
        const key = _groupKey(task);
        if (key) {
            if (seenGroups.has(key)) return;
            seenGroups.add(key);
            const instances = seriesGroups[key];
            const starts = instances.map(t => parseDate(t.period_start || t.created_at)).filter(Boolean);
            const ends   = instances.map(t => parseDate(t.due_date)).filter(Boolean);
            const doneCount   = instances.filter(t => t.status === 'done').length;
            const inProgCount = instances.filter(t => t.status === 'in_progress').length;
            displayRows.push({
                ...instances[0],
                _isGroup:    true,
                _count:      instances.length,
                _groupStart: starts.length ? new Date(Math.min(...starts.map(d => d.getTime()))) : null,
                _groupEnd:   ends.length   ? new Date(Math.max(...ends.map(d => d.getTime())))   : null,
                status: doneCount === instances.length ? 'done'
                      : (inProgCount > 0 || doneCount > 0 ? 'in_progress' : 'todo'),
                _progress: Math.round((doneCount / instances.length) * 100)
            });
        } else {
            displayRows.push({ ...task, _isGroup: false, _count: 1, _progress: undefined });
        }
    });

    function statusCfg(s) {
        if (s === 'done')        return { dot: '#10b981', track: 'rgba(16,185,129,.12)', fill: 'linear-gradient(90deg,#10b981,#34d399)' };
        if (s === 'in_progress') return { dot: '#4361ee', track: 'rgba(67,97,238,.10)',  fill: 'linear-gradient(90deg,#4361ee,#6b83f7)' };
        return                          { dot: '#cbd5e1', track: 'rgba(0,0,0,.05)',       fill: '#e2e5eb' };
    }

    const currentMonth = today.getFullYear() === quarterlyYear ? today.getMonth() : -1;
    const todayFrac    = (today >= yearStart && today <= yearEnd) ? fracOfYear(today) : null;
    const monthNames   = ['Th1','Th2','Th3','Th4','Th5','Th6','Th7','Th8','Th9','Th10','Th11','Th12'];

    const qBandColors = [
        'rgba(59,130,246,.035)',
        'rgba(34,197,94,.035)',
        'rgba(245,158,11,.04)',
        'rgba(168,85,247,.035)',
    ];

    const quartersHtml = [0,1,2,3].map(qi => {
        const months   = [qi*3, qi*3+1, qi*3+2];
        const isCurrQ  = months.includes(currentMonth);
        return `<div class="tl-quarter${isCurrQ ? ' current-q' : ''}" data-qi="${qi}">
            <div class="tl-q-label${isCurrQ ? ' current' : ''}">Q${qi+1} ${quarterlyYear}</div>
            <div class="tl-q-months">
                ${months.map(mi => `<div class="tl-q-month${mi === currentMonth ? ' current' : ''}"><span>${monthNames[mi]}</span></div>`).join('')}
            </div>
        </div>`;
    }).join('');

    // Quarter bands + month lines rendered inside .tl-rows
    const bandsAndLinesHtml = (() => {
        let html = '';
        // Quarter bands (4 blocks of 25%)
        for (let qi = 0; qi < 4; qi++) {
            const leftF  = qi * 0.25;
            html += `<div class="tl-q-band" style="left:calc(260px + (100% - 260px)*${leftF});width:calc((100% - 260px)*0.25);background:${qBandColors[qi]}"></div>`;
        }
        // Month lines (11 lines at each month boundary)
        for (let mi = 1; mi < 12; mi++) {
            const frac = mi / 12;
            const cls  = mi % 3 === 0 ? 'tl-quarter-divider' : 'tl-month-line';
            html += `<div class="${cls}" style="left:calc(260px + (100% - 260px)*${frac.toFixed(4)})"></div>`;
        }
        return html;
    })();

    const statusLabelMap = { todo: 'Chưa thực hiện', in_progress: 'Đang thực hiện', done: 'Hoàn thành' };

    const rowsHtml = displayRows.map(row => {
        const rawStart = row._isGroup ? row._groupStart : parseDate(row.period_start || row.created_at);
        const rawEnd   = row._isGroup ? row._groupEnd   : parseDate(row.due_date);
        if (!rawEnd) return '';

        const start      = rawStart && rawStart <= rawEnd ? rawStart : rawEnd;
        const clampStart = new Date(Math.max(start.getTime(), yearStart.getTime()));
        const clampEnd   = new Date(Math.min(rawEnd.getTime(), yearEnd.getTime()));
        if (clampStart > clampEnd) return '';

        const leftF    = fracOfYear(clampStart);
        const rightF   = fracOfYear(clampEnd);
        const leftPct  = (leftF * 100).toFixed(2);
        const widthPct = Math.max(1.5, (rightF - leftF) * 100).toFixed(2);

        const cfg      = statusCfg(row.status);
        const progress = row._progress !== undefined ? row._progress
                       : (row.status === 'done' ? 100 : row.status === 'in_progress' ? 50 : 0);

        const badgeHtml = row._isGroup
            ? `<span class="tl-row-badge">×${row._count}</span>`
            : (row.task_type === 'one_time' ? `<span class="tl-row-badge tl-badge-once">1 lần</span>` : '');

        const freqHint = row._isGroup ? ` · ${getTaskFrequencyLabel(row.frequency, row.task_type)} · ${row._count} chu kỳ` : '';
        const tooltip  = `${row.title}\n${statusLabelMap[row.status] || ''}${freqHint}\n${formatDateDisplay(clampStart)} – ${formatDateDisplay(clampEnd)}`;

        return `<div class="tl-row">
            <div class="tl-row-name">
                <div class="tl-row-dot" style="background:${cfg.dot}"></div>
                <button type="button" class="tl-row-title" onclick="openTimelineTaskModal(${row.id})" title="${escapeHtml(row.title)}">${escapeHtml(row.title)}</button>
                ${badgeHtml}
            </div>
            <div class="tl-bar-area">
                <div class="tl-bar" style="left:${leftPct}%;width:${widthPct}%;background:${cfg.track}" data-tooltip="${escapeHtml(tooltip)}" onclick="openTimelineTaskModal(${row.id})">
                    <div class="tl-bar-fill" style="width:${progress}%;background:${cfg.fill}"></div>
                    ${progress >= 15 ? `<span class="tl-bar-label">${progress}%</span>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

    const doneAll     = filteredTasks.filter(t => t.status === 'done').length;
    const inProgAll   = filteredTasks.filter(t => t.status === 'in_progress').length;
    const seriesCount = Object.values(seriesGroups).filter(g => g.length > 1).length;

    chart.innerHTML = `
        <div class="tl-card">
            <div class="tl-scroll">
                <div class="tl-header-row">
                    <div class="tl-header-stub"><span>Danh sách công việc</span></div>
                    <div class="tl-quarters">${quartersHtml}</div>
                </div>
                <div class="tl-rows">
                    ${bandsAndLinesHtml}
                    ${todayFrac !== null ? `<div class="tl-today-line" style="left:calc(260px + (100% - 260px) * ${todayFrac.toFixed(4)})"><div class="tl-today-label">Hôm nay</div></div>` : ''}
                    ${rowsHtml || '<div style="padding:32px 24px;color:#9ca3af;font-size:14px">Không có task nào trong năm này.</div>'}
                </div>
            </div>
        </div>
        <div class="tl-summary">
            <div class="tl-summary-card">
                <div class="tl-summary-icon" style="background:#f0f1ff;color:#4361ee">${displayRows.length}</div>
                <div><div class="tl-summary-sub">Hiển thị</div><div class="tl-summary-val">dòng timeline</div></div>
            </div>
            <div class="tl-summary-card">
                <div class="tl-summary-icon" style="background:#ecfdf5;color:#10b981">${doneAll}</div>
                <div><div class="tl-summary-sub">Hoàn thành</div><div class="tl-summary-val">đúng tiến độ</div></div>
            </div>
            <div class="tl-summary-card">
                <div class="tl-summary-icon" style="background:#eff6ff;color:#4361ee">${inProgAll}</div>
                <div><div class="tl-summary-sub">Đang thực hiện</div><div class="tl-summary-val">công việc</div></div>
            </div>
            <div class="tl-summary-card">
                <div class="tl-summary-icon" style="background:#faf5ff;color:#8b5cf6">${seriesCount}</div>
                <div><div class="tl-summary-sub">Nhóm lặp lại</div><div class="tl-summary-val">đã gom lại</div></div>
            </div>
        </div>`;

    chart.querySelectorAll('.tl-bar').forEach(bar => {
        bar.addEventListener('mouseenter', e => showTimelineTooltip(e, bar.getAttribute('data-tooltip')));
        bar.addEventListener('mousemove',  moveTimelineTooltip);
        bar.addEventListener('mouseleave', hideTimelineTooltip);
    });
}

function attachTimelineTooltipEvents(container) {
    if (!container) return;
    container.querySelectorAll('.gantt-bar-quarter').forEach(bar => {
        bar.addEventListener('mouseenter', event => showTimelineTooltip(event, bar.getAttribute('data-tooltip')));
        bar.addEventListener('mousemove', moveTimelineTooltip);
        bar.addEventListener('mouseleave', hideTimelineTooltip);
    });
}

function openTimelineTaskModal(taskId) {
    const task = tasks.find(item => item.id === taskId);
    if (task) {
        openTaskModal(task, !canEditTask(task));
    }
}

function initTimelineTooltip() {
    if (timelineTooltip) return;
    timelineTooltip = document.createElement('div');
    timelineTooltip.id = 'timelineTooltip';
    timelineTooltip.className = 'timeline-tooltip';
    timelineTooltip.style.display = 'none';
    document.body.appendChild(timelineTooltip);
}

function showTimelineTooltip(event, content) {
    if (!timelineTooltip) return;
    timelineTooltip.textContent = content;
    timelineTooltip.style.display = 'block';
    positionTimelineTooltip(event);
}

function moveTimelineTooltip(event) {
    if (!timelineTooltip || timelineTooltip.style.display === 'none') return;
    positionTimelineTooltip(event);
}

function hideTimelineTooltip() {
    if (!timelineTooltip) return;
    timelineTooltip.style.display = 'none';
}

function positionTimelineTooltip(event) {
    if (!timelineTooltip) return;
    const margin = 16;
    const scrollX = window.pageXOffset;
    const scrollY = window.pageYOffset;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    timelineTooltip.style.left = `${event.pageX + margin}px`;
    timelineTooltip.style.top = `${event.pageY - margin}px`;
    const tooltipRect = timelineTooltip.getBoundingClientRect();

    let left = event.pageX + margin;
    let top = event.pageY - tooltipRect.height - margin;

    if (left + tooltipRect.width > scrollX + viewportWidth - margin) {
        left = event.pageX - tooltipRect.width - margin;
    }
    if (left < scrollX + margin) {
        left = scrollX + margin;
    }
    if (top < scrollY + margin) {
        top = event.pageY + margin;
    }
    if (top + tooltipRect.height > scrollY + viewportHeight - margin) {
        top = scrollY + viewportHeight - tooltipRect.height - margin;
    }

    timelineTooltip.style.left = `${left}px`;
    timelineTooltip.style.top = `${top}px`;
}

function getStatusColor(status) {
    switch (status) {
        case 'todo':
            return '#93c5fd';
        case 'in_progress':
            return '#fcd34d';
        case 'done':
            return '#6ee7b7';
        default:
            return '#e5e7eb';
    }
}

function getTaskStatusLabel(status) {
    const statusMap = {
        todo: 'Chưa thực hiện',
        in_progress: 'Đang thực hiện',
        done: 'Hoàn thành'
    };
    return statusMap[status] || statusMap.todo;
}

function getTaskFrequencyLabel(frequency, taskType) {
    if (taskType === 'one_time' || (!frequency && taskType !== 'recurring')) return 'Phát sinh';
    const frequencyMap = {
        weekly: 'Hàng tuần',
        monthly: 'Hàng tháng',
        quarterly: 'Hàng quý',
        semiannual: '6 tháng',
        yearly: 'Hàng năm'
    };
    return frequencyMap[frequency] || 'Lặp lại';
}

function getTaskPeriodText(task) {
    const start = task.period_start || task.created_at;
    const end = task.period_end || task.due_date;
    if (!start && !end) return 'Chưa có kỳ hạn';
    if (!start) return `Đến ${formatDateDisplay(end)}`;
    if (!end) return `Từ ${formatDateDisplay(start)}`;
    return `${formatDateDisplay(start)} - ${formatDateDisplay(end)}`;
}

function createTaskCard(task) {
    const tags = task.tags ? task.tags.split(',').map(t => t.trim()) : [];
    // Xử lý nhiều assignees
    const assignees = task.assignees || [];
    const editable = canEditTask(task);
    const statusInfo = getTaskInsightStatus(task.status);
    const periodText = getTaskPeriodText(task);
    const frequencyText = getTaskFrequencyLabel(task.frequency, task.task_type);
    
    // Tạo avatar HTML cho nhiều assignees
    let assigneesHtml = '';
    if (assignees.length > 0) {
        assigneesHtml = assignees.map(assignee => {
            const assigneeName = assignee.full_name || assignee.username;
            if (assignee.avatar_url) {
                return `<img src="${escapeHtml(assignee.avatar_url)}" alt="${escapeHtml(assigneeName)}" class="task-assignee-avatar" title="${escapeHtml(assigneeName)}" onerror="onAvatarError(this,'task-assignee-avatar task-assignee-initials')">`;
            } else {
                const initials = (assigneeName || 'U').split(' ').map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('') || 'U';
                return `<div class="task-assignee-avatar task-assignee-initials" title="${escapeHtml(assigneeName)}">${initials}</div>`;
            }
        }).join('');
        
        // Thêm text hiển thị tên nếu chỉ có 1 assignee, hoặc số lượng nếu nhiều hơn
        if (assignees.length === 1) {
            assigneesHtml += `<span class="task-assignee-name">${escapeHtml(assignees[0].full_name || assignees[0].username)}</span>`;
        } else {
            assigneesHtml += `<span class="task-assignee-name">${assignees.length} assignees</span>`;
        }
    }
    
    return `
        <div class="task-card ${editable ? '' : 'task-card-readonly'}" draggable="${editable}" data-task-id="${task.id}" data-can-edit="${editable}">
            <div class="task-card-header">
                <div class="task-title">${escapeHtml(task.title)}</div>
                ${currentProjectIsOwner ? `<button class="task-delete-btn" onclick="handleDeleteTask(${task.id}, event)" title="Xóa task">×</button>` : ''}
            </div>
            ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
            <div class="task-meta">
                <span class="task-insight-status status-${statusInfo.key}">${escapeHtml(statusInfo.label)}</span>
                <span>${escapeHtml(frequencyText)}</span>
                <span>${escapeHtml(periodText)}</span>
            </div>
            ${assigneesHtml ? `<div class="task-assignee">${assigneesHtml}</div>` : ''}
            ${tags.length > 0 ? `
                <div class="task-tags">
                    ${tags.map(tag => `<span class="task-tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function createTaskSeriesCard(series) {
    const task = series.representative || series.tasks[0];
    const assignees = task.assignees || [];
    const statusInfo = getTaskInsightStatus(series.status);
    const frequencyText = getTaskFrequencyLabel(task.frequency, task.task_type);
    const nextPeriodText = getTaskPeriodText(task);
    const encodedKey = encodeURIComponent(series.key);
    const progress = series.totalCount ? Math.round((series.doneCount / series.totalCount) * 100) : 0;
    const assigneeText = assignees.length === 1
        ? (assignees[0].full_name || assignees[0].username)
        : assignees.length > 1
            ? `${assignees.length} người thực hiện`
            : 'Chưa phân công';

    return `
        <div class="task-card task-series-card" data-series-key="${encodedKey}" data-can-edit="false">
            <div class="task-card-header">
                <div>
                    <div class="task-series-eyebrow">Công việc lặp lại</div>
                    <div class="task-title">${escapeHtml(task.title || 'Task chưa đặt tên')}</div>
                </div>
                <span class="task-series-count">${series.doneCount}/${series.totalCount}</span>
            </div>
            ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
            <div class="task-meta">
                <span class="task-insight-status status-${statusInfo.key}">${escapeHtml(statusInfo.label)}</span>
                <span>${escapeHtml(frequencyText)}</span>
                <span>${escapeHtml(nextPeriodText)}</span>
            </div>
            <div class="task-series-progress" aria-label="${progress}% hoàn thành">
                <div class="task-series-progress-fill" style="width: ${progress}%"></div>
            </div>
            <div class="task-series-footer">
                <span>${escapeHtml(assigneeText)}</span>
                <strong>${series.totalCount} kỳ</strong>
            </div>
            <button type="button" class="task-series-open">Mở các kỳ thực hiện</button>
        </div>
    `;
}

async function createTask(taskData) {
    taskData.project_id = currentProjectId;
    const data = await apiCall('/tasks/', 'POST', taskData);
    if (data) {
        refreshCurrentProjectTasks();
        if (currentProjectId) {
            await loadActivities(currentProjectId);
        }
        closeTaskModal();
    }
}

async function updateTask(taskId, taskData) {
    const data = await apiCall(`/tasks/${taskId}`, 'PUT', taskData);
    if (data) {
        refreshCurrentProjectTasks();
        if (currentProjectId) {
            await loadActivities(currentProjectId);
        }
        closeTaskModal();
    }
}

async function deleteTask(taskId) {
    if (!confirm('Bạn có chắc chắn muốn xóa task này không?')) {
        return;
    }
    const data = await apiCall(`/tasks/${taskId}`, 'DELETE');
    if (data) {
        refreshCurrentProjectTasks();
    }
}

function handleDeleteTask(taskId, event) {
    event.stopPropagation(); // Ngăn trigger click vào card
    deleteTask(taskId);
}

// Drag and Drop
let draggedTask = null;

function handleDragStart(e) {
    if (e.currentTarget.dataset.canEdit !== 'true') {
        e.preventDefault();
        return;
    }
    draggedTask = e.currentTarget;
    e.currentTarget.classList.add('dragging');
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleTaskCardClick(e) {
    // Tránh trigger khi đang kéo thả
    if (e.currentTarget.classList.contains('dragging')) {
        return;
    }
    const taskId = parseInt(e.currentTarget.getAttribute('data-task-id'));
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const canEdit = e.currentTarget.dataset.canEdit === 'true';
    openTaskModal(task, !canEdit);
}

function handleTaskSeriesCardClick(e) {
    const rawKey = e.currentTarget.getAttribute('data-series-key');
    if (!rawKey) return;
    openTaskSeriesModal(decodeURIComponent(rawKey));
}

function ensureTaskSeriesModal() {
    let modal = document.getElementById('taskSeriesModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'taskSeriesModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content task-series-modal">
            <div class="modal-header">
                <div>
                    <div class="modal-subtitle">Recurring task</div>
                    <h2 id="taskSeriesModalTitle">Các kỳ thực hiện</h2>
                </div>
                <button type="button" class="modal-close" id="closeTaskSeriesModal">&times;</button>
            </div>
            <div class="task-series-modal-body" id="taskSeriesModalBody"></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeTaskSeriesModal();
    });
    modal.querySelector('#closeTaskSeriesModal')?.addEventListener('click', closeTaskSeriesModal);
    modal.querySelector('#taskSeriesModalBody')?.addEventListener('click', handleTaskSeriesModalAction);
    return modal;
}

function closeTaskSeriesModal() {
    const modal = document.getElementById('taskSeriesModal');
    if (modal) {
        modal.classList.remove('active');
    }
    activeTaskSeriesKey = null;
}

function openTaskSeriesModal(seriesKey) {
    activeTaskSeriesKey = seriesKey;
    const modal = ensureTaskSeriesModal();
    renderTaskSeriesModal();
    modal.classList.add('active');
}

function getActiveTaskSeries() {
    if (!activeTaskSeriesKey) return null;
    if (taskSeriesIndex.has(activeTaskSeriesKey)) {
        return taskSeriesIndex.get(activeTaskSeriesKey);
    }
    buildKanbanTaskItems(filteredTasks);
    return taskSeriesIndex.get(activeTaskSeriesKey) || null;
}

function renderTaskSeriesModal() {
    const series = getActiveTaskSeries();
    const title = document.getElementById('taskSeriesModalTitle');
    const body = document.getElementById('taskSeriesModalBody');
    if (!body) return;
    if (!series) {
        body.innerHTML = '<div class="empty-state">Không tìm thấy chuỗi công việc này.</div>';
        return;
    }

    const representative = series.representative || series.tasks[0];
    const progress = series.totalCount ? Math.round((series.doneCount / series.totalCount) * 100) : 0;
    if (title) title.textContent = representative.title || 'Các kỳ thực hiện';
    body.innerHTML = `
        <div class="task-series-summary">
            <div>
                <span>${escapeHtml(getTaskFrequencyLabel(representative.frequency, representative.task_type))}</span>
                <strong>${series.doneCount}/${series.totalCount} kỳ hoàn thành</strong>
                <p>${escapeHtml(representative.description || 'Chưa có mô tả công việc.')}</p>
            </div>
            <div class="task-series-summary-progress">
                <b>${progress}%</b>
                <div class="task-series-progress">
                    <div class="task-series-progress-fill" style="width: ${progress}%"></div>
                </div>
            </div>
        </div>
        <div class="task-series-occurrence-list">
            ${series.tasks.map(createTaskSeriesOccurrenceRow).join('')}
        </div>
    `;
}

function createTaskSeriesOccurrenceRow(task) {
    const statusInfo = getTaskInsightStatus(task.status);
    const canEdit = canEditTask(task);
    const assigneeText = (task.assignees || [])
        .map(assignee => assignee.full_name || assignee.username)
        .filter(Boolean)
        .join(', ') || 'Chưa phân công';
    return `
        <div class="task-series-occurrence" data-task-id="${task.id}">
            <div class="task-series-occurrence-main">
                <span class="task-insight-status status-${statusInfo.key}">${escapeHtml(statusInfo.label)}</span>
                <strong>${escapeHtml(getTaskPeriodText(task))}</strong>
                <p>${escapeHtml(assigneeText)}</p>
            </div>
            <div class="task-series-occurrence-actions">
                <button type="button" class="btn-secondary" data-series-action="open" data-task-id="${task.id}">Chi tiết</button>
                ${canEdit && task.status === 'todo' ? `<button type="button" class="btn-secondary" data-series-action="acknowledge" data-task-id="${task.id}">Nhận việc</button>` : ''}
                ${canEdit && task.status === 'in_progress' ? `<button type="button" class="btn-primary" data-series-action="complete" data-task-id="${task.id}">Hoàn thành</button>` : ''}
            </div>
        </div>
    `;
}

async function handleTaskSeriesModalAction(event) {
    const button = event.target.closest('[data-series-action]');
    if (!button) return;
    const taskId = Number(button.dataset.taskId);
    const action = button.dataset.seriesAction;
    const task = tasks.find(item => item.id === taskId);
    if (!task) return;

    if (action === 'open') {
        closeTaskSeriesModal();
        openTaskModal(task, !canEditTask(task));
        return;
    }

    button.disabled = true;
    if (action === 'acknowledge') {
        await apiCall(`/tasks/${taskId}/acknowledge`, 'POST');
    } else if (action === 'complete') {
        await apiCall(`/tasks/${taskId}/complete`, 'POST');
    }
    await refreshCurrentProjectTasks();
    renderTaskSeriesModal();
}

async function handleDrop(e) {
    e.preventDefault();
    if (!draggedTask) return;
    const column = e.currentTarget;
    const newStatus = column.getAttribute('data-status');
    const taskId = parseInt(draggedTask.getAttribute('data-task-id'));
    
    // Find position (simple: add to end)
    const tasksInColumn = tasks.filter(t => t.status === newStatus);
    const newPosition = tasksInColumn.length;
    
    const result = await apiCall(`/tasks/${taskId}/move`, 'POST', {
        new_status: newStatus,
        new_position: newPosition
    });
    
    if (result) {
        refreshCurrentProjectTasks();
    }
}

// Dashboard
async function loadDashboard() {
    _dashWireTabs();

    const [projectsData, allTasksData, meetingsData, ptypes] = await Promise.all([
        apiCall('/projects/'),
        apiCall('/tasks/?assigned_only=false'),
        apiCall('/periodic-meetings/'),
        apiCall('/projects/types/list'),
    ]);

    const now = new Date();
    const projects = projectsData || [];
    const allTasks = allTasksData || [];
    const meetings = meetingsData || [];

    const typeList = ptypes || [];

    dashboardTasks = allTasks;

    const taskMap = allTasks.reduce((m, t) => {
        if (!m[t.project_id]) m[t.project_id] = [];
        m[t.project_id].push(t);
        return m;
    }, {});

    const activeProjects  = projects.filter(p => p.status !== 'completed');
    const completedProjects = projects.filter(p => p.status === 'completed');
    const overdueProjects = projects.filter(p => isProjectOverdue(p, now));
    const atRiskProjects  = projects.filter(p => isProjectAtRisk(p, taskMap, now));

    // -- stat cards --
    _dashSetStat('dsSoDA',      activeProjects.length);
    _dashSetStat('dsQuaHan',    overdueProjects.length);
    _dashSetStat('dsChuY',      atRiskProjects.length);
    _dashSetStat('dsHoanThanh', completedProjects.length);

    // -- legacy compat IDs (hidden, referenced by old code) --
    _dashSetStat('statTotalProjects',  projects.length);
    _dashSetStat('statOverdueCount',   overdueProjects.length);
    updateWarningCards(atRiskProjects, overdueProjects);

    // -- tong-quan tab --
    _dashRenderProjectTable(projects, taskMap, typeList, now);
    _dashRenderUrgentList(atRiskProjects, overdueProjects);
    _dashRenderTeamWorkload(allTasks);

    // -- cua-toi tab --
    const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
    _dashRenderGreeting(allTasks);
    _dashRenderTodayTasks(allTasks, projectMap);
    _dashRenderDeadlines(allTasks, projectMap);
    _dashRenderMeetings(meetings);

}

function _dashSetStat(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function _dashWireTabs() {
    document.querySelectorAll('.dash-tab').forEach(btn => {
        if (btn.dataset.dashWired) return;
        btn.dataset.dashWired = '1';
        btn.addEventListener('click', () => {
            const tab = btn.dataset.dashTab;
            document.querySelectorAll('.dash-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const panel = document.getElementById(tab === 'tong-quan' ? 'dashPanelTongQuan' : 'dashPanelCuaToi');
            if (panel) panel.classList.add('active');
        });
    });
}

function _dashRenderProjectTable(projects, taskMap, typeList, now) {
    const tbody = document.getElementById('dashProjectTableBody');
    if (!tbody) return;
    if (!projects.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="dash-table-loading">Chưa có dự án nào</td></tr>';
        return;
    }
    const typeMap = Object.fromEntries((typeList || []).map(t => [t.id, t.name]));
    const userMap = Object.fromEntries((users || []).map(u => [u.id, u]));

    tbody.innerHTML = projects.map(p => {
        const pi = getProjectProgressInfo(p.id, taskMap);
        const pct = Math.round(pi.percent * 100);

        let statusClass = 'on-track', statusLabel = 'Bình thường';
        if (p.status === 'completed') { statusClass = 'completed'; statusLabel = 'Hoàn thành'; }
        else if (isProjectOverdue(p, now)) { statusClass = 'overdue'; statusLabel = 'Quá hạn'; }
        else if (isProjectAtRisk(p, taskMap, now)) { statusClass = 'at-risk'; statusLabel = 'Cần chú ý'; }

        let deadlineClass = '', deadlineText = '--';
        if (p.due_date) {
            const due = new Date(p.due_date);
            const diffDays = Math.ceil((due - now) / 86400000);
            deadlineText = formatDateDisplay(p.due_date);
            if (diffDays < 0) deadlineClass = 'overdue';
            else if (diffDays <= 7) deadlineClass = 'soon';
        }

        const owner = userMap[p.owner_id];
        const initials = owner ? (owner.full_name || owner.username || '?').slice(0, 2).toUpperCase() : '?';
        const ownerName = owner ? (owner.full_name || owner.username) : '—';

        return `<tr onclick="selectProject(${p.id})">
            <td class="dpt-name">${escapeHtml(p.name)}</td>
            <td><span class="dpt-type-badge">${escapeHtml(typeMap[p.project_type_id] || 'Khác')}</span></td>
            <td class="dpt-progress-wrap">
                <div class="dpt-progress-bar-bg"><div class="dpt-progress-bar-fill" style="width:${pct}%"></div></div>
                <div class="dpt-progress-label">${pct}% (${pi.done}/${pi.total} task)</div>
            </td>
            <td class="dpt-deadline ${deadlineClass}">${deadlineText}</td>
            <td><span class="dpt-status-badge ${statusClass}">${statusLabel}</span></td>
            <td class="dpt-owner"><div class="dpt-avatar">${initials}</div>${escapeHtml(ownerName)}</td>
        </tr>`;
    }).join('');
}

function _dashRenderUrgentList(atRisk, overdue) {
    const el = document.getElementById('dashUrgentList');
    if (!el) return;
    const items = [
        ...overdue.map(p => ({ p, cls: 'overdue', tag: 'Quá hạn' })),
        ...atRisk.filter(p => !overdue.find(o => o.id === p.id)).map(p => ({ p, cls: 'at-risk', tag: 'Cần chú ý' })),
    ].slice(0, 6);

    if (!items.length) {
        el.innerHTML = '<div class="dash-empty">Tất cả dự án đang đúng tiến độ</div>';
        return;
    }
    el.innerHTML = items.map(({ p, cls, tag }) => `
        <div class="dash-urgent-item ${cls}" onclick="selectProject(${p.id})">
            <div class="dash-urgent-item-header">
                <span class="dash-urgent-name">${escapeHtml(p.name)}</span>
                <span class="dash-urgent-tag ${cls}">${tag}</span>
            </div>
            <div class="dash-urgent-desc">${p.due_date ? 'Hạn: ' + formatDateDisplay(p.due_date) : 'Chưa có deadline'}</div>
        </div>`).join('');
}

function _dashRenderTeamWorkload(allTasks) {
    const el = document.getElementById('dashTeamWorkload');
    if (!el) return;
    const activeUsers = (users || []).filter(u => u.is_active !== false);
    if (!activeUsers.length) {
        el.innerHTML = '<div class="dash-empty">Chưa có thành viên nào</div>';
        return;
    }

    // build per-user counts from task assignees
    const counts = {};
    for (const t of allTasks) {
        for (const a of (t.assignees || [])) {
            if (!counts[a.id]) counts[a.id] = { todo: 0, in_progress: 0, done: 0 };
            const s = t.status === 'done' ? 'done' : t.status === 'in_progress' ? 'in_progress' : 'todo';
            counts[a.id][s]++;
        }
    }

    const AVATAR_COLORS = ['#6366f1','#3b82f6','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];

    el.innerHTML = activeUsers.map((u, i) => {
        const c = counts[u.id] || { todo: 0, in_progress: 0, done: 0 };
        const total = c.todo + c.in_progress + c.done;
        const donePct = total ? Math.round(c.done / total * 100) : 0;
        const name = u.full_name || u.username || '?';
        const initials = name.trim().split(/\s+/).map(w => w[0]).slice(-2).join('').toUpperCase();
        const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
        const dept = u.department || u.position || '';
        return `<div class="dtw-row">
            <div class="dtw-avatar" style="background:${color}">${initials}</div>
            <div class="dtw-info">
                <div class="dtw-name">${escapeHtml(name)}</div>
                ${dept ? `<div class="dtw-dept">${escapeHtml(dept)}</div>` : ''}
            </div>
            <div class="dtw-chips">
                ${c.in_progress ? `<span class="dtw-chip dtw-chip--progress">${c.in_progress} đang làm</span>` : ''}
                ${c.todo ? `<span class="dtw-chip dtw-chip--todo">${c.todo} chờ</span>` : ''}
                ${c.done ? `<span class="dtw-chip dtw-chip--done">${c.done} xong</span>` : ''}
                ${!total ? `<span class="dtw-chip dtw-chip--idle">Không có task</span>` : ''}
            </div>
            <div class="dtw-bar-wrap" title="${donePct}% hoàn thành">
                <div class="dtw-bar-bg">
                    <div class="dtw-bar-fill" style="width:${donePct}%"></div>
                </div>
            </div>
        </div>`;
    }).join('');
}

function _dashRenderGreeting(allTasks) {
    const nameEl = document.getElementById('dashGreetingName');
    const dateEl = document.getElementById('dashGreetingDate');
    const badgeEl = document.getElementById('dashGreetingTaskBadge');
    if (!currentUser) return;

    const firstName = (currentUser.full_name || currentUser.username || '').split(' ').pop();
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    if (nameEl) nameEl.textContent = `${greet}, ${firstName}!`;

    const days = ['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
    const d = new Date();
    if (dateEl) dateEl.textContent = `${days[d.getDay()]}, ${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;

    const myPending = allTasks.filter(t =>
        t.status !== 'done' &&
        (t.assignees || []).some(a => a.id === currentUser.id)
    ).length;
    if (badgeEl) {
        if (myPending > 0) {
            badgeEl.textContent = `${myPending} task chưa xong`;
            badgeEl.style.display = '';
        } else {
            badgeEl.style.display = 'none';
        }
    }
}

function _dashRenderTodayTasks(allTasks, projectMap) {
    const el = document.getElementById('dashTodayTasks');
    if (!el) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const todayStr = today.toISOString().slice(0,10);

    const myTasks = allTasks.filter(t =>
        t.due_date && t.due_date.slice(0,10) === todayStr &&
        (t.assignees || []).some(a => a.id === currentUser?.id)
    ).slice(0, 8);

    if (!myTasks.length) {
        el.innerHTML = '<div class="dash-empty">Không có task nào đến hạn hôm nay</div>';
        return;
    }
    const STATUS_LABEL = { todo: 'Chờ', in_progress: 'Đang làm', done: 'Xong' };
    const STATUS_CLS   = { todo: 'todo', in_progress: 'progress', done: 'done' };
    el.innerHTML = myTasks.map(t => {
        const cls = STATUS_CLS[t.status] || 'todo';
        const icon = t.status === 'done' ? 'task_alt' : 'radio_button_unchecked';
        const pName = (projectMap && projectMap[t.project_id]?.name) || '';
        return `<div class="dash-task-item" onclick="openTaskById(${t.id})">
            <div class="dash-task-icon ${t.status === 'done' ? 'done' : ''}">
                <span class="material-symbols-outlined">${icon}</span>
            </div>
            <div class="dash-task-body">
                <div class="dash-task-name ${t.status === 'done' ? 'done' : ''}">${escapeHtml(t.title)}</div>
                <div class="dash-task-meta">${escapeHtml(pName)}</div>
            </div>
            <span class="dash-task-status ${cls}">${STATUS_LABEL[t.status] || ''}</span>
        </div>`;
    }).join('');
}

function _dashRenderDeadlines(allTasks, projectMap) {
    const el = document.getElementById('dashUpcomingDeadlines');
    if (!el) return;
    const today = new Date(); today.setHours(0,0,0,0);

    const upcoming = allTasks
        .filter(t =>
            t.due_date && t.status !== 'done' &&
            (t.assignees || []).some(a => a.id === currentUser?.id)
        )
        .map(t => ({ t, due: new Date(t.due_date.slice(0,10) + 'T00:00:00') }))
        .sort((a, b) => a.due - b.due)
        .slice(0, 8);

    if (!upcoming.length) {
        el.innerHTML = '<div class="dash-empty">Không có deadline sắp tới</div>';
        return;
    }
    el.innerHTML = upcoming.map(({ t, due }) => {
        const diff = Math.ceil((due - today) / 86400000);
        let chipCls = 'normal', chipText = `${diff} ngày`;
        if (diff < 0)  { chipCls = 'overdue'; chipText = `Quá ${-diff} ngày`; }
        else if (diff === 0) { chipCls = 'today'; chipText = 'Hôm nay'; }
        else if (diff <= 3)  { chipCls = 'soon';  chipText = `${diff} ngày`; }
        const pName = (projectMap && projectMap[t.project_id]?.name) || '';
        return `<div class="dash-deadline-item" onclick="openTaskById(${t.id})">
            <div class="dash-deadline-body">
                <div class="dash-deadline-name">${escapeHtml(t.title)}</div>
                <div class="dash-deadline-project">${escapeHtml(pName)} · ${formatDateDisplay(t.due_date)}</div>
            </div>
            <span class="dash-days-chip ${chipCls}">${chipText}</span>
        </div>`;
    }).join('');
}

function _dashRenderMeetings(meetings) {
    const el = document.getElementById('dashMeetingList');
    if (!el) return;
    if (!currentUser || !meetings.length) {
        el.innerHTML = '<div class="dash-empty">Không có phiên họp nào được phân công</div>';
        return;
    }
    // The API already filters to current user's meetings; sort by next_session
    const myMeetings = [...meetings].sort((a, b) => {
        if (!a.next_session && !b.next_session) return 0;
        if (!a.next_session) return 1;
        if (!b.next_session) return -1;
        return a.next_session.localeCompare(b.next_session);
    });
    if (!myMeetings.length) {
        el.innerHTML = '<div class="dash-empty">Không có phiên họp nào được phân công</div>';
        return;
    }
    const FREQ = { weekly: 'Hàng tuần', monthly: 'Hàng tháng', quarterly: 'Hàng quý' };
    const today = new Date(); today.setHours(0,0,0,0);
    el.innerHTML = myMeetings.slice(0, 5).map(m => {
        const freq = FREQ[m.frequency] || m.frequency || '';
        const nextDate = m.next_session ? formatDateDisplay(m.next_session) : '';
        const nextDue = m.next_session ? new Date(m.next_session + 'T00:00:00') : null;
        const diffDays = nextDue ? Math.ceil((nextDue - today) / 86400000) : null;
        const isOpen = diffDays !== null && diffDays <= 7 && diffDays >= 0;
        return `<div class="dash-meeting-item" onclick="openPmMeetingFromDash(${m.id})">
            <div class="dash-meeting-icon">
                <span class="material-symbols-outlined">event_repeat</span>
            </div>
            <div class="dash-meeting-body">
                <div class="dash-meeting-name">${escapeHtml(m.title)}</div>
                <div class="dash-meeting-sub">${freq}${nextDate ? ' · Phiên tiếp: ' + nextDate : ''}</div>
            </div>
            ${isOpen ? '<span class="dash-meeting-date-chip open">Sắp tới</span>' : nextDate ? '<span class="dash-meeting-date-chip">' + nextDate + '</span>' : ''}
        </div>`;
    }).join('');
}

async function openPmMeetingFromDash(meetingId) {
    switchView('personal');
    showPersonalSection('meeting', true, false);
    showMeetingMode('periodic');
    await new Promise(r => setTimeout(r, 80));
    openPmSessionBoard(meetingId);
}

function openTaskById(taskId) {
    const task = dashboardTasks.find(t => t.id === taskId) || tasks.find(t => t.id === taskId);
    if (!task) return;
    if (task.project_id) {
        currentProjectId = task.project_id;
        switchView('board');
        setTimeout(() => {
            const el = document.querySelector(`[data-task-id="${taskId}"]`);
            if (el) el.click(); else openTaskModal(task);
        }, 300);
    } else {
        openTaskModal(task);
    }
}

// Upcoming Deadlines
async function loadUpcomingDeadlines() {
    if (!currentUser) return;
    
    try {
        // Load tasks assigned to current user
        const tasksData = await apiCall('/tasks/?assigned_only=true');
        if (!tasksData) {
            renderUpcomingDeadlines([]);
            return;
        }
        
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        
        // Filter tasks with due_date, not completed, and due_date >= today
        const upcomingTasks = tasksData
            .filter(task => {
                if (!task.due_date) return false;
                if (task.status === 'done') return false;
                
                const dueDate = new Date(task.due_date);
                dueDate.setHours(0, 0, 0, 0);
                return dueDate >= now;
            })
            .sort((a, b) => {
                const dateA = new Date(a.due_date);
                const dateB = new Date(b.due_date);
                return dateA - dateB;
            })
            .slice(0, 10); // Limit to 10 most urgent
        
        renderUpcomingDeadlines(upcomingTasks);
    } catch (error) {
        console.error('Error loading upcoming deadlines:', error);
        renderUpcomingDeadlines([]);
    }
}

function renderUpcomingDeadlines(tasks) {
    const container = document.getElementById('upcomingDeadlinesList');
    if (!container) return;
    
    if (!tasks || tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                <div style="margin-bottom: 12px;">Xin chúc mừng! Bạn đã hoàn thành toàn bộ deadline</div>
                <span class="material-symbols-outlined" style="font-size: 56px; color: var(--primary-color);">sentiment_satisfied</span>
            </div>
        `;
        return;
    }
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    container.innerHTML = tasks.map(task => {
        const dueDate = new Date(task.due_date);
        dueDate.setHours(0, 0, 0, 0);
        const daysDiff = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
        
        let urgencyClass = '';
        if (daysDiff <= 3) {
            urgencyClass = 'urgent';
        } else if (daysDiff <= 7) {
            urgencyClass = 'warning';
        }
        
        const formattedDate = dueDate.toLocaleDateString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        
        const daysText = daysDiff === 0 ? 'Hôm nay' : daysDiff === 1 ? '1 ngày' : `${daysDiff} ngày`;
        
        return `
            <div class="upcoming-deadline-item ${urgencyClass}" onclick="openTaskFromDeadline(${task.id})">
                <div class="upcoming-deadline-task-name">${escapeHtml(task.title)}</div>
                <div class="upcoming-deadline-date">
                    <svg class="upcoming-deadline-date-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                    </svg>
                    Due: ${formattedDate} (${daysText})
                </div>
            </div>
        `;
    }).join('');
}

function openTaskFromDeadline(taskId) {
    // Find the task and open it
    const task = tasks.find(t => t.id === taskId) || dashboardTasks.find(t => t.id === taskId);
    if (task) {
        // Switch to board view and select the project
        if (task.project_id) {
            currentProjectId = task.project_id;
            switchView('board');
            // Wait a bit for view to load, then open task
            setTimeout(() => {
                const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
                if (taskElement) {
                    taskElement.click();
                } else {
                    // Try to open task modal directly
                    openTaskModal(task);
                }
            }, 300);
        } else {
            openTaskModal(task);
        }
    }
}

async function renderTodayTasks() {
    const container = document.getElementById('todayTasksList');
    if (!container) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Load todos for today
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    
    const todayTodos = await apiCall(`/todos/?start_date=${start.toISOString()}&end_date=${end.toISOString()}`);
    
    if (!todayTodos || todayTodos.length === 0) {
        container.innerHTML = '<div class="empty-state">Chưa có công việc nào cho ngày hôm nay.</div>';
        return;
    }
    
    container.innerHTML = todayTodos.map(todo => {
        const todoDate = new Date(todo.planned_date);
        todoDate.setHours(0, 0, 0, 0);
        const isPast = todoDate < today && !todo.is_done;
        
        let statusClass = 'in-progress';
        let statusText = 'In Progress';
        if (todo.is_done) {
            statusClass = 'done';
            statusText = 'Done';
        } else if (isPast) {
            statusClass = 'late';
            statusText = 'Late';
        }
        
        return `
            <div class="today-task-row">
                <div class="task-col-status">
                    <span class="task-status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="task-col-title">${escapeHtml(todo.title)}</div>
                <div class="task-col-description">${escapeHtml(todo.description || '')}</div>
                <div class="task-col-actions">
                    <button class="task-action-btn ${todo.is_done ? 'done' : ''}" onclick="toggleTodayTodo(${todo.id})">
                        ${todo.is_done ? '↺ Hoàn tác' : '✓ Done'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function toggleTodayTodo(todoId) {
    const result = await apiCall(`/todos/${todoId}/toggle`, 'POST');
    if (result) {
        await renderTodayTasks();
        // Also refresh todos list and calendar if needed
        const dateInput = document.getElementById('todoDate');
        const referenceDate = dateInput?.value ? new Date(dateInput.value) : dashboardMonth;
        await loadTodos(referenceDate);
        renderTodoDayList();
    }
}

// Modals
async function openProjectModal(project = null) {
    const modal = document.getElementById('projectModal');
    const form = document.getElementById('projectForm');
    const modalContent = modal?.querySelector('.modal-content');
    
    // Load project types, MTCL and users into dropdowns/pickers
    await Promise.all([loadProjectTypes(), loadProjectObjectives(), loadUsers()]);
    
    if (project) {
        projectModalOwnerId = project.owner_id || currentUser?.id || null;
        document.getElementById('projectModalTitle').textContent = 'Chỉnh sửa dự án';
        document.getElementById('projectId').value = project.id;
        document.getElementById('projectName').value = project.name;
        document.getElementById('projectDescription').value = project.description || '';
        document.getElementById('projectColor').value = project.color || '#6366f1';
        document.getElementById('projectType').value = project.project_type_id || '';
        document.getElementById('projectObjectiveGroup').value = project.objective_group || '';
        syncProjectObjectiveSelection(project.objective_description || '');
        if (project.due_date) {
            const due = new Date(project.due_date);
            document.getElementById('projectDueDate').value = due.toISOString().slice(0, 10);
        } else {
            document.getElementById('projectDueDate').value = '';
        }
        projectModalTeamMembers = await fetchProjectTeamMembers(project.id);
    } else {
        projectModalOwnerId = currentUser?.id || null;
        document.getElementById('projectModalTitle').textContent = 'Tạo dự án';
        form.reset();
        document.getElementById('projectId').value = '';
        document.getElementById('projectColor').value = '#6366f1';
        document.getElementById('projectType').value = '';
        document.getElementById('projectObjectiveGroup').value = '';
        syncProjectObjectiveSelection();
        document.getElementById('projectDueDate').value = '';
        projectModalTeamMembers = [];
    }

    renderProjectMemberPicker(project);
    modal.classList.add('active');
    if (modalContent) {
        modalContent.scrollTop = 0;
    }
}

async function fetchProjectTeamMembers(projectId) {
    if (!projectId) return [];
    const data = await apiCall(`/teams/project/${projectId}`);
    return Array.isArray(data) ? data : [];
}

function getProjectModalOwnerId(project = null) {
    return project?.owner_id || projectModalOwnerId || currentUser?.id || null;
}

function renderProjectMemberPicker(project = null) {
    const list = document.getElementById('projectMemberPickerList');
    const count = document.getElementById('projectMemberPickerCount');
    if (!list) return;

    const ownerId = getProjectModalOwnerId(project);
    const selectedIds = new Set((projectModalTeamMembers || []).map(member => member.user_id));
    if (ownerId) selectedIds.add(ownerId);

    if (!users.length) {
        list.innerHTML = '<div class="empty-state">Chưa có user nào trong hệ thống.</div>';
        if (count) count.textContent = '0 thành viên';
        return;
    }

    const sortedUsers = users.slice().sort((a, b) => {
        if (a.id === ownerId) return -1;
        if (b.id === ownerId) return 1;
        return (a.full_name || a.username || '').localeCompare((b.full_name || b.username || ''), 'vi');
    });

    list.innerHTML = sortedUsers.map(user => {
        const name = escapeHtml(user.full_name || user.username || `User ${user.id}`);
        const code = escapeHtml(user.username || `U${user.id}`);
        const isOwner = user.id === ownerId;
        const checked = selectedIds.has(user.id);
        const label = `${name} (${code})${isOwner ? ' · Owner' : ''}`;
        return `<label class="assignee-checkbox${isOwner ? ' is-owner' : ''}">
            <input type="checkbox" value="${user.id}" class="project-member-picker-input assignee-checkbox-input" ${checked ? 'checked' : ''} ${isOwner ? 'disabled' : ''}>
            <span class="assignee-checkbox-label">
                <span class="assignee-name-text">${label}</span>
            </span>
        </label>`;
    }).join('');

    updateProjectMemberPickerCount();
    list.querySelectorAll('.project-member-picker-input').forEach(input => {
        input.addEventListener('change', updateProjectMemberPickerCount);
    });
}

function getSelectedProjectMemberIds() {
    const ids = Array.from(document.querySelectorAll('.project-member-picker-input:checked'))
        .map(input => Number(input.value))
        .filter(Boolean);
    const ownerId = getProjectModalOwnerId();
    if (ownerId && !ids.includes(ownerId)) ids.push(ownerId);
    return ids;
}

function updateProjectMemberPickerCount() {
    const count = document.getElementById('projectMemberPickerCount');
    if (!count) return;
    const total = getSelectedProjectMemberIds().length;
    count.textContent = `${total} thành viên`;
}

async function syncProjectTeamMembers(projectId) {
    if (!projectId) return;
    const selectedIds = new Set(getSelectedProjectMemberIds());
    const ownerId = getProjectModalOwnerId();
    if (ownerId) selectedIds.delete(ownerId);

    const currentMembers = await fetchProjectTeamMembers(projectId);
    const currentByUserId = new Map(currentMembers.map(member => [member.user_id, member]));

    const addJobs = Array.from(selectedIds)
        .filter(userId => !currentByUserId.has(userId))
        .map(userId => apiCall('/teams/', 'POST', { project_id: projectId, user_id: userId, role: 'member' }));

    const removeJobs = currentMembers
        .filter(member => member.user_id !== ownerId && !selectedIds.has(member.user_id))
        .map(member => apiCall(`/teams/${member.id}`, 'DELETE'));

    await Promise.all([...addJobs, ...removeJobs]);
}

function localizeProjectModal() {
    const formGroups = Array.from(document.querySelectorAll('#projectModal .form-group'));
    if (formGroups.length < 7) return;

    const [nameGroup, descriptionGroup, typeGroup, objectiveGroup, objectiveDescriptionGroup, dueDateGroup, colorGroup, membersGroup] = formGroups;
    const setGroupLabel = (group, text) => {
        const label = group?.querySelector('label');
        if (label) {
            label.textContent = text;
        }
    };
    const setHint = (group, text) => {
        const hint = group?.querySelector('.input-hint');
        if (hint) {
            hint.textContent = text;
        }
    };

    setGroupLabel(nameGroup, 'Tên dự án');
    setGroupLabel(descriptionGroup, 'Mô tả dự án');
    setGroupLabel(typeGroup, 'Loại dự án');
    setHint(typeGroup, 'Phân loại dự án theo cấp độ (Công ty / Phòng ban).');

    const objectiveLabels = objectiveGroup?.querySelectorAll('label') || [];
    if (objectiveLabels.length > 1) {
        objectiveLabels[0].remove();
    }
    setGroupLabel(objectiveGroup, 'Mục tiêu chất lượng');
    setHint(objectiveGroup, 'Bước 1: chọn mục tiêu chất lượng duy nhất.');

    setGroupLabel(objectiveDescriptionGroup, 'Mô tả mục tiêu chất lượng');
    setHint(objectiveDescriptionGroup, 'Bước 2: chọn mô tả thuộc mục tiêu đã chọn.');

    const dueDateInput = dueDateGroup?.querySelector('#projectDueDate');
    if (dueDateGroup && dueDateInput) {
        let dueDateLabel = dueDateGroup.querySelector('label');
        if (!dueDateLabel) {
            dueDateLabel = document.createElement('label');
            dueDateGroup.insertBefore(dueDateLabel, dueDateInput);
        }
        dueDateLabel.textContent = 'Ngày hoàn thành dự kiến';
    }
    setHint(dueDateGroup, 'Dùng để theo dõi tiến độ hoàn thành dự án.');

    setGroupLabel(colorGroup, 'Màu nhận diện');
    setGroupLabel(membersGroup, 'Thành viên dự án');
    setHint(membersGroup, 'Danh sách này sẽ được dùng trong vùng phân công của popup New Task.');

    const cancelButton = document.getElementById('cancelProject');
    if (cancelButton) {
        cancelButton.textContent = 'Hủy';
    }
    const submitButton = document.querySelector('#projectForm button[type="submit"]');
    if (submitButton) {
        submitButton.textContent = 'Lưu dự án';
    }
}

async function loadProjectTypes() {
    try {
        const projectTypes = await apiCall('/projects/types/list');
        const select = document.getElementById('projectType');
        if (!select) return;
        
        // Lưu giá trị hiện tại
        const currentValue = select.value;
        
        // Clear và thêm options
        select.innerHTML = '<option value="">-- Chọn loại dự án --</option>';
        
        if (projectTypes && projectTypes.length > 0) {
            projectTypes.forEach(type => {
                const option = document.createElement('option');
                option.value = type.id;
                option.textContent = type.name;
                select.appendChild(option);
            });
        }
        
        // Khôi phục giá trị nếu có
        if (currentValue) {
            select.value = currentValue;
        }
    } catch (error) {
        console.error('Error loading project types:', error);
    }
}

async function loadProjectObjectives() {
    try {
        const objectiveSelect = document.getElementById('projectObjectiveGroup');
        const descriptionSelect = document.getElementById('projectObjectiveDescription');
        if (!objectiveSelect || !descriptionSelect) return;

        const currentValue = objectiveSelect.value;
        const mtclData = await apiCall('/mtcl/');
        projectObjectiveItems = Array.isArray(mtclData) ? mtclData : [];
        objectiveSelect.innerHTML = '<option value="">-- Chọn mục tiêu chất lượng --</option>';
        descriptionSelect.innerHTML = '<option value="">-- Chọn mô tả mục tiêu chất lượng --</option>';

        const uniqueGroups = [...new Set(projectObjectiveItems
            .map((item) => item.objective_group)
            .filter(Boolean))];

        uniqueGroups.forEach((groupName) => {
            const option = document.createElement('option');
            option.value = groupName;
            option.textContent = groupName;
            objectiveSelect.appendChild(option);
        });

        if (currentValue) {
            objectiveSelect.value = currentValue;
        }
    } catch (error) {
        console.error('Error loading MTCL objectives:', error);
    }
}

function syncProjectObjectiveSelection(selectedDescription = '') {
    const objectiveSelect = document.getElementById('projectObjectiveGroup');
    const descriptionSelect = document.getElementById('projectObjectiveDescription');
    if (!objectiveSelect || !descriptionSelect) return;

    const selectedGroup = objectiveSelect.value;
    const descriptions = projectObjectiveItems.filter((item) => item.objective_group === selectedGroup);
    descriptionSelect.innerHTML = '<option value="">-- Chọn mô tả mục tiêu chất lượng --</option>';

    descriptions.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.description || '';
        option.textContent = item.description || '';
        descriptionSelect.appendChild(option);
    });

    if (selectedDescription && descriptions.some((item) => item.description === selectedDescription)) {
        descriptionSelect.value = selectedDescription;
    } else {
        descriptionSelect.value = '';
    }
}

function closeProjectModal() {
    document.getElementById('projectModal').classList.remove('active');
    projectModalTeamMembers = [];
    projectModalOwnerId = null;
}

function normalizeDateInput(value) {
    if (!value) return null;
    const trimmed = value.trim();
    
    let day;
    let month;
    let year;
    
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
        [day, month, year] = trimmed.split('/');
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        [year, month, day] = trimmed.split('-');
    } else {
        const parsedDate = new Date(trimmed);
        if (Number.isNaN(parsedDate.getTime())) {
            console.warn('Không thể parse ngày hạn project:', value);
            return null;
        }
        year = parsedDate.getFullYear().toString();
        month = String(parsedDate.getMonth() + 1).padStart(2, '0');
        day = String(parsedDate.getDate()).padStart(2, '0');
    }

    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    if (![dayNum, monthNum, yearNum].every(Number.isFinite)) {
        console.warn('Ngày không hợp lệ:', value);
        return null;
    }

    const utcDate = new Date(Date.UTC(yearNum, monthNum - 1, dayNum, 0, 0, 0));
    if (
        Number.isNaN(utcDate.getTime()) ||
        utcDate.getUTCFullYear() !== yearNum ||
        utcDate.getUTCMonth() + 1 !== monthNum ||
        utcDate.getUTCDate() !== dayNum
    ) {
        console.warn('Ngày không tồn tại:', value);
        return null;
    }

    const normalizedYear = String(yearNum).padStart(4, '0');
    const normalizedMonth = String(monthNum).padStart(2, '0');
    const normalizedDay = String(dayNum).padStart(2, '0');
    return `${normalizedYear}-${normalizedMonth}-${normalizedDay}T00:00:00Z`;
}

function handleProjectSubmit(e) {
    e.preventDefault();
    const projectId = document.getElementById('projectId').value;
    const projectTypeId = document.getElementById('projectType').value;
    const objectiveGroup = document.getElementById('projectObjectiveGroup').value;
    const objectiveDescription = document.getElementById('projectObjectiveDescription').value;
    const dueDateValue = document.getElementById('projectDueDate').value;
    const normalizedDueDate = normalizeDateInput(dueDateValue);
    if (objectiveGroup && !objectiveDescription) {
        alert('Vui lòng chọn mô tả mục tiêu chất lượng tương ứng.');
        return;
    }
    if (dueDateValue && !normalizedDueDate) {
        alert('Ngày hoàn thành dự án không hợp lệ. Vui lòng nhập theo định dạng dd/mm/yyyy hoặc chọn ngày từ lịch.');
        return;
    }
    const projectData = {
        name: document.getElementById('projectName').value,
        description: document.getElementById('projectDescription').value,
        objective_group: objectiveGroup || null,
        objective_description: objectiveGroup ? objectiveDescription : null,
        color: document.getElementById('projectColor').value,
        project_type_id: projectTypeId ? parseInt(projectTypeId) : null,
        due_date: normalizedDueDate
    };
    
    if (projectId) {
        updateProject(parseInt(projectId), projectData);
    } else {
        createProject(projectData);
    }
}

function toDateInputValue(value) {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function fromDateInputValue(value) {
    return value ? `${value}T00:00:00` : null;
}

function calculateTaskPeriodEnd(startValue, frequency) {
    if (!startValue) return '';
    const [year, month, day] = startValue.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return '';

    if (frequency === 'weekly') {
        const daysUntilSaturday = (6 - date.getDay() + 7) % 7;
        date.setDate(date.getDate() + daysUntilSaturday);
    } else if (frequency === 'monthly') {
        date.setMonth(date.getMonth() + 1, 0);
    } else if (frequency === 'quarterly') {
        const quarterEndMonth = Math.floor(date.getMonth() / 3) * 3 + 2;
        date.setMonth(quarterEndMonth + 1, 0);
    } else if (frequency === 'semiannual') {
        date.setMonth(date.getMonth() <= 5 ? 6 : 12, 0);
    } else if (frequency === 'yearly') {
        date.setMonth(12, 0);
    }

    return toDateInputValue(date);
}

function _setTaskType(type) {
    document.getElementById('taskType').value = type;
    document.querySelectorAll('#taskTypeToggle .task-type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === type);
    });
    const isRecurring = type === 'recurring';
    document.getElementById('taskScheduleRecurring').style.display = isRecurring ? '' : 'none';
    document.getElementById('taskScheduleOneTime').style.display  = isRecurring ? 'none' : '';
    updateTaskPeriodPreview();
}

function handleTaskScheduleChange(event) {
    const frequencyEl = document.getElementById('taskFrequency');
    const startEl = document.getElementById('taskPeriodStart');
    const endEl = document.getElementById('taskPeriodEnd');
    const frequency = frequencyEl?.value || 'weekly';
    const start = startEl?.value || '';

    if (endEl && start && event?.target?.id !== 'taskPeriodEnd') {
        endEl.value = calculateTaskPeriodEnd(start, frequency);
    }
    updateTaskPeriodPreview();
}

function updateTaskPeriodPreview() {
    const preview = document.getElementById('taskPeriodPreview');
    if (!preview) return;
    const type = document.getElementById('taskType')?.value || 'recurring';
    if (type === 'one_time') {
        const from = document.getElementById('taskOneTimeFrom')?.value || '';
        const to   = document.getElementById('taskOneTimeTo')?.value || '';
        preview.textContent = from && to
            ? `Phát sinh · ${formatDateDisplay(from)} – ${formatDateDisplay(to)}`
            : 'Chọn khoảng thời gian thực hiện.';
        return;
    }
    const frequency = document.getElementById('taskFrequency')?.value || '';
    const start = document.getElementById('taskPeriodStart')?.value || '';
    const end = document.getElementById('taskPeriodEnd')?.value || '';
    if (!start || !end) {
        preview.textContent = 'Chọn tần suất để tự tính kỳ hạn.';
        return;
    }
    preview.textContent = `${getTaskFrequencyLabel(frequency)} · ${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
}

function updateTaskStatusDisplay(task) {
    const display = document.getElementById('taskStatusDisplay');
    const panel = document.getElementById('taskStatusPanel');
    if (!display || !panel) return;
    const status = task?.status || 'todo';
    display.textContent = getTaskStatusLabel(status);
    panel.dataset.status = status;
}

function openTaskModal(task = null, readOnly = false) {
    if (!currentProjectId) {
        alert('Vui lòng chọn project trước!');
        return;
    }
    if (!task && !currentProjectIsOwner) {
        alert('Chỉ Project Manager mới được tạo task.');
        return;
    }
    
    const modal = document.getElementById('taskModal');
    const form = document.getElementById('taskForm');
    
    updateAssigneesList();
    currentTaskData = task || null;
    currentEditingTaskId = task ? task.id : null;
    taskModalReadOnly = readOnly;

    if (task) {
        document.getElementById('taskModalTitle').textContent = 'Edit Task';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDescription').value = task.description || '';

        const ttype = task.task_type === 'one_time' ? 'one_time' : 'recurring';
        _setTaskType(ttype);
        if (ttype === 'one_time') {
            document.getElementById('taskOneTimeFrom').value = toDateInputValue(task.period_start || task.created_at);
            document.getElementById('taskOneTimeTo').value   = toDateInputValue(task.period_end || task.due_date);
        } else {
            document.getElementById('taskFrequency').value   = task.frequency || 'weekly';
            document.getElementById('taskPeriodStart').value = toDateInputValue(task.period_start || task.created_at);
            document.getElementById('taskPeriodEnd').value   = toDateInputValue(task.period_end || task.due_date);
            document.getElementById('taskRepeatUntil').value = toDateInputValue(task.repeat_until);
        }

        const assigneeIds = task.assignees ? task.assignees.map(a => a.id) : [];
        document.querySelectorAll('.assignee-checkbox-input').forEach(checkbox => {
            checkbox.checked = assigneeIds.includes(parseInt(checkbox.value));
        });
    } else {
        document.getElementById('taskModalTitle').textContent = 'New Task';
        form.reset();
        document.getElementById('taskId').value = '';
        _setTaskType('recurring');
        document.getElementById('taskFrequency').value = 'weekly';
        document.getElementById('taskPeriodStart').value = toDateInputValue(new Date());
        document.getElementById('taskPeriodEnd').value = calculateTaskPeriodEnd(document.getElementById('taskPeriodStart').value, 'weekly');

        document.querySelectorAll('.assignee-checkbox-input').forEach(checkbox => {
            checkbox.checked = false;
        });
    }
    
    updateTaskStatusDisplay(task);
    updateTaskPeriodPreview();
    updateAssigneeDropdownLabel();
    document.getElementById('taskAssigneesContainer')?.classList.remove('open');
    renderTaskExtras(task);
    applyTaskModalReadOnlyState(readOnly);
    
    modal.classList.add('active');
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.remove('active');
    currentEditingTaskId = null;
    currentTaskData = null;
    taskModalReadOnly = false;
}

function handleTaskSubmit(e) {
    e.preventDefault();
    if (taskModalReadOnly) {
        alert('Task này chỉ có thể xem, không thể chỉnh sửa.');
        return;
    }
    const taskId = document.getElementById('taskId').value;
    const ttype = document.getElementById('taskType')?.value || 'recurring';
    const taskData = {
        title: document.getElementById('taskTitle').value,
        description: document.getElementById('taskDescription').value,
        task_type: ttype,
    };
    if (ttype === 'one_time') {
        const from = document.getElementById('taskOneTimeFrom').value;
        const to   = document.getElementById('taskOneTimeTo').value;
        taskData.period_start  = fromDateInputValue(from);
        taskData.period_end    = fromDateInputValue(to);
        taskData.due_date      = fromDateInputValue(to);
        taskData.frequency     = null;
        taskData.repeat_until  = null;
    } else {
        taskData.frequency     = document.getElementById('taskFrequency').value;
        taskData.period_start  = fromDateInputValue(document.getElementById('taskPeriodStart').value);
        taskData.period_end    = fromDateInputValue(document.getElementById('taskPeriodEnd').value);
        taskData.repeat_until  = fromDateInputValue(document.getElementById('taskRepeatUntil').value);
    }
    if (!taskId) {
        taskData.status = 'todo';
        taskData.priority = 'medium';
    }
    // Lấy danh sách assignee_ids từ checkboxes
    const assigneeCheckboxes = document.querySelectorAll('.assignee-checkbox-input:checked');
    const assigneeIds = Array.from(assigneeCheckboxes).map(cb => parseInt(cb.value));
    taskData.assignee_ids = assigneeIds.length > 0 ? assigneeIds : null;
    
    if (taskId) {
        updateTask(parseInt(taskId), taskData);
    } else {
        createTask(taskData);
    }
}

function getAssigneeName(userId) {
    if (!userId) return '';
    const user = users.find(u => u.id === userId);
    if (!user) return '';
    return user.full_name || user.username || '';
}

function getAssignee(userId) {
    if (!userId) return null;
    return users.find(u => u.id === userId) || null;
}

function canEditTask(task) {
    if (!task || !currentUser) return false;
    if (currentProjectIsOwner) return true;
    
    // Kiểm tra nếu user có trong danh sách assignees
    const assigneeIds = task.assignees ? task.assignees.map(a => a.id) : [];
    return assigneeIds.includes(currentUser.id);
}

function updateProjectSummaryInfo() {
    const summarySection = document.getElementById('projectSummarySection');
    const descriptionLabel = document.getElementById('projectDescriptionDisplay');
    const objectiveLabel = document.getElementById('projectObjectiveDisplay');
    const timelineLabel = document.getElementById('projectTimelineDisplay');
    if (!summarySection) return;
    if (!currentProject) {
        summarySection.style.display = 'none';
        if (descriptionLabel) descriptionLabel.textContent = '--';
        if (objectiveLabel) objectiveLabel.innerHTML = '<span class="summary-pill muted">--</span>';
        if (timelineLabel) timelineLabel.textContent = '--';
        updateProjectSummaryProgress(true);
        projectMembers = [];
        selectedProjectMemberId = null;
        renderProjectGoals();
        renderProjectMembers();
        return;
    }
    summarySection.style.display = 'grid';
    if (descriptionLabel) {
        descriptionLabel.textContent = currentProject.description || 'Chưa có mô tả dự án.';
    }
    if (objectiveLabel) {
        const pills = [];
        if (currentProject.objective_group) {
            pills.push(`<span class="summary-pill">${escapeHtml(currentProject.objective_group)}</span>`);
        }
        objectiveLabel.innerHTML = pills.join('') || '<span class="summary-pill muted">Chưa liên kết MTCL</span>';
    }
    if (timelineLabel) {
        const startText = formatDateDisplay(currentProject.created_at);
        const endText = currentProject.due_date ? formatDateDisplay(currentProject.due_date) : 'Chưa thiết lập';
        timelineLabel.textContent = `${startText} - ${endText}`;
    }
    renderProjectGoals();
}

function updateProjectSummaryProgress(reset = false) {
    const text = document.getElementById('projectProgressText');
    const fill = document.getElementById('projectProgressFill');
    if (!text || !fill) return;
    if (reset || !currentProjectId) {
        text.textContent = '0% (0/0)';
        fill.style.width = '0%';
        fill.style.background = getProgressColor(0);
        return;
    }
    const total = filteredTasks.length;
    const done = filteredTasks.filter(t => t.status === 'done').length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    text.textContent = `${percent}% (${done}/${total})`;
    fill.style.width = `${percent}%`;
    fill.style.background = getProgressColor(percent);
}

function formatDateDisplay(dateValue) {
    if (!dateValue) return '--';
    // Nếu là Date object, dùng trực tiếp
    if (dateValue instanceof Date) {
        if (Number.isNaN(dateValue.getTime())) return '--';
        return dateValue.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    // Nếu là string, chuẩn hóa trước khi parse
    const normalized = String(dateValue).replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isProjectOverdue(project, now = new Date()) {
    if (!project?.due_date) return false;
    const due = new Date(project.due_date);
    return due < now && project.status !== 'completed';
}

function isProjectAtRisk(project, taskMap, now = new Date()) {
    if (!project?.due_date || project.status === 'completed') return false;
    const due = new Date(project.due_date);
    if (due <= now) return false;
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + AT_RISK_DAYS_THRESHOLD);
    if (due > cutoff) return false;
    const progressInfo = getProjectProgressInfo(project.id, taskMap);
    return progressInfo.percent < AT_RISK_PROGRESS_THRESHOLD;
}

function getProjectProgressInfo(projectId, taskMap) {
    const projectTasks = taskMap[projectId] || [];
    const total = projectTasks.length;
    const done = projectTasks.filter(t => t.status === 'done').length;
    return {
        total,
        done,
        percent: total ? done / total : 0
    };
}

function updateWarningCards(atRiskProjects, overdueProjects) {
    const atRiskCountEl = document.getElementById('warningAtRiskCount');
    const atRiskListEl = document.getElementById('warningAtRiskList');
    const overdueCountEl = document.getElementById('warningOverdueCount');
    const overdueListEl = document.getElementById('warningOverdueList');

    if (atRiskCountEl) atRiskCountEl.textContent = atRiskProjects.length;
    if (atRiskListEl) {
        atRiskListEl.innerHTML = formatWarningList(atRiskProjects);
    }
    if (overdueCountEl) overdueCountEl.textContent = overdueProjects.length;
    if (overdueListEl) {
        overdueListEl.innerHTML = formatWarningList(overdueProjects);
    }
}

function formatWarningList(projects) {
    if (!projects || projects.length === 0) {
        return 'Không có dự án nào';
    }
    const top = projects.slice(0, 3).map(project => {
        const due = project.due_date ? formatDateDisplay(project.due_date) : 'Chưa có hạn';
        return `<span>${escapeHtml(project.name)} (${due})</span>`;
    }).join('');
    if (projects.length > 3) {
        return top + `<span>+${projects.length - 3} dự án khác</span>`;
    }
    return top;
}

function renderTaskExtras(task) {
    updateTaskActionButtons(task);
    renderSubtasks(task);
    updateProgressUI(task);
    if (task) {
        loadComments(task.id);
        document.getElementById('commentsSection').style.display = 'block';
    } else {
        document.getElementById('commentsSection').style.display = 'none';
    }
}

function updateProgressUI(task) {
    const fill = document.getElementById('taskProgressFill');
    const text = document.getElementById('taskProgressText');
    const progress = task ? Math.round(task.progress_percent || 0) : 0;
    const completed = task ? task.completed_subtasks || 0 : 0;
    const total = task ? task.total_subtasks || 0 : 0;
    const color = getProgressColor(progress);
    const textColor = getProgressTextColor(progress);
    if (fill) {
        fill.style.width = `${progress}%`;
        fill.style.background = color;
    }
    if (text) {
        text.textContent = `${progress}% (${completed}/${total})`;
        text.style.color = textColor;
    }
}

function renderSubtasks(task) {
    const section = document.getElementById('subtasksSection');
    const list = document.getElementById('subtasksList');
    const emptyState = document.getElementById('subtasksEmptyState');
    const formWrapper = document.getElementById('subtaskFormWrapper');
    if (!section || !list || !emptyState) return;

    if (!task || !task.id) {
        section.classList.add('disabled');
        emptyState.style.display = 'block';
        emptyState.textContent = 'Lưu task trước khi thêm sub task.';
        list.innerHTML = '';
        if (formWrapper) formWrapper.style.display = 'none';
        return;
    }

    section.classList.remove('disabled');
    if (formWrapper) formWrapper.style.display = 'block';

    if (!task.subtasks || task.subtasks.length === 0) {
        emptyState.style.display = 'block';
        emptyState.textContent = 'Chưa có sub task nào, thêm mới bên dưới.';
    } else {
        emptyState.style.display = 'none';
    }

    const ordered = [...(task.subtasks || [])].sort((a, b) => Number(a.is_done) - Number(b.is_done));
    const allowEdits = !taskModalReadOnly;

    list.innerHTML = ordered.map(subtask => `
        <div class="subtask-item ${subtask.is_done ? 'done' : ''}">
            <label>
                <input type="checkbox" ${subtask.is_done ? 'checked' : ''} ${allowEdits ? '' : 'disabled'} onchange="handleSubtaskToggle(${subtask.id}, this.checked)">
                <span class="subtask-title">${escapeHtml(subtask.title)}</span>
            </label>
            ${subtask.work_log_id ? `<div class="subtask-linked-log"><span>📚 Work Log #${subtask.work_log_id}</span> <a href="#" onclick="openWorkLogFromSubtask(${subtask.work_log_id}, false); return false;" class="subtask-readonly-link">Đọc chi tiết</a></div>` : '<div class="subtask-linked-log muted">Chưa có Work Log</div>'}
            <div class="subtask-actions">
                ${allowEdits ? `
                    <button type="button" class="btn-link" onclick="openWorkLogLinkModal(${subtask.id})">${subtask.work_log_id ? 'Đổi Work Log' : 'Gắn Work Log'}</button>
                    ${subtask.work_log_id ? `<button type="button" class="btn-link danger" onclick="unlinkWorkLogFromSubtask(${subtask.id})">Bỏ liên kết</button>` : ''}
                    <button type="button" class="btn-link danger" onclick="deleteSubtask(${subtask.id})">Xoá</button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

async function handleAddSubtask() {
    if (taskModalReadOnly) {
        alert('Không thể chỉnh sửa sub task ở chế độ xem.');
        return;
    }
    if (!currentEditingTaskId) {
        alert('Vui lòng lưu task trước khi thêm sub task.');
        return;
    }
    const titleInput = document.getElementById('newSubtaskTitle');
    const descInput = document.getElementById('newSubtaskDescription');
    const attachmentInput = document.getElementById('newSubtaskAttachment');

    const title = titleInput.value.trim();
    if (!title) {
        alert('Vui lòng nhập tên sub task');
        return;
    }

    const payload = {
        task_id: currentEditingTaskId,
        title,
        description: descInput.value.trim() || null,
        attachment_url: attachmentInput.value.trim() || null
    };

    const result = await apiCall('/subtasks/', 'POST', payload);
    if (result) {
        titleInput.value = '';
        descInput.value = '';
        attachmentInput.value = '';
        await refreshCurrentTaskData();
    }
}

async function refreshCurrentTaskData() {
    if (!currentEditingTaskId) return;
    const latest = await apiCall(`/tasks/${currentEditingTaskId}`);
    if (latest) {
        currentTaskData = latest;
        renderTaskExtras(latest);
        refreshCurrentProjectTasks();
    }
}

async function handleSubtaskToggle(subtaskId, checked) {
    if (taskModalReadOnly) return;
    await apiCall(`/subtasks/${subtaskId}`, 'PUT', { is_done: checked });
    await refreshCurrentTaskData();
    if (currentProjectId) {
        await loadActivities(currentProjectId);
    }
}

async function promptSubtaskLink(subtaskId) {
    if (taskModalReadOnly) return;
    const link = prompt('Nhập link minh hoạ (để trống để xoá):');
    if (link === null) return;
    await apiCall(`/subtasks/${subtaskId}`, 'PUT', { attachment_url: link.trim() || null });
    await refreshCurrentTaskData();
}

function triggerSubtaskUpload(subtaskId) {
    if (taskModalReadOnly) return;
    const input = document.getElementById('subtaskUploadInput');
    if (!input) return;
    input.value = '';
    input.dataset.subtaskId = subtaskId;
    input.click();
}

async function handleSubtaskUpload(event) {
    if (taskModalReadOnly) return;
    const input = event.target;
    const file = input.files[0];
    const subtaskId = input.dataset.subtaskId;
    if (!file || !subtaskId) return;

    const formData = new FormData();
    formData.append('file', file);

    await apiCall(`/subtasks/${subtaskId}/attachment`, 'POST', formData);
    input.value = '';
    delete input.dataset.subtaskId;
    await refreshCurrentTaskData();
}

async function deleteSubtask(subtaskId) {
    if (taskModalReadOnly) return;
    if (!confirm('Bạn chắc chắn muốn xoá sub task này?')) return;
    await apiCall(`/subtasks/${subtaskId}`, 'DELETE');
    await refreshCurrentTaskData();
}

function updateTaskActionButtons(task) {
    const acknowledgeBtn = document.getElementById('acknowledgeTaskBtn');
    const completeBtn = document.getElementById('completeTaskBtn');
    if (!acknowledgeBtn || !completeBtn) return;

    acknowledgeBtn.style.display = 'none';
    completeBtn.style.display = 'none';
    if (!task || taskModalReadOnly || !canEditTask(task)) return;

    if (task.status === 'todo') {
        acknowledgeBtn.style.display = 'inline-flex';
    }
    if (task.status === 'in_progress') {
        completeBtn.style.display = 'inline-flex';
    }
}

async function acknowledgeCurrentTask() {
    if (!currentEditingTaskId) return;
    const result = await apiCall(`/tasks/${currentEditingTaskId}/acknowledge`, 'POST');
    if (result) {
        currentTaskData = result;
        updateTaskStatusDisplay(result);
        renderTaskExtras(result);
        refreshCurrentProjectTasks();
    }
}

async function completeCurrentTask() {
    if (!currentEditingTaskId) return;
    const result = await apiCall(`/tasks/${currentEditingTaskId}/complete`, 'POST');
    if (result) {
        closeTaskModal();
        refreshCurrentProjectTasks();
    }
}

function applyTaskModalReadOnlyState(readOnly) {
    const form = document.getElementById('taskForm');
    if (!form) return;
    const saveBtn = document.getElementById('saveTaskBtn');
    const note = document.getElementById('taskReadOnlyNote');
    const inputs = ['taskTitle','taskDescription','taskFrequency','taskPeriodStart','taskPeriodEnd','taskRepeatUntil'];
    // Disable assignees checkboxes
    document.querySelectorAll('.assignee-checkbox-input').forEach(cb => {
        cb.disabled = readOnly;
    });
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = readOnly;
    });
    if (saveBtn) {
        saveBtn.style.display = readOnly ? 'none' : 'inline-flex';
    }
    if (note) {
        note.style.display = readOnly ? 'block' : 'none';
    }
    updateTaskActionButtons(currentTaskData);
}

function getProgressColor(progress) {
    if (progress <= 0) return '#CE2525';
    if (progress >= 100) return '#00FF7F';
    return '#FFB703';
}

function getProgressTextColor(progress) {
    if (progress <= 0) return '#CE2525';
    return '#1F2937';
}

// Utility
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return div.textContent || '';
}

function getLocalDateKey(dateValue) {
    if (!dateValue) return null;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// User Management Functions
async function loadUsersList() {
    if (currentUser?.role !== 'admin') return;
    const data = await apiCall('/users/');
    if (data) {
        users = data;
        renderUsersTable();
    }
}

async function loadMtclList() {
    const data = await apiCall('/mtcl/');
    if (data) {
        mtclItems = data;
        renderMtclTable();
    }
}

function cleanMtclText(value = '') {
    return String(value || '')
        .replace(/\s*\[[^\]]+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeUserFieldGroups(user = {}) {
    const groupEntries = Array.isArray(user.group) ? user.group : [];
    const chapterEntries = Array.isArray(user.chapter) ? user.chapter : [];
    const fields = Array.isArray(user.field) ? user.field : [];

    const groupMap = new Map();
    groupEntries.forEach((entry) => {
        const fieldName = String(entry?.field || '').trim().toUpperCase();
        if (!fieldName) return;
        groupMap.set(fieldName, String(entry?.group || '').trim());
    });

    const chapterMap = new Map();
    chapterEntries.forEach((entry) => {
        const fieldName = String(entry?.field || '').trim().toUpperCase();
        if (!fieldName) return;
        const chapters = Array.isArray(entry?.chapters)
            ? entry.chapters.map((chapter) => String(chapter || '').trim()).filter(Boolean)
            : [];
        chapterMap.set(fieldName, chapters);
    });

    const fieldOrder = [];
    const seenFields = new Set();
    [...fields, ...groupEntries.map((entry) => entry?.field), ...chapterEntries.map((entry) => entry?.field)]
        .forEach((fieldName) => {
            const normalizedField = String(fieldName || '').trim().toUpperCase();
            if (!normalizedField || seenFields.has(normalizedField)) return;
            seenFields.add(normalizedField);
            fieldOrder.push(normalizedField);
        });

    return fieldOrder.map((fieldName) => ({
        field: fieldName,
        group: groupMap.get(fieldName) || '',
        chapters: chapterMap.get(fieldName) || []
    }));
}

function renderUserFieldGroupSummary(user = {}) {
    const entries = normalizeUserFieldGroups(user);
    if (entries.length === 0) {
        return '--';
    }

    return entries
        .map((entry) => {
            const chaptersLabel = entry.chapters?.length ? entry.chapters.join('; ') : '--';
            const groupLabel = entry.group || '--';
            return `${entry.field} | ${chaptersLabel} | Group ${groupLabel}`;
        })
        .join(', ');
}

const USER_FIELD_OPTIONS = [
    'OPEX',
    'SSE',
    'HRP',
    'QUALITY',
    'DPR',
    'ADMANRI',
    'ENV'
];

function createUserFieldGroupRowMarkup(fieldValue = '', groupValue = '', chapterValues = []) {
    const normalizedFieldValue = String(fieldValue || '').trim().toUpperCase();
    const fieldOptionsMarkup = USER_FIELD_OPTIONS
        .map((option) => `<option value="${option}"${option === normalizedFieldValue ? ' selected' : ''}>${option}</option>`)
        .join('');
    const rowId = `user-field-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const safeChapters = Array.isArray(chapterValues) && chapterValues.length > 0 ? chapterValues : [''];
    const chapterInputsMarkup = safeChapters
        .map((chapterValue) => createUserChapterInputMarkup(chapterValue))
        .join('');

    return `
        <div class="user-field-group-row" data-row-id="${rowId}">
            <div class="form-group">
                <label>Lĩnh vực</label>
                <select class="user-field-input">
                    <option value="">Chọn lĩnh vực</option>
                    ${fieldOptionsMarkup}
                </select>
            </div>
            <div class="form-group">
                <label>Nhóm</label>
                <input type="number" min="0" step="1" inputmode="numeric" class="user-group-input" value="${escapeHtml(groupValue)}" placeholder="Nhập số nhóm">
            </div>
            <button type="button" class="btn-secondary danger user-field-group-remove" onclick="removeUserFieldGroupRow(this)">Remove</button>
            <div class="user-chapter-section">
                <div class="user-chapter-header">
                    <label>Chapter</label>
                    <button type="button" class="btn-secondary user-chapter-add" onclick="addUserChapterInput('${rowId}')">+ Add chapter</button>
                </div>
                <div class="user-chapter-list" data-chapter-container>
                    ${chapterInputsMarkup}
                </div>
            </div>
        </div>
    `;
}

function renderUserFieldGroupRows(entries = []) {
    const rowsContainer = document.getElementById('userFieldGroupRows');
    if (!rowsContainer) return;

    const safeEntries = entries.length > 0 ? entries : [{ field: '', group: '', chapters: [''] }];
    rowsContainer.innerHTML = safeEntries
        .map((entry) => createUserFieldGroupRowMarkup(entry.field || '', entry.group || '', entry.chapters || []))
        .join('');
}

function createUserChapterInputMarkup(chapterValue = '') {
    return `
        <div class="user-chapter-input-row">
            <input type="text" class="user-chapter-input" value="${escapeHtml(chapterValue)}" placeholder="Ví dụ: Trục 1">
            <button type="button" class="btn-secondary danger user-chapter-remove" onclick="removeUserChapterInput(this)">Remove</button>
        </div>
    `;
}

function addUserFieldGroupRow(fieldValue = '', groupValue = '', chapters = ['']) {
    const rowsContainer = document.getElementById('userFieldGroupRows');
    if (!rowsContainer) return;

    rowsContainer.insertAdjacentHTML('beforeend', createUserFieldGroupRowMarkup(fieldValue, groupValue, chapters));
}

function addUserChapterInput(rowId, chapterValue = '') {
    const row = document.querySelector(`.user-field-group-row[data-row-id="${rowId}"]`);
    const chapterContainer = row?.querySelector('[data-chapter-container]');
    if (!chapterContainer) return;

    chapterContainer.insertAdjacentHTML('beforeend', createUserChapterInputMarkup(chapterValue));
}

function removeUserChapterInput(button) {
    const chapterContainer = button?.closest('[data-chapter-container]');
    const chapterRow = button?.closest('.user-chapter-input-row');
    if (!chapterContainer || !chapterRow) return;

    if (chapterContainer.children.length === 1) {
        const chapterInput = chapterRow.querySelector('.user-chapter-input');
        if (chapterInput) chapterInput.value = '';
        return;
    }

    chapterRow.remove();
}

function removeUserFieldGroupRow(button) {
    const rowsContainer = document.getElementById('userFieldGroupRows');
    const row = button?.closest('.user-field-group-row');
    if (!rowsContainer || !row) return;

    if (rowsContainer.children.length === 1) {
        const fieldInput = row.querySelector('.user-field-input');
        const groupInput = row.querySelector('.user-group-input');
        const chapterInputs = row.querySelectorAll('.user-chapter-input');
        if (fieldInput) fieldInput.value = '';
        if (groupInput) groupInput.value = '';
        chapterInputs.forEach((chapterInput, index) => {
            chapterInput.value = '';
            if (index > 0) {
                chapterInput.closest('.user-chapter-input-row')?.remove();
            }
        });
        return;
    }

    row.remove();
}

function collectUserFieldGroupData() {
    const rows = Array.from(document.querySelectorAll('#userFieldGroupRows .user-field-group-row'));

    return rows
        .map((row) => ({
            field: row.querySelector('.user-field-input')?.value?.trim() || '',
            group: row.querySelector('.user-group-input')?.value?.trim() || '',
            chapters: Array.from(row.querySelectorAll('.user-chapter-input'))
                .map((input) => input.value.trim())
                .filter(Boolean)
        }))
        .filter((entry) => entry.field);
}

function renderUserAvatarMarkup(user) {
    const initials = ((user.full_name || user.username || 'U')
        .split(' ')
        .map((part) => part.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('')) || 'U';

    if (user.avatar_url) {
        return `
            <div class="user-directory-avatar">
                <img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.full_name || user.username || 'U')}" onerror="onAvatarError(this,'__parent__')">
            </div>
        `;
    }

    return `<div class="user-directory-avatar">${escapeHtml(initials)}</div>`;
}

function updateUsersDirectorySummary() {
    const totalCount = users.length;
    const adminCount = users.filter((user) => user.role === 'admin').length;
    const departmentCount = new Set(
        users
            .map((user) => (user.department || '').trim())
            .filter(Boolean)
    ).size;

    const totalNode = document.getElementById('usersTotalCount');
    const adminNode = document.getElementById('usersAdminCount');
    const departmentNode = document.getElementById('usersDepartmentCount');
    if (totalNode) totalNode.textContent = String(totalCount);
    if (adminNode) adminNode.textContent = String(adminCount);
    if (departmentNode) departmentNode.textContent = String(departmentCount);

    const meta = document.getElementById('usersDirectoryMeta');
    const footerMeta = document.getElementById('usersDirectoryFooterMeta');
    const metaText = totalCount === 0
        ? 'Chưa có hồ sơ nào trong danh mục.'
        : `${totalCount} hồ sơ • ${adminCount} admin • ${departmentCount} phòng ban`;
    if (meta) {
        meta.textContent = metaText;
    }
    if (footerMeta) footerMeta.textContent = metaText;
}

function renderMtclTable() {
    const container = document.getElementById('mtclTableBody');
    if (!container) return;

    const recordCount = mtclItems.length;
    const groupCount = new Set(mtclItems.map((item) => item.objective_group).filter(Boolean)).size;
    const unitCount = new Set(mtclItems.flatMap((item) => Array.isArray(item.units) ? item.units : [])).size;

    document.getElementById('mtclRecordCount').textContent = String(recordCount);
    document.getElementById('mtclGroupCount').textContent = String(groupCount);
    document.getElementById('mtclUnitCount').textContent = String(unitCount);

    const meta = document.getElementById('mtclMeta');
    if (meta) {
        meta.textContent = recordCount === 0
            ? 'No MTCL records available.'
            : `${recordCount} records • ${groupCount} groups • ${unitCount} units`;
    }

    if (recordCount === 0) {
        container.innerHTML = '<div class="users-empty-state">No MTCL data available.</div>';
        return;
    }

    container.innerHTML = mtclItems.map((item) => `
        <article class="mtcl-card">
            <div class="mtcl-card-group">
                <div class="mtcl-card-title">${escapeHtml(item.objective_group || '--')}</div>
            </div>
            <div class="mtcl-card-units">
                ${(Array.isArray(item.units) ? item.units : []).map((unit) => `<span class="mtcl-unit-pill">${escapeHtml(unit)}</span>`).join('') || '<span class="mtcl-unit-pill">--</span>'}
            </div>
            <div class="mtcl-card-description">${escapeHtml(cleanMtclText(item.description || '--'))}</div>
            <div class="mtcl-card-action">
                <button class="btn-link" type="button" onclick="openMtclModal(${item.id})">Edit</button>
            </div>
        </article>
    `).join('');
}

function openMtclModal(itemId) {
    const item = mtclItems.find((entry) => entry.id === itemId);
    if (!item) return;

    currentMtclId = item.id;
    document.getElementById('mtclId').value = String(item.id);
    document.getElementById('mtclObjectiveGroup').value = cleanMtclText(item.objective_group || '');
    document.getElementById('mtclUnits').value = Array.isArray(item.units) ? item.units.join(', ') : '';
    document.getElementById('mtclDescription').value = cleanMtclText(item.description || '');
    document.getElementById('mtclModal').classList.add('active');
}

function closeMtclModal() {
    currentMtclId = null;
    document.getElementById('mtclForm')?.reset();
    document.getElementById('mtclModal')?.classList.remove('active');
}

async function handleMtclSubmit(event) {
    event.preventDefault();
    const itemId = currentMtclId || parseInt(document.getElementById('mtclId').value, 10);
    if (!itemId) return;

    const units = String(document.getElementById('mtclUnits').value || '')
        .split(',')
        .map((unit) => cleanMtclText(unit))
        .filter(Boolean);

    const payload = {
        objective_group: cleanMtclText(document.getElementById('mtclObjectiveGroup').value || ''),
        units,
        description: cleanMtclText(document.getElementById('mtclDescription').value || ''),
    };

    const data = await apiCall(`/mtcl/${itemId}`, 'PUT', payload);
    if (data) {
        await loadMtclList();
        closeMtclModal();
    }
}

function renderUsersTable() {
    const container = document.getElementById('usersTableBody');
    if (!container) return;

    updateUsersDirectorySummary();
    
    if (users.length === 0) {
        container.innerHTML = '<div class="users-empty-state">Chưa có user nào trong hệ thống.</div>';
        return;
    }
    
    container.innerHTML = users.map(user => `
        <article class="user-directory-card">
            <div class="user-directory-profile">
                ${renderUserAvatarMarkup(user)}
                <div class="user-directory-copy">
                    <div class="user-directory-name">${escapeHtml(user.full_name || user.username || '--')}</div>
                    <div class="user-directory-subline">@${escapeHtml(user.username || '--')}</div>
                </div>
            </div>
            <div class="user-directory-meta">
                <strong>${escapeHtml(user.department || '--')}</strong>
                <span>${escapeHtml(user.team || '--')}</span>
            </div>
            <div class="user-directory-pillset">
                ${renderUserCapabilityPills(user)}
            </div>
            <span class="user-directory-role role-${escapeHtml(user.role || 'member')}">${escapeHtml(user.role || 'member')}</span>
            <div class="user-directory-action">
                <button class="btn-link" onclick="openRecurringTasksModal(${user.id})" type="button" title="Công việc định kỳ">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">assignment_ind</span>
                </button>
                <button class="btn-link" onclick="openUserModal(${user.id})" type="button">Edit</button>
            </div>
        </article>
    `).join('');
}

function renderUserCapabilityPills(user) {
    const entries = normalizeUserFieldGroups(user);
    if (entries.length === 0) {
        return '<span class="user-directory-pill muted">No field</span>';
    }

    const visibleEntries = entries.slice(0, 2);
    const hiddenCount = entries.length - visibleEntries.length;
    const pills = visibleEntries.map((entry) => {
        const chapters = (entry.chapters || []).slice(0, 2).join(', ') || '--';
        const group = entry.group || '--';
        const fullChapters = (entry.chapters || []).join(', ') || '--';
        const title = `${entry.field} / ${fullChapters} / Group ${group}`;
        return `<span class="user-directory-pill" title="${escapeHtml(title)}">${escapeHtml(entry.field)} / ${escapeHtml(chapters)} / G${escapeHtml(group)}</span>`;
    });

    if (hiddenCount > 0) {
        pills.push(`<span class="user-directory-pill muted">+${hiddenCount}</span>`);
    }

    return pills.join('');
}

function openCreateUserModal() {
    const modal = document.getElementById('userModal');
    const passwordGroup = document.getElementById('userPasswordGroup');
    const passwordInput = document.getElementById('userPassword');

    document.getElementById('userModalTitle').textContent = 'Create User';
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('userRole').value = 'member';
    document.getElementById('userAvatarPreview').style.display = 'none';
    document.getElementById('userAvatarInput').value = '';
    passwordGroup.style.display = 'block';
    passwordInput.required = true;
    renderUserFieldGroupRows();

    modal.classList.add('active');
}

function openUserModal(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const modal = document.getElementById('userModal');
    const passwordGroup = document.getElementById('userPasswordGroup');
    const passwordInput = document.getElementById('userPassword');

    document.getElementById('userModalTitle').textContent = 'Edit User';
    document.getElementById('userId').value = user.id;
    document.getElementById('userUsername').value = user.username || '';
    document.getElementById('userEmail').value = user.email || '';
    document.getElementById('userFullName').value = user.full_name || '';
    document.getElementById('userDepartment').value = user.department || '';
    document.getElementById('userTeam').value = user.team || '';
    document.getElementById('userPosition').value = user.position || '';
    document.getElementById('userRole').value = user.role || 'member';
    passwordGroup.style.display = 'none';
    passwordInput.required = false;
    passwordInput.value = '';
    renderUserFieldGroupRows(normalizeUserFieldGroups(user));

    const avatarPreview = document.getElementById('userAvatarPreview');
    const avatarInput = document.getElementById('userAvatarInput');
    if (user.avatar_url) {
        avatarPreview.src = user.avatar_url;
        avatarPreview.style.display = 'block';
    } else {
        avatarPreview.style.display = 'none';
    }
    avatarInput.value = '';
    
    modal.classList.add('active');
}

function closeUserModal() {
    const modal = document.getElementById('userModal');
    modal.classList.remove('active');
    document.getElementById('userForm').reset();
    document.getElementById('userAvatarPreview').style.display = 'none';
    document.getElementById('userAvatarInput').value = '';
    document.getElementById('userPasswordGroup').style.display = 'block';
    document.getElementById('userPassword').required = true;
    document.getElementById('userModalTitle').textContent = 'Edit User';
    renderUserFieldGroupRows();
}

function handleAvatarPreview(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        alert('File phải là ảnh (PNG, JPG, JPEG)');
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const avatarPreview = document.getElementById('userAvatarPreview');
        avatarPreview.src = e.target.result;
        avatarPreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

async function handleUserSubmit(e) {
    e.preventDefault();
    const userId = parseInt(document.getElementById('userId').value);
    const fieldGroupEntries = collectUserFieldGroupData();
    
    const userData = {
        username: document.getElementById('userUsername').value,
        email: document.getElementById('userEmail').value || null,
        full_name: document.getElementById('userFullName').value || null,
        department: document.getElementById('userDepartment').value || null,
        team: document.getElementById('userTeam').value || null,
        position: document.getElementById('userPosition').value || null,
        field: fieldGroupEntries.map((entry) => entry.field),
        chapter: fieldGroupEntries.map((entry) => ({
            field: entry.field,
            chapters: entry.chapters
        })),
        group: fieldGroupEntries.map((entry) => ({
            field: entry.field,
            group: entry.group
        })),
        role: document.getElementById('userRole').value
    };

    const avatarInput = document.getElementById('userAvatarInput');

    if (userId) {
        let uploadedUser = null;
        if (avatarInput.files && avatarInput.files.length > 0) {
            uploadedUser = await uploadUserAvatar(userId, avatarInput.files[0]);
            if (!uploadedUser) {
                return;
            }
        }

        const updatedUser = await updateUserInfo(userId, userData);
        if (updatedUser || uploadedUser) {
            await loadUsersList();
            closeUserModal();
        }
        return;
    }

    const password = document.getElementById('userPassword').value;
    if (!password) {
        alert('Password là bắt buộc khi tạo user mới');
        return;
    }

    const createdUser = await createUserInfo({
        ...userData,
        password
    });

    if (!createdUser) {
        return;
    }

    if (avatarInput.files && avatarInput.files.length > 0) {
        await uploadUserAvatar(createdUser.id, avatarInput.files[0]);
    }

    if (createdUser) {
        await loadUsersList();
        closeUserModal();
    }
}

async function createUserInfo(userData) {
    const data = await apiCall('/users/', 'POST', userData);
    if (data) {
        return data;
    }
    return null;
}

async function updateUserInfo(userId, userData) {
    const data = await apiCall(`/users/${userId}`, 'PUT', userData);
    if (data) {
        return data;
    }
    return null;
}

async function uploadUserAvatar(userId, file) {
    const token = localStorage.getItem('pm_token');
    if (!token) {
        alert('Vui lòng đăng nhập lại');
        return null;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(`${API_BASE}/users/${userId}/avatar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        if (response.status === 401) {
            forceLogout();
            return null;
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Upload avatar thất bại');
        }
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Upload Error:', error);
        alert('Có lỗi xảy ra: ' + error.message);
        return null;
    }
}

// Thread Functions
let projectThreads = [];
let threadPollingInterval = null;
const THREAD_POLL_INTERVAL = 5000; // 5 giây
let mentionState = {
    isActive: false,
    query: '',
    selectedIndex: 0,
    startPos: 0,
    endPos: 0
};

async function loadThreads(shouldScrollToBottom = false) {
    if (!currentProjectId) {
        const container = document.getElementById('threadMessages');
        if (container) {
            container.innerHTML = 
                '<div style="padding: 24px; text-align: center; color: var(--text-secondary);">Vui lòng chọn project trước.</div>';
        }
        stopThreadPolling();
        return;
    }
    
    const data = await apiCall(`/threads/?project_id=${currentProjectId}`);
    if (data) {
        // Kiểm tra xem có message mới không (so sánh số lượng hoặc last message ID)
        const hasNewMessages = projectThreads.length !== data.length || 
            (data.length > 0 && projectThreads.length > 0 && 
             data[data.length - 1].id !== projectThreads[projectThreads.length - 1].id);
        
        projectThreads = data;
        renderThreads(shouldScrollToBottom || hasNewMessages);
    }
}

function startThreadPolling() {
    // Dừng polling cũ nếu có
    stopThreadPolling();
    
    // Chỉ start polling nếu tab Thread đang active
    const threadTab = document.getElementById('boardTabThread');
    if (!threadTab || !threadTab.classList.contains('active')) {
        return;
    }
    
    // Load ngay lập tức
    loadThreads(false);
    
    // Sau đó poll mỗi 5 giây
    threadPollingInterval = setInterval(() => {
        // Kiểm tra lại xem tab có còn active không
        const threadTab = document.getElementById('boardTabThread');
        if (threadTab && threadTab.classList.contains('active') && currentProjectId) {
            loadThreads(false); // Không auto-scroll khi polling
        } else {
            stopThreadPolling();
        }
    }, THREAD_POLL_INTERVAL);
}

function stopThreadPolling() {
    if (threadPollingInterval) {
        clearInterval(threadPollingInterval);
        threadPollingInterval = null;
    }
}

function renderThreads(shouldScrollToBottom = true) {
    const container = document.getElementById('threadMessages');
    if (!container) return;
    
    // Lưu scroll position trước khi render
    const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
    
    if (projectThreads.length === 0) {
        container.innerHTML = 
            '<div style="padding: 24px; text-align: center; color: var(--text-secondary);">Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện!</div>';
        return;
    }
    
    container.innerHTML = projectThreads.map(thread => createThreadMessage(thread)).join('');
    attachThreadImageEvents();
    
    // Chỉ scroll xuống nếu user đang ở cuối hoặc khi gửi message mới
    if (shouldScrollToBottom || wasAtBottom) {
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }
    
    // Attach event listeners
    container.querySelectorAll('.thread-message-action').forEach(btn => {
        const action = btn.getAttribute('data-action');
        const threadId = parseInt(btn.getAttribute('data-thread-id'));
        if (action === 'edit') {
            btn.addEventListener('click', () => handleEditThread(threadId));
        } else if (action === 'delete') {
            btn.addEventListener('click', () => handleDeleteThread(threadId));
        }
    });
}

function createThreadMessage(thread) {
    const user = thread.user || {};
    const authorName = user.full_name || user.username || 'Unknown';
    const avatarUrl = user.avatar_url;
    const isAuthor = thread.user_id === currentUser?.id;
    const isProjectOwner = currentProject?.owner_id === currentUser?.id;
    const canEdit = isAuthor;
    const canDelete = isAuthor || isProjectOwner;
    
    // Avatar HTML
    let avatarHtml = '';
    if (avatarUrl) {
        avatarHtml = `<img src="${avatarUrl}" alt="${escapeHtml(authorName)}" class="thread-message-avatar" onerror="onAvatarError(this,'thread-message-avatar-initials')">`;
    } else {
        const initials = (authorName || 'U').split(' ').map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('') || '👤';
        avatarHtml = `<div class="thread-message-avatar-initials">${initials}</div>`;
    }
    
    // Time display
    const timeStr = formatThreadTime(thread.created_at);
    const editedStr = thread.is_edited ? '<span class="thread-message-edited">(đã chỉnh sửa)</span>' : '';
    
    // Actions HTML
    let actionsHtml = '';
    if (canEdit || canDelete) {
        actionsHtml = '<div class="thread-message-actions">';
        if (canEdit) {
            actionsHtml += `<button class="thread-message-action" data-action="edit" data-thread-id="${thread.id}">Sửa</button>`;
        }
        if (canDelete) {
            actionsHtml += `<button class="thread-message-action danger" data-action="delete" data-thread-id="${thread.id}">Xóa</button>`;
        }
        actionsHtml += '</div>';
    }
    
    // Replies HTML
    let repliesHtml = '';
    if (thread.replies && thread.replies.length > 0) {
        repliesHtml = '<div class="thread-replies">' + 
            thread.replies.map(reply => createThreadMessage(reply)).join('') + 
            '</div>';
    }
    
    return `
        <div class="thread-message" data-thread-id="${thread.id}">
            ${avatarHtml}
            <div class="thread-message-content">
                <div class="thread-message-header">
                    <span class="thread-message-author">${escapeHtml(authorName)}</span>
                    <span class="thread-message-time">${timeStr}</span>
                </div>
                <div class="thread-message-text">${parseAndHighlightMentions(thread.content, thread.mentions || [])}</div>
                ${editedStr}
                ${actionsHtml}
                ${repliesHtml}
            </div>
        </div>
    `;
}

function parseAndHighlightMentions(content, mentionUserIds) {
    if (!content) return '';

    const mentionedUsers = (mentionUserIds || [])
        .map(userId => users.find(u => u.id === userId))
        .filter(Boolean);

    const segments = [];
    const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = imagePattern.exec(content)) !== null) {
        if (match.index > lastIndex) {
            segments.push(highlightMentionsInText(content.substring(lastIndex, match.index), mentionedUsers));
        }

        const altText = match[1] || 'image';
        const imageUrl = (match[2] || '').trim();
        if (isSafeImageUrl(imageUrl)) {
            segments.push(`<img src="${escapeAttribute(imageUrl)}" alt="${escapeHtml(altText)}" class="thread-inline-image">`);
        } else {
            segments.push(highlightMentionsInText(match[0], mentionedUsers));
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
        segments.push(highlightMentionsInText(content.substring(lastIndex), mentionedUsers));
    }

    return segments.join('');
}

function highlightMentionsInText(text, mentionedUsers) {
    if (!text) return '';
    if (!mentionedUsers || mentionedUsers.length === 0) {
        return escapeHtml(text).replace(/\n/g, '<br>');
    }

    const mentionPattern = /@(\w+(?:\s+\w+)*)/g;
    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = mentionPattern.exec(text)) !== null) {
        result += escapeHtml(text.substring(lastIndex, match.index));

        const mentionText = match[1].trim();
        const mentionedUser = mentionedUsers.find(user =>
            (user.username && user.username.toLowerCase() === mentionText.toLowerCase()) ||
            (user.full_name && user.full_name.toLowerCase() === mentionText.toLowerCase())
        );

        if (mentionedUser) {
            const displayName = mentionedUser.full_name || mentionedUser.username;
            result += `<span class="thread-mention" title="Mention: ${escapeHtml(displayName)}">@${escapeHtml(mentionText)}</span>`;
        } else {
            result += escapeHtml(match[0]);
        }

        lastIndex = match.index + match[0].length;
    }

    result += escapeHtml(text.substring(lastIndex));
    return result.replace(/\n/g, '<br>');
}

function isSafeImageUrl(url) {
    if (!url) return false;
    const trimmed = url.trim();
    return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/static/');
}

function escapeAttribute(value) {
    return (value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function formatThreadTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function handleSendThread() {
    if (!currentProjectId) {
        alert('Vui lòng chọn project trước!');
        return;
    }
    
    const input = document.getElementById('threadInput');
    const content = (input.value || '').trim();
    if (!content) return;
    
    const data = await apiCall('/threads/', 'POST', {
        project_id: currentProjectId,
        content: content
    });
    
    if (data) {
        input.value = '';
        // Load lại và scroll xuống bottom khi gửi message mới
        await loadThreads(true);
    }
}

async function handleEditThread(threadId) {
    const thread = findThreadById(threadId);
    if (!thread) return;
    
    const newContent = prompt('Sửa tin nhắn:', thread.content);
    if (newContent === null || newContent.trim() === '') return;
    
    const data = await apiCall(`/threads/${threadId}`, 'PUT', {
        content: newContent.trim()
    });
    
    if (data) {
        await loadThreads();
    }
}

async function handleDeleteThread(threadId) {
    if (!confirm('Bạn có chắc chắn muốn xóa tin nhắn này không?')) {
        return;
    }
    
    const data = await apiCall(`/threads/${threadId}`, 'DELETE');
    if (data) {
        await loadThreads();
    }
}

function findThreadById(threadId) {
    for (const thread of projectThreads) {
        if (thread.id === threadId) return thread;
        if (thread.replies) {
            for (const reply of thread.replies) {
                if (reply.id === threadId) return reply;
            }
        }
    }
    return null;
}

// Mention Functions
function isMentionDropdownVisible() {
    const dropdown = document.getElementById('mentionDropdown');
    return dropdown && dropdown.style.display !== 'none';
}

function handleThreadInput(e) {
    const input = e.target;
    const value = input.value;
    const cursorPos = input.selectionStart;
    
    // Tìm @ gần nhất trước cursor
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
        // Kiểm tra xem có space sau @ không (nếu có thì không phải mention)
        const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
        if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
            // Có @ mention đang được gõ
            const query = textAfterAt.trim();
            mentionState.isActive = true;
            mentionState.query = query;
            mentionState.startPos = lastAtIndex;
            mentionState.endPos = cursorPos;
            mentionState.selectedIndex = 0;
            
            showMentionDropdown(query);
            return;
        }
    }
    
    // Không có mention active
    hideMentionDropdown();
}

function handleThreadInputKeydown(e) {
    if (!isMentionDropdownVisible()) return;
    
    const dropdown = document.getElementById('mentionDropdown');
    const items = dropdown.querySelectorAll('.mention-item');
    
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionState.selectedIndex = Math.min(mentionState.selectedIndex + 1, items.length - 1);
        updateMentionDropdownSelection();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionState.selectedIndex = Math.max(mentionState.selectedIndex - 1, 0);
        updateMentionDropdownSelection();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (items[mentionState.selectedIndex]) {
            selectMention(items[mentionState.selectedIndex]);
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        hideMentionDropdown();
    }
}

async function handleThreadPaste(event) {
    if (!event || !event.clipboardData) return;
    const clipboardData = event.clipboardData;
    const images = [];

    if (clipboardData.items && clipboardData.items.length) {
        for (const item of clipboardData.items) {
            if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) images.push(file);
            }
        }
    }

    if (!images.length && clipboardData.files && clipboardData.files.length) {
        for (const file of clipboardData.files) {
            if (file.type && file.type.startsWith('image/')) {
                images.push(file);
            }
        }
    }

    if (!images.length) return;
    if (!currentProjectId) {
        alert('Vui lòng chọn project trước khi đính kèm ảnh.');
        return;
    }

    event.preventDefault();
    const textarea = event.target;
    const pastedText = clipboardData.getData('text/plain');
    if (pastedText) {
        insertTextAtCursor(textarea, pastedText);
    }

    for (const file of images) {
        await uploadThreadImage(file, textarea);
    }
}

async function uploadThreadImage(file, textarea) {
    if (!file || !textarea || !currentProjectId) return;
    const formData = new FormData();
    formData.append('project_id', currentProjectId);
    formData.append('file', file);

    try {
        const response = await apiCall('/threads/upload', 'POST', formData);
        if (response?.url) {
            const needsLeadingNewLine = textarea.value && !textarea.value.endsWith('\n');
            const placeholder = `${needsLeadingNewLine ? '\n' : ''}![image](${response.url})\n`;
            insertTextAtCursor(textarea, placeholder);
        }
    } catch (error) {
        console.error('Thread image upload failed:', error);
        alert('Không thể tải ảnh lên. Vui lòng thử lại.');
    }
}

function insertTextAtCursor(textarea, text) {
    if (!textarea || typeof text !== 'string') return;
    const value = textarea.value || '';
    const start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : value.length;
    const end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : value.length;

    textarea.value = value.slice(0, start) + text + value.slice(end);
    const newPos = start + text.length;
    if (typeof textarea.setSelectionRange === 'function') {
        textarea.setSelectionRange(newPos, newPos);
    } else {
        textarea.selectionStart = textarea.selectionEnd = newPos;
    }
    textarea.focus();
}

function attachThreadImageEvents() {
    const container = document.getElementById('threadMessages');
    if (!container) return;
    container.querySelectorAll('.thread-inline-image').forEach(img => {
        if (img.dataset.viewerBound === 'true') return;
        img.dataset.viewerBound = 'true';
        img.addEventListener('click', () => {
            openThreadImageViewer(img.getAttribute('src'), img.getAttribute('alt'));
        });
    });
}

function initThreadImageViewer() {
    const viewer = document.getElementById('threadImageViewer');
    const closeBtn = document.getElementById('closeThreadImageViewer');
    if (!viewer) return;

    viewer.addEventListener('click', (event) => {
        if (event.target === viewer || event.target.classList.contains('thread-image-viewer-backdrop')) {
            closeThreadImageViewer();
        }
    });
    closeBtn?.addEventListener('click', closeThreadImageViewer);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && viewer.style.display !== 'none') {
            closeThreadImageViewer();
        }
    });
}

function openThreadImageViewer(src, alt = '') {
    const viewer = document.getElementById('threadImageViewer');
    const img = document.getElementById('threadImageViewerImg');
    const caption = document.getElementById('threadImageViewerCaption');
    if (!viewer || !img || !caption) return;
    img.src = src || '';
    img.alt = alt || 'Preview';
    caption.textContent = alt || '';
    viewer.style.display = 'flex';
}

function closeThreadImageViewer() {
    const viewer = document.getElementById('threadImageViewer');
    const img = document.getElementById('threadImageViewerImg');
    const caption = document.getElementById('threadImageViewerCaption');
    if (!viewer || !img || !caption) return;
    viewer.style.display = 'none';
    img.src = '';
    caption.textContent = '';
}

function showMentionDropdown(query) {
    const dropdown = document.getElementById('mentionDropdown');
    if (!dropdown) return;
    
    // Filter users theo query
    const filteredUsers = users.filter(user => {
        if (!query) return true;
        const q = query.toLowerCase();
        const username = (user.username || '').toLowerCase();
        const fullName = (user.full_name || '').toLowerCase();
        return username.includes(q) || fullName.includes(q);
    });
    
    if (filteredUsers.length === 0) {
        hideMentionDropdown();
        return;
    }
    
    dropdown.innerHTML = filteredUsers.map((user, index) => {
        const userName = user.full_name || user.username || 'Unknown';
        const avatarUrl = user.avatar_url;
        let avatarHtml = '';
        if (avatarUrl) {
            avatarHtml = `<img src="${avatarUrl}" alt="${escapeHtml(userName)}" class="mention-item-avatar" onerror="onAvatarError(this,'mention-item-avatar-initials')">`;
        } else {
            const initials = userName.split(' ').map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('') || '👤';
            avatarHtml = `<div class="mention-item-avatar-initials">${initials}</div>`;
        }
        
        return `
            <div class="mention-item ${index === 0 ? 'selected' : ''}" data-user-id="${user.id}" data-username="${escapeHtml(user.username)}" data-full-name="${escapeHtml(userName)}">
                ${avatarHtml}
                <div class="mention-item-info">
                    <div class="mention-item-name">${escapeHtml(userName)}</div>
                    <div class="mention-item-username">@${escapeHtml(user.username)}</div>
                </div>
            </div>
        `;
    }).join('');
    
    dropdown.style.display = 'block';
    
    // Attach click handlers
    dropdown.querySelectorAll('.mention-item').forEach(item => {
        item.addEventListener('click', () => selectMention(item));
    });
    
    mentionState.selectedIndex = 0;
    updateMentionDropdownSelection();
}

function updateMentionDropdownSelection() {
    const dropdown = document.getElementById('mentionDropdown');
    if (!dropdown) return;
    
    const items = dropdown.querySelectorAll('.mention-item');
    items.forEach((item, index) => {
        if (index === mentionState.selectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

function selectMention(item) {
    const input = document.getElementById('threadInput');
    if (!input) return;
    
    const username = item.getAttribute('data-username');
    const fullName = item.getAttribute('data-full-name');
    const value = input.value;
    
    // Thay thế @query bằng @username
    const beforeMention = value.substring(0, mentionState.startPos);
    const afterMention = value.substring(mentionState.endPos);
    const newValue = beforeMention + '@' + username + ' ' + afterMention;
    
    input.value = newValue;
    
    // Set cursor position sau mention
    const newCursorPos = mentionState.startPos + username.length + 2; // +2 cho @ và space
    input.setSelectionRange(newCursorPos, newCursorPos);
    input.focus();
    
    hideMentionDropdown();
}

function hideMentionDropdown() {
    const dropdown = document.getElementById('mentionDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    mentionState.isActive = false;
    mentionState.query = '';
    mentionState.selectedIndex = 0;
}

// Task Comments Functions
let taskComments = [];
let commentAttachmentFile = null;

async function loadComments(taskId) {
    if (!taskId) return;
    
    const data = await apiCall(`/comments/?task_id=${taskId}`);
    if (data) {
        taskComments = data;
        renderComments();
    }
}

function renderComments() {
    const container = document.getElementById('commentsList');
    if (!container) return;
    
    if (taskComments.length === 0) {
        container.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-secondary); font-size: 14px;">Chưa có comment nào.</div>';
        return;
    }
    
    container.innerHTML = taskComments.map(comment => createCommentItem(comment)).join('');
    
    // Attach event listeners
    container.querySelectorAll('.comment-item-action').forEach(btn => {
        const action = btn.getAttribute('data-action');
        const commentId = parseInt(btn.getAttribute('data-comment-id'));
        if (action === 'edit') {
            btn.addEventListener('click', () => handleEditComment(commentId));
        } else if (action === 'delete') {
            btn.addEventListener('click', () => handleDeleteComment(commentId));
        }
    });
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function createCommentItem(comment) {
    const user = comment.user || {};
    const authorName = user.full_name || user.username || 'Unknown';
    const avatarUrl = user.avatar_url;
    const isAuthor = comment.user_id === currentUser?.id;
    const isProjectOwner = currentProject?.owner_id === currentUser?.id;
    const canEdit = isAuthor;
    const canDelete = isAuthor || isProjectOwner;
    
    // Avatar HTML
    let avatarHtml = '';
    if (avatarUrl) {
        avatarHtml = `<img src="${avatarUrl}" alt="${escapeHtml(authorName)}" class="comment-item-avatar" onerror="onAvatarError(this,'comment-item-avatar-initials')">`;
    } else {
        const initials = (authorName || 'U').split(' ').map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('') || '👤';
        avatarHtml = `<div class="comment-item-avatar-initials">${initials}</div>`;
    }
    
    // Time display
    const timeStr = formatCommentTime(comment.created_at);
    const editedStr = comment.is_edited ? '<span style="font-size: 11px; color: var(--text-secondary); font-style: italic; margin-left: 8px;">(đã chỉnh sửa)</span>' : '';
    
    // Attachment HTML
    let attachmentHtml = '';
    if (comment.attachment_url && !comment.is_deleted) {
        attachmentHtml = `
            <div class="comment-item-attachment">
                <img src="${comment.attachment_url}" alt="Attachment" onclick="window.open('${comment.attachment_url}', '_blank')">
            </div>
        `;
    }
    
    // Actions HTML
    let actionsHtml = '';
    if ((canEdit || canDelete) && !comment.is_deleted) {
        actionsHtml = '<div class="comment-item-actions">';
        if (canEdit) {
            actionsHtml += `<button class="comment-item-action" data-action="edit" data-comment-id="${comment.id}">Sửa</button>`;
        }
        if (canDelete) {
            actionsHtml += `<button class="comment-item-action danger" data-action="delete" data-comment-id="${comment.id}">Xóa</button>`;
        }
        actionsHtml += '</div>';
    }
    
    return `
        <div class="comment-item">
            ${avatarHtml}
            <div class="comment-item-content">
                <div class="comment-item-header">
                    <span class="comment-item-author">${escapeHtml(authorName)}</span>
                    <span class="comment-item-time">${timeStr}</span>
                    ${editedStr}
                </div>
                <div class="comment-item-text">${escapeHtml(comment.content)}</div>
                ${attachmentHtml}
                ${actionsHtml}
            </div>
        </div>
    `;
}

function formatCommentTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function handleAddComment() {
    const taskId = document.getElementById('taskId').value;
    if (!taskId) {
        alert('Vui lòng lưu task trước khi thêm comment!');
        return;
    }
    
    const content = document.getElementById('newCommentContent').value.trim();
    if (!content && !commentAttachmentFile) {
        alert('Vui lòng nhập nội dung hoặc đính kèm file!');
        return;
    }
    
    // Tạo comment
    const commentData = {
        task_id: parseInt(taskId),
        content: content || '(Không có nội dung)'
    };
    
    const comment = await apiCall('/comments/', 'POST', commentData);
    if (comment) {
        // Upload attachment nếu có
        if (commentAttachmentFile) {
            await uploadCommentAttachment(comment.id, commentAttachmentFile);
        }
        
        // Clear form
        document.getElementById('newCommentContent').value = '';
        commentAttachmentFile = null;
        document.getElementById('commentAttachmentPreview').style.display = 'none';
        document.getElementById('commentAttachmentInput').value = '';
        
        // Reload comments
        await loadComments(parseInt(taskId));
        if (currentProjectId) {
            await loadActivities(currentProjectId);
        }
    }
}

async function uploadCommentAttachment(commentId, file) {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(`/api/comments/${commentId}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Upload thất bại');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Upload Error:', error);
        alert('Có lỗi xảy ra khi upload file: ' + error.message);
        return null;
    }
}

function handleCommentAttachmentPreview(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        alert('Chỉ chấp nhận file ảnh!');
        return;
    }
    
    commentAttachmentFile = file;
    const preview = document.getElementById('commentAttachmentPreview');
    const reader = new FileReader();
    
    reader.onload = (e) => {
        preview.innerHTML = `
            <img src="${e.target.result}" alt="Preview">
            <div class="remove-attachment" onclick="removeCommentAttachment()">Xóa đính kèm</div>
        `;
        preview.style.display = 'block';
    };
    
    reader.readAsDataURL(file);
}

function removeCommentAttachment() {
    commentAttachmentFile = null;
    document.getElementById('commentAttachmentPreview').style.display = 'none';
    document.getElementById('commentAttachmentInput').value = '';
}

async function handleEditComment(commentId) {
    const comment = taskComments.find(c => c.id === commentId);
    if (!comment) return;
    
    const newContent = prompt('Sửa comment:', comment.content);
    if (newContent === null || newContent.trim() === '') return;
    
    const data = await apiCall(`/comments/${commentId}`, 'PUT', {
        content: newContent.trim()
    });
    
    if (data) {
        const taskId = document.getElementById('taskId').value;
        await loadComments(parseInt(taskId));
    }
}

async function handleDeleteComment(commentId) {
    if (!confirm('Bạn có chắc chắn muốn xóa comment này không?')) {
        return;
    }
    
    const data = await apiCall(`/comments/${commentId}`, 'DELETE');
    if (data) {
        const taskId = document.getElementById('taskId').value;
        await loadComments(parseInt(taskId));
        if (currentProjectId) {
            await loadActivities(currentProjectId);
        }
    }
}

// Activity Log Functions
let projectActivities = [];
let activityPollingInterval = null;
const ACTIVITY_POLL_INTERVAL = 5000; // 5 giây

async function loadActivities(projectId) {
    if (!projectId) {
        document.getElementById('projectSummarySection').style.display = 'none';
        return;
    }

    projectActivities = [];
    renderProjectGoals();
    await loadProjectMembers(projectId);

    // Fetch actual activity log from API
    try {
        const data = await apiCall(`/activities/?project_id=${projectId}&limit=40`);
        projectActivities = Array.isArray(data) ? data : [];
    } catch (e) {
        projectActivities = [];
    }
    renderActivities();
}

async function loadProjectMembers(projectId) {
    const memberList = document.getElementById('projectMembersList');
    if (!memberList) return;

    if (!projectId) {
        projectMembers = [];
        selectedProjectMemberId = null;
        renderProjectMembers();
        return;
    }

    const roleMap = new Map();
    if (currentProject?.owner_id) {
        roleMap.set(currentProject.owner_id, 'owner');
    }

    try {
        const data = await apiCall(`/teams/project/${projectId}`);
        if (Array.isArray(data)) {
            data.forEach((member) => {
                if (member?.user_id) {
                    roleMap.set(member.user_id, member.role || roleMap.get(member.user_id) || 'member');
                }
            });
        }
    } catch (error) {
        console.error('Failed to load project members:', error);
    }

    const taskAssigneeMap = new Map();
    (tasks || []).forEach((task) => {
        (task.assignees || []).forEach((assignee) => {
            if (!assignee?.id) return;
            if (!taskAssigneeMap.has(assignee.id)) {
                taskAssigneeMap.set(assignee.id, assignee);
            }
            if (!roleMap.has(assignee.id)) {
                roleMap.set(assignee.id, 'assignee');
            }
        });
    });

    const userLookup = new Map((users || []).map((user) => [user.id, user]));
    taskAssigneeMap.forEach((value, key) => {
        if (!userLookup.has(key)) {
            userLookup.set(key, value);
        }
    });

    projectMembers = Array.from(roleMap.entries()).map(([userId, role]) => {
        const user = userLookup.get(userId) || { id: userId, username: `U${userId}` };
        const ownedTasks = (tasks || []).filter((task) => (task.assignees || []).some((assignee) => assignee.id === userId));
        return {
            id: userId,
            role,
            user,
            responsibilities: ownedTasks.map((task) => task.title),
            responsibilityCount: ownedTasks.length
        };
    }).sort((a, b) => {
        const roleOrder = { owner: 0, admin: 1, member: 2, assignee: 3 };
        const roleDiff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
        if (roleDiff !== 0) return roleDiff;
        return (a.user.full_name || a.user.username || '').localeCompare((b.user.full_name || b.user.username || ''), 'vi');
    });

    if (!projectMembers.some((member) => member.id === selectedProjectMemberId)) {
        selectedProjectMemberId = projectMembers[0]?.id || null;
    }

    renderProjectMembers();
    updateAssigneesList();
}

function renderProjectGoals() {
    const container = document.getElementById('activityList');
    if (!container) return;

    if (!currentProject) {
        container.innerHTML = '<div class="project-members-empty">Chưa có mục tiêu nào.</div>';
        return;
    }

    const goals = [];
    if (currentProject.objective_group) {
        goals.push({
            title: 'MTCL liên kết',
            body: currentProject.objective_group
        });
    }
    if (currentProject.objective_description) {
        goals.push({
            title: 'Mô tả mục tiêu',
            body: currentProject.objective_description
        });
    }
    if (!goals.length) {
        container.innerHTML = '<div class="project-members-empty">Chưa có mục tiêu nào.</div>';
        return;
    }

    container.innerHTML = goals.map((goal) => `
        <article class="goal-item">
            <span class="goal-item-label">${escapeHtml(goal.title)}</span>
            <p>${escapeHtml(goal.body || '--')}</p>
        </article>
    `).join('');
}

const _PM_AVATAR_PALETTES = [
    ['#4361ee','#7c89f7'], ['#10b981','#34d399'], ['#f59e0b','#fbbf24'],
    ['#8b5cf6','#a78bfa'], ['#ef4444','#f87171'], ['#0ea5e9','#38bdf8'],
    ['#ec4899','#f472b6'], ['#14b8a6','#2dd4bf'],
];
function _pmAvatarGradient(id) {
    const [a, b] = _PM_AVATAR_PALETTES[(id || 0) % _PM_AVATAR_PALETTES.length];
    return `linear-gradient(135deg,${a},${b})`;
}
function _pmInitials(name) {
    return (name || 'U').split(' ').map(p => p[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join('');
}

function renderProjectMembers() {
    const list = document.getElementById('projectMembersList');
    if (!list) return;

    if (!projectMembers.length) {
        list.innerHTML = '<div class="project-members-empty">Chưa có thành viên nào.</div>';
        return;
    }

    list.innerHTML = `<div class="pm-cards-grid">${projectMembers.map(member => {
        const user    = member.user || {};
        const name    = user.full_name || user.username || `User ${member.id}`;
        const initials = _pmInitials(name);
        const roleText = formatProjectMemberRole(member.role);
        const roleCls  = member.role === 'owner' ? 'pm-role-owner'
                       : member.role === 'admin'  ? 'pm-role-admin' : 'pm-role-member';
        const ringCls  = member.role === 'owner'  ? ' pm-owner-ring' : '';
        const tc       = member.responsibilityCount || 0;
        const avatarInner = user.avatar_url
            ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">${initials}`
            : initials;

        return `<button type="button" class="pm-card" onclick="openMemberPopup(${member.id}, event)">
            <div class="pm-avatar${ringCls}" style="background:${_pmAvatarGradient(member.id)}">${avatarInner}</div>
            <div class="pm-name">${escapeHtml(name)}</div>
            <span class="pm-role-badge ${roleCls}">${escapeHtml(roleText)}</span>
            <div class="pm-task-count">${tc > 0 ? `${tc} task` : 'Chưa có task'}</div>
        </button>`;
    }).join('')}</div>`;
}

let _memberPopupOpenId = null;

function openMemberPopup(memberId, event) {
    event?.stopPropagation();
    closeMemberPopup();

    const member = projectMembers.find(m => m.id === memberId);
    if (!member) return;
    _memberPopupOpenId = memberId;

    const user     = member.user || {};
    const name     = user.full_name || user.username || `User ${memberId}`;
    const initials = _pmInitials(name);
    const roleText = formatProjectMemberRole(member.role);
    const roleCls  = member.role === 'owner' ? 'pm-role-owner'
                   : member.role === 'admin'  ? 'pm-role-admin' : 'pm-role-member';
    const code     = user.username ? `${user.username}` : '';
    const dept     = user.department || '';
    const pos      = user.position || '';
    const meta     = [code, dept, pos].filter(Boolean).join(' · ');

    const memberTasks = (tasks || []).filter(t => (t.assignees || []).some(a => a.id === memberId));
    const doneCount   = memberTasks.filter(t => t.status === 'done').length;
    const progCount   = memberTasks.filter(t => t.status === 'in_progress').length;
    const todoCount   = memberTasks.filter(t => t.status === 'todo').length;
    const memberTaskItems = getCollapsedTaskItems(memberTasks);

    const taskListHtml = memberTaskItems.slice(0, 6).map(item => {
        if (item.type === 'series') {
            const series = item.series;
            const rep = series.representative || series.tasks[0];
            const dot = series.status === 'done' ? '#10b981' : series.status === 'in_progress' ? '#4361ee' : '#cbd5e1';
            return `<button type="button" class="mp-task-item" onclick="closeMemberPopup(); openTaskSeriesModal(decodeURIComponent('${encodeURIComponent(series.key)}'))">
                <div class="mp-task-dot" style="background:${dot}"></div>
                <span class="mp-task-title">${escapeHtml(rep.title)}</span>
                <span class="mp-task-badge">${series.doneCount}/${series.totalCount}</span>
            </button>`;
        }
        const t = item.task;
        const dot = t.status === 'done' ? '#10b981' : t.status === 'in_progress' ? '#4361ee' : '#cbd5e1';
        return `<button type="button" class="mp-task-item" onclick="openTaskModal(tasks.find(x=>x.id==${t.id}),false);closeMemberPopup()">
            <div class="mp-task-dot" style="background:${dot}"></div>
            <span class="mp-task-title">${escapeHtml(t.title)}</span>
        </button>`;
    }).join('');

    const avatarHeader = user.avatar_url
        ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(name)}">`
        : initials;

    const popup = document.createElement('div');
    popup.id = 'memberPopup';
    popup.className = 'member-popup';
    popup.innerHTML = `
        <div class="mp-header" style="background:${_pmAvatarGradient(memberId)}">
            <div class="mp-avatar-lg">${avatarHeader}</div>
            <div class="mp-identity">
                <div class="mp-full-name">${escapeHtml(name)}</div>
                <div class="mp-code-dept">${escapeHtml(meta || 'Chưa có thông tin')}</div>
            </div>
            <button class="mp-close-btn" onclick="closeMemberPopup()">×</button>
        </div>
        <div class="mp-body">
            <div class="mp-role-row">
                <span class="mp-role-label">Vai trò</span>
                <span class="mp-role-pill ${roleCls}">${escapeHtml(roleText)}</span>
            </div>
            <div class="mp-stats-row">
                <div class="mp-stat mp-stat-done"><div class="mp-stat-num">${doneCount}</div><div class="mp-stat-lbl">Hoàn thành</div></div>
                <div class="mp-stat mp-stat-prog"><div class="mp-stat-num">${progCount}</div><div class="mp-stat-lbl">Đang làm</div></div>
                <div class="mp-stat mp-stat-todo"><div class="mp-stat-num">${todoCount}</div><div class="mp-stat-lbl">Chưa làm</div></div>
            </div>
            ${memberTaskItems.length > 0 ? `
            <div class="mp-tasks-label">Công việc được giao (${memberTaskItems.length})</div>
            <div class="mp-task-list">${taskListHtml}</div>
            ${memberTaskItems.length > 6 ? `<div style="font-size:11px;color:#9ca3af;margin-top:6px">+${memberTaskItems.length-6} task khác</div>` : ''}
            ` : '<div style="font-size:12px;color:#9ca3af;padding:4px 0">Chưa được giao task nào.</div>'}
        </div>`;

    document.body.appendChild(popup);

    // Position popup near clicked card
    const card = event?.currentTarget || event?.target?.closest('.pm-card');
    if (card) {
        const rect  = card.getBoundingClientRect();
        const pw    = 290;
        const ph    = popup.offsetHeight || 360;
        let left    = rect.right + 8;
        let top     = rect.top;
        if (left + pw > window.innerWidth - 8) left = rect.left - pw - 8;
        if (top + ph  > window.innerHeight - 8) top  = window.innerHeight - ph - 8;
        if (top < 8) top = 8;
        popup.style.left = `${left}px`;
        popup.style.top  = `${top}px`;
    } else {
        popup.style.left = '50%';
        popup.style.top  = '50%';
        popup.style.transform = 'translate(-50%,-50%)';
    }

    // Overlay to close on outside click
    const overlay = document.createElement('div');
    overlay.id = 'memberPopupOverlay';
    overlay.className = 'mp-overlay';
    overlay.addEventListener('click', closeMemberPopup);
    document.body.insertBefore(overlay, popup);
}

function closeMemberPopup() {
    document.getElementById('memberPopup')?.remove();
    document.getElementById('memberPopupOverlay')?.remove();
    _memberPopupOpenId = null;
}

function getProjectMemberStatusInfo(member) {
    if (member.role === 'owner') {
        return { key: 'owner' };
    }
    if (member.responsibilityCount > 2) {
        return { key: 'busy' };
    }
    if (member.responsibilityCount > 0) {
        return { key: 'active' };
    }
    return { key: 'idle' };
}

function getProjectMemberResponsibilitySummary(member) {
    const responsibilities = member.responsibilities || [];
    if (!responsibilities.length) {
        return 'Chưa có task cụ thể';
    }
    const topItems = responsibilities.slice(0, 2).join(', ');
    const remaining = responsibilities.length - 2;
    return remaining > 0 ? `${topItems} +${remaining}` : topItems;
}

function formatProjectMemberRole(role) {
    const roleMap = {
        owner: 'Project Owner',
        admin: 'Quản trị',
        member: 'Thành viên',
        assignee: 'Phụ trách task'
    };
    return roleMap[role] || role || 'Thành viên';
}

function renderActivities() {
    const container = document.getElementById('projectActivityList');
    if (!container) return;
    
    if (projectActivities.length === 0) {
        container.innerHTML = '<div class="project-members-empty">Chưa có hoạt động nào.</div>';
        return;
    }
    
    const grouped = groupActivitiesByDate(projectActivities);
    
    container.innerHTML = Object.entries(grouped).map(([dateLabel, activities]) => `
        <div class="activity-group">
            <div class="activity-group-header">${dateLabel}</div>
            ${activities.map(activity => createActivityItem(activity)).join('')}
        </div>
    `).join('');
    
    // Attach click listeners
    container.querySelectorAll('.activity-item').forEach(item => {
        item.addEventListener('click', () => {
            const entityType = item.getAttribute('data-entity-type');
            const entityId = parseInt(item.getAttribute('data-entity-id'));
            if (entityType === 'task') {
                const task = tasks.find(t => t.id === entityId);
                if (task) {
                    openTaskModal(task, !canEditTask(task));
                }
            }
        });
    });
}

function groupActivitiesByDate(activities) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const grouped = {};
    
    activities.forEach(activity => {
        const date = new Date(activity.created_at);
        let label = '';
        
        if (date >= today) {
            label = 'Hôm nay';
        } else if (date >= yesterday) {
            label = 'Hôm qua';
        } else if (date >= weekAgo) {
            label = 'Tuần này';
        } else {
            label = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
        
        if (!grouped[label]) {
            grouped[label] = [];
        }
        grouped[label].push(activity);
    });
    
    return grouped;
}

function createActivityItem(activity) {
    const user = activity.user || {};
    const authorName = user.full_name || user.username || 'Unknown';
    const avatarUrl = user.avatar_url;

    let avatarHtml = '';
    if (avatarUrl) {
        avatarHtml = `<img src="${avatarUrl}" alt="${escapeHtml(authorName)}" class="activity-item-avatar" onerror="onAvatarError(this,'activity-item-avatar-initials')">`;
    } else {
        const initials = (authorName || 'U').split(' ').map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('') || 'U';
        avatarHtml = `<div class="activity-item-avatar-initials">${initials}</div>`;
    }

    const iconMap = {
        task_created: 'add_task',
        task_updated: 'edit_square',
        task_status_changed: 'sync_alt',
        task_completed: 'task_alt',
        task_assigned: 'person_add',
        comment_added: 'chat',
        subtask_completed: 'check_circle'
    };
    const icon = iconMap[activity.activity_type] || 'flag';
    const timeStr = formatActivityTime(activity.created_at);

    return `
        <div class="activity-item" data-entity-type="${activity.entity_type}" data-entity-id="${activity.entity_id}">
            ${avatarHtml}
            <div class="activity-item-icon ${activity.activity_type}"><span class="material-symbols-outlined">${icon}</span></div>
            <div class="activity-item-content">
                <div class="activity-item-text">${escapeHtml(activity.description)}</div>
                <div class="activity-item-time">${timeStr}</div>
            </div>
        </div>
    `;
}

function formatActivityTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function startActivityPolling(projectId) {
    // Dừng polling cũ nếu có
    stopActivityPolling();
    
    // Poll mỗi 5 giây để cập nhật activities
    activityPollingInterval = setInterval(() => {
        if (currentProjectId === projectId) {
            loadActivities(projectId);
        } else {
            stopActivityPolling();
        }
    }, ACTIVITY_POLL_INTERVAL);
}

function stopActivityPolling() {
    if (activityPollingInterval) {
        clearInterval(activityPollingInterval);
        activityPollingInterval = null;
    }
}

// Notifications
async function loadNotificationCount() {
    if (!currentUser) return;
    
    try {
        const data = await apiCall('/notifications/unread-count');
        if (data && data.count > 0) {
            const badge = document.getElementById('notificationBadge');
            if (badge) {
                badge.textContent = data.count > 99 ? '99+' : data.count;
                badge.style.display = 'flex';
            }
        } else {
            const badge = document.getElementById('notificationBadge');
            if (badge) {
                badge.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error loading notification count:', error);
    }
}

async function loadNotifications() {
    if (!currentUser) return;
    
    try {
        const notifications = await apiCall('/notifications/?limit=50');
        renderNotifications(notifications || []);
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function renderNotifications(notifications) {
    const container = document.getElementById('notificationsList');
    if (!container) return;

    if (!notifications || notifications.length === 0) {
        container.innerHTML = '<div class="empty-state">Không có thông báo nào</div>';
        return;
    }

    notificationsIndex = new Map(notifications.map(notif => [Number(notif.id), notif]));
    container.onclick = (event) => {
        const item = event.target.closest('.notification-item');
        if (!item) return;
        handleNotificationClick(Number(item.dataset.notifId), item);
    };

    container.innerHTML = notifications.map(notif => {
        const timeAgo = getTimeAgo(new Date(notif.created_at));
        const readClass = notif.is_read ? 'read' : 'unread';

        let icon = 'notifications';

        if (notif.type === 'task_assigned') {
            icon = 'person_add';
        } else if (notif.type === 'task_updated') {
            icon = 'edit_square';
        } else if (notif.type === 'mentioned') {
            icon = 'alternate_email';
        } else if (notif.type === 'deadline_reminder') {
            icon = 'alarm';
        } else if (notif.type === 'meeting_assigned') {
            icon = 'group_add';
        } else if (notif.type === 'meeting_session_open') {
            icon = 'event_available';
        }

        return `
            <div class="notification-item ${readClass}" data-notif-id="${notif.id}">
                <div class="notification-content">
                    <div class="notification-title">
                        <span class="notification-title-icon"><span class="material-symbols-outlined">${icon}</span></span>
                        ${escapeHtml(notif.title)}
                    </div>
                    <div class="notification-message">${escapeHtml(notif.message)}</div>
                    <div class="notification-time">${timeAgo}</div>
                </div>
                ${!notif.is_read ? '<div class="notification-unread-dot"></div>' : ''}
            </div>
        `;
    }).join('');
}

async function handleNotificationClick(notificationId, el) {
    const notif = notificationsIndex.get(Number(notificationId));
    if (!notif) return;

    if (notif.type === 'meeting_session_open') {
        if (notif.meeting_id && notif.session_id) {
            await openPmSessionFromNotification(Number(notif.meeting_id), Number(notif.session_id));
        } else {
            await openPmSessionFromNotificationFallback(notif);
        }
    } else if (notif.type === 'meeting_assigned') {
        switchView('personal');
        showPersonalSection('meeting');
    } else if (notif.type === 'mentioned') {
        if (notif.thread_id && notif.project_id) {
            openThreadFromNotification(notif.project_id, notif.thread_id);
        } else if (notif.project_id) {
            selectProject(notif.project_id);
        }
    } else if (notif.task_id) {
        openTaskFromNotification(notif.task_id);
    } else if (notif.project_id) {
        selectProject(notif.project_id);
    }

    await markNotificationAsRead(notificationId, el);
}

async function openPmSessionFromNotificationFallback(notif) {
    const parsed = parseMeetingSessionNotificationMessage(notif.message || '');
    const meetingsData = await apiCall('/periodic-meetings/');
    if (!meetingsData?.length) {
        switchView('personal');
        showPersonalSection('meeting');
        return;
    }

    const meeting = parsed.meetingTitle
        ? meetingsData.find(m => normalizeText(m.title) === normalizeText(parsed.meetingTitle))
        : null;
    const candidateMeeting = meeting || meetingsData[0];
    const sessions = await apiCall(`/periodic-meetings/${candidateMeeting.id}/sessions`);
    const session = parsed.sessionTitle
        ? sessions?.find(s => normalizeText(s.title) === normalizeText(parsed.sessionTitle))
        : sessions?.find(s => s.status === 'open');

    if (candidateMeeting?.id && session?.id) {
        await openPmSessionFromNotification(candidateMeeting.id, session.id);
    } else {
        switchView('personal');
        showPersonalSection('meeting');
    }
}

function parseMeetingSessionNotificationMessage(message) {
    const match = message.match(/Phiên\s+"([^"]+)"\s+\(([^)]+)\)/i);
    return {
        sessionTitle: match?.[1] || '',
        meetingTitle: match?.[2] || '',
    };
}

function normalizeText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    if (hours < 24) return `${hours} giờ trước`;
    if (days < 7) return `${days} ngày trước`;
    return date.toLocaleDateString('vi-VN');
}

function openTaskFromNotification(taskId) {
    const task = tasks.find(t => t.id === taskId) || dashboardTasks.find(t => t.id === taskId);
    if (task) {
        if (task.project_id) {
            currentProjectId = task.project_id;
            switchView('board');
            setTimeout(() => {
                openTaskModal(task);
            }, 300);
        } else {
            openTaskModal(task);
        }
    }
}

function openThreadFromNotification(projectId, threadId) {
    // Thread tab is temporarily hidden from the board UI.
    // Keep the notification routing on the related project board instead of activating dormant thread UI.
    if (projectId) {
        currentProjectId = projectId;
        switchView('board');
        switchBoardTab('status');
    }
}

async function markAllNotificationsAsRead() {
    try {
        await apiCall('/notifications/read-all', 'PUT');
        const container = document.getElementById('notificationsList');
        if (container) {
            const items = container.querySelectorAll('.notification-item');
            items.forEach((el, i) => {
                setTimeout(() => {
                    el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                    el.style.opacity = '0';
                    el.style.transform = 'translateX(16px)';
                }, i * 40);
            });
            setTimeout(() => {
                container.innerHTML = '<div class="empty-state">Không có thông báo nào</div>';
            }, items.length * 40 + 250);
        }
        loadNotificationCount();
    } catch (error) {
        console.error('Error marking all as read:', error);
    }
}

async function markNotificationAsRead(notificationId, el) {
    try {
        await apiCall(`/notifications/${notificationId}/read`, 'PUT');
        if (el) {
            const h = el.offsetHeight;
            el.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
            el.style.opacity = '0';
            el.style.transform = 'translateX(20px)';
            setTimeout(() => {
                el.style.transition = 'max-height 0.28s ease, padding 0.28s ease, margin 0.28s ease';
                el.style.overflow = 'hidden';
                el.style.maxHeight = h + 'px';
                requestAnimationFrame(() => {
                    el.style.maxHeight = '0';
                    el.style.paddingTop = '0';
                    el.style.paddingBottom = '0';
                    el.style.marginBottom = '0';
                });
                setTimeout(() => {
                    el.remove();
                    const container = document.getElementById('notificationsList');
                    if (container && container.querySelectorAll('.notification-item').length === 0) {
                        container.innerHTML = '<div class="empty-state">Không có thông báo nào</div>';
                    }
                }, 300);
            }, 230);
        }
        loadNotificationCount();
    } catch (error) {
        console.error('Error marking as read:', error);
    }
}

// ── Recurring Task Templates ──────────────────────────────────────────────────

const FREQUENCY_LABELS = {
    weekly:      'Hàng tuần',
    monthly:     'Hàng tháng',
    quarterly:   'Hàng quý',
    semi_annual: '6 tháng',
    annual:      'Hàng năm',
    ad_hoc:      'Khi phát sinh',
};
const FREQUENCY_ORDER = ['weekly', 'monthly', 'quarterly', 'semi_annual', 'annual', 'ad_hoc'];

let recurringTasksUserId = null;
let recurringTasksList = [];
let activeRecurringFreq = 'weekly';
let recurringTasksReadOnly = false;
let recurringTasksRenderTarget = 'modal';

async function openRecurringTasksModal(userId, options = {}) {
    const user = options.user || users.find(u => u.id === userId);
    if (!user) return;
    recurringTasksUserId = userId;
    activeRecurringFreq = 'weekly';
    recurringTasksReadOnly = Boolean(options.readOnly);
    recurringTasksRenderTarget = 'modal';

    document.getElementById('recurringTasksModalTitle').textContent = 'Công việc định kỳ';
    document.getElementById('recurringTasksModalSubtitle').textContent =
        (user.full_name || user.username) + (user.position ? ' · ' + user.position : '');
    const modal = document.getElementById('recurringTasksModal');
    modal.classList.toggle('modal-over-dashboard', recurringTasksReadOnly && document.getElementById('pmDashboardOverlay')?.style.display !== 'none');
    modal.classList.add('active');

    await loadRecurringTasks(userId);
}

function closeRecurringTasksModal() {
    const modal = document.getElementById('recurringTasksModal');
    modal.classList.remove('active', 'modal-over-dashboard');
    recurringTasksUserId = null;
    recurringTasksList = [];
    recurringTasksReadOnly = false;
    recurringTasksRenderTarget = 'modal';
}

async function loadRecurringTasks(userId, options = {}) {
    const body = getRecurringTasksBody();
    if (!body) return;
    body.innerHTML = '<div class="users-empty-state" style="padding:32px">Đang tải...</div>';
    const data = await apiCall(options.endpoint || `/recurring-tasks/user/${userId}`);
    if (!data) return;
    recurringTasksList = data;
    cacheTaskList(data);
    renderRecurringTasksList(options);
}

function getRecurringTasksBody() {
    return document.getElementById(
        recurringTasksRenderTarget === 'account' ? 'accountRecurringTasksBody' : 'recurringTasksBody'
    );
}

function renderRecurringTasksList(options = {}) {
    const body = getRecurringTasksBody();
    if (!body) return;

    const grouped = {};
    FREQUENCY_ORDER.forEach(f => { grouped[f] = []; });
    recurringTasksList.forEach(t => {
        if (grouped[t.frequency]) grouped[t.frequency].push(t);
    });

    // Dropdown options
    const optionsHtml = FREQUENCY_ORDER.map(f => {
        const count = grouped[f].length;
        const label = FREQUENCY_LABELS[f] + (count > 0 ? ` (${count})` : '');
        return `<option value="${f}"${f === activeRecurringFreq ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    // Active frequency card list
    const activeTasks = grouped[activeRecurringFreq] || [];
    const cardRowsHtml = activeTasks.map((t, i) => `
        <div class="rtask-item" data-id="${t.id}">
            <span class="rtask-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="rtask-title">${escapeHtml(t.title)}</span>
            ${t.description
                ? `<button type="button" class="rtask-info-btn" onclick="showTaskDetailById(${t.id})" title="Xem chi tiết">
                    <span class="material-symbols-outlined">info</span>
                </button>`
                : ''}
            ${recurringTasksReadOnly ? '' : `<button type="button" class="rtask-delete-btn" onclick="deleteRecurringTask(${t.id})" title="Xoá">
                <span class="material-symbols-outlined">close</span>
            </button>`}
        </div>`).join('');

    const emptyHtml = activeTasks.length === 0
        ? `<div class="rtask-empty-row">${recurringTasksReadOnly ? 'Chưa có công việc nào.' : 'Chưa có công việc nào — nhập bên dưới để thêm'}</div>` : '';
    const addRowHtml = recurringTasksReadOnly ? '' : `
        <div class="rtask-add-row">
            <input type="text" id="rtaskQuickInput" class="rtask-inline-input"
                placeholder="Nhập tên công việc..."
                onkeydown="handleRtaskQuickKey(event)" autocomplete="off">
            <button type="button" class="rtask-inline-confirm" onclick="submitRtaskQuick()" title="Thêm">
                <span class="material-symbols-outlined">add</span>
            </button>
        </div>`;

    body.innerHTML = `
        <div class="rtask-freq-header">
            <div class="rtask-freq-header-left">
                <span class="rtask-color-bar ${activeRecurringFreq}"></span>
                <h2 class="rtask-freq-title">${escapeHtml(FREQUENCY_LABELS[activeRecurringFreq])}</h2>
            </div>
            <div class="rtask-freq-select-wrap">
                <select class="rtask-freq-select" onchange="switchRecurringFreq(this.value)">
                    ${optionsHtml}
                </select>
                <span class="material-symbols-outlined">expand_more</span>
            </div>
        </div>
        <div class="rtask-card-list">${cardRowsHtml}${emptyHtml}</div>
        ${addRowHtml}`;

    if (!recurringTasksReadOnly && options.focusInput !== false) {
        setTimeout(() => document.getElementById('rtaskQuickInput')?.focus(), 50);
    }
}

function switchRecurringFreq(f) {
    activeRecurringFreq = f;
    renderRecurringTasksList();
}

async function submitRtaskQuick() {
    const input = document.getElementById('rtaskQuickInput');
    if (!input || !recurringTasksUserId) return;
    const title = input.value.trim();
    if (!title) { input.focus(); return; }

    input.disabled = true;
    const endpoint = recurringTasksRenderTarget === 'account'
        ? '/recurring-tasks/me'
        : `/recurring-tasks/user/${recurringTasksUserId}`;
    const result = await apiCall(endpoint, 'POST',
        { title, frequency: activeRecurringFreq });
    if (result) {
        recurringTasksList.push(result);
        renderRecurringTasksList();
    } else {
        input.disabled = false;
        input.focus();
    }
}

function handleRtaskQuickKey(event) {
    if (event.key === 'Enter') { event.preventDefault(); submitRtaskQuick(); }
}

async function deleteRecurringTask(templateId) {
    if (!confirm('Xoá công việc này?')) return;
    const result = await apiCall(`/recurring-tasks/${templateId}`, 'DELETE');
    if (result !== null) {
        recurringTasksList = recurringTasksList.filter(t => t.id !== templateId);
        renderRecurringTasksList();
    }
}

// ── Employee Detail Drawer (Screen 2) ────────────────────────────────────────

let empDrawerUserId = null;

async function openEmployeeDetail(userId) {
    const drawer = document.getElementById('employeeDetailDrawer');
    empDrawerUserId = userId;

    const user = users.find(u => u.id === userId);
    if (user) {
        // Avatar
        const avatarWrap = document.getElementById('empDrawerAvatarWrap');
        if (user.avatar_url) {
            avatarWrap.innerHTML = `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.full_name || user.username)}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;" onerror="onAvatarError(this,'__parent__')">`;
        } else {
            const initials = (user.full_name || user.username || '?').charAt(0).toUpperCase();
            avatarWrap.innerHTML = `<div class="user-avatar" style="width:48px;height:48px;font-size:18px;">${initials}</div>`;
        }
        document.getElementById('empDrawerName').textContent = user.full_name || user.username;
        const metaParts = [user.position, user.team, user.department].filter(Boolean);
        document.getElementById('empDrawerMeta').textContent = metaParts.join(' · ') || user.username;
    }

    // KPI placeholder while loading
    document.getElementById('empDrawerKpi').innerHTML = '';
    document.getElementById('empDrawerBody').innerHTML = '<div class="users-empty-state">Đang tải...</div>';

    // Wire edit button
    const editBtn = document.getElementById('empDrawerEditBtn');
    editBtn.onclick = () => {
        closeEmployeeDetail();
        openRecurringTasksModal(userId);
    };

    drawer.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Load tasks
    const tasks = await apiCall(`/recurring-tasks/user/${userId}`);
    if (!tasks) return;
    cacheTaskList(tasks);
    renderEmployeeDetailBody(tasks);
}

function closeEmployeeDetail() {
    const drawer = document.getElementById('employeeDetailDrawer');
    drawer.classList.remove('active');
    document.getElementById('empDrawerPanel')?.classList.remove('emp-drawer-panel--fullscreen');
    const icon = document.getElementById('empDrawerFullscreenIcon');
    if (icon) icon.textContent = 'open_in_full';
    document.body.style.overflow = '';
    empDrawerUserId = null;
}

function toggleEmpDrawerFullscreen() {
    const panel = document.getElementById('empDrawerPanel');
    const icon  = document.getElementById('empDrawerFullscreenIcon');
    const isFs  = panel.classList.toggle('emp-drawer-panel--fullscreen');
    icon.textContent = isFs ? 'close_fullscreen' : 'open_in_full';
}

function renderEmployeeDetailBody(tasks) {
    const grouped = {};
    FREQUENCY_ORDER.forEach(f => { grouped[f] = []; });
    tasks.forEach(t => {
        if (grouped[t.frequency]) grouped[t.frequency].push(t);
    });

    const total = tasks.length;
    const freqsWithTasks = FREQUENCY_ORDER.filter(f => grouped[f].length > 0).length;

    // KPI strip
    document.getElementById('empDrawerKpi').innerHTML = `
        <div class="emp-drawer-kpi-item">
            <span class="emp-drawer-kpi-label">Tổng tasks</span>
            <span class="emp-drawer-kpi-val">${total}</span>
        </div>
        <div class="emp-drawer-kpi-item">
            <span class="emp-drawer-kpi-label">Tần suất có task</span>
            <span class="emp-drawer-kpi-val blue">${freqsWithTasks} / ${FREQUENCY_ORDER.length}</span>
        </div>
        <div class="emp-drawer-kpi-item">
            <span class="emp-drawer-kpi-label">Trạng thái</span>
            <span class="emp-drawer-kpi-val${total > 0 ? ' green' : ''}">${total > 0 ? 'Đã có' : 'Trống'}</span>
        </div>
    `;

    // Horizontal frequency grid
    const colsHtml = FREQUENCY_ORDER.map(f => {
        const ftasks = grouped[f];
        const taskRows = ftasks.length > 0
            ? ftasks.map((t, i) => {
                const infoBtn = t.description
                    ? `<button type="button" class="emp-freq-task-info"
                            onclick="event.stopPropagation();showTaskDetailById(${t.id})"
                            title="Xem chi tiết">
                            <span class="material-symbols-outlined">open_in_full</span>
                        </button>`
                    : '';
                return `<li class="emp-freq-col-task"${t.description ? ` onclick="showTaskDetailById(${t.id})" style="cursor:pointer"` : ''}>
                    <span class="emp-freq-col-num">${i + 1}</span>
                    <span style="flex:1;min-width:0">${escapeHtml(t.title)}</span>
                    ${infoBtn}
                </li>`;
            }).join('')
            : `<li class="emp-freq-col-empty">Chưa có</li>`;

        return `
            <div class="emp-freq-col">
                <div class="emp-freq-col-header">
                    <span class="emp-freq-col-bar ${f}"></span>
                    <span class="emp-freq-col-label">${escapeHtml(FREQUENCY_LABELS[f])}</span>
                    <span class="emp-freq-col-count">${ftasks.length > 0 ? ftasks.length + ' task' : '—'}</span>
                </div>
                <ul class="emp-freq-col-tasks">${taskRows}</ul>
            </div>`;
    }).join('');

    document.getElementById('empDrawerBody').innerHTML = `
        <div class="emp-freq-grid-wrap">
            <div class="emp-freq-grid">${colsHtml}</div>
        </div>`;
}

// ── Tracking Matrix (Screen 3) ────────────────────────────────────────────────

let trackingMatrixData = [];

async function loadRecurringTasksMatrix() {
    document.getElementById('trackingMatrixBody').innerHTML =
        '<tr><td colspan="8" class="users-empty-state">Đang tải...</td></tr>';

    const data = await apiCall('/recurring-tasks/matrix');
    if (!data) return;
    trackingMatrixData = data;

    // Populate dept filter
    const deptFilter = document.getElementById('trackingDeptFilter');
    const depts = [...new Set(data.map(r => r.department).filter(Boolean))].sort();
    deptFilter.innerHTML = '<option value="">Tất cả phòng ban</option>' +
        depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    deptFilter.onchange = () => renderTrackingMatrix(trackingMatrixData);

    renderTrackingMatrix(data);
}

function renderTrackingMatrix(data) {
    const filterVal = document.getElementById('trackingDeptFilter')?.value || '';
    const rows = filterVal ? data.filter(r => r.department === filterVal) : data;

    // KPIs
    const assigned = rows.filter(r => r.total_tasks > 0).length;
    document.getElementById('tkpiTotal').textContent = rows.length;
    document.getElementById('tkpiAssigned').textContent = assigned;
    document.getElementById('tkpiUnassigned').textContent = rows.length - assigned;
    document.getElementById('tkpiTasks').textContent = rows.reduce((s, r) => s + r.total_tasks, 0);

    if (rows.length === 0) {
        document.getElementById('trackingMatrixBody').innerHTML =
            '<tr><td colspan="8" class="users-empty-state">Không có dữ liệu.</td></tr>';
        return;
    }

    const bodyHtml = rows.map(r => {
        const avatarHtml = r.avatar_url
            ? `<img src="${escapeHtml(r.avatar_url)}" alt="${escapeHtml(r.full_name||r.username||'?')}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="onAvatarError(this,'user-avatar')">`
            : `<div class="user-avatar" style="width:32px;height:32px;font-size:13px;flex-shrink:0;">${escapeHtml((r.full_name||r.username||'?').charAt(0).toUpperCase())}</div>`;

        const freqCells = FREQUENCY_ORDER.map(f => {
            const count = r.task_counts[f] || 0;
            return `<td class="tm-freq-cell">
                <span class="tm-badge ${count > 0 ? 'has' : 'none'}">${count > 0 ? count : '—'}</span>
            </td>`;
        }).join('');

        const subParts = [r.position, r.team].filter(Boolean);
        return `
            <tr onclick="openEmployeeDetail(${r.user_id})" title="Xem chi tiết ${escapeHtml(r.full_name||r.username)}">
                <td class="tm-employee-cell">
                    <div class="tm-employee-row">
                        ${avatarHtml}
                        <div class="tm-employee-info">
                            <div class="tm-employee-name">${escapeHtml(r.full_name || r.username)}</div>
                            ${subParts.length ? `<div class="tm-employee-sub">${escapeHtml(subParts.join(' · '))}</div>` : ''}
                        </div>
                    </div>
                </td>
                ${freqCells}
                <td class="tm-total-cell">
                    <span class="tm-total-val${r.total_tasks === 0 ? ' zero' : ''}">${r.total_tasks || '—'}</span>
                </td>
            </tr>
        `;
    }).join('');

    document.getElementById('trackingMatrixBody').innerHTML = bodyHtml;
}

// ── Task Detail Modal ─────────────────────────────────────────────────────

// Global task lookup (populated when tasks are loaded for any user)
const taskDetailCache = {};

function showTaskDetailById(id) {
    const task = taskDetailCache[id];
    if (task) showTaskDetail(task);
}

function cacheTaskList(tasks) {
    tasks.forEach(t => { taskDetailCache[t.id] = t; });
}

function showTaskDetail(task) {
    const modal = document.getElementById('taskDetailModal');
    const bar   = document.getElementById('taskDetailFreqBar');
    const label = document.getElementById('taskDetailFreqLabel');
    const title = document.getElementById('taskDetailTitle');
    const body  = document.getElementById('taskDetailBody');

    bar.className = `task-detail-freq-bar ${task.frequency}`;
    label.textContent = FREQUENCY_LABELS[task.frequency] || task.frequency;
    title.textContent = task.title;

    if (task.description) {
        const lines = task.description.split('\n').filter(l => l.trim());
        const isBullets = lines.every(l => l.trim().startsWith('-'));
        if (isBullets) {
            body.innerHTML = lines.map(l => `
                <div class="task-detail-desc-bullet">
                    <span class="task-detail-bullet-dot"></span>
                    <span>${escapeHtml(l.replace(/^-\s*/, ''))}</span>
                </div>`).join('');
        } else {
            body.innerHTML = `<div class="task-detail-desc">${escapeHtml(task.description)}</div>`;
        }
    } else {
        body.innerHTML = `<p style="color:var(--text-secondary);font-size:13px;font-style:italic;">Không có chi tiết bổ sung.</p>`;
    }

    modal.classList.add('active');
}

function closeTaskDetailModal() {
    document.getElementById('taskDetailModal').classList.remove('active');
}

// Drawer close listeners (run once after DOM ready)
(function initDrawerListeners() {
    const ready = () => {
        document.getElementById('empDrawerClose')?.addEventListener('click', closeEmployeeDetail);
        document.getElementById('empDrawerBackdrop')?.addEventListener('click', closeEmployeeDetail);
        document.getElementById('closeTaskDetailModal')?.addEventListener('click', closeTaskDetailModal);
        document.getElementById('taskDetailModal')?.addEventListener('click', e => {
            if (e.target.id === 'taskDetailModal') closeTaskDetailModal();
        });
        // Click-outside to close PM modals
        document.getElementById('pmSessionDetailModal')?.addEventListener('click', e => {
            if (e.target.id === 'pmSessionDetailModal') closePmSessionDetail();
        });
        document.getElementById('createPeriodicMeetingModal')?.addEventListener('click', e => {
            if (e.target.id === 'createPeriodicMeetingModal') closeCreatePeriodicMeeting();
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (document.getElementById('pmSessionDetailModal')?.classList.contains('active')) {
                    closePmSessionDetail();
                } else if (document.getElementById('createPeriodicMeetingModal')?.classList.contains('active')) {
                    closeCreatePeriodicMeeting();
                } else if (document.getElementById('taskDetailModal')?.classList.contains('active')) {
                    closeTaskDetailModal();
                } else if (document.getElementById('employeeDetailDrawer')?.classList.contains('active')) {
                    closeEmployeeDetail();
                }
            }
        });
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ready);
    } else {
        ready();
    }
})();


// ── Periodic Meeting Module ───────────────────────────────────────────────────

const PM_FREQ_LABELS = { weekly: 'Hàng tuần', monthly: 'Hàng tháng', quarterly: 'Hàng quý' };
const PM_MONTHS_VI   = ['Thg 1','Thg 2','Thg 3','Thg 4','Thg 5','Thg 6','Thg 7','Thg 8','Thg 9','Thg 10','Thg 11','Thg 12'];
const PM_STATUS_VI   = { upcoming: 'Sắp tới', open: 'Đang mở', completed: 'Đã xong' };
const PM_DOW_VI      = ['T2','T3','T4','T5','T6','T7','CN'];

let pmCurrentMeeting = null;
let pmCurrentSession = null;
let pmSelectedParticipants = new Set();
let pmSelectedFreq = 'weekly';
let pmSelectedDow  = 0;
let pmAllUsers = [];
let pmMeetings = [];
const pmSessionCache = {};  // id → session object

async function openPmSessionFromNotification(meetingId, sessionId) {
    switchView('personal');
    showPersonalSection('meeting', true, false);
    showMeetingMode('periodic');
    updateURL('personal', { personalSection: 'meeting', meetingId, sessionId });
    await new Promise(r => setTimeout(r, 60));
    await _openPmSessionDetail(meetingId, sessionId);
}

async function _openPmSessionDetail(meetingId, sessionId) {
    // Fetch meeting trực tiếp từ API (không phụ thuộc vào pmMeetings)
    const meeting = await apiCall(`/periodic-meetings/${meetingId}`);
    if (!meeting || !canSeePeriodicMeeting(meeting)) return;
    pmCurrentMeeting = meeting;

    // Fetch sessions & cache
    const sessions = await apiCall(`/periodic-meetings/${meetingId}/sessions`);
    if (!sessions?.length) return;
    sessions.forEach(s => { pmSessionCache[s.id] = s; });

    // Hiển thị session board để user có context khi đóng popup
    renderPmSessionList(sessions, meeting.participants.length);
    document.getElementById('pmBoardList').style.display = 'none';
    document.getElementById('pmSessionBoard').style.display = 'block';
    document.getElementById('pmSessionTitle').textContent = meeting.title;
    document.getElementById('pmSessionMeta').textContent =
        `${meeting.participants.length} thành viên · Từ ${formatDateVI(meeting.start_date)}` +
        (meeting.end_date ? ` đến ${formatDateVI(meeting.end_date)}` : '');
    const _freqColors = { weekly:'rgba(59,130,246,0.1);color:#3b82f6', monthly:'rgba(34,197,94,0.1);color:#16a34a', quarterly:'rgba(245,158,11,0.1);color:#d97706' };
    const _fc = _freqColors[meeting.frequency] || 'rgba(99,102,241,0.1);color:#6366f1';
    const badge = document.getElementById('pmSessionFreqBadge');
    if (badge) {
        badge.style.cssText = `background:${_fc.split(';')[0].replace('background:','').trim()};${_fc.split(';')[1].trim()}`;
        badge.textContent = PM_FREQ_LABELS[meeting.frequency];
    }

    // Mở thẳng popup nhập nội dung của phiên
    const session = sessions.find(s => Number(s.id) === Number(sessionId));
    if (session) await openPmSessionDetail(session);
}

// Mode switcher
function showMeetingMode(mode) {
    const one = document.getElementById('pmModeOne');
    const periodic = document.getElementById('pmModePeriodic');
    if (one) one.style.display = mode === 'one' ? '' : 'none';
    if (periodic) periodic.style.display = mode === 'periodic' ? '' : 'none';
    document.getElementById('pmSwitchOne')?.classList.toggle('active', mode === 'one');
    document.getElementById('pmSwitchPeriodic')?.classList.toggle('active', mode === 'periodic');
    if (mode === 'periodic') loadPeriodicMeetings();
}

// ── List ─────────────────────────────────────────────────────────────────────

async function loadPeriodicMeetings() {
    const data = await apiCall('/periodic-meetings/');
    if (!data) return;
    pmMeetings = data.filter(canSeePeriodicMeeting);
    renderPmMeetingGrid(pmMeetings);
}

function isPeriodicMeetingCreator(meeting) {
    return Number(meeting?.created_by) === Number(currentUser?.id);
}

function isPeriodicMeetingParticipant(meeting) {
    const myId = Number(currentUser?.id);
    return Array.isArray(meeting?.participants) && meeting.participants.some(p => Number(p.id) === myId);
}

function canSeePeriodicMeeting(meeting) {
    return currentUser?.role === 'admin' || isPeriodicMeetingCreator(meeting) || isPeriodicMeetingParticipant(meeting);
}

function canStartPeriodicMeeting(meeting) {
    return currentUser?.role === 'admin' || isPeriodicMeetingCreator(meeting);
}

function renderPmMeetingGrid(meetings) {
    const grid = document.getElementById('pmMeetingGrid');
    if (!grid) return;
    meetings = meetings.filter(canSeePeriodicMeeting);
    if (!meetings.length) {
        grid.innerHTML = '<div class="users-empty-state"><span class="material-symbols-outlined" style="font-size:32px;opacity:0.3;display:block;margin:0 auto 8px">event_repeat</span>Chưa có lịch họp định kỳ nào.</div>';
        return;
    }
    grid.innerHTML = meetings.map(m => {
        const avatars = m.participants.slice(0,4).map(p => {
            const init = (p.full_name || p.email).split(' ').map(w=>w[0]).slice(-2).join('').toUpperCase();
            const colors = ['#6366f1','#3b82f6','#22c55e','#f59e0b','#ec4899','#8b5cf6'];
            const col = colors[p.id % colors.length];
            return `<div class="pm-meeting-card-avatar" style="background:${col}">${init}</div>`;
        }).join('');
        const more = m.participants.length > 4
            ? `<div class="pm-meeting-card-more">+${m.participants.length - 4}</div>` : '';
        const nextBadge = m.next_session
            ? `<div class="pm-next-badge"><span class="material-symbols-outlined">schedule</span>Tiếp: ${formatDateVI(m.next_session)}</div>` : '';
        return `
        <div class="pm-meeting-card" onclick="openPmSessionBoard(${m.id})">
            <div class="pm-meeting-card-freq ${m.frequency}">${PM_FREQ_LABELS[m.frequency] || m.frequency}</div>
            <div class="pm-meeting-card-title">${escapeHtml(m.title)}</div>
            <div class="pm-meeting-card-meta">
                <span><span class="material-symbols-outlined">groups</span>${m.participants.length} thành viên</span>
                <span><span class="material-symbols-outlined">event_note</span>${m.session_count} phiên</span>
            </div>
            <div class="pm-meeting-card-avatars">${avatars}${more}</div>
            ${nextBadge}
        </div>`;
    }).join('');
}

function formatDateVI(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

// ── Session Board ────────────────────────────────────────────────────────────

async function openPmSessionBoard(meetingId) {
    pmCurrentMeeting = pmMeetings.find(m => m.id === meetingId);
    if (!pmCurrentMeeting || !canSeePeriodicMeeting(pmCurrentMeeting)) return;

    document.getElementById('pmBoardList').style.display = 'none';
    document.getElementById('pmSessionBoard').style.display = 'block';

    const freqColors = { weekly:'rgba(59,130,246,0.1);color:#3b82f6', monthly:'rgba(34,197,94,0.1);color:#16a34a', quarterly:'rgba(245,158,11,0.1);color:#d97706' };
    const fc = freqColors[pmCurrentMeeting.frequency] || 'rgba(99,102,241,0.1);color:#6366f1';
    document.getElementById('pmSessionFreqBadge').style.cssText = `background:${fc.split(';')[0].replace('background:','')};${fc.split(';')[1]}`;
    document.getElementById('pmSessionFreqBadge').textContent = PM_FREQ_LABELS[pmCurrentMeeting.frequency];
    document.getElementById('pmSessionTitle').textContent = pmCurrentMeeting.title;
    document.getElementById('pmSessionMeta').textContent =
        `${pmCurrentMeeting.participants.length} thành viên · Từ ${formatDateVI(pmCurrentMeeting.start_date)}` +
        (pmCurrentMeeting.end_date ? ` đến ${formatDateVI(pmCurrentMeeting.end_date)}` : '');

    const sessions = await apiCall(`/periodic-meetings/${meetingId}/sessions`);
    if (!sessions) return;
    renderPmSessionList(sessions, pmCurrentMeeting.participants.length);
}

function closePmSessionBoard() {
    document.getElementById('pmBoardList').style.display = '';
    document.getElementById('pmSessionBoard').style.display = 'none';
    pmCurrentMeeting = null;
}

function renderPmSessionList(sessions, totalParticipants) {
    const list = document.getElementById('pmSessionList');
    const dashBtn = document.getElementById('pmDashboardBtn');
    if (dashBtn) dashBtn.style.display = 'none';
    if (!sessions.length) {
        list.innerHTML = '<div class="users-empty-state">Không có phiên họp nào.</div>';
        return;
    }

    // Show "Bắt đầu họp" only to the meeting creator or admin.
    const openSess = sessions.find(s => s.status === 'open');
    if (openSess && dashBtn && canStartPeriodicMeeting(pmCurrentMeeting)) {
        dashBtn.style.display = 'flex';
        dashBtn.onclick = () => startPeriodicMeetingDashboard(openSess);
    }

    // Cache sessions by id for onclick lookup
    sessions.forEach(s => { pmSessionCache[s.id] = s; });

    list.innerHTML = sessions.map(s => {
        const d = new Date(s.session_date + 'T00:00:00');
        const statusLabel = PM_STATUS_VI[s.status] || s.status;
        const submitted = s.submitted_user_ids.length;
        const isClickable = s.status !== 'upcoming';
        const opensLabel = s.status === 'upcoming'
            ? `<span class="pm-session-card-sub">Mở từ: ${new Date(s.opens_at).toLocaleDateString('vi-VN')}</span>` : '';
        const progress = isClickable
            ? `<span class="pm-session-progress"><span class="material-symbols-outlined">rate_review</span>${submitted}/${totalParticipants}</span>` : '';

        return `<div class="pm-session-card status-${s.status}"
                     ${isClickable ? `onclick="openPmSessionDetailById(${s.id})"` : ''}>
            <div class="pm-session-card-date">
                <div class="pm-session-card-day">${String(d.getDate()).padStart(2,'0')}</div>
                <div class="pm-session-card-month">${PM_MONTHS_VI[d.getMonth()]}</div>
            </div>
            <div class="pm-session-card-divider"></div>
            <div class="pm-session-card-info">
                <div class="pm-session-card-title">${escapeHtml(s.title)}</div>
                ${opensLabel}
            </div>
            ${progress}
            <span class="pm-session-status-chip ${s.status}">${statusLabel}</span>
        </div>`;
    }).join('');
}

// ── Session Detail ────────────────────────────────────────────────────────────

function openPmSessionDetailById(sessionId) {
    const s = pmSessionCache[sessionId];
    if (s) openPmSessionDetail(s);
}

async function openPmSessionDetail(sessionOrJson, isDashboard) {
    const s = typeof sessionOrJson === 'string' ? JSON.parse(sessionOrJson) : sessionOrJson;
    pmCurrentSession = s;
    const d = new Date(s.session_date + 'T00:00:00');
    document.getElementById('pmSdDate').textContent = `${PM_DOW_VI[d.getDay() === 0 ? 6 : d.getDay()-1]}, ${formatDateVI(s.session_date)}`;
    document.getElementById('pmSdTitle').textContent = s.title;

    const myName = currentUser?.full_name || currentUser?.username || 'Bạn';
    const userLine = document.getElementById('pmSdUserLine');
    if (userLine) userLine.innerHTML = `Cập nhật của bạn — <strong>${escapeHtml(myName)}</strong>`;

    // Footer bar: hide save if completed
    const footerBar = document.querySelector('.pm-sd-footer-bar');
    if (footerBar) footerBar.style.display = s.status === 'completed' ? 'none' : 'flex';

    document.getElementById('pmSessionDetailModal').classList.add('active');
    await loadPmAgendaItems(s.id);

    if (isDashboard) {
        closePmSessionDetail();
        startPeriodicMeetingDashboard(s);
    }
}

function closePmSessionDetail() {
    document.getElementById('pmSessionDetailModal').classList.remove('active');
    pmCurrentSession = null;
}

async function loadPmAgendaItems(sessionId) {
    const items = await apiCall(`/periodic-meetings/sessions/${sessionId}/agenda`);
    if (!items) return;
    renderPmAgendaItems(items);
}

const PM_SECTIONS = [
    { type: 'update', icon: '📋', title: 'Cập nhật hoạt động', sub: 'WHAT I DID THIS CYCLE',    hint: 'Liệt kê các đầu việc quan trọng đã hoàn thành để minh bạch hoá tiến độ.' },
    { type: 'issue',  icon: '⚠️', title: 'Vấn đề / Khó khăn',  sub: 'CURRENT BLOCKERS',          hint: 'Tập trung vào các rào cản cần ban quản lý hỗ trợ tháo gỡ.' },
    { type: 'plan',   icon: '🎯', title: 'Kế hoạch tuần tới',   sub: 'PLAN FOR NEXT CYCLE',       hint: 'Liệt kê mục tiêu ưu tiên cho chu kỳ tới.' },
];

function renderPmAgendaItems(items) {
    const body = document.getElementById('pmSdBody');
    const isOpen = pmCurrentSession?.status !== 'completed';
    const myId   = currentUser?.id;

    // Show only current user's items in 3 sections
    const myItems = items.filter(i => i.user_id === myId);

    body.innerHTML = PM_SECTIONS.map(sec => {
        const secItems = myItems.filter(i => i.item_type === sec.type);
        const chipsHtml = secItems.map(item => `
            <div class="pm-item-chip" id="pmChip_${item.id}">
                <span class="pm-item-chip-text" ${isOpen ? `onclick="editPmChip(${item.id}, this, '${item.item_type}')" title="Click để sửa"` : ''}>${escapeHtml(item.content)}</span>
                ${isOpen ? `<button class="pm-item-chip-del" onclick="deletePmAgendaItem(${item.id})" title="Xoá">×</button>` : ''}
            </div>`).join('');

        return `<div class="pm-sd-section pm-sd-sec-${sec.type}">
            <div class="pm-sd-section-header">
                <div class="pm-sd-section-title-wrap">
                    <span class="pm-sd-section-icon">${sec.icon}</span>
                    <div>
                        <div class="pm-sd-section-name">${sec.title}</div>
                        <div class="pm-sd-section-sub">${sec.sub}</div>
                    </div>
                </div>
                ${isOpen ? `<button class="pm-add-item-btn" onclick="showPmAddInput('${sec.type}')">+ Thêm</button>` : ''}
            </div>
            <div class="pm-sd-section-body">
                <div class="pm-chips-wrap" id="pmChips_${sec.type}">${chipsHtml}</div>
                <div class="pm-add-input-wrap" id="pmAddWrap_${sec.type}" style="display:none">
                    <input class="pm-add-input" id="pmAddInput_${sec.type}" placeholder="Nhập nội dung..."
                        onkeydown="if(event.key==='Enter')submitPmItem('${sec.type}');if(event.key==='Escape')hidePmAddInput('${sec.type}')">
                    <button class="pm-add-confirm-btn" onclick="submitPmItem('${sec.type}')">Thêm</button>
                    <button class="pm-add-cancel-btn" onclick="hidePmAddInput('${sec.type}')">Hủy</button>
                </div>
                ${!secItems.length ? `<div class="pm-sd-hint">${sec.hint}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    // Update last-modified timestamp
    const lastItem = myItems.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
    const tsEl = document.getElementById('pmSdLastUpdate');
    if (tsEl && lastItem) {
        const dt = new Date(lastItem.updated_at);
        tsEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;vertical-align:-3px">schedule</span> Cập nhật lần cuối: ${dt.toLocaleString('vi-VN', {hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}`;
    } else if (tsEl) {
        tsEl.textContent = '';
    }
}

function showPmAddInput(type) {
    const wrap = document.getElementById(`pmAddWrap_${type}`);
    if (!wrap) return;
    wrap.style.display = 'flex';
    document.getElementById(`pmAddInput_${type}`)?.focus();
}

function hidePmAddInput(type) {
    const wrap = document.getElementById(`pmAddWrap_${type}`);
    if (!wrap) return;
    wrap.style.display = 'none';
    const inp = document.getElementById(`pmAddInput_${type}`);
    if (inp) inp.value = '';
}

async function submitPmItem(type) {
    if (!pmCurrentSession) return;
    const input = document.getElementById(`pmAddInput_${type}`);
    const content = input?.value.trim();
    if (!content) return;

    const result = await apiCall(`/periodic-meetings/sessions/${pmCurrentSession.id}/agenda`, 'POST', { content, item_type: type });
    if (!result) return;
    hidePmAddInput(type);
    await loadPmAgendaItems(pmCurrentSession.id);
}

async function deletePmAgendaItem(itemId) {
    const ok = await apiCall(`/periodic-meetings/sessions/agenda/${itemId}`, 'DELETE');
    if (ok !== null && pmCurrentSession) await loadPmAgendaItems(pmCurrentSession.id);
}

function editPmChip(itemId, spanEl, itemType) {
    const chip = document.getElementById(`pmChip_${itemId}`);
    if (!chip || chip.querySelector('input')) return; // already editing
    const original = spanEl.textContent;
    spanEl.style.display = 'none';
    const inp = document.createElement('input');
    inp.className = 'pm-chip-edit-input';
    inp.value = original;
    chip.insertBefore(inp, spanEl);
    inp.focus();
    inp.select();
    const save = async () => {
        const newVal = inp.value.trim();
        if (newVal && newVal !== original) {
            const result = await apiCall(`/periodic-meetings/sessions/agenda/${itemId}`, 'PUT', { content: newVal, item_type: itemType });
            if (result && pmCurrentSession) { await loadPmAgendaItems(pmCurrentSession.id); return; }
        }
        // Cancel / no change — restore
        inp.remove();
        spanEl.style.display = '';
    };
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); save(); }
        if (e.key === 'Escape') { inp.remove(); spanEl.style.display = ''; }
    });
    inp.addEventListener('blur', save);
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

async function startPeriodicMeetingDashboard(session) {
    if (!pmCurrentMeeting || !session || !canStartPeriodicMeeting(pmCurrentMeeting)) return;
    updateURL('meetingDashboard', { meetingId: pmCurrentMeeting.id, sessionId: session.id });
    await openMeetingDashboard(session);
}

async function openMeetingDashboardRoute(meetingId, sessionId, pushUrl = true) {
    const meeting = await apiCall(`/periodic-meetings/${meetingId}`);
    if (!meeting || !canStartPeriodicMeeting(meeting)) return;
    pmCurrentMeeting = meeting;

    showMeetingMode('periodic');
    document.getElementById('pmBoardList').style.display = 'none';
    document.getElementById('pmSessionBoard').style.display = 'block';

    const sessions = await apiCall(`/periodic-meetings/${meetingId}/sessions`);
    if (!sessions?.length) return;
    const session = sessions.find(s => Number(s.id) === Number(sessionId))
        || sessions.find(s => s.status === 'open')
        || sessions.find(s => s.status === 'completed')
        || sessions[0];
    pmCurrentSession = session;
    if (pushUrl) {
        updateURL('meetingDashboard', { meetingId: pmCurrentMeeting.id, sessionId: session.id });
    }
    await openMeetingDashboard(session);
}

async function openMeetingDashboard(preferredSession = null) {
    if (!pmCurrentMeeting || !canStartPeriodicMeeting(pmCurrentMeeting)) return;
    const sessions = await apiCall(`/periodic-meetings/${pmCurrentMeeting.id}/sessions`);
    const openSess = preferredSession
                  || sessions?.find(s => s.status === 'open')
                  || sessions?.find(s => s.status === 'completed')
                  || pmCurrentSession   // fallback: session explicitly set (e.g. admin opens dashboard manually)
                  || sessions?.[0];
    if (!openSess) return;

    const items = await apiCall(`/periodic-meetings/sessions/${openSess.id}/agenda`);
    if (!items) return;

    document.getElementById('pmDashFreqLabel').textContent = PM_FREQ_LABELS[pmCurrentMeeting.frequency];
    document.getElementById('pmDashTitle').textContent = pmCurrentMeeting.title;
    document.getElementById('pmDashDate').textContent = formatDateVI(openSess.session_date);

    // Group by participant → by type
    const byUser = {};
    pmCurrentMeeting.participants.forEach(p => {
        byUser[p.id] = { name: p.full_name || p.username || p.email, byType: { update: [], issue: [], plan: [] } };
    });
    items.forEach(i => {
        if (!byUser[i.user_id]) byUser[i.user_id] = { name: i.user_name || '?', byType: { update: [], issue: [], plan: [] } };
        (byUser[i.user_id].byType[i.item_type] = byUser[i.user_id].byType[i.item_type] || []).push(i);
    });

    const total   = Object.keys(byUser).length;
    const updated = Object.values(byUser).filter(u => Object.values(u.byType).some(arr => arr.length > 0)).length;
    document.getElementById('pmDashProgress').textContent    = `${updated} / ${total} người đã cập nhật`;
    document.getElementById('pmDashProgressBar').style.width = total ? `${Math.round(updated/total*100)}%` : '0%';

    const colors = ['#6366f1','#3b82f6','#22c55e','#f59e0b','#ec4899','#8b5cf6'];
    const dashSecs = [
        { type: 'update', label: 'Cập nhật hoạt động', cls: 'pm-dash-sec-update' },
        { type: 'issue',  label: 'Vấn đề / Khó khăn',  cls: 'pm-dash-sec-issue'  },
        { type: 'plan',   label: 'Kế hoạch tuần tới',   cls: 'pm-dash-sec-plan'   },
    ];

    document.getElementById('pmDashBody').innerHTML = Object.entries(byUser).map(([uid, u]) => {
        const init = u.name.split(' ').map(w=>w[0]).slice(-2).join('').toUpperCase();
        const col  = colors[parseInt(uid) % colors.length];
        const hasUpdate = Object.values(u.byType).some(arr => arr.length > 0);

        const sectionsHtml = dashSecs.map(sec => {
            const arr = u.byType[sec.type] || [];
            if (!arr.length) return '';
            return `<div class="pm-dash-sec ${sec.cls}">
                <div class="pm-dash-sec-label">${sec.label}</div>
                ${arr.map(i => `<div class="pm-dash-sec-item">${escapeHtml(i.content)}</div>`).join('')}
            </div>`;
        }).join('');

        return `<div class="pm-dash-person-card${hasUpdate ? '' : ' pm-dash-card-empty'}">
            <div class="pm-dash-person-header">
                <div class="pm-dash-avatar" style="background:${col}">${init}</div>
                <div class="pm-dash-person-name">${escapeHtml(u.name)}</div>
                <button type="button" class="pm-dash-recurring-btn" onclick="event.stopPropagation(); openPmParticipantRecurringTasks(${Number(uid)})" title="Xem công việc định kỳ">
                    <span class="material-symbols-outlined">event_repeat</span>
                    Công việc định kỳ
                </button>
            </div>
            ${hasUpdate ? sectionsHtml : '<div class="pm-dash-no-update">Chưa cập nhật</div>'}
        </div>`;
    }).join('');

    document.getElementById('pmDashboardOverlay').style.display = 'flex';
}

function openPmParticipantRecurringTasks(userId) {
    const participant = pmCurrentMeeting?.participants?.find(p => Number(p.id) === Number(userId));
    if (!participant) return;
    openRecurringTasksModal(userId, {
        readOnly: true,
        user: {
            id: participant.id,
            full_name: participant.full_name,
            username: participant.email,
            email: participant.email,
            position: participant.position,
            avatar_url: participant.avatar_url
        }
    });
}

function closeMeetingDashboard() {
    document.getElementById('pmDashboardOverlay').style.display = 'none';
    updateURL('personal', { personalSection: 'meeting' });
}

// ── Create Meeting Modal ──────────────────────────────────────────────────────

async function openCreatePeriodicMeeting() {
    pmSelectedParticipants = new Set();
    pmSelectedFreq = 'weekly';
    pmSelectedDow  = 0;

    // Reset form
    document.getElementById('pmTitle').value = '';
    document.getElementById('pmDescription').value = '';
    document.getElementById('pmStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('pmEndDate').value = '';
    document.querySelectorAll('.pm-freq-pill').forEach(b => b.classList.toggle('active', b.dataset.freq === 'weekly'));
    document.querySelectorAll('.pm-dow-pill').forEach(b => b.classList.toggle('active', b.dataset.dow === '0'));
    document.getElementById('pmDowPills').style.display = 'flex';
    document.getElementById('pmDomRow').style.display = 'none';
    document.getElementById('pmDayLabel').textContent = 'Ngày họp trong tuần';

    // Load users
    if (!pmAllUsers.length) {
        const users = await apiCall('/users/');
        if (users) pmAllUsers = users;
    }
    renderPmParticipantList(pmAllUsers);
    renderPmSelectedChips();

    document.getElementById('createPeriodicMeetingModal').classList.add('active');
    setTimeout(() => document.getElementById('pmTitle').focus(), 50);
}

function closeCreatePeriodicMeeting() {
    document.getElementById('createPeriodicMeetingModal').classList.remove('active');
}

function selectPmFreq(freq, btn) {
    pmSelectedFreq = freq;
    document.querySelectorAll('.pm-freq-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const isWeekly = freq === 'weekly';
    document.getElementById('pmDowPills').style.display = isWeekly ? 'flex' : 'none';
    document.getElementById('pmDomRow').style.display = isWeekly ? 'none' : 'block';
    document.getElementById('pmDayLabel').textContent = isWeekly ? 'Ngày họp trong tuần' : 'Ngày họp cố định';
}

function selectPmDow(dow, btn) {
    pmSelectedDow = dow;
    document.querySelectorAll('.pm-dow-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function filterPmParticipants(q) {
    const filtered = q ? pmAllUsers.filter(u =>
        (u.full_name || '').toLowerCase().includes(q.toLowerCase()) ||
        u.email.toLowerCase().includes(q.toLowerCase())
    ) : pmAllUsers;
    renderPmParticipantList(filtered);
}

function renderPmParticipantList(users) {
    const colors = ['#6366f1','#3b82f6','#22c55e','#f59e0b','#ec4899','#8b5cf6'];
    document.getElementById('pmParticipantList').innerHTML = users.map(u => {
        const init = (u.full_name || u.email).split(' ').map(w=>w[0]).slice(-2).join('').toUpperCase();
        const col = colors[u.id % colors.length];
        const isSelected = pmSelectedParticipants.has(u.id);
        return `<div class="pm-participant-row ${isSelected ? 'selected' : ''}" onclick="togglePmParticipant(${u.id})">
            <div class="pm-participant-check">
                ${isSelected ? '<span class="material-symbols-outlined">check</span>' : ''}
            </div>
            <div class="pm-participant-avatar-sm" style="background:${col}">${init}</div>
            <div>
                <div class="pm-participant-name">${escapeHtml(u.full_name || u.email)}</div>
                ${u.position ? `<div class="pm-participant-pos">${escapeHtml(u.position)}</div>` : ''}
            </div>
        </div>`;
    }).join('');
}

function togglePmParticipant(userId) {
    if (pmSelectedParticipants.has(userId)) pmSelectedParticipants.delete(userId);
    else pmSelectedParticipants.add(userId);
    renderPmParticipantList(pmAllUsers.filter(u => {
        const q = document.getElementById('pmParticipantSearch').value;
        return !q || (u.full_name||'').toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase());
    }));
    renderPmSelectedChips();
}

function renderPmSelectedChips() {
    const wrap = document.getElementById('pmParticipantSelected');
    if (!pmSelectedParticipants.size) { wrap.innerHTML = ''; return; }
    const colors = ['#6366f1','#3b82f6','#22c55e','#f59e0b','#ec4899','#8b5cf6'];
    wrap.innerHTML = [...pmSelectedParticipants].map(uid => {
        const u = pmAllUsers.find(x => x.id === uid);
        if (!u) return '';
        const init = (u.full_name||u.email).split(' ').map(w=>w[0]).slice(-2).join('').toUpperCase();
        const col = colors[uid % colors.length];
        return `<div class="pm-selected-chip">
            <div class="pm-participant-avatar-sm" style="background:${col};width:20px;height:20px;font-size:9px">${init}</div>
            ${escapeHtml(u.full_name || u.email)}
            <button onclick="togglePmParticipant(${uid})" title="Bỏ chọn">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>`;
    }).join('');
}

async function submitCreatePeriodicMeeting() {
    const title = document.getElementById('pmTitle').value.trim();
    if (!title) { document.getElementById('pmTitle').focus(); return; }
    const startDate = document.getElementById('pmStartDate').value;
    if (!startDate) { document.getElementById('pmStartDate').focus(); return; }

    const body = {
        title,
        frequency: pmSelectedFreq,
        start_date: startDate,
        end_date: document.getElementById('pmEndDate').value || null,
        description: document.getElementById('pmDescription').value.trim() || null,
        participant_ids: [...pmSelectedParticipants],
    };

    if (pmSelectedFreq === 'weekly') {
        body.day_of_week = pmSelectedDow;
    } else {
        body.day_of_month = parseInt(document.getElementById('pmDom').value) || 1;
        if (pmSelectedFreq === 'quarterly') body.month_of_quarter = 1;
    }

    const btn = document.querySelector('.pm-btn-submit');
    btn.disabled = true;
    const result = await apiCall('/periodic-meetings/', 'POST', body);
    btn.disabled = false;
    if (!result) return;

    closeCreatePeriodicMeeting();
    await loadPeriodicMeetings();
}
