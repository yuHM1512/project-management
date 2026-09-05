// ──────────────────────────────────────────────────────────────────
// periodic-meetings.js — Periodic meetings, sessions, agenda, dashboard
// ──────────────────────────────────────────────────────────────────

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
const pmSessionCache = {};

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
    const _fc = _freqColors[meeting.frequency] || 'rgba(37,99,235,0.1);color:#2563eb';
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
            const colors = ['#2563eb','#3b82f6','#059669','#d97706','#ec4899','#7c3aed'];
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

async function openPmSessionBoard(meetingId) {
    pmCurrentMeeting = pmMeetings.find(m => m.id === meetingId);
    if (!pmCurrentMeeting || !canSeePeriodicMeeting(pmCurrentMeeting)) return;

    document.getElementById('pmBoardList').style.display = 'none';
    document.getElementById('pmSessionBoard').style.display = 'block';

    const freqColors = { weekly:'rgba(59,130,246,0.1);color:#3b82f6', monthly:'rgba(34,197,94,0.1);color:#16a34a', quarterly:'rgba(245,158,11,0.1);color:#d97706' };
    const fc = freqColors[pmCurrentMeeting.frequency] || 'rgba(37,99,235,0.1);color:#2563eb';
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

    const colors = ['#2563eb','#3b82f6','#059669','#d97706','#ec4899','#7c3aed'];
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
    const colors = ['#2563eb','#3b82f6','#059669','#d97706','#ec4899','#7c3aed'];
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
    const colors = ['#2563eb','#3b82f6','#059669','#d97706','#ec4899','#7c3aed'];
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
