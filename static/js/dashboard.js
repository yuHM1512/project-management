// ──────────────────────────────────────────────────────────────────
// dashboard.js — Dashboard view, stats, calendar, today tasks
// ──────────────────────────────────────────────────────────────────
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

    const AVATAR_COLORS = ['#2563eb','#3b82f6','#0ea5e9','#059669','#d97706','#dc2626','#7c3aed','#ec4899'];

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
