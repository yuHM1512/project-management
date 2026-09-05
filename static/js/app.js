// ──────────────────────────────────────────────────────────────────
// app.js — Core: routing, auth, sidebar, global state, init
// ──────────────────────────────────────────────────────────────────
// API Base URL
const API_BASE = '/api';

// Avatar error fallback — called via onerror on every <img> avatar tag
(function () {
    'use strict';

    function getCurrentVersion() {
        // Lấy version từ server-stored hash (combined tất cả JS modules)
        return localStorage.getItem('app_js_version') || null;
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
let timelineMonth = new Date().getMonth();
let timelineZoom = 'quarter'; // 'quarter' | 'month'
let timelineTooltip = null;
let projectMembers = [];
let selectedProjectMemberId = null;
let projectModalTeamMembers = [];
let projectModalOwnerId = null;
let notificationsIndex = new Map();

const AT_RISK_DAYS_THRESHOLD = 5;
const AT_RISK_PROGRESS_THRESHOLD = 0.7;
const TILE_COLORS = [
    { bg: '#dbeafe', text: '#1e40af' },
    { bg: '#ecfdf5', text: '#065f46' },
    { bg: '#fef3c7', text: '#92400e' },
    { bg: '#fef2f2', text: '#991b1b' },
    { bg: '#e0f2fe', text: '#075985' },
    { bg: '#f0fdf4', text: '#166534' },
    { bg: '#fdf4ff', text: '#86198f' },
    { bg: '#fff7ed', text: '#9a3412' }
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
        if (timelineZoom === 'month') {
            timelineMonth--;
            if (timelineMonth < 0) { timelineMonth = 11; quarterlyYear--; }
            renderTimeline();
        } else {
            quarterlyYear--;
            renderTimeline();
        }
    });
    document.getElementById('nextYearBtn')?.addEventListener('click', () => {
        if (timelineZoom === 'month') {
            timelineMonth++;
            if (timelineMonth > 11) { timelineMonth = 0; quarterlyYear++; }
            renderTimeline();
        } else {
            quarterlyYear++;
            renderTimeline();
        }
    });
    document.getElementById('tlZoomQuarter')?.addEventListener('click', () => setTimelineZoom('quarter'));
    document.getElementById('tlZoomMonth')?.addEventListener('click', () => setTimelineZoom('month'));
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
        renderTimeline();
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

async function loadUsers() {
    const data = await apiCall('/users/');
    if (data) {
        users = data;
        updateAssigneesList();
    }
}
