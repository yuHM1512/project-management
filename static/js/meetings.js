// ──────────────────────────────────────────────────────────────────
// meetings.js — 1-1 meeting review (create, report, content editor)
// ──────────────────────────────────────────────────────────────────
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
