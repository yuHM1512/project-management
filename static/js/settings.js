// ──────────────────────────────────────────────────────────────────
// settings.js — User management, MTCL, account settings
// ──────────────────────────────────────────────────────────────────
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
    document.getElementById('accountTabs')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-account-tab]');
        if (!button) return;
        setAccountTab(button.getAttribute('data-account-tab') || 'profile');
    });
    document.getElementById('btnOpenRecurringAdminReport')?.addEventListener('click', openRecurringAdminReport);

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

    document.getElementById('meetingForm')?.addEventListener('submit', handleMeetingSubmit);
    document.getElementById('btnResetMeeting')?.addEventListener('click', () => resetMeetingForm(true));
    document.getElementById('btnDeleteMeeting')?.addEventListener('click', handleDeleteMeeting);
    document.getElementById('meetingEmployee')?.addEventListener('change', handleMeetingEmployeeChange);
    document.getElementById('closeMeetingContentModal')?.addEventListener('click', closeMeetingContentEditor);
    document.getElementById('cancelMeetingContent')?.addEventListener('click', closeMeetingContentEditor);
    document.getElementById('saveMeetingContent')?.addEventListener('click', saveMeetingContent);
    document.getElementById('meetingContentModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'meetingContentModal') closeMeetingContentEditor();
    });
    document.getElementById('closeMeetingReportModal')?.addEventListener('click', closeMeetingReportModal);
    document.getElementById('btnCloseMeetingReport')?.addEventListener('click', closeMeetingReportModal);
    document.getElementById('btnEditMeetingFromReport')?.addEventListener('click', editMeetingFromReport);
    document.getElementById('btnMeetingReportFullscreen')?.addEventListener('click', toggleMeetingReportFullscreen);
    document.querySelectorAll('.meeting-content-checkbox').forEach((checkbox) => {
        checkbox.addEventListener('change', () => setMeetingContentSelected(checkbox.value, checkbox.checked));
    });

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

function initSettingsNavigation() {
    const tabbar = document.getElementById('settingsTabbar');
    if (!tabbar) return;

    tabbar.addEventListener('click', (event) => {
        const button = event.target.closest('[data-settings-tab]');
        if (!button) return;
        const tab = button.getAttribute('data-settings-tab') || 'users';
        showSettingsTab(tab);
    });
}

function showSettingsTab(tab = 'users', shouldUpdateURL = true) {
    currentSettingsTab = tab;
    updateRecentProjectsVisibility();
    document.getElementById('projectSummarySection')?.style.setProperty('display', 'none');

    document.querySelectorAll('.settings-tab').forEach((button) => {
        button.classList.toggle('active', button.getAttribute('data-settings-tab') === tab);
    });

    document.querySelectorAll('.settings-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`settingsPanel${tab.charAt(0).toUpperCase()}${tab.slice(1)}`)?.classList.add('active');

    if (shouldUpdateURL && currentView === 'settings') {
        updateURL('settings', { settingsTab: tab });
    }

    if (tab === 'users' && currentUser?.role === 'admin') {
        loadUsersList();
    }
    if (tab === 'mtcl') {
        loadMtclList();
    }
    if (tab === 'tracking') {
        loadRecurringTasksMatrix();
    }
}

function showPersonalSection(section = 'account', highlightNav = true, shouldUpdateURL = true) {
    currentPersonalSection = section;
    syncViewBodyState(currentView);
    updateRecentProjectsVisibility();
    document.getElementById('projectSummarySection')?.style.setProperty('display', 'none');
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
        meeting: document.getElementById('personalSectionMeeting'),
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
        ensureAccountSection();
    } else if (section === 'todos') {
        ensureTodosSection();
    } else if (section === 'work') {
        ensureWorkLogSection();
    } else if (section === 'notes') {
        ensureNotesSection();
    } else if (section === 'meeting') {
        ensureMeetingSection();
    }
    updatePersonalSectionHeader(section);
}

function updatePersonalSectionHeader(section) {
    const title = document.querySelector('#personalView .view-title-stack h2');
    const description = document.querySelector('#personalView .view-title-stack p');
    const pageTitle = document.getElementById('pageTitle');
    const copy = {
        todos: {
            title: 'To-do List',
            description: 'Lên lịch công việc cá nhân theo ngày và theo dõi phần việc cần xử lý.'
        },
        meeting: {
            title: 'Meeting',
            description: 'Quản lý danh sách cuộc họp, nội dung trao đổi và phần chuẩn bị trước họp.'
        },
        notes: {
            title: 'My Notes',
            description: 'Ghi chú nhanh, lưu ý công việc và nội dung cần theo dõi riêng.'
        },
        work: {
            title: 'Work Log',
            description: 'Ghi nhận nhật ký công việc, liên kết dự án/task và lưu bằng chứng thực hiện.'
        },
        account: {
            title: 'Account',
            description: 'Cập nhật hồ sơ cá nhân, thông tin đơn vị và thiết lập tài khoản.'
        }
    };
    const current = copy[section] || copy.account;
    if (title) title.textContent = current.title;
    if (description) description.textContent = current.description;
    if (pageTitle && currentView === 'personal') pageTitle.textContent = current.title;
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

function ensureAccountSection() {
    const reportBtn = document.getElementById('btnOpenRecurringAdminReport');
    if (reportBtn) {
        reportBtn.style.display = currentUser?.role === 'admin' ? 'inline-flex' : 'none';
    }
    setAccountTab(currentAccountTab || 'profile', false);
}

function setAccountTab(tab = 'profile', shouldFocus = true) {
    currentAccountTab = tab;
    document.querySelectorAll('#accountTabs .account-tab').forEach((button) => {
        button.classList.toggle('active', button.getAttribute('data-account-tab') === tab);
    });
    document.querySelectorAll('#personalSectionAccount .account-tab-panel').forEach((panel) => {
        panel.classList.remove('active');
    });
    document.getElementById(`accountTab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`)?.classList.add('active');

    if (tab === 'profile') {
        populateAccountForm();
    } else if (tab === 'recurring') {
        loadAccountRecurringTasks(shouldFocus);
    }
}

async function loadAccountRecurringTasks(shouldFocus = false) {
    if (!currentUser) return;
    recurringTasksUserId = currentUser.id;
    recurringTasksRenderTarget = 'account';
    recurringTasksReadOnly = false;
    activeRecurringFreq = activeRecurringFreq || 'weekly';
    await loadRecurringTasks(currentUser.id, {
        endpoint: '/recurring-tasks/me',
        focusInput: shouldFocus
    });
}

function openRecurringAdminReport() {
    if (currentUser?.role !== 'admin') return;
    currentSettingsTab = 'tracking';
    switchView('settings');
    showSettingsTab('tracking');
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

async function loadUsersList() {
    if (currentUser?.role !== 'admin') return;
    const data = await apiCall('/users/');
    if (data) {
        users = data;
        renderUsersTable();
    }
}

async function loadMtclList() {
    const data = await apiCall('/mtcl/');
    if (data) {
        mtclItems = data;
        renderMtclTable();
    }
}

function cleanMtclText(value = '') {
    return String(value || '')
        .replace(/\s*\[[^\]]+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeUserFieldGroups(user = {}) {
    const groupEntries = Array.isArray(user.group) ? user.group : [];
    const chapterEntries = Array.isArray(user.chapter) ? user.chapter : [];
    const fields = Array.isArray(user.field) ? user.field : [];

    const groupMap = new Map();
    groupEntries.forEach((entry) => {
        const fieldName = String(entry?.field || '').trim().toUpperCase();
        if (!fieldName) return;
        groupMap.set(fieldName, String(entry?.group || '').trim());
    });

    const chapterMap = new Map();
    chapterEntries.forEach((entry) => {
        const fieldName = String(entry?.field || '').trim().toUpperCase();
        if (!fieldName) return;
        const chapters = Array.isArray(entry?.chapters)
            ? entry.chapters.map((chapter) => String(chapter || '').trim()).filter(Boolean)
            : [];
        chapterMap.set(fieldName, chapters);
    });

    const fieldOrder = [];
    const seenFields = new Set();
    [...fields, ...groupEntries.map((entry) => entry?.field), ...chapterEntries.map((entry) => entry?.field)]
        .forEach((fieldName) => {
            const normalizedField = String(fieldName || '').trim().toUpperCase();
            if (!normalizedField || seenFields.has(normalizedField)) return;
            seenFields.add(normalizedField);
            fieldOrder.push(normalizedField);
        });

    return fieldOrder.map((fieldName) => ({
        field: fieldName,
        group: groupMap.get(fieldName) || '',
        chapters: chapterMap.get(fieldName) || []
    }));
}

function renderUserFieldGroupSummary(user = {}) {
    const entries = normalizeUserFieldGroups(user);
    if (entries.length === 0) {
        return '--';
    }

    return entries
        .map((entry) => {
            const chaptersLabel = entry.chapters?.length ? entry.chapters.join('; ') : '--';
            const groupLabel = entry.group || '--';
            return `${entry.field} | ${chaptersLabel} | Group ${groupLabel}`;
        })
        .join(', ');
}

const USER_FIELD_OPTIONS = [
    'OPEX',
    'SSE',
    'HRP',
    'QUALITY',
    'DPR',
    'ADMANRI',
    'ENV'
];

function createUserFieldGroupRowMarkup(fieldValue = '', groupValue = '', chapterValues = []) {
    const normalizedFieldValue = String(fieldValue || '').trim().toUpperCase();
    const fieldOptionsMarkup = USER_FIELD_OPTIONS
        .map((option) => `<option value="${option}"${option === normalizedFieldValue ? ' selected' : ''}>${option}</option>`)
        .join('');
    const rowId = `user-field-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const safeChapters = Array.isArray(chapterValues) && chapterValues.length > 0 ? chapterValues : [''];
    const chapterInputsMarkup = safeChapters
        .map((chapterValue) => createUserChapterInputMarkup(chapterValue))
        .join('');

    return `
        <div class="user-field-group-row" data-row-id="${rowId}">
            <div class="form-group">
                <label>Lĩnh vực</label>
                <select class="user-field-input">
                    <option value="">Chọn lĩnh vực</option>
                    ${fieldOptionsMarkup}
                </select>
            </div>
            <div class="form-group">
                <label>Nhóm</label>
                <input type="number" min="0" step="1" inputmode="numeric" class="user-group-input" value="${escapeHtml(groupValue)}" placeholder="Nhập số nhóm">
            </div>
            <button type="button" class="btn-secondary danger user-field-group-remove" onclick="removeUserFieldGroupRow(this)">Remove</button>
            <div class="user-chapter-section">
                <div class="user-chapter-header">
                    <label>Chapter</label>
                    <button type="button" class="btn-secondary user-chapter-add" onclick="addUserChapterInput('${rowId}')">+ Add chapter</button>
                </div>
                <div class="user-chapter-list" data-chapter-container>
                    ${chapterInputsMarkup}
                </div>
            </div>
        </div>
    `;
}

function renderUserFieldGroupRows(entries = []) {
    const rowsContainer = document.getElementById('userFieldGroupRows');
    if (!rowsContainer) return;

    const safeEntries = entries.length > 0 ? entries : [{ field: '', group: '', chapters: [''] }];
    rowsContainer.innerHTML = safeEntries
        .map((entry) => createUserFieldGroupRowMarkup(entry.field || '', entry.group || '', entry.chapters || []))
        .join('');
}

function createUserChapterInputMarkup(chapterValue = '') {
    return `
        <div class="user-chapter-input-row">
            <input type="text" class="user-chapter-input" value="${escapeHtml(chapterValue)}" placeholder="Ví dụ: Trục 1">
            <button type="button" class="btn-secondary danger user-chapter-remove" onclick="removeUserChapterInput(this)">Remove</button>
        </div>
    `;
}

function addUserFieldGroupRow(fieldValue = '', groupValue = '', chapters = ['']) {
    const rowsContainer = document.getElementById('userFieldGroupRows');
    if (!rowsContainer) return;

    rowsContainer.insertAdjacentHTML('beforeend', createUserFieldGroupRowMarkup(fieldValue, groupValue, chapters));
}

function addUserChapterInput(rowId, chapterValue = '') {
    const row = document.querySelector(`.user-field-group-row[data-row-id="${rowId}"]`);
    const chapterContainer = row?.querySelector('[data-chapter-container]');
    if (!chapterContainer) return;

    chapterContainer.insertAdjacentHTML('beforeend', createUserChapterInputMarkup(chapterValue));
}

function removeUserChapterInput(button) {
    const chapterContainer = button?.closest('[data-chapter-container]');
    const chapterRow = button?.closest('.user-chapter-input-row');
    if (!chapterContainer || !chapterRow) return;

    if (chapterContainer.children.length === 1) {
        const chapterInput = chapterRow.querySelector('.user-chapter-input');
        if (chapterInput) chapterInput.value = '';
        return;
    }

    chapterRow.remove();
}

function removeUserFieldGroupRow(button) {
    const rowsContainer = document.getElementById('userFieldGroupRows');
    const row = button?.closest('.user-field-group-row');
    if (!rowsContainer || !row) return;

    if (rowsContainer.children.length === 1) {
        const fieldInput = row.querySelector('.user-field-input');
        const groupInput = row.querySelector('.user-group-input');
        const chapterInputs = row.querySelectorAll('.user-chapter-input');
        if (fieldInput) fieldInput.value = '';
        if (groupInput) groupInput.value = '';
        chapterInputs.forEach((chapterInput, index) => {
            chapterInput.value = '';
            if (index > 0) {
                chapterInput.closest('.user-chapter-input-row')?.remove();
            }
        });
        return;
    }

    row.remove();
}

function collectUserFieldGroupData() {
    const rows = Array.from(document.querySelectorAll('#userFieldGroupRows .user-field-group-row'));

    return rows
        .map((row) => ({
            field: row.querySelector('.user-field-input')?.value?.trim() || '',
            group: row.querySelector('.user-group-input')?.value?.trim() || '',
            chapters: Array.from(row.querySelectorAll('.user-chapter-input'))
                .map((input) => input.value.trim())
                .filter(Boolean)
        }))
        .filter((entry) => entry.field);
}

function renderUserAvatarMarkup(user) {
    const initials = ((user.full_name || user.username || 'U')
        .split(' ')
        .map((part) => part.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('')) || 'U';

    if (user.avatar_url) {
        return `
            <div class="user-directory-avatar">
                <img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.full_name || user.username || 'U')}" onerror="onAvatarError(this,'__parent__')">
            </div>
        `;
    }

    return `<div class="user-directory-avatar">${escapeHtml(initials)}</div>`;
}

function updateUsersDirectorySummary() {
    const totalCount = users.length;
    const adminCount = users.filter((user) => user.role === 'admin').length;
    const departmentCount = new Set(
        users
            .map((user) => (user.department || '').trim())
            .filter(Boolean)
    ).size;

    const totalNode = document.getElementById('usersTotalCount');
    const adminNode = document.getElementById('usersAdminCount');
    const departmentNode = document.getElementById('usersDepartmentCount');
    if (totalNode) totalNode.textContent = String(totalCount);
    if (adminNode) adminNode.textContent = String(adminCount);
    if (departmentNode) departmentNode.textContent = String(departmentCount);

    const meta = document.getElementById('usersDirectoryMeta');
    const footerMeta = document.getElementById('usersDirectoryFooterMeta');
    const metaText = totalCount === 0
        ? 'Chưa có hồ sơ nào trong danh mục.'
        : `${totalCount} hồ sơ • ${adminCount} admin • ${departmentCount} phòng ban`;
    if (meta) {
        meta.textContent = metaText;
    }
    if (footerMeta) footerMeta.textContent = metaText;
}

function renderMtclTable() {
    const container = document.getElementById('mtclTableBody');
    if (!container) return;

    const recordCount = mtclItems.length;
    const groupCount = new Set(mtclItems.map((item) => item.objective_group).filter(Boolean)).size;
    const unitCount = new Set(mtclItems.flatMap((item) => Array.isArray(item.units) ? item.units : [])).size;

    document.getElementById('mtclRecordCount').textContent = String(recordCount);
    document.getElementById('mtclGroupCount').textContent = String(groupCount);
    document.getElementById('mtclUnitCount').textContent = String(unitCount);

    const meta = document.getElementById('mtclMeta');
    if (meta) {
        meta.textContent = recordCount === 0
            ? 'No MTCL records available.'
            : `${recordCount} records • ${groupCount} groups • ${unitCount} units`;
    }

    if (recordCount === 0) {
        container.innerHTML = '<div class="users-empty-state">No MTCL data available.</div>';
        return;
    }

    container.innerHTML = mtclItems.map((item) => `
        <article class="mtcl-card">
            <div class="mtcl-card-group">
                <div class="mtcl-card-title">${escapeHtml(item.objective_group || '--')}</div>
            </div>
            <div class="mtcl-card-units">
                ${(Array.isArray(item.units) ? item.units : []).map((unit) => `<span class="mtcl-unit-pill">${escapeHtml(unit)}</span>`).join('') || '<span class="mtcl-unit-pill">--</span>'}
            </div>
            <div class="mtcl-card-description">${escapeHtml(cleanMtclText(item.description || '--'))}</div>
            <div class="mtcl-card-action">
                <button class="btn-link" type="button" onclick="openMtclModal(${item.id})">Edit</button>
            </div>
        </article>
    `).join('');
}

function openMtclModal(itemId) {
    const item = mtclItems.find((entry) => entry.id === itemId);
    if (!item) return;

    currentMtclId = item.id;
    document.getElementById('mtclId').value = String(item.id);
    document.getElementById('mtclObjectiveGroup').value = cleanMtclText(item.objective_group || '');
    document.getElementById('mtclUnits').value = Array.isArray(item.units) ? item.units.join(', ') : '';
    document.getElementById('mtclDescription').value = cleanMtclText(item.description || '');
    document.getElementById('mtclModal').classList.add('active');
}

function closeMtclModal() {
    currentMtclId = null;
    document.getElementById('mtclForm')?.reset();
    document.getElementById('mtclModal')?.classList.remove('active');
}

async function handleMtclSubmit(event) {
    event.preventDefault();
    const itemId = currentMtclId || parseInt(document.getElementById('mtclId').value, 10);
    if (!itemId) return;

    const units = String(document.getElementById('mtclUnits').value || '')
        .split(',')
        .map((unit) => cleanMtclText(unit))
        .filter(Boolean);

    const payload = {
        objective_group: cleanMtclText(document.getElementById('mtclObjectiveGroup').value || ''),
        units,
        description: cleanMtclText(document.getElementById('mtclDescription').value || ''),
    };

    const data = await apiCall(`/mtcl/${itemId}`, 'PUT', payload);
    if (data) {
        await loadMtclList();
        closeMtclModal();
    }
}

function renderUsersTable() {
    const container = document.getElementById('usersTableBody');
    if (!container) return;

    updateUsersDirectorySummary();

    if (users.length === 0) {
        container.innerHTML = '<div class="users-empty-state">Chưa có user nào trong hệ thống.</div>';
        return;
    }

    container.innerHTML = users.map(user => `
        <article class="user-directory-card">
            <div class="user-directory-profile">
                ${renderUserAvatarMarkup(user)}
                <div class="user-directory-copy">
                    <div class="user-directory-name">${escapeHtml(user.full_name || user.username || '--')}</div>
                    <div class="user-directory-subline">@${escapeHtml(user.username || '--')}</div>
                </div>
            </div>
            <div class="user-directory-meta">
                <strong>${escapeHtml(user.department || '--')}</strong>
                <span>${escapeHtml(user.team || '--')}</span>
            </div>
            <div class="user-directory-pillset">
                ${renderUserCapabilityPills(user)}
            </div>
            <span class="user-directory-role role-${escapeHtml(user.role || 'member')}">${escapeHtml(user.role || 'member')}</span>
            <div class="user-directory-action">
                <button class="btn-link" onclick="openRecurringTasksModal(${user.id})" type="button" title="Công việc định kỳ">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">assignment_ind</span>
                </button>
                <button class="btn-link" onclick="openUserModal(${user.id})" type="button">Edit</button>
            </div>
        </article>
    `).join('');
}

function renderUserCapabilityPills(user) {
    const entries = normalizeUserFieldGroups(user);
    if (entries.length === 0) {
        return '<span class="user-directory-pill muted">No field</span>';
    }

    const visibleEntries = entries.slice(0, 2);
    const hiddenCount = entries.length - visibleEntries.length;
    const pills = visibleEntries.map((entry) => {
        const chapters = (entry.chapters || []).slice(0, 2).join(', ') || '--';
        const group = entry.group || '--';
        const fullChapters = (entry.chapters || []).join(', ') || '--';
        const title = `${entry.field} / ${fullChapters} / Group ${group}`;
        return `<span class="user-directory-pill" title="${escapeHtml(title)}">${escapeHtml(entry.field)} / ${escapeHtml(chapters)} / G${escapeHtml(group)}</span>`;
    });

    if (hiddenCount > 0) {
        pills.push(`<span class="user-directory-pill muted">+${hiddenCount}</span>`);
    }

    return pills.join('');
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
        email: document.getElementById('userEmail').value || null,
        full_name: document.getElementById('userFullName').value || null,
        department: document.getElementById('userDepartment').value || null,
        team: document.getElementById('userTeam').value || null,
        position: document.getElementById('userPosition').value || null,
        field: fieldGroupEntries.map((entry) => entry.field),
        chapter: fieldGroupEntries.map((entry) => ({
            field: entry.field,
            chapters: entry.chapters
        })),
        group: fieldGroupEntries.map((entry) => ({
            field: entry.field,
            group: entry.group
        })),
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
