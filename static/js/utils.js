// ──────────────────────────────────────────────────────────────────
// utils.js — Shared helpers (toast, API, formatting, escaping)
// ──────────────────────────────────────────────────────────────────
function onAvatarError(img, fallbackClass) {
    img.onerror = null; // prevent infinite loop
    const name = (img.alt && img.alt !== 'Avatar') ? img.alt : (img.dataset.name || '?');
    const initials = name.split(' ').filter(Boolean).map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('') || '?';
    const cls = fallbackClass || img.dataset.fallbackClass || 'user-avatar';

    if (cls === '__parent__') {
        // img is inside a styled wrapper — just put initials in the parent
        img.parentNode.textContent = initials;
    } else {
        const div = document.createElement('div');
        div.className = cls;
        if (img.style.cssText) div.style.cssText = img.style.cssText;
        div.textContent = initials;
        img.parentNode.replaceChild(div, img);
    }
}

// Version Management - Auto update check
function showToast(msg, type = 'info') {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.12);max-width:400px;word-break:break-word;transition:opacity .3s;background:${type==='error'?'#dc2626':'#2563eb'};color:#fff;`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
}

// API Functions
async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {}
    };

    const token = localStorage.getItem('pm_token');
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
    if (!isFormData) {
        options.headers['Content-Type'] = 'application/json';
    }

    if (data) {
        options.body = isFormData ? data : JSON.stringify(data);
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        if (response.status === 401) {
            forceLogout();
            return null;
        }
        if (!response.ok) {
            let errorDetail = '';
            try {
                const errorJson = await response.clone().json();
                if (errorJson?.detail) {
                    errorDetail = typeof errorJson.detail === 'string'
                        ? errorJson.detail
                        : JSON.stringify(errorJson.detail);
                } else if (Object.keys(errorJson || {}).length) {
                    errorDetail = JSON.stringify(errorJson);
                }
            } catch (_) {
                try {
                    errorDetail = await response.clone().text();
                } catch (_) {
                    // ignore
                }
            }
            const statusText = response.statusText || 'Error';
            throw new Error(`HTTP ${response.status} - ${statusText}${errorDetail ? `: ${errorDetail}` : ''}`);
        }
        if (response.status === 204) return {};
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        showToast('Lỗi: ' + error.message, 'error');
        return null;
    }
}

// Projects
function getStatusColor(status) {
    switch (status) {
        case 'todo':
            return '#93c5fd';
        case 'in_progress':
            return '#fcd34d';
        case 'done':
            return '#6ee7b7';
        default:
            return '#e5e7eb';
    }
}

function getTaskStatusLabel(status, task) {
    if (status === 'in_progress' && task?.period_end) {
        const end = new Date(task.period_end);
        end.setHours(23, 59, 59, 999);
        if (new Date() > end) return 'Trễ hạn';
    }
    const statusMap = {
        todo: 'Chưa thực hiện',
        in_progress: 'Đang thực hiện',
        done: 'Hoàn thành'
    };
    return statusMap[status] || statusMap.todo;
}

function getTaskFrequencyLabel(frequency, taskType) {
    if (taskType === 'one_time' || (!frequency && taskType !== 'recurring')) return 'Phát sinh';
    const frequencyMap = {
        weekly: 'Hàng tuần',
        monthly: 'Hàng tháng',
        quarterly: 'Hàng quý',
        semiannual: '6 tháng',
        yearly: 'Hàng năm'
    };
    return frequencyMap[frequency] || 'Lặp lại';
}

function getTaskPeriodText(task) {
    const start = task.period_start || task.created_at;
    const end = task.period_end || task.due_date;
    if (!start && !end) return 'Chưa có kỳ hạn';
    if (!start) return `Đến ${formatDateDisplay(end)}`;
    if (!end) return `Từ ${formatDateDisplay(start)}`;
    return `${formatDateDisplay(start)} - ${formatDateDisplay(end)}`;
}

function normalizeDateInput(value) {
    if (!value) return null;
    const trimmed = value.trim();

    let day;
    let month;
    let year;

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
        [day, month, year] = trimmed.split('/');
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        [year, month, day] = trimmed.split('-');
    } else {
        const parsedDate = new Date(trimmed);
        if (Number.isNaN(parsedDate.getTime())) {
            console.warn('Không thể parse ngày hạn project:', value);
            return null;
        }
        year = parsedDate.getFullYear().toString();
        month = String(parsedDate.getMonth() + 1).padStart(2, '0');
        day = String(parsedDate.getDate()).padStart(2, '0');
    }

    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    if (![dayNum, monthNum, yearNum].every(Number.isFinite)) {
        console.warn('Ngày không hợp lệ:', value);
        return null;
    }

    const utcDate = new Date(Date.UTC(yearNum, monthNum - 1, dayNum, 0, 0, 0));
    if (
        Number.isNaN(utcDate.getTime()) ||
        utcDate.getUTCFullYear() !== yearNum ||
        utcDate.getUTCMonth() + 1 !== monthNum ||
        utcDate.getUTCDate() !== dayNum
    ) {
        console.warn('Ngày không tồn tại:', value);
        return null;
    }

    const normalizedYear = String(yearNum).padStart(4, '0');
    const normalizedMonth = String(monthNum).padStart(2, '0');
    const normalizedDay = String(dayNum).padStart(2, '0');
    return `${normalizedYear}-${normalizedMonth}-${normalizedDay}T00:00:00Z`;
}

function toDateInputValue(value) {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function fromDateInputValue(value) {
    return value ? `${value}T00:00:00` : null;
}

function formatDateDisplay(dateValue) {
    if (!dateValue) return '--';
    // Nếu là Date object, dùng trực tiếp
    if (dateValue instanceof Date) {
        if (Number.isNaN(dateValue.getTime())) return '--';
        return dateValue.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    // Nếu là string, chuẩn hóa trước khi parse
    const normalized = String(dateValue).replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getProgressColor(progress) {
    if (progress <= 0) return '#CE2525';
    if (progress >= 100) return '#00FF7F';
    return '#FFB703';
}

function getProgressTextColor(progress) {
    if (progress <= 0) return '#CE2525';
    return '#1F2937';
}

// Utility
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return div.textContent || '';
}

function linkifyText(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(
        /(?:https?:\/\/)[^\s<>&"']+/gi,
        url => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--primary-color);text-decoration:underline;word-break:break-all;">${url}</a>`
    );
}

function getLocalDateKey(dateValue) {
    if (!dateValue) return null;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isSafeImageUrl(url) {
    if (!url) return false;
    const trimmed = url.trim();
    return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/static/');
}

function escapeAttribute(value) {
    return (value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function normalizeText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    if (hours < 24) return `${hours} giờ trước`;
    if (days < 7) return `${days} ngày trước`;
    return date.toLocaleDateString('vi-VN');
}

function formatDateVI(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
