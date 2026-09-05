// ──────────────────────────────────────────────────────────────────
// notifications.js — Notification polling, rendering, actions
// ──────────────────────────────────────────────────────────────────
async function loadNotificationCount() {
    if (!currentUser) return;

    try {
        const data = await apiCall('/notifications/unread-count');
        if (data && data.count > 0) {
            const badge = document.getElementById('notificationBadge');
            if (badge) {
                badge.textContent = data.count > 99 ? '99+' : data.count;
                badge.style.display = 'flex';
            }
        } else {
            const badge = document.getElementById('notificationBadge');
            if (badge) {
                badge.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error loading notification count:', error);
    }
}

async function loadNotifications() {
    if (!currentUser) return;

    try {
        const notifications = await apiCall('/notifications/?limit=50');
        renderNotifications(notifications || []);
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function renderNotifications(notifications) {
    const container = document.getElementById('notificationsList');
    if (!container) return;

    if (!notifications || notifications.length === 0) {
        container.innerHTML = '<div class="empty-state">Không có thông báo nào</div>';
        return;
    }

    notificationsIndex = new Map(notifications.map(notif => [Number(notif.id), notif]));
    container.onclick = (event) => {
        const item = event.target.closest('.notification-item');
        if (!item) return;
        handleNotificationClick(Number(item.dataset.notifId), item);
    };

    container.innerHTML = notifications.map(notif => {
        const timeAgo = getTimeAgo(new Date(notif.created_at));
        const readClass = notif.is_read ? 'read' : 'unread';

        let icon = 'notifications';

        if (notif.type === 'task_assigned') {
            icon = 'person_add';
        } else if (notif.type === 'task_updated') {
            icon = 'edit_square';
        } else if (notif.type === 'mentioned') {
            icon = 'alternate_email';
        } else if (notif.type === 'deadline_reminder') {
            icon = 'alarm';
        } else if (notif.type === 'meeting_assigned') {
            icon = 'group_add';
        } else if (notif.type === 'meeting_session_open') {
            icon = 'event_available';
        }

        return `
            <div class="notification-item ${readClass}" data-notif-id="${notif.id}">
                <div class="notification-content">
                    <div class="notification-title">
                        <span class="notification-title-icon"><span class="material-symbols-outlined">${icon}</span></span>
                        ${escapeHtml(notif.title)}
                    </div>
                    <div class="notification-message">${escapeHtml(notif.message)}</div>
                    <div class="notification-time">${timeAgo}</div>
                </div>
                ${!notif.is_read ? '<div class="notification-unread-dot"></div>' : ''}
            </div>
        `;
    }).join('');
}

async function handleNotificationClick(notificationId, el) {
    const notif = notificationsIndex.get(Number(notificationId));
    if (!notif) return;

    if (notif.type === 'meeting_session_open') {
        if (notif.meeting_id && notif.session_id) {
            await openPmSessionFromNotification(Number(notif.meeting_id), Number(notif.session_id));
        } else {
            await openPmSessionFromNotificationFallback(notif);
        }
    } else if (notif.type === 'meeting_assigned') {
        switchView('personal');
        showPersonalSection('meeting');
    } else if (notif.type === 'mentioned') {
        if (notif.thread_id && notif.project_id) {
            openThreadFromNotification(notif.project_id, notif.thread_id);
        } else if (notif.project_id) {
            selectProject(notif.project_id);
        }
    } else if (notif.task_id) {
        openTaskFromNotification(notif.task_id);
    } else if (notif.project_id) {
        selectProject(notif.project_id);
    }

    await markNotificationAsRead(notificationId, el);
}

async function openPmSessionFromNotificationFallback(notif) {
    const parsed = parseMeetingSessionNotificationMessage(notif.message || '');
    const meetingsData = await apiCall('/periodic-meetings/');
    if (!meetingsData?.length) {
        switchView('personal');
        showPersonalSection('meeting');
        return;
    }

    const meeting = parsed.meetingTitle
        ? meetingsData.find(m => normalizeText(m.title) === normalizeText(parsed.meetingTitle))
        : null;
    const candidateMeeting = meeting || meetingsData[0];
    const sessions = await apiCall(`/periodic-meetings/${candidateMeeting.id}/sessions`);
    const session = parsed.sessionTitle
        ? sessions?.find(s => normalizeText(s.title) === normalizeText(parsed.sessionTitle))
        : sessions?.find(s => s.status === 'open');

    if (candidateMeeting?.id && session?.id) {
        await openPmSessionFromNotification(candidateMeeting.id, session.id);
    } else {
        switchView('personal');
        showPersonalSection('meeting');
    }
}

function parseMeetingSessionNotificationMessage(message) {
    const match = message.match(/Phiên\s+"([^"]+)"\s+\(([^)]+)\)/i);
    return {
        sessionTitle: match?.[1] || '',
        meetingTitle: match?.[2] || '',
    };
}

function openTaskFromNotification(taskId) {
    const task = tasks.find(t => t.id === taskId) || dashboardTasks.find(t => t.id === taskId);
    if (task) {
        if (task.project_id) {
            currentProjectId = task.project_id;
            switchView('board');
            setTimeout(() => {
                openTaskModal(task);
            }, 300);
        } else {
            openTaskModal(task);
        }
    }
}

function openThreadFromNotification(projectId, threadId) {
    // Thread tab is temporarily hidden from the board UI.
    // Keep the notification routing on the related project board instead of activating dormant thread UI.
    if (projectId) {
        currentProjectId = projectId;
        switchView('board');
        switchBoardTab('status');
    }
}

async function markAllNotificationsAsRead() {
    try {
        await apiCall('/notifications/read-all', 'PUT');
        const container = document.getElementById('notificationsList');
        if (container) {
            const items = container.querySelectorAll('.notification-item');
            items.forEach((el, i) => {
                setTimeout(() => {
                    el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                    el.style.opacity = '0';
                    el.style.transform = 'translateX(16px)';
                }, i * 40);
            });
            setTimeout(() => {
                container.innerHTML = '<div class="empty-state">Không có thông báo nào</div>';
            }, items.length * 40 + 250);
        }
        loadNotificationCount();
    } catch (error) {
        console.error('Error marking all as read:', error);
    }
}

async function markNotificationAsRead(notificationId, el) {
    try {
        await apiCall(`/notifications/${notificationId}/read`, 'PUT');
        if (el) {
            const h = el.offsetHeight;
            el.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
            el.style.opacity = '0';
            el.style.transform = 'translateX(20px)';
            setTimeout(() => {
                el.style.transition = 'max-height 0.28s ease, padding 0.28s ease, margin 0.28s ease';
                el.style.overflow = 'hidden';
                el.style.maxHeight = h + 'px';
                requestAnimationFrame(() => {
                    el.style.maxHeight = '0';
                    el.style.paddingTop = '0';
                    el.style.paddingBottom = '0';
                    el.style.marginBottom = '0';
                });
                setTimeout(() => {
                    el.remove();
                    const container = document.getElementById('notificationsList');
                    if (container && container.querySelectorAll('.notification-item').length === 0) {
                        container.innerHTML = '<div class="empty-state">Không có thông báo nào</div>';
                    }
                }, 300);
            }, 230);
        }
        loadNotificationCount();
    } catch (error) {
        console.error('Error marking as read:', error);
    }
}
