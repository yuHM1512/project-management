// ──────────────────────────────────────────────────────────────────
// worklogs.js — Work log CRUD, attachments, subtask linking
// ──────────────────────────────────────────────────────────────────
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
