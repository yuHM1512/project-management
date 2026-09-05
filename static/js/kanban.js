// ──────────────────────────────────────────────────────────────────
// kanban.js — Board views, drag & drop, task cards, series modal
// ──────────────────────────────────────────────────────────────────
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
        renderTaskOverviewBoard();
        renderTimeline();
    } else if (tabName === 'status') {
        stopThreadPolling();
        renderTasks();
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
    if (!container) return;

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
                ${currentUser?.role === 'admin' ? `<button class="task-delete-btn" onclick="handleDeleteTask(${task.id}, event)" title="Xóa task">×</button>` : ''}
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
