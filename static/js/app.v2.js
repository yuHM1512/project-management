// API Base URL
const API_BASE = '/api';

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
            const storedVersion = localStorage.getItem('app_js_version');
            if (data.version && data.version !== storedVersion) {
                if (!storedVersion) {
                    localStorage.setItem('app_js_version', data.version);
                    return;
                }

                const reloadFlag = sessionStorage.getItem('app_reload_flag');
                if (!reloadFlag) {
                    sessionStorage.setItem('app_reload_flag', 'true');
                    localStorage.setItem('app_js_version', data.version);
                    const shouldReload = confirm('Có phiên bản mới của ứng dụng. Bạn có muốn tải lại ngay bây giờ?');
                    if (shouldReload) {
                        window.location.reload();
                    } else {
                        setTimeout(() => window.location.reload(), 30000);
                    }
                }
            } else if (data.version) {
                localStorage.setItem('app_js_version', data.version);
            }
        } catch (error) {
            console.debug('Version check failed:', error);
        }
    }

    const currentVersion = getCurrentVersion();
    if (currentVersion) {
        localStorage.setItem('app_js_version', currentVersion);
    }

    setInterval(checkForUpdate, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkForUpdate();
    });
    window.addEventListener('focus', checkForUpdate);
    sessionStorage.removeItem('app_reload_flag');
})();

// State
let currentView = 'dashboard';
let currentProjectId = null;
let projects = [];
let tasks = [];
let dashboardTasks = [];
let filteredTasks = [];
let users = [];
let currentUser = null;
let authToken = null;
let currentProjectIsOwner = false;
let currentProject = null;
let currentTaskData = null;
let taskModalReadOnly = false;
let currentPersonalSection = 'account';
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
let worklogTabsInitialized = false;
let todos = [];
let dashboardMonth = new Date();
let quarterlyYear = new Date().getFullYear();
let timelineTooltip = null;

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
    } else if (path === '/users') {
        return { view: 'users' };
    } else if (path.startsWith('/personal')) {
        const section = searchParams.get('section') || 'account';
        const create = searchParams.get('create') === 'true';
        const projectId = searchParams.get('project_id');
        const taskId = searchParams.get('task_id');
        const subtaskId = searchParams.get('subtask_id');
        return {
            view: 'personal',
            personalSection: section,
            createWorkLog: create,
            workLogProjectId: projectId ? parseInt(projectId, 10) : null,
            workLogTaskId: taskId ? parseInt(taskId, 10) : null,
            workLogSubtaskId: subtaskId ? parseInt(subtaskId, 10) : null
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
        case 'users':
            path = '/users';
            break;
        case 'personal':
            path = '/personal';
            if (params.personalSection) searchParams.set('section', params.personalSection);
            if (params.createWorkLog) searchParams.set('create', 'true');
            if (params.workLogProjectId) searchParams.set('project_id', params.workLogProjectId);
            if (params.workLogTaskId) searchParams.set('task_id', params.workLogTaskId);
            if (params.workLogSubtaskId) searchParams.set('subtask_id', params.workLogSubtaskId);
            break;
        default:
            path = '/dashboard';
    }

    const queryString = searchParams.toString();
    const newURL = queryString ? `${path}?${queryString}` : path;
    window.history.pushState({ view, ...params }, '', newURL);
}

async function navigateToRoute(route) {
    const { view, projectId, personalSection, createWorkLog, workLogProjectId, workLogTaskId, workLogSubtaskId } = route;

    if (projectId !== undefined) {
        currentProjectId = projectId;
    }
    if (personalSection !== undefined) {
        currentPersonalSection = personalSection;
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
            avatar.innerHTML = `<img src="${currentUser.avatar_url}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
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
    const confirmTaskDoneBtn = document.getElementById('confirmTaskDone');
    if (confirmTaskDoneBtn) {
        confirmTaskDoneBtn.addEventListener('click', confirmTaskCompletion);
    }
    
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

    // User management
    document.getElementById('btnCreateUser')?.addEventListener('click', () => openCreateUserModal());
    document.getElementById('closeUserModal')?.addEventListener('click', () => closeUserModal());
    document.getElementById('cancelUser')?.addEventListener('click', () => closeUserModal());
    document.getElementById('userForm')?.addEventListener('submit', handleUserSubmit);
    document.getElementById('userAvatarInput')?.addEventListener('change', handleAvatarPreview);
    document.getElementById('btnAddUserFieldGroup')?.addEventListener('click', () => addUserFieldGroupRow());

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
    
    if (statusTab && statusTab.classList.contains('active')) {
        renderTasks();
    }
    if (timelineTab && timelineTab.classList.contains('active')) {
        renderGanttChartQuy();
    }
}

// View Switching
function switchView(view, shouldUpdateURL = true) {
    currentView = view;
    
    // Update nav
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    const navLink = document.querySelector(`[data-view="${view}"]`);
    if (navLink) {
        navLink.classList.add('active');
    }
    
    // Update content
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const activeView = document.getElementById(`${view}View`);
    if (activeView) {
        activeView.classList.add('active');
    }
    
    // Update title
    const titles = {
        dashboard: 'Dashboard',
        projects: 'Projects',
        personal: 'Personal',
        board: 'Board',
        users: 'User Management',
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
        updateURL(view, routeParams);
    }
    
    // Load data for specific views
    if (view === 'users' && currentUser?.role === 'admin') {
        loadUsersList();
    }
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

function showPersonalSection(section = 'account', highlightNav = true, shouldUpdateURL = true) {
    currentPersonalSection = section;
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
    } else if (section === 'todos') {
        ensureTodosSection();
    } else if (section === 'work') {
        ensureWorkLogSection();
    } else if (section === 'notes') {
        ensureNotesSection();
    }
}

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
    const data = await apiCall('/tasks/?assigned_only=true');
    if (data) {
        myWorkLogTasks = data;
    }
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
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        alert('Có lỗi xảy ra: ' + error.message);
        return null;
    }
}

// Projects
async function loadProjects() {
    const data = await apiCall('/projects/');
    if (data) {
        projects = data;
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

    if (!users || users.length === 0) {
        container.innerHTML = '<div class="empty-state">Chưa có user nào</div>';
        return;
    }

    container.innerHTML = users.map(user => {
        const name = escapeHtml(user.full_name || user.username);
        const email = escapeHtml(user.email);
        const userId = user.id;
        return `
            <label class="assignee-checkbox">
                <input type="checkbox" value="${userId}" class="assignee-checkbox-input" data-user-id="${userId}">
                <span class="assignee-checkbox-label">
                    ${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" alt="${name}" class="assignee-avatar-small">` : ''}
                    <span>${name} (${email})</span>
                </span>
            </label>
        `;
    }).join('');
}

function renderProjects() {
    const container = document.getElementById('projectsGrid');
    if (!container) return;
    
    container.innerHTML = projects.map(project => `
        <div class="project-card" onclick="selectProject(${project.id})">
            <div class="project-card-header">
                <div class="project-color" style="background: ${project.color}"></div>
                <h3>${escapeHtml(project.name)}</h3>
            </div>
            <p>${escapeHtml(project.description || 'No description')}</p>
            <div class="project-meta">
                <span>Status: ${project.status}</span>
            </div>
        </div>
    `).join('');
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
        await Promise.all([loadProjects(), loadDashboard()]);
        closeProjectModal();
    }
}

async function updateProject(projectId, projectData) {
    const data = await apiCall(`/projects/${projectId}`, 'PUT', projectData);
    if (data) {
        await Promise.all([loadProjects(), loadDashboard()]);
        closeProjectModal();
    }
}

// Tasks
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
        
        if (statusTab && statusTab.classList.contains('active')) {
            renderTasks();
        }
        if (timelineTab && timelineTab.classList.contains('active')) {
            renderGanttChart();
        }
        
        // Load threads nếu tab Thread đang active
        const threadTab = document.getElementById('boardTabThread');
        if (threadTab && threadTab.classList.contains('active')) {
            loadThreads();
        }
    }
}

function refreshCurrentProjectTasks() {
    if (currentProjectId) {
        loadTasks(currentProjectId, false);
    }
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
    
    const statuses = ['todo', 'in_progress', 'done', 'blocked'];
    const statusMap = {
        todo: 'tasksTodo',
        in_progress: 'tasksInProgress',
        done: 'tasksDone',
        blocked: 'tasksBlocked'
    };
    const countMap = {
        todo: 'countTodo',
        in_progress: 'countInProgress',
        done: 'countDone',
        blocked: 'countBlocked'
    };
    
    statuses.forEach(status => {
        const container = document.getElementById(statusMap[status]);
        if (!container) return;
        
        const statusTasks = filteredTasks.filter(t => t.status === status);
        const countEl = document.getElementById(countMap[status]);
        if (countEl) {
            countEl.textContent = statusTasks.length;
        }
        
        container.innerHTML = statusTasks.map(task => createTaskCard(task)).join('');
        
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
    } else if (tabName === 'thread') {
        startThreadPolling();
    }
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
    const timeline = document.getElementById('ganttTimeline');
    const yearDisplay = document.getElementById('currentYearDisplay');
    if (!chart || !timeline) return;

    if (yearDisplay) {
        yearDisplay.textContent = `Năm ${quarterlyYear}`;
    }

    if (!currentProject || filteredTasks.length === 0) {
        chart.innerHTML = '<p class="text-muted">Chưa có task nào để hiển thị.</p>';
        timeline.innerHTML = '';
        return;
    }

    function parseDate(dateValue) {
        if (!dateValue) return null;
        const normalized = String(dateValue).replace(' ', 'T');
        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const tasksInYear = filteredTasks.filter(task => {
        const dueDate = parseDate(task.due_date);
        return dueDate && dueDate.getFullYear() === quarterlyYear;
    });

    if (tasksInYear.length === 0) {
        chart.innerHTML = `<p class="text-muted">Không có task nào trong năm ${quarterlyYear}.</p>`;
        timeline.innerHTML = '';
        return;
    }

    const quarters = [
        { name: 'Q1', months: ['1', '2', '3'], startMonth: 0, endMonth: 2 },
        { name: 'Q2', months: ['4', '5', '6'], startMonth: 3, endMonth: 5 },
        { name: 'Q3', months: ['7', '8', '9'], startMonth: 6, endMonth: 8 },
        { name: 'Q4', months: ['10', '11', '12'], startMonth: 9, endMonth: 11 }
    ];

    timeline.innerHTML = quarters.map((quarter, index) => `
        <div class="gantt-quarter-block quarter-q${index + 1}">
            <div class="gantt-quarter-header">${quarter.name} ${quarterlyYear}</div>
            <div class="gantt-quarter-months">
                ${quarter.months.map(month => `<span>${month}</span>`).join('')}
            </div>
        </div>
    `).join('');

    const yearStart = new Date(quarterlyYear, 0, 1);
    const yearEnd = new Date(quarterlyYear, 11, 31, 23, 59, 59, 999);
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const totalYearDays = Math.max(1, (yearEnd - yearStart) / MS_PER_DAY);

    chart.innerHTML = tasksInYear.map(task => {
        const dueDateRaw = parseDate(task.due_date);
        if (!dueDateRaw) return '';
        const startDateRaw = parseDate(task.created_at) || dueDateRaw;
        if (startDateRaw > yearEnd || dueDateRaw < yearStart) return '';

        const start = new Date(Math.max(yearStart, startDateRaw));
        const end = new Date(Math.min(yearEnd, dueDateRaw));
        const startOffsetDays = (start - yearStart) / MS_PER_DAY;
        const durationDays = Math.max(1, (end - start) / MS_PER_DAY);
        const leftPercent = (startOffsetDays / totalYearDays) * 100;
        const widthPercent = Math.max(2, Math.min((durationDays / totalYearDays) * 100, 100 - leftPercent));
        const color = getStatusColor(task.status);
        const statusTextMap = { todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked' };
        const statusText = statusTextMap[task.status] || task.status;
        const totalSubtasks = typeof task.total_subtasks === 'number'
            ? task.total_subtasks
            : (task.subtasks ? task.subtasks.length : 0);
        const completedSubtasks = typeof task.completed_subtasks === 'number'
            ? task.completed_subtasks
            : (task.subtasks ? task.subtasks.filter(sub => sub.is_done).length : 0);
        const tooltip = escapeHtml(
            `Task: ${task.title}\nTrạng thái: ${statusText}\nBắt đầu: ${formatDateDisplay(start)}\nHạn: ${formatDateDisplay(end)}\nPriority: ${task.priority || 'Không có'}\nSubtasks: ${completedSubtasks}/${totalSubtasks}`
        );

        return `
            <div class="gantt-row">
                <div class="gantt-label">
                    <button type="button" class="timeline-task-link" onclick="openTimelineTaskModal(${task.id})">
                        ${escapeHtml(task.title)}
                    </button>
                </div>
                <div class="gantt-bars">
                    <div class="gantt-bar gantt-bar-quarter" style="left: ${leftPercent}%; width: ${widthPercent}%; background: ${color};" data-tooltip="${tooltip}" onclick="openTimelineTaskModal(${task.id})"></div>
                </div>
            </div>
        `;
    }).join('');

    attachTimelineTooltipEvents(chart);
}

function attachTimelineTooltipEvents(container) {
    if (!container) return;
    container.querySelectorAll('.gantt-bar-quarter').forEach(bar => {
        bar.addEventListener('mouseenter', event => showTimelineTooltip(event, bar.getAttribute('data-tooltip')));
        bar.addEventListener('mousemove', moveTimelineTooltip);
        bar.addEventListener('mouseleave', hideTimelineTooltip);
    });
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
        case 'blocked':
            return '#fca5a5';
        default:
            return '#e5e7eb';
    }
}

function createTaskCard(task) {
    const priorityClass = `priority-${task.priority}`;
    const tags = task.tags ? task.tags.split(',').map(t => t.trim()) : [];
    const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    // Xử lý nhiều assignees
    const assignees = task.assignees || [];
    const progress = Math.round(task.progress_percent || 0);
    const subtaskInfo = `${task.completed_subtasks || 0}/${task.total_subtasks || 0}`;
    const progressColor = getProgressColor(progress);
    const progressTextColor = getProgressTextColor(progress);
    const editable = canEditTask(task);
    
    // Tạo avatar HTML cho nhiều assignees
    let assigneesHtml = '';
    if (assignees.length > 0) {
        assigneesHtml = assignees.map(assignee => {
            const assigneeName = assignee.full_name || assignee.username;
            if (assignee.avatar_url) {
                return `<img src="${escapeHtml(assignee.avatar_url)}" alt="${escapeHtml(assigneeName)}" class="task-assignee-avatar" title="${escapeHtml(assigneeName)}">`;
            } else {
                const initials = (assigneeName || 'U').split(' ').map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('') || '👤';
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
                <span class="task-priority ${priorityClass}">${task.priority}</span>
                ${dueDate ? `<span>Due: ${dueDate}</span>` : ''}
            </div>
            ${assigneesHtml ? `<div class="task-assignee">${assigneesHtml}</div>` : ''}
            <div class="task-progress">
                <div class="task-progress-bar">
                    <div class="task-progress-fill" style="width: ${progress}%; background: ${progressColor};"></div>
                </div>
                <span class="task-progress-text" style="color: ${progressTextColor};">${progress}% (${subtaskInfo})</span>
            </div>
            ${tags.length > 0 ? `
                <div class="task-tags">
                    ${tags.map(tag => `<span class="task-tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
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
    const [projectsData, tasksData] = await Promise.all([
        apiCall('/projects/'),
        apiCall('/tasks/?assigned_only=false')
    ]);
    
    if (!projectsData || !tasksData) return;

    const now = new Date();

    dashboardTasks = tasksData || [];
    const taskMap = tasksData.reduce((map, task) => {
        if (!map[task.project_id]) map[task.project_id] = [];
        map[task.project_id].push(task);
        return map;
    }, {});

    const totalProjects = projectsData.length;
    const completedProjects = projectsData.filter(p => p.status === 'completed').length;
    const completionRate = totalProjects ? Math.round((completedProjects / totalProjects) * 100) : 0;

    const overdueProjects = projectsData.filter(project => isProjectOverdue(project, now));
    const overdueCount = overdueProjects.length;

    const onTimeProjects = projectsData.filter(project => !isProjectOverdue(project, now));
    const onTimeRate = totalProjects ? Math.round((onTimeProjects.length / totalProjects) * 100) : 0;

    const atRiskProjects = projectsData.filter(project => isProjectAtRisk(project, taskMap, now));

    document.getElementById('statTotalProjects').textContent = totalProjects;
    
    // Completion Rate with color coding
    const completionRateEl = document.getElementById('statCompletionRate');
    completionRateEl.textContent = `${completionRate}%`;
    if (completionRate < 100) {
        completionRateEl.style.color = '#dc2626'; // Red
    } else {
        completionRateEl.style.color = '#10b981'; // Green
    }
    
    // On-time Rate with color coding
    const onTimeRateEl = document.getElementById('statOnTimeRate');
    onTimeRateEl.textContent = `${onTimeRate}%`;
    if (onTimeRate < 100) {
        onTimeRateEl.style.color = '#dc2626'; // Red
    } else {
        onTimeRateEl.style.color = '#10b981'; // Green
    }
    
    document.getElementById('statOverdueCount').textContent = overdueCount;

    updateWarningCards(atRiskProjects, overdueProjects);

    const recentProjects = projectsData.slice(0, 6);
    const container = document.getElementById('recentProjectsList');
    if (container) {
        container.innerHTML = recentProjects.map(project => `
            <div class="project-card" onclick="selectProject(${project.id})">
                <div class="project-card-header">
                    <div class="project-color" style="background: ${project.color}"></div>
                    <h3>${escapeHtml(project.name)}</h3>
                </div>
                <p>${escapeHtml(project.description || 'No description')}</p>
            </div>
        `).join('');
    }
    
    renderDashboardCalendar(dashboardTasks, todos);
    await loadTodos(dashboardMonth);
    await renderTodayTasks();
    loadUpcomingDeadlines();
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
    
    // Load project types vào dropdown
    await loadProjectTypes();
    
    if (project) {
        document.getElementById('projectModalTitle').textContent = 'Edit Project';
        document.getElementById('projectId').value = project.id;
        document.getElementById('projectName').value = project.name;
        document.getElementById('projectDescription').value = project.description || '';
        document.getElementById('projectColor').value = project.color || '#6366f1';
        document.getElementById('projectType').value = project.project_type_id || '';
        if (project.due_date) {
            const due = new Date(project.due_date);
            document.getElementById('projectDueDate').value = due.toISOString().slice(0, 10);
        } else {
            document.getElementById('projectDueDate').value = '';
        }
    } else {
        document.getElementById('projectModalTitle').textContent = 'New Project';
        form.reset();
        document.getElementById('projectId').value = '';
        document.getElementById('projectColor').value = '#6366f1';
        document.getElementById('projectType').value = '';
        document.getElementById('projectDueDate').value = '';
    }
    
    modal.classList.add('active');
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

function closeProjectModal() {
    document.getElementById('projectModal').classList.remove('active');
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
    const dueDateValue = document.getElementById('projectDueDate').value;
    const normalizedDueDate = normalizeDateInput(dueDateValue);
    if (dueDateValue && !normalizedDueDate) {
        alert('Ngày hoàn thành dự án không hợp lệ. Vui lòng nhập theo định dạng dd/mm/yyyy hoặc chọn ngày từ lịch.');
        return;
    }
    const projectData = {
        name: document.getElementById('projectName').value,
        description: document.getElementById('projectDescription').value,
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
        document.getElementById('taskStatus').value = task.status;
        document.getElementById('taskPriority').value = task.priority;
        document.getElementById('taskTags').value = task.tags || '';
        
        // Load assignees đã chọn
        const assigneeIds = task.assignees ? task.assignees.map(a => a.id) : [];
        document.querySelectorAll('.assignee-checkbox-input').forEach(checkbox => {
            checkbox.checked = assigneeIds.includes(parseInt(checkbox.value));
        });
        
        if (task.due_date) {
            const date = new Date(task.due_date);
            document.getElementById('taskDueDate').value = date.toISOString().slice(0, 16);
        }
    } else {
        document.getElementById('taskModalTitle').textContent = 'New Task';
        form.reset();
        document.getElementById('taskId').value = '';
        document.getElementById('taskStatus').value = 'todo';
        document.getElementById('taskPriority').value = 'medium';
        
        // Uncheck tất cả assignees
        document.querySelectorAll('.assignee-checkbox-input').forEach(checkbox => {
            checkbox.checked = false;
        });
    }
    
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
    const taskData = {
        title: document.getElementById('taskTitle').value,
        description: document.getElementById('taskDescription').value,
        status: document.getElementById('taskStatus').value,
        priority: document.getElementById('taskPriority').value,
        tags: document.getElementById('taskTags').value,
        due_date: document.getElementById('taskDueDate').value || null
    };
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
    const dueLabel = document.getElementById('projectDueDateDisplay');
    if (!summarySection) return;
    if (!currentProject) {
        summarySection.style.display = 'none';
        if (dueLabel) dueLabel.textContent = '--';
        updateProjectSummaryProgress(true);
        return;
    }
    summarySection.style.display = 'grid';
    console.log('updateProjectSummaryInfo currentProject due_date:', currentProject?.due_date);
    if (dueLabel) {
        dueLabel.textContent = currentProject.due_date
            ? formatDateDisplay(currentProject.due_date)
            : 'Chưa thiết lập';
    }
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
    updateProgressUI(task);
    renderSubtasks(task);
    toggleConfirmButton(task);
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

function toggleConfirmButton(task) {
    const btn = document.getElementById('confirmTaskDone');
    if (!btn) return;
    if (!task || taskModalReadOnly) {
        btn.style.display = 'none';
        return;
    }
    if (task && currentProjectIsOwner && (task.progress_percent || 0) >= 100 && task.status !== 'done') {
        btn.style.display = 'inline-flex';
    } else {
        btn.style.display = 'none';
    }
}

async function confirmTaskCompletion() {
    if (taskModalReadOnly) return;
    if (!currentEditingTaskId) return;
    const result = await apiCall(`/tasks/${currentEditingTaskId}/confirm-complete`, 'POST');
    if (result) {
        alert('Đã xác nhận hoàn thành task.');
        closeTaskModal();
        refreshCurrentProjectTasks();
    }
}

function applyTaskModalReadOnlyState(readOnly) {
    const form = document.getElementById('taskForm');
    if (!form) return;
    const saveBtn = document.getElementById('saveTaskBtn');
    const note = document.getElementById('taskReadOnlyNote');
    const addBtn = document.getElementById('btnAddSubtask');
    const subtaskForm = document.getElementById('subtaskFormWrapper');
    const inputs = ['taskTitle','taskDescription','taskStatus','taskPriority','taskDueDate','taskTags'];
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
    if (addBtn) {
        addBtn.disabled = readOnly;
    }
    if (subtaskForm) {
        subtaskForm.style.display = readOnly ? 'none' : 'flex';
    }
    const confirmBtn = document.getElementById('confirmTaskDone');
    if (confirmBtn && readOnly) {
        confirmBtn.style.display = 'none';
    }
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

function normalizeUserFieldGroups(user = {}) {
    const groupEntries = Array.isArray(user.group) ? user.group : [];
    const normalizedGroups = groupEntries
        .map((entry) => ({
            field: (entry?.field || '').trim(),
            group: (entry?.group || '').trim()
        }))
        .filter((entry) => entry.field || entry.group);

    if (normalizedGroups.length > 0) {
        return normalizedGroups;
    }

    const fields = Array.isArray(user.field) ? user.field : [];
    return fields
        .map((fieldName) => ({
            field: String(fieldName || '').trim(),
            group: ''
        }))
        .filter((entry) => entry.field);
}

function renderUserFieldGroupSummary(user = {}) {
    const entries = normalizeUserFieldGroups(user);
    if (entries.length === 0) {
        return '--';
    }

    return entries
        .map((entry) => entry.group ? `${entry.field} - ${entry.group}` : entry.field)
        .join(', ');
}

function createUserFieldGroupRowMarkup(fieldValue = '', groupValue = '') {
    return `
        <div class="user-field-group-row">
            <div class="form-group">
                <label>Lĩnh vực</label>
                <input type="text" class="user-field-input" value="${escapeHtml(fieldValue)}" placeholder="Ví dụ: Sales">
            </div>
            <div class="form-group">
                <label>Nhóm</label>
                <input type="text" class="user-group-input" value="${escapeHtml(groupValue)}" placeholder="Ví dụ: Enterprise">
            </div>
            <button type="button" class="btn-secondary danger user-field-group-remove" onclick="removeUserFieldGroupRow(this)">Remove</button>
        </div>
    `;
}

function renderUserFieldGroupRows(entries = []) {
    const rowsContainer = document.getElementById('userFieldGroupRows');
    if (!rowsContainer) return;

    const safeEntries = entries.length > 0 ? entries : [{ field: '', group: '' }];
    rowsContainer.innerHTML = safeEntries
        .map((entry) => createUserFieldGroupRowMarkup(entry.field || '', entry.group || ''))
        .join('');
}

function addUserFieldGroupRow(fieldValue = '', groupValue = '') {
    const rowsContainer = document.getElementById('userFieldGroupRows');
    if (!rowsContainer) return;

    rowsContainer.insertAdjacentHTML('beforeend', createUserFieldGroupRowMarkup(fieldValue, groupValue));
}

function removeUserFieldGroupRow(button) {
    const rowsContainer = document.getElementById('userFieldGroupRows');
    const row = button?.closest('.user-field-group-row');
    if (!rowsContainer || !row) return;

    if (rowsContainer.children.length === 1) {
        const fieldInput = row.querySelector('.user-field-input');
        const groupInput = row.querySelector('.user-group-input');
        if (fieldInput) fieldInput.value = '';
        if (groupInput) groupInput.value = '';
        return;
    }

    row.remove();
}

function collectUserFieldGroupData() {
    const rows = Array.from(document.querySelectorAll('#userFieldGroupRows .user-field-group-row'));

    return rows
        .map((row) => ({
            field: row.querySelector('.user-field-input')?.value?.trim() || '',
            group: row.querySelector('.user-group-input')?.value?.trim() || ''
        }))
        .filter((entry) => entry.field);
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="padding: 24px; text-align: center; color: var(--text-secondary);">Không có user nào</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 12px;">
                ${user.avatar_url 
                    ? `<img src="${user.avatar_url}" alt="Avatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-color);">`
                    : '<div style="width: 40px; height: 40px; border-radius: 50%; background: var(--sidebar-bg); display: flex; align-items: center; justify-content: center; font-weight: 600; color: var(--text-secondary);">' + 
                      ((user.full_name || user.username || 'U').split(' ').map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('') || '👤') + 
                      '</div>'
                }
            </td>
            <td style="padding: 12px; font-weight: 500;">${escapeHtml(user.username)}</td>
            <td style="padding: 12px;">${escapeHtml(user.email)}</td>
            <td style="padding: 12px;">${escapeHtml(user.full_name || '--')}</td>
            <td style="padding: 12px;">${escapeHtml(user.position || '--')}</td>
            <td style="padding: 12px;">${escapeHtml(user.department || '--')}</td>
            <td style="padding: 12px;">${escapeHtml(user.team || '--')}</td>
            <td style="padding: 12px;">${escapeHtml(renderUserFieldGroupSummary(user))}</td>
            <td style="padding: 12px;">
                <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; 
                    ${user.role === 'admin' ? 'background: #fee2e2; color: #991b1b;' : 
                      user.role === 'viewer' ? 'background: #e0e7ff; color: #3730a3;' : 
                      'background: #dbeafe; color: #1e40af;'}">
                    ${user.role || 'member'}
                </span>
            </td>
            <td style="padding: 12px;">
                <button class="btn-link" onclick="openUserModal(${user.id})" style="cursor: pointer;">Edit</button>
            </td>
        </tr>
    `).join('');
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
        email: document.getElementById('userEmail').value,
        full_name: document.getElementById('userFullName').value || null,
        department: document.getElementById('userDepartment').value || null,
        team: document.getElementById('userTeam').value || null,
        position: document.getElementById('userPosition').value || null,
        field: fieldGroupEntries.map((entry) => entry.field),
        group: fieldGroupEntries,
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
        avatarHtml = `<img src="${avatarUrl}" alt="${escapeHtml(authorName)}" class="thread-message-avatar">`;
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
            avatarHtml = `<img src="${avatarUrl}" alt="${escapeHtml(userName)}" class="mention-item-avatar">`;
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
        avatarHtml = `<img src="${avatarUrl}" alt="${escapeHtml(authorName)}" class="comment-item-avatar">`;
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
    
    const data = await apiCall(`/activities/?project_id=${projectId}&limit=50`);
    if (data) {
        projectActivities = data;
        renderActivities();
        
        // Start polling for new activities
        startActivityPolling(projectId);
    }
}

function renderActivities() {
    const container = document.getElementById('activityList');
    if (!container) return;
    
    if (projectActivities.length === 0) {
        container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-secondary);">Chưa có hoạt động nào.</div>';
        return;
    }
    
    // Group activities by date
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
        avatarHtml = `<img src="${avatarUrl}" alt="${escapeHtml(authorName)}" class="activity-item-avatar">`;
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
        container.innerHTML = '<div class="empty-state">Kh?ng c? th?ng b?o n?o</div>';
        return;
    }

    container.innerHTML = notifications.map(notif => {
        const timeAgo = getTimeAgo(new Date(notif.created_at));
        const readClass = notif.is_read ? 'read' : 'unread';

        let icon = 'notifications';
        let actionUrl = '#';

        if (notif.type === 'task_assigned') {
            icon = 'person_add';
            if (notif.task_id) {
                actionUrl = `javascript:openTaskFromNotification(${notif.task_id})`;
            } else if (notif.project_id) {
                actionUrl = `javascript:selectProject(${notif.project_id})`;
            }
        } else if (notif.type === 'task_updated') {
            icon = 'edit_square';
            if (notif.task_id) {
                actionUrl = `javascript:openTaskFromNotification(${notif.task_id})`;
            } else if (notif.project_id) {
                actionUrl = `javascript:selectProject(${notif.project_id})`;
            }
        } else if (notif.type === 'mentioned') {
            icon = 'alternate_email';
            if (notif.thread_id && notif.project_id) {
                actionUrl = `javascript:openThreadFromNotification(${notif.project_id}, ${notif.thread_id})`;
            } else if (notif.project_id) {
                actionUrl = `javascript:selectProject(${notif.project_id})`;
            }
        } else if (notif.type === 'deadline_reminder') {
            icon = 'alarm';
            if (notif.task_id) {
                actionUrl = `javascript:openTaskFromNotification(${notif.task_id})`;
            } else if (notif.project_id) {
                actionUrl = `javascript:selectProject(${notif.project_id})`;
            }
        } else {
            if (notif.task_id) {
                actionUrl = `javascript:openTaskFromNotification(${notif.task_id})`;
            } else if (notif.project_id) {
                actionUrl = `javascript:selectProject(${notif.project_id})`;
            }
        }

        return `
            <div class="notification-item ${readClass}" onclick="${actionUrl}; if(!${notif.is_read}) markNotificationAsRead(${notif.id})">
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
    // Chuyển đến project và board view
    if (projectId) {
        currentProjectId = projectId;
        switchView('board');
        
        // Chuyển sang tab Thread
        setTimeout(() => {
            const threadTab = document.getElementById('boardTabThread');
            if (threadTab) {
                threadTab.click(); // Trigger click để switch tab
            }
            
            // Đợi threads load xong rồi scroll đến thread
            setTimeout(() => {
                // Tìm thread element và scroll đến nó
                const threadElement = document.querySelector(`[data-thread-id="${threadId}"]`);
                if (threadElement) {
                    const container = document.getElementById('threadMessages');
                    if (container) {
                        // Scroll container đến thread
                        const threadTop = threadElement.offsetTop;
                        const containerTop = container.offsetTop;
                        container.scrollTop = threadTop - containerTop - 50;
                        
                        // Highlight thread
                        threadElement.style.backgroundColor = 'rgba(35, 131, 226, 0.1)';
                        threadElement.style.transition = 'background-color 0.3s';
                        setTimeout(() => {
                            threadElement.style.backgroundColor = '';
                        }, 2000);
                    }
                }
            }, 800); // Đợi threads load
        }, 300);
    }
}

async function markAllNotificationsAsRead() {
    try {
        await apiCall('/notifications/read-all', 'PUT');
        await loadNotifications();
        await loadNotificationCount();
    } catch (error) {
        console.error('Error marking all as read:', error);
    }
}

async function markNotificationAsRead(notificationId) {
    try {
        await apiCall(`/notifications/${notificationId}/read`, 'PUT');
        await loadNotifications();
        await loadNotificationCount();
    } catch (error) {
        console.error('Error marking as read:', error);
    }
}

