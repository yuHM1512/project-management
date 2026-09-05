// ──────────────────────────────────────────────────────────────────
// threads.js — Discussion threads, comments, mentions, image viewer
// ──────────────────────────────────────────────────────────────────
async function loadThreads(shouldScrollToBottom = false) {
    if (!currentProjectId) {
        const container = document.getElementById('threadMessages');
        if (container) {
            container.innerHTML =
                '<div style="padding: 24px; text-align: center; color: var(--text-secondary);">Vui lòng chọn project trước.</div>';
        }
        stopThreadPolling();
        return;
    }

    const data = await apiCall(`/threads/?project_id=${currentProjectId}`);
    if (data) {
        // Kiểm tra xem có message mới không (so sánh số lượng hoặc last message ID)
        const hasNewMessages = projectThreads.length !== data.length ||
            (data.length > 0 && projectThreads.length > 0 &&
             data[data.length - 1].id !== projectThreads[projectThreads.length - 1].id);

        projectThreads = data;
        renderThreads(shouldScrollToBottom || hasNewMessages);
    }
}

function startThreadPolling() {
    // Dừng polling cũ nếu có
    stopThreadPolling();

    // Chỉ start polling nếu tab Thread đang active
    const threadTab = document.getElementById('boardTabThread');
    if (!threadTab || !threadTab.classList.contains('active')) {
        return;
    }

    // Load ngay lập tức
    loadThreads(false);

    // Sau đó poll mỗi 5 giây
    threadPollingInterval = setInterval(() => {
        // Kiểm tra lại xem tab có còn active không
        const threadTab = document.getElementById('boardTabThread');
        if (threadTab && threadTab.classList.contains('active') && currentProjectId) {
            loadThreads(false); // Không auto-scroll khi polling
        } else {
            stopThreadPolling();
        }
    }, THREAD_POLL_INTERVAL);
}

function stopThreadPolling() {
    if (threadPollingInterval) {
        clearInterval(threadPollingInterval);
        threadPollingInterval = null;
    }
}

function renderThreads(shouldScrollToBottom = true) {
    const container = document.getElementById('threadMessages');
    if (!container) return;

    // Lưu scroll position trước khi render
    const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;

    if (projectThreads.length === 0) {
        container.innerHTML =
            '<div style="padding: 24px; text-align: center; color: var(--text-secondary);">Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện!</div>';
        return;
    }

    container.innerHTML = projectThreads.map(thread => createThreadMessage(thread)).join('');
    attachThreadImageEvents();

    // Chỉ scroll xuống nếu user đang ở cuối hoặc khi gửi message mới
    if (shouldScrollToBottom || wasAtBottom) {
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }

    // Attach event listeners
    container.querySelectorAll('.thread-message-action').forEach(btn => {
        const action = btn.getAttribute('data-action');
        const threadId = parseInt(btn.getAttribute('data-thread-id'));
        if (action === 'edit') {
            btn.addEventListener('click', () => handleEditThread(threadId));
        } else if (action === 'delete') {
            btn.addEventListener('click', () => handleDeleteThread(threadId));
        }
    });
}

function createThreadMessage(thread) {
    const user = thread.user || {};
    const authorName = user.full_name || user.username || 'Unknown';
    const avatarUrl = user.avatar_url;
    const isAuthor = thread.user_id === currentUser?.id;
    const isProjectOwner = currentProject?.owner_id === currentUser?.id;
    const canEdit = isAuthor;
    const canDelete = isAuthor || isProjectOwner;

    // Avatar HTML
    let avatarHtml = '';
    if (avatarUrl) {
        avatarHtml = `<img src="${avatarUrl}" alt="${escapeHtml(authorName)}" class="thread-message-avatar" onerror="onAvatarError(this,'thread-message-avatar-initials')">`;
    } else {
        const initials = (authorName || 'U').split(' ').map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('') || '👤';
        avatarHtml = `<div class="thread-message-avatar-initials">${initials}</div>`;
    }

    // Time display
    const timeStr = formatThreadTime(thread.created_at);
    const editedStr = thread.is_edited ? '<span class="thread-message-edited">(đã chỉnh sửa)</span>' : '';

    // Actions HTML
    let actionsHtml = '';
    if (canEdit || canDelete) {
        actionsHtml = '<div class="thread-message-actions">';
        if (canEdit) {
            actionsHtml += `<button class="thread-message-action" data-action="edit" data-thread-id="${thread.id}">Sửa</button>`;
        }
        if (canDelete) {
            actionsHtml += `<button class="thread-message-action danger" data-action="delete" data-thread-id="${thread.id}">Xóa</button>`;
        }
        actionsHtml += '</div>';
    }

    // Replies HTML
    let repliesHtml = '';
    if (thread.replies && thread.replies.length > 0) {
        repliesHtml = '<div class="thread-replies">' +
            thread.replies.map(reply => createThreadMessage(reply)).join('') +
            '</div>';
    }

    return `
        <div class="thread-message" data-thread-id="${thread.id}">
            ${avatarHtml}
            <div class="thread-message-content">
                <div class="thread-message-header">
                    <span class="thread-message-author">${escapeHtml(authorName)}</span>
                    <span class="thread-message-time">${timeStr}</span>
                </div>
                <div class="thread-message-text">${parseAndHighlightMentions(thread.content, thread.mentions || [])}</div>
                ${editedStr}
                ${actionsHtml}
                ${repliesHtml}
            </div>
        </div>
    `;
}

function parseAndHighlightMentions(content, mentionUserIds) {
    if (!content) return '';

    const mentionedUsers = (mentionUserIds || [])
        .map(userId => users.find(u => u.id === userId))
        .filter(Boolean);

    const segments = [];
    const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = imagePattern.exec(content)) !== null) {
        if (match.index > lastIndex) {
            segments.push(highlightMentionsInText(content.substring(lastIndex, match.index), mentionedUsers));
        }

        const altText = match[1] || 'image';
        const imageUrl = (match[2] || '').trim();
        if (isSafeImageUrl(imageUrl)) {
            segments.push(`<img src="${escapeAttribute(imageUrl)}" alt="${escapeHtml(altText)}" class="thread-inline-image">`);
        } else {
            segments.push(highlightMentionsInText(match[0], mentionedUsers));
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
        segments.push(highlightMentionsInText(content.substring(lastIndex), mentionedUsers));
    }

    return segments.join('');
}

function highlightMentionsInText(text, mentionedUsers) {
    if (!text) return '';
    if (!mentionedUsers || mentionedUsers.length === 0) {
        return escapeHtml(text).replace(/\n/g, '<br>');
    }

    const mentionPattern = /@(\w+(?:\s+\w+)*)/g;
    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = mentionPattern.exec(text)) !== null) {
        result += escapeHtml(text.substring(lastIndex, match.index));

        const mentionText = match[1].trim();
        const mentionedUser = mentionedUsers.find(user =>
            (user.username && user.username.toLowerCase() === mentionText.toLowerCase()) ||
            (user.full_name && user.full_name.toLowerCase() === mentionText.toLowerCase())
        );

        if (mentionedUser) {
            const displayName = mentionedUser.full_name || mentionedUser.username;
            result += `<span class="thread-mention" title="Mention: ${escapeHtml(displayName)}">@${escapeHtml(mentionText)}</span>`;
        } else {
            result += escapeHtml(match[0]);
        }

        lastIndex = match.index + match[0].length;
    }

    result += escapeHtml(text.substring(lastIndex));
    return result.replace(/\n/g, '<br>');
}

function formatThreadTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;

    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function handleSendThread() {
    if (!currentProjectId) {
        alert('Vui lòng chọn project trước!');
        return;
    }

    const input = document.getElementById('threadInput');
    const content = (input.value || '').trim();
    if (!content) return;

    const data = await apiCall('/threads/', 'POST', {
        project_id: currentProjectId,
        content: content
    });

    if (data) {
        input.value = '';
        // Load lại và scroll xuống bottom khi gửi message mới
        await loadThreads(true);
    }
}

async function handleEditThread(threadId) {
    const thread = findThreadById(threadId);
    if (!thread) return;

    const newContent = prompt('Sửa tin nhắn:', thread.content);
    if (newContent === null || newContent.trim() === '') return;

    const data = await apiCall(`/threads/${threadId}`, 'PUT', {
        content: newContent.trim()
    });

    if (data) {
        await loadThreads();
    }
}

async function handleDeleteThread(threadId) {
    if (!confirm('Bạn có chắc chắn muốn xóa tin nhắn này không?')) {
        return;
    }

    const data = await apiCall(`/threads/${threadId}`, 'DELETE');
    if (data) {
        await loadThreads();
    }
}

function findThreadById(threadId) {
    for (const thread of projectThreads) {
        if (thread.id === threadId) return thread;
        if (thread.replies) {
            for (const reply of thread.replies) {
                if (reply.id === threadId) return reply;
            }
        }
    }
    return null;
}

// Mention Functions
function isMentionDropdownVisible() {
    const dropdown = document.getElementById('mentionDropdown');
    return dropdown && dropdown.style.display !== 'none';
}

function handleThreadInput(e) {
    const input = e.target;
    const value = input.value;
    const cursorPos = input.selectionStart;

    // Tìm @ gần nhất trước cursor
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
        // Kiểm tra xem có space sau @ không (nếu có thì không phải mention)
        const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
        if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
            // Có @ mention đang được gõ
            const query = textAfterAt.trim();
            mentionState.isActive = true;
            mentionState.query = query;
            mentionState.startPos = lastAtIndex;
            mentionState.endPos = cursorPos;
            mentionState.selectedIndex = 0;

            showMentionDropdown(query);
            return;
        }
    }

    // Không có mention active
    hideMentionDropdown();
}

function handleThreadInputKeydown(e) {
    if (!isMentionDropdownVisible()) return;

    const dropdown = document.getElementById('mentionDropdown');
    const items = dropdown.querySelectorAll('.mention-item');

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionState.selectedIndex = Math.min(mentionState.selectedIndex + 1, items.length - 1);
        updateMentionDropdownSelection();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionState.selectedIndex = Math.max(mentionState.selectedIndex - 1, 0);
        updateMentionDropdownSelection();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (items[mentionState.selectedIndex]) {
            selectMention(items[mentionState.selectedIndex]);
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        hideMentionDropdown();
    }
}

async function handleThreadPaste(event) {
    if (!event || !event.clipboardData) return;
    const clipboardData = event.clipboardData;
    const images = [];

    if (clipboardData.items && clipboardData.items.length) {
        for (const item of clipboardData.items) {
            if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) images.push(file);
            }
        }
    }

    if (!images.length && clipboardData.files && clipboardData.files.length) {
        for (const file of clipboardData.files) {
            if (file.type && file.type.startsWith('image/')) {
                images.push(file);
            }
        }
    }

    if (!images.length) return;
    if (!currentProjectId) {
        alert('Vui lòng chọn project trước khi đính kèm ảnh.');
        return;
    }

    event.preventDefault();
    const textarea = event.target;
    const pastedText = clipboardData.getData('text/plain');
    if (pastedText) {
        insertTextAtCursor(textarea, pastedText);
    }

    for (const file of images) {
        await uploadThreadImage(file, textarea);
    }
}

async function uploadThreadImage(file, textarea) {
    if (!file || !textarea || !currentProjectId) return;
    const formData = new FormData();
    formData.append('project_id', currentProjectId);
    formData.append('file', file);

    try {
        const response = await apiCall('/threads/upload', 'POST', formData);
        if (response?.url) {
            const needsLeadingNewLine = textarea.value && !textarea.value.endsWith('\n');
            const placeholder = `${needsLeadingNewLine ? '\n' : ''}![image](${response.url})\n`;
            insertTextAtCursor(textarea, placeholder);
        }
    } catch (error) {
        console.error('Thread image upload failed:', error);
        alert('Không thể tải ảnh lên. Vui lòng thử lại.');
    }
}

function insertTextAtCursor(textarea, text) {
    if (!textarea || typeof text !== 'string') return;
    const value = textarea.value || '';
    const start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : value.length;
    const end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : value.length;

    textarea.value = value.slice(0, start) + text + value.slice(end);
    const newPos = start + text.length;
    if (typeof textarea.setSelectionRange === 'function') {
        textarea.setSelectionRange(newPos, newPos);
    } else {
        textarea.selectionStart = textarea.selectionEnd = newPos;
    }
    textarea.focus();
}

function attachThreadImageEvents() {
    const container = document.getElementById('threadMessages');
    if (!container) return;
    container.querySelectorAll('.thread-inline-image').forEach(img => {
        if (img.dataset.viewerBound === 'true') return;
        img.dataset.viewerBound = 'true';
        img.addEventListener('click', () => {
            openThreadImageViewer(img.getAttribute('src'), img.getAttribute('alt'));
        });
    });
}

function initThreadImageViewer() {
    const viewer = document.getElementById('threadImageViewer');
    const closeBtn = document.getElementById('closeThreadImageViewer');
    if (!viewer) return;

    viewer.addEventListener('click', (event) => {
        if (event.target === viewer || event.target.classList.contains('thread-image-viewer-backdrop')) {
            closeThreadImageViewer();
        }
    });
    closeBtn?.addEventListener('click', closeThreadImageViewer);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && viewer.style.display !== 'none') {
            closeThreadImageViewer();
        }
    });
}

function openThreadImageViewer(src, alt = '') {
    const viewer = document.getElementById('threadImageViewer');
    const img = document.getElementById('threadImageViewerImg');
    const caption = document.getElementById('threadImageViewerCaption');
    if (!viewer || !img || !caption) return;
    img.src = src || '';
    img.alt = alt || 'Preview';
    caption.textContent = alt || '';
    viewer.style.display = 'flex';
}

function closeThreadImageViewer() {
    const viewer = document.getElementById('threadImageViewer');
    const img = document.getElementById('threadImageViewerImg');
    const caption = document.getElementById('threadImageViewerCaption');
    if (!viewer || !img || !caption) return;
    viewer.style.display = 'none';
    img.src = '';
    caption.textContent = '';
}

function showMentionDropdown(query) {
    const dropdown = document.getElementById('mentionDropdown');
    if (!dropdown) return;

    // Filter users theo query
    const filteredUsers = users.filter(user => {
        if (!query) return true;
        const q = query.toLowerCase();
        const username = (user.username || '').toLowerCase();
        const fullName = (user.full_name || '').toLowerCase();
        return username.includes(q) || fullName.includes(q);
    });

    if (filteredUsers.length === 0) {
        hideMentionDropdown();
        return;
    }

    dropdown.innerHTML = filteredUsers.map((user, index) => {
        const userName = user.full_name || user.username || 'Unknown';
        const avatarUrl = user.avatar_url;
        let avatarHtml = '';
        if (avatarUrl) {
            avatarHtml = `<img src="${avatarUrl}" alt="${escapeHtml(userName)}" class="mention-item-avatar" onerror="onAvatarError(this,'mention-item-avatar-initials')">`;
        } else {
            const initials = userName.split(' ').map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('') || '👤';
            avatarHtml = `<div class="mention-item-avatar-initials">${initials}</div>`;
        }

        return `
            <div class="mention-item ${index === 0 ? 'selected' : ''}" data-user-id="${user.id}" data-username="${escapeHtml(user.username)}" data-full-name="${escapeHtml(userName)}">
                ${avatarHtml}
                <div class="mention-item-info">
                    <div class="mention-item-name">${escapeHtml(userName)}</div>
                    <div class="mention-item-username">@${escapeHtml(user.username)}</div>
                </div>
            </div>
        `;
    }).join('');

    dropdown.style.display = 'block';

    // Attach click handlers
    dropdown.querySelectorAll('.mention-item').forEach(item => {
        item.addEventListener('click', () => selectMention(item));
    });

    mentionState.selectedIndex = 0;
    updateMentionDropdownSelection();
}

function updateMentionDropdownSelection() {
    const dropdown = document.getElementById('mentionDropdown');
    if (!dropdown) return;

    const items = dropdown.querySelectorAll('.mention-item');
    items.forEach((item, index) => {
        if (index === mentionState.selectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

function selectMention(item) {
    const input = document.getElementById('threadInput');
    if (!input) return;

    const username = item.getAttribute('data-username');
    const fullName = item.getAttribute('data-full-name');
    const value = input.value;

    // Thay thế @query bằng @username
    const beforeMention = value.substring(0, mentionState.startPos);
    const afterMention = value.substring(mentionState.endPos);
    const newValue = beforeMention + '@' + username + ' ' + afterMention;

    input.value = newValue;

    // Set cursor position sau mention
    const newCursorPos = mentionState.startPos + username.length + 2; // +2 cho @ và space
    input.setSelectionRange(newCursorPos, newCursorPos);
    input.focus();

    hideMentionDropdown();
}

function hideMentionDropdown() {
    const dropdown = document.getElementById('mentionDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    mentionState.isActive = false;
    mentionState.query = '';
    mentionState.selectedIndex = 0;
}

// Task Comments Functions
let taskComments = [];
let commentAttachmentFile = null;

async function loadComments(taskId) {
    if (!taskId) return;

    const data = await apiCall(`/comments/?task_id=${taskId}`);
    if (data) {
        taskComments = data;
        renderComments();
    }
}

function renderComments() {
    const container = document.getElementById('commentsList');
    if (!container) return;

    if (taskComments.length === 0) {
        container.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-secondary); font-size: 14px;">Chưa có comment nào.</div>';
        return;
    }

    container.innerHTML = taskComments.map(comment => createCommentItem(comment)).join('');

    // Attach event listeners
    container.querySelectorAll('.comment-item-action').forEach(btn => {
        const action = btn.getAttribute('data-action');
        const commentId = parseInt(btn.getAttribute('data-comment-id'));
        if (action === 'edit') {
            btn.addEventListener('click', () => handleEditComment(commentId));
        } else if (action === 'delete') {
            btn.addEventListener('click', () => handleDeleteComment(commentId));
        }
    });

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function createCommentItem(comment) {
    const user = comment.user || {};
    const authorName = user.full_name || user.username || 'Unknown';
    const avatarUrl = user.avatar_url;
    const isAuthor = comment.user_id === currentUser?.id;
    const isProjectOwner = currentProject?.owner_id === currentUser?.id;
    const canEdit = isAuthor;
    const canDelete = isAuthor || isProjectOwner;

    // Avatar HTML
    let avatarHtml = '';
    if (avatarUrl) {
        avatarHtml = `<img src="${avatarUrl}" alt="${escapeHtml(authorName)}" class="comment-item-avatar" onerror="onAvatarError(this,'comment-item-avatar-initials')">`;
    } else {
        const initials = (authorName || 'U').split(' ').map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('') || '👤';
        avatarHtml = `<div class="comment-item-avatar-initials">${initials}</div>`;
    }

    // Time display
    const timeStr = formatCommentTime(comment.created_at);
    const editedStr = comment.is_edited ? '<span style="font-size: 11px; color: var(--text-secondary); font-style: italic; margin-left: 8px;">(đã chỉnh sửa)</span>' : '';

    // Attachment HTML
    let attachmentHtml = '';
    if (comment.attachment_url && !comment.is_deleted) {
        attachmentHtml = `
            <div class="comment-item-attachment">
                <img src="${comment.attachment_url}" alt="Attachment" onclick="window.open('${comment.attachment_url}', '_blank')">
            </div>
        `;
    }

    // Actions HTML
    let actionsHtml = '';
    if ((canEdit || canDelete) && !comment.is_deleted) {
        actionsHtml = '<div class="comment-item-actions">';
        if (canEdit) {
            actionsHtml += `<button class="comment-item-action" data-action="edit" data-comment-id="${comment.id}">Sửa</button>`;
        }
        if (canDelete) {
            actionsHtml += `<button class="comment-item-action danger" data-action="delete" data-comment-id="${comment.id}">Xóa</button>`;
        }
        actionsHtml += '</div>';
    }

    return `
        <div class="comment-item">
            ${avatarHtml}
            <div class="comment-item-content">
                <div class="comment-item-header">
                    <span class="comment-item-author">${escapeHtml(authorName)}</span>
                    <span class="comment-item-time">${timeStr}</span>
                    ${editedStr}
                </div>
                <div class="comment-item-text">${linkifyText(comment.content)}</div>
                ${attachmentHtml}
                ${actionsHtml}
            </div>
        </div>
    `;
}

function formatCommentTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;

    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function handleAddComment() {
    const taskId = document.getElementById('taskId').value;
    if (!taskId) {
        alert('Vui lòng lưu task trước khi thêm comment!');
        return;
    }

    const content = document.getElementById('newCommentContent').value.trim();
    if (!content && !commentAttachmentFile) {
        alert('Vui lòng nhập nội dung hoặc đính kèm file!');
        return;
    }

    // Tạo comment
    const commentData = {
        task_id: parseInt(taskId),
        content: content || '(Không có nội dung)'
    };

    const comment = await apiCall('/comments/', 'POST', commentData);
    if (comment) {
        // Upload attachment nếu có
        if (commentAttachmentFile) {
            await uploadCommentAttachment(comment.id, commentAttachmentFile);
        }

        // Clear form
        document.getElementById('newCommentContent').value = '';
        commentAttachmentFile = null;
        document.getElementById('commentAttachmentPreview').style.display = 'none';
        document.getElementById('commentAttachmentInput').value = '';

        // Reload comments
        await loadComments(parseInt(taskId));
        if (currentProjectId) {
            await loadActivities(currentProjectId);
        }
    }
}

async function uploadCommentAttachment(commentId, file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`/api/comments/${commentId}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload thất bại');
        }

        return await response.json();
    } catch (error) {
        console.error('Upload Error:', error);
        alert('Có lỗi xảy ra khi upload file: ' + error.message);
        return null;
    }
}

function handleCommentAttachmentPreview(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Chỉ chấp nhận file ảnh!');
        return;
    }

    commentAttachmentFile = file;
    const preview = document.getElementById('commentAttachmentPreview');
    const reader = new FileReader();

    reader.onload = (e) => {
        preview.innerHTML = `
            <img src="${e.target.result}" alt="Preview">
            <div class="remove-attachment" onclick="removeCommentAttachment()">Xóa đính kèm</div>
        `;
        preview.style.display = 'block';
    };

    reader.readAsDataURL(file);
}

function removeCommentAttachment() {
    commentAttachmentFile = null;
    document.getElementById('commentAttachmentPreview').style.display = 'none';
    document.getElementById('commentAttachmentInput').value = '';
}

async function handleEditComment(commentId) {
    const comment = taskComments.find(c => c.id === commentId);
    if (!comment) return;

    const newContent = prompt('Sửa comment:', comment.content);
    if (newContent === null || newContent.trim() === '') return;

    const data = await apiCall(`/comments/${commentId}`, 'PUT', {
        content: newContent.trim()
    });

    if (data) {
        const taskId = document.getElementById('taskId').value;
        await loadComments(parseInt(taskId));
    }
}

async function handleDeleteComment(commentId) {
    if (!confirm('Bạn có chắc chắn muốn xóa comment này không?')) {
        return;
    }

    const data = await apiCall(`/comments/${commentId}`, 'DELETE');
    if (data) {
        const taskId = document.getElementById('taskId').value;
        await loadComments(parseInt(taskId));
        if (currentProjectId) {
            await loadActivities(currentProjectId);
        }
    }
}

// Activity Log Functions
let projectActivities = [];
let activityPollingInterval = null;
const ACTIVITY_POLL_INTERVAL = 5000; // 5 giây
