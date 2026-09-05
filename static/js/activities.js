// ──────────────────────────────────────────────────────────────────
// activities.js — Activity log, polling, timeline grouping
// ──────────────────────────────────────────────────────────────────
async function loadActivities(projectId) {
    if (!projectId) {
        document.getElementById('projectSummarySection').style.display = 'none';
        return;
    }

    projectActivities = [];
    renderProjectGoals();
    await loadProjectMembers(projectId);

    // Fetch actual activity log from API
    try {
        const data = await apiCall(`/activities/?project_id=${projectId}&limit=40`);
        projectActivities = Array.isArray(data) ? data : [];
    } catch (e) {
        projectActivities = [];
    }
    renderActivities();
}

function renderActivities() {
    const container = document.getElementById('projectActivityList');
    if (!container) return;

    if (projectActivities.length === 0) {
        container.innerHTML = '<div class="project-members-empty">Chưa có hoạt động nào.</div>';
        return;
    }

    const grouped = groupActivitiesByDate(projectActivities);

    container.innerHTML = Object.entries(grouped).map(([dateLabel, activities]) => `
        <div class="activity-group">
            <div class="activity-group-header">${dateLabel}</div>
            ${activities.map(activity => createActivityItem(activity)).join('')}
        </div>
    `).join('');

    // Attach click listeners
    container.querySelectorAll('.activity-item').forEach(item => {
        item.addEventListener('click', () => {
            const entityType = item.getAttribute('data-entity-type');
            const entityId = parseInt(item.getAttribute('data-entity-id'));
            if (entityType === 'task') {
                const task = tasks.find(t => t.id === entityId);
                if (task) {
                    openTaskModal(task, !canEditTask(task));
                }
            }
        });
    });
}

function groupActivitiesByDate(activities) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const grouped = {};

    activities.forEach(activity => {
        const date = new Date(activity.created_at);
        let label = '';

        if (date >= today) {
            label = 'Hôm nay';
        } else if (date >= yesterday) {
            label = 'Hôm qua';
        } else if (date >= weekAgo) {
            label = 'Tuần này';
        } else {
            label = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }

        if (!grouped[label]) {
            grouped[label] = [];
        }
        grouped[label].push(activity);
    });

    return grouped;
}

function createActivityItem(activity) {
    const user = activity.user || {};
    const authorName = user.full_name || user.username || 'Unknown';
    const avatarUrl = user.avatar_url;

    let avatarHtml = '';
    if (avatarUrl) {
        avatarHtml = `<img src="${avatarUrl}" alt="${escapeHtml(authorName)}" class="activity-item-avatar" onerror="onAvatarError(this,'activity-item-avatar-initials')">`;
    } else {
        const initials = (authorName || 'U').split(' ').map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('') || 'U';
        avatarHtml = `<div class="activity-item-avatar-initials">${initials}</div>`;
    }

    const iconMap = {
        task_created: 'add_task',
        task_updated: 'edit_square',
        task_status_changed: 'sync_alt',
        task_completed: 'task_alt',
        task_assigned: 'person_add',
        comment_added: 'chat',
        subtask_completed: 'check_circle'
    };
    const icon = iconMap[activity.activity_type] || 'flag';
    const timeStr = formatActivityTime(activity.created_at);

    return `
        <div class="activity-item" data-entity-type="${activity.entity_type}" data-entity-id="${activity.entity_id}">
            ${avatarHtml}
            <div class="activity-item-icon ${activity.activity_type}"><span class="material-symbols-outlined">${icon}</span></div>
            <div class="activity-item-content">
                <div class="activity-item-text">${escapeHtml(activity.description)}</div>
                <div class="activity-item-time">${timeStr}</div>
            </div>
        </div>
    `;
}

function formatActivityTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;

    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function startActivityPolling(projectId) {
    // Dừng polling cũ nếu có
    stopActivityPolling();

    // Poll mỗi 5 giây để cập nhật activities
    activityPollingInterval = setInterval(() => {
        if (currentProjectId === projectId) {
            loadActivities(projectId);
        } else {
            stopActivityPolling();
        }
    }, ACTIVITY_POLL_INTERVAL);
}

function stopActivityPolling() {
    if (activityPollingInterval) {
        clearInterval(activityPollingInterval);
        activityPollingInterval = null;
    }
}
