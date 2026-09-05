// ──────────────────────────────────────────────────────────────────
// tasks.js — Task CRUD, detail modal, subtasks, assignees
// ──────────────────────────────────────────────────────────────────
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
    const checked = Array.from(document.querySelectorAll('#taskAssigneesList .assignee-checkbox-input:checked'));
    if (!checked.length) {
        label.textContent = 'Chọn người thực hiện';
    } else if (checked.length === 1) {
        const rowText = checked[0].closest('.assignee-checkbox')?.querySelector('.assignee-name-text')?.textContent || '1 người đã chọn';
        label.textContent = rowText;
    } else {
        label.textContent = `Đã chọn ${checked.length} người thực hiện`;
    }
    renderSelectedAssigneeChips(checked);
}

function renderSelectedAssigneeChips(checkedInputs) {
    const container = document.getElementById('selectedAssigneeChips');
    if (!container) return;
    if (!checkedInputs || !checkedInputs.length) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = checkedInputs.map(cb => {
        const nameText = cb.closest('.assignee-checkbox')?.querySelector('.assignee-name-text')?.textContent || '';
        const name = nameText.split('(')[0].trim();
        return `<span class="assignee-chip">${escapeHtml(name)}</span>`;
    }).join('');
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
        const workloadTab = document.getElementById('boardTabWorkload');

        if (statusTab && statusTab.classList.contains('active')) {
            renderTasks();
        }
        if (timelineTab && timelineTab.classList.contains('active')) {
            renderTaskOverviewBoard();
            renderTimeline();
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
    const label = getTaskStatusLabel(status, task);
    display.textContent = label;
    panel.dataset.status = label === 'Trễ hạn' ? 'overdue' : status;
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
        document.getElementById('taskModalTitle').textContent = 'Tạo công việc';
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

    const isCreateMode = !task;
    const commentsSection = document.getElementById('commentsSection');
    const saveBtn = document.getElementById('saveTaskBtn');
    const statusPanel = document.getElementById('taskStatusPanel');

    if (commentsSection) commentsSection.style.display = isCreateMode ? 'none' : 'block';
    if (saveBtn) saveBtn.textContent = isCreateMode ? 'Tạo' : 'Lưu';
    if (statusPanel) statusPanel.style.display = isCreateMode ? 'none' : '';

    updateTaskStatusDisplay(task);
    updateTaskPeriodPreview();
    updateAssigneeDropdownLabel();
    document.getElementById('taskAssigneesContainer')?.classList.remove('open');
    if (!isCreateMode) renderTaskExtras(task);
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
    const completeBtn = document.getElementById('completeTaskBtn');
    const saveBtn = document.getElementById('saveTaskBtn');
    if (!completeBtn) return;

    completeBtn.style.display = 'none';
    if (!task || taskModalReadOnly || !canEditTask(task)) return;

    if (task.status === 'todo' || task.status === 'in_progress') {
        completeBtn.style.display = 'inline-flex';
    }

    if (task.status === 'done' && saveBtn) {
        saveBtn.style.display = 'none';
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
