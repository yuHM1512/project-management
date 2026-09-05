// ──────────────────────────────────────────────────────────────────
// timeline.js — Gantt chart, timeline views (quarter/month)
// ──────────────────────────────────────────────────────────────────
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

function renderTimeline() {
    if (timelineZoom === 'month') renderGanttChartMonth();
    else renderGanttChartQuy();
}

function setTimelineZoom(zoom) {
    timelineZoom = zoom;
    const btnQ = document.getElementById('tlZoomQuarter');
    const btnM = document.getElementById('tlZoomMonth');
    if (btnQ) btnQ.classList.toggle('active', zoom === 'quarter');
    if (btnM) btnM.classList.toggle('active', zoom === 'month');
    // Update nav button labels
    const prevBtn = document.getElementById('prevYearBtn');
    const nextBtn = document.getElementById('nextYearBtn');
    if (prevBtn) prevBtn.textContent = zoom === 'month' ? '← Tháng trước' : '← Năm trước';
    if (nextBtn) nextBtn.textContent = zoom === 'month' ? 'Tháng sau →' : 'Năm sau →';
    renderTimeline();
}

function renderGanttChartMonth() {
    const chart = document.getElementById('ganttChart');
    if (!chart) return;

    const oldTl = document.getElementById('ganttTimeline');
    if (oldTl) oldTl.style.display = 'none';
    const oldHdr = chart.closest('.gantt-section')?.querySelector('.gantt-task-header-row');
    if (oldHdr) oldHdr.style.display = 'none';

    const monthNames = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                        'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
    const yearDisplay = document.getElementById('currentYearDisplay');
    if (yearDisplay) yearDisplay.textContent = `${monthNames[timelineMonth]} / ${quarterlyYear}`;

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
    const monthStart = new Date(quarterlyYear, timelineMonth, 1);
    const monthEnd   = new Date(quarterlyYear, timelineMonth + 1, 0, 23, 59, 59, 999);
    const totalMs    = monthEnd - monthStart;

    function fracOfMonth(date) {
        const t = Math.min(Math.max(date.getTime(), monthStart.getTime()), monthEnd.getTime());
        return (t - monthStart) / totalMs;
    }

    const tasksInMonth = filteredTasks.filter(task => {
        const end = parseDate(task.due_date);
        if (!end) return false;
        const start = parseDate(task.period_start || task.created_at) || end;
        return !(end < monthStart || start > monthEnd);
    });

    if (tasksInMonth.length === 0) {
        chart.innerHTML = `<p class="text-muted" style="padding:24px 0">Không có task nào trong ${monthNames[timelineMonth]} ${quarterlyYear}.</p>`;
        return;
    }

    function _groupKey(task) {
        if (task.task_type === 'one_time') return null;
        if (!task.frequency) return null;
        if (task.series_id) return `sid:${task.series_id}`;
        return `tf:${task.title}|${task.frequency}`;
    }

    const seriesGroups = {};
    tasksInMonth.forEach(task => {
        const key = _groupKey(task);
        if (!key) return;
        if (!seriesGroups[key]) seriesGroups[key] = [];
        seriesGroups[key].push(task);
    });

    const seenGroups = new Set();
    const displayRows = [];
    tasksInMonth.forEach(task => {
        const key = _groupKey(task);
        if (key) {
            if (seenGroups.has(key)) return;
            seenGroups.add(key);
            const instances = seriesGroups[key];
            const starts   = instances.map(t => parseDate(t.period_start || t.created_at)).filter(Boolean);
            const ends     = instances.map(t => parseDate(t.due_date)).filter(Boolean);
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

    const daysInMonth = monthEnd.getDate();
    const weeks = [];
    let ws = 1;
    while (ws <= daysInMonth) { weeks.push({ start: ws, end: Math.min(ws + 6, daysInMonth) }); ws += 7; }

    const todayFrac  = (today >= monthStart && today <= monthEnd) ? fracOfMonth(today) : null;
    const currentDay = (today.getFullYear() === quarterlyYear && today.getMonth() === timelineMonth) ? today.getDate() : -1;

    const weekHeaderHtml = weeks.map((w, wi) => {
        const isCurrWeek = currentDay >= w.start && currentDay <= w.end;
        return `<div class="tl-week${isCurrWeek ? ' current-w' : ''}">
            <div class="tl-w-label${isCurrWeek ? ' current' : ''}">Tuần ${wi + 1}</div>
            <div class="tl-w-days">${w.start}–${w.end}</div>
        </div>`;
    }).join('');

    const weekBandColors = ['rgba(59,130,246,.035)','rgba(67,97,238,.025)','rgba(59,130,246,.035)','rgba(67,97,238,.025)','rgba(59,130,246,.035)'];
    const bandsAndLinesHtml = (() => {
        let html = '';
        weeks.forEach((w, wi) => {
            const leftF  = (w.start - 1) / daysInMonth;
            const widthF = (w.end - w.start + 1) / daysInMonth;
            html += `<div class="tl-q-band" style="left:calc(260px + (100% - 260px)*${leftF.toFixed(4)});width:calc((100% - 260px)*${widthF.toFixed(4)});background:${weekBandColors[wi % weekBandColors.length]}"></div>`;
        });
        for (let wi = 1; wi < weeks.length; wi++) {
            const frac = (weeks[wi].start - 1) / daysInMonth;
            html += `<div class="tl-quarter-divider" style="left:calc(260px + (100% - 260px)*${frac.toFixed(4)})"></div>`;
        }
        return html;
    })();

    const statusLabelMap = { todo: 'Chưa thực hiện', in_progress: 'Đang thực hiện', done: 'Hoàn thành' };

    const rowsHtml = displayRows.map(row => {
        const rawStart = row._isGroup ? row._groupStart : parseDate(row.period_start || row.created_at);
        const rawEnd   = row._isGroup ? row._groupEnd   : parseDate(row.due_date);
        if (!rawEnd) return '';

        const start      = rawStart && rawStart <= rawEnd ? rawStart : rawEnd;
        const clampStart = new Date(Math.max(start.getTime(), monthStart.getTime()));
        const clampEnd   = new Date(Math.min(rawEnd.getTime(), monthEnd.getTime()));
        if (clampStart > clampEnd) return '';

        const leftF    = fracOfMonth(clampStart);
        const rightF   = fracOfMonth(clampEnd);
        const leftPct  = (leftF * 100).toFixed(2);
        const widthPct = Math.max(2, (rightF - leftF) * 100).toFixed(2);

        const cfg      = statusCfg(row.status);
        const progress = row._progress !== undefined ? row._progress
                       : (row.status === 'done' ? 100 : row.status === 'in_progress' ? 50 : 0);

        const badgeHtml  = row._isGroup
            ? `<span class="tl-row-badge">×${row._count}</span>`
            : (row.task_type === 'one_time' ? `<span class="tl-row-badge tl-badge-once">1 lần</span>` : '');
        const freqHint   = row._isGroup ? ` · ${getTaskFrequencyLabel(row.frequency, row.task_type)} · ${row._count} chu kỳ` : '';
        const tooltip    = `${row.title}\n${statusLabelMap[row.status] || ''}${freqHint}\n${formatDateDisplay(clampStart)} – ${formatDateDisplay(clampEnd)}`;

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

    const doneAll   = tasksInMonth.filter(t => t.status === 'done').length;
    const inProgAll = tasksInMonth.filter(t => t.status === 'in_progress').length;
    const seriesCount = Object.values(seriesGroups).filter(g => g.length > 1).length;

    chart.innerHTML = `
        <div class="tl-card">
            <div class="tl-scroll">
                <div class="tl-header-row">
                    <div class="tl-header-stub"><span>Danh sách công việc</span></div>
                    <div class="tl-quarters tl-weeks">${weekHeaderHtml}</div>
                </div>
                <div class="tl-rows">
                    ${bandsAndLinesHtml}
                    ${todayFrac !== null ? `<div class="tl-today-line" style="left:calc(260px + (100% - 260px) * ${todayFrac.toFixed(4)})"><div class="tl-today-label">Hôm nay</div></div>` : ''}
                    ${rowsHtml || `<div style="padding:32px 24px;color:#9ca3af;font-size:14px">Không có task nào trong tháng này.</div>`}
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
                <div><div class="tl-summary-sub">Hoàn thành</div><div class="tl-summary-val">trong tháng</div></div>
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
