// ──────────────────────────────────────────────────────────────────
// personal.js — Notes, todos (personal section)
// ──────────────────────────────────────────────────────────────────
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
