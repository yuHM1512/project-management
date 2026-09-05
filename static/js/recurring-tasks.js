// ──────────────────────────────────────────────────────────────────
// recurring-tasks.js — Recurring task templates, employee detail, tracking matrix
// ──────────────────────────────────────────────────────────────────
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
