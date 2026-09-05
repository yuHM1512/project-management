// ──────────────────────────────────────────────────────────────────
// projects.js — Project CRUD, modal, members, objectives, goals
// ──────────────────────────────────────────────────────────────────
async function loadProjects() {
    const data = await apiCall('/projects/');
    if (data) {
        projects = data;
        updateProjectObjectiveFilterOptions();
        renderProjects();
        updateProjectSelect();
    }
}

function renderProjects() {
    const container = document.getElementById('projectsGrid');
    if (!container) return;

    const filteredProjects = currentProjectObjectiveFilter
        ? projects.filter((project) => (project.objective_group || '') === currentProjectObjectiveFilter)
        : [...projects];

    if (filteredProjects.length === 0) {
        container.innerHTML = '<div class="empty-state">Không có dự án phù hợp với bộ lọc hiện tại.</div>';
        return;
    }

    const groupedProjects = filteredProjects.reduce((acc, project) => {
        const groupName = project.objective_group || 'Chưa gắn mục tiêu chất lượng';
        if (!acc[groupName]) {
            acc[groupName] = [];
        }
        acc[groupName].push(project);
        return acc;
    }, {});

    const sortedGroupNames = Object.keys(groupedProjects).sort((a, b) => a.localeCompare(b, 'vi'));
    container.innerHTML = sortedGroupNames.map((groupName) => `
        <section class="project-group-section">
            <div class="project-group-title">${escapeHtml(groupName)}</div>
            <div class="projects-grid">
                ${groupedProjects[groupName]
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'))
                    .map((project) => renderProjectCard(project))
                    .join('')}
            </div>
        </section>
    `).join('');
}

function renderProjectCard(project) {
    return `
        <div class="project-card" onclick="if(!event.target.closest('.project-card-actions')) selectProject(${project.id})">
            <div class="project-card-actions">
                <button
                    type="button"
                    class="project-card-edit-btn"
                    aria-label="Chỉnh sửa dự án"
                    title="Chỉnh sửa dự án"
                    onclick="openProjectEditModal(${project.id})"
                >
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button
                    type="button"
                    class="project-card-delete-btn"
                    aria-label="Xoá dự án"
                    title="Xoá dự án"
                    onclick="deleteProject(${project.id})"
                >
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </div>
            <div class="project-card-header">
                <div class="project-color" style="background: ${project.color}"></div>
                <h3>${escapeHtml(project.name)}</h3>
            </div>
            <p>${escapeHtml(project.description || 'Chưa có mô tả')}</p>
            <div class="project-meta">
                <span>${escapeHtml(project.status || 'active')}</span>
                ${project.objective_description ? `<span>${escapeHtml(project.objective_description)}</span>` : ''}
            </div>
        </div>
    `;
}

function openProjectEditModal(projectId, event) {
    if (event) {
        event.stopPropagation();
    }
    const project = projects.find((item) => item.id === projectId);
    if (project) {
        openProjectModal(project);
    }
}

async function deleteProject(projectId) {
    const projectName = projects.find(p => p.id === projectId)?.name || `#${projectId}`;
    if (!confirm(`Xoá dự án "${projectName}"?\n\nToàn bộ task, sub task, work log, bình luận và dữ liệu liên quan sẽ bị xoá vĩnh viễn.`)) return;
    const result = await apiCall(`/projects/${projectId}`, 'DELETE');
    if (result) {
        projects = projects.filter(p => p.id !== projectId);
        if (currentProjectId === projectId) {
            currentProjectId = projects[0]?.id || null;
        }
        renderProjects();
    }
}

function updateProjectObjectiveFilterOptions() {
    const filterSelect = document.getElementById('projectObjectiveFilter');
    if (!filterSelect) return;

    const currentValue = currentProjectObjectiveFilter;
    const uniqueGroups = [...new Set(projects.map((project) => project.objective_group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));

    filterSelect.innerHTML = '<option value="">Tất cả mục tiêu chất lượng</option>' +
        uniqueGroups.map((groupName) => `<option value="${escapeHtml(groupName)}">${escapeHtml(groupName)}</option>`).join('');

    filterSelect.value = uniqueGroups.includes(currentValue) ? currentValue : '';
    currentProjectObjectiveFilter = filterSelect.value;
}

function handleProjectObjectiveFilterChange(event) {
    currentProjectObjectiveFilter = event.target.value || '';
    renderProjects();
}

// Function removed - sidebar projects list has been removed
// function renderProjectsSidebar() {
//     const container = document.getElementById('projectsList');
//     if (!container) return;
//
//     container.innerHTML = projects.slice(0, 10).map(project => `
//         <li>
//             <a href="#" onclick="selectProject(${project.id}); return false;">
//                 <span style="color: ${project.color}">●</span> ${escapeHtml(project.name)}
//             </a>
//         </li>
//     `).join('');
// }

function updateProjectSelect() {
    const select = document.getElementById('projectSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Select Project</option>' +
        projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

async function selectProject(projectId, skipViewSwitch = false) {
    currentProjectId = projectId;
    updateRecentProjectsVisibility();
    const projectSelectEl = document.getElementById('projectSelect');
    if (projectSelectEl) {
        projectSelectEl.value = projectId;
    }

    // Tìm trong cache trước
    let projectDetail = projects.find(p => p.id === projectId) || null;
    try {
        const freshProject = await apiCall(`/projects/${projectId}`);
        if (freshProject) {
            projectDetail = freshProject;
            const existingIndex = projects.findIndex(p => p.id === projectId);
            if (existingIndex >= 0) {
                projects[existingIndex] = freshProject;
            } else {
                projects.push(freshProject);
            }
        }
    } catch (error) {
        console.error('Failed to load project details:', error);
    }

    currentProject = projectDetail;
    currentProjectIsOwner = currentProject ? currentProject.owner_id === currentUser?.id : false;
    updateTaskButtonState();
    updateProjectSummaryInfo();

    if (!skipViewSwitch) {
        switchView('board');
    } else {
        updateURL('board', { projectId });
    }

    await loadTasks(projectId, false);
    await loadActivities(projectId);

    document.getElementById('projectSummarySection').style.display = 'grid';
}

async function createProject(projectData) {
    const data = await apiCall('/projects/', 'POST', projectData);
    if (data) {
        await syncProjectTeamMembers(data.id);
        await Promise.all([loadProjects(), loadDashboard()]);
        closeProjectModal();
    }
}

async function updateProject(projectId, projectData) {
    const data = await apiCall(`/projects/${projectId}`, 'PUT', projectData);
    if (data) {
        await syncProjectTeamMembers(projectId);
        await Promise.all([loadProjects(), loadDashboard()]);
        if (currentProjectId === projectId) {
            currentProject = data;
            updateProjectSummaryInfo();
            await loadProjectMembers(projectId);
        }
        closeProjectModal();
    }
}

// Tasks
async function openProjectModal(project = null) {
    const modal = document.getElementById('projectModal');
    const form = document.getElementById('projectForm');
    const modalContent = modal?.querySelector('.modal-content');

    // Load project types, MTCL and users into dropdowns/pickers
    await Promise.all([loadProjectTypes(), loadProjectObjectives(), loadUsers()]);

    if (project) {
        projectModalOwnerId = project.owner_id || currentUser?.id || null;
        document.getElementById('projectModalTitle').textContent = 'Chỉnh sửa dự án';
        document.getElementById('projectId').value = project.id;
        document.getElementById('projectName').value = project.name;
        document.getElementById('projectDescription').value = project.description || '';
        document.getElementById('projectColor').value = project.color || '#2563eb';
        document.getElementById('projectType').value = project.project_type_id || '';
        document.getElementById('projectObjectiveGroup').value = project.objective_group || '';
        syncProjectObjectiveSelection(project.objective_description || '');
        if (project.due_date) {
            const due = new Date(project.due_date);
            document.getElementById('projectDueDate').value = due.toISOString().slice(0, 10);
        } else {
            document.getElementById('projectDueDate').value = '';
        }
        projectModalTeamMembers = await fetchProjectTeamMembers(project.id);
    } else {
        projectModalOwnerId = currentUser?.id || null;
        document.getElementById('projectModalTitle').textContent = 'Tạo dự án';
        form.reset();
        document.getElementById('projectId').value = '';
        document.getElementById('projectColor').value = '#2563eb';
        document.getElementById('projectType').value = '';
        document.getElementById('projectObjectiveGroup').value = '';
        syncProjectObjectiveSelection();
        document.getElementById('projectDueDate').value = '';
        projectModalTeamMembers = [];
    }

    renderProjectMemberPicker(project);
    modal.classList.add('active');
    if (modalContent) {
        modalContent.scrollTop = 0;
    }
}

async function fetchProjectTeamMembers(projectId) {
    if (!projectId) return [];
    const data = await apiCall(`/teams/project/${projectId}`);
    return Array.isArray(data) ? data : [];
}

function getProjectModalOwnerId(project = null) {
    return project?.owner_id || projectModalOwnerId || currentUser?.id || null;
}

function renderProjectMemberPicker(project = null) {
    const container = document.getElementById('projectMemberPickerItems');
    const count = document.getElementById('projectMemberPickerCount');
    const searchInput = document.getElementById('projectMemberSearch');
    if (!container) return;

    const ownerId = getProjectModalOwnerId(project);
    const selectedIds = new Set((projectModalTeamMembers || []).map(member => member.user_id));
    if (ownerId) selectedIds.add(ownerId);

    if (!users.length) {
        container.innerHTML = '<div class="empty-state">Chưa có user nào trong hệ thống.</div>';
        if (count) count.textContent = '0 thành viên';
        return;
    }

    function getLastName(fullName) {
        if (!fullName) return '';
        const parts = fullName.trim().split(/\s+/);
        return parts[parts.length - 1];
    }

    const sortedUsers = users.slice().sort((a, b) => {
        if (a.id === ownerId) return -1;
        if (b.id === ownerId) return 1;
        const nameA = getLastName(a.full_name) || a.username || '';
        const nameB = getLastName(b.full_name) || b.username || '';
        return nameA.localeCompare(nameB, 'vi');
    });

    function renderList(query) {
        const q = (query || '').toLowerCase().trim();
        const filtered = q ? sortedUsers.filter(u => {
            const full = (u.full_name || '').toLowerCase();
            const code = (u.username || '').toLowerCase();
            const lastName = getLastName(u.full_name).toLowerCase();
            return lastName.includes(q) || full.includes(q) || code.includes(q);
        }) : sortedUsers;

        if (!filtered.length) {
            container.innerHTML = '<div class="empty-state">Không tìm thấy nhân viên.</div>';
            return;
        }

        container.innerHTML = filtered.map(user => {
            const name = escapeHtml(user.full_name || user.username || `User ${user.id}`);
            const code = escapeHtml(user.username || `U${user.id}`);
            const isOwner = user.id === ownerId;
            const checked = document.querySelector(`.project-member-picker-input[value="${user.id}"]`)?.checked ?? selectedIds.has(user.id);
            const label = `${name} (${code})${isOwner ? ' · Owner' : ''}`;
            return `<label class="assignee-checkbox${isOwner ? ' is-owner' : ''}">
                <input type="checkbox" value="${user.id}" class="project-member-picker-input assignee-checkbox-input" ${checked ? 'checked' : ''} ${isOwner ? 'disabled' : ''}>
                <span class="assignee-checkbox-label">
                    <span class="assignee-name-text">${label}</span>
                </span>
            </label>`;
        }).join('');

        container.querySelectorAll('.project-member-picker-input').forEach(input => {
            input.addEventListener('change', updateProjectMemberPickerCount);
        });
    }

    renderList('');
    updateProjectMemberPickerCount();

    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = () => renderList(searchInput.value);
    }
}

function getSelectedProjectMemberIds() {
    const ids = Array.from(document.querySelectorAll('.project-member-picker-input:checked'))
        .map(input => Number(input.value))
        .filter(Boolean);
    const ownerId = getProjectModalOwnerId();
    if (ownerId && !ids.includes(ownerId)) ids.push(ownerId);
    return ids;
}

function updateProjectMemberPickerCount() {
    const count = document.getElementById('projectMemberPickerCount');
    if (!count) return;
    const total = getSelectedProjectMemberIds().length;
    count.textContent = `${total} thành viên`;
}

async function syncProjectTeamMembers(projectId) {
    if (!projectId) return;
    const selectedIds = new Set(getSelectedProjectMemberIds());
    const ownerId = getProjectModalOwnerId();
    if (ownerId) selectedIds.delete(ownerId);

    const currentMembers = await fetchProjectTeamMembers(projectId);
    const currentByUserId = new Map(currentMembers.map(member => [member.user_id, member]));

    const addJobs = Array.from(selectedIds)
        .filter(userId => !currentByUserId.has(userId))
        .map(userId => apiCall('/teams/', 'POST', { project_id: projectId, user_id: userId, role: 'member' }));

    const removeJobs = currentMembers
        .filter(member => member.user_id !== ownerId && !selectedIds.has(member.user_id))
        .map(member => apiCall(`/teams/${member.id}`, 'DELETE'));

    await Promise.all([...addJobs, ...removeJobs]);
}

function localizeProjectModal() {
    const formGroups = Array.from(document.querySelectorAll('#projectModal .form-group'));
    if (formGroups.length < 7) return;

    const [nameGroup, descriptionGroup, typeGroup, objectiveGroup, objectiveDescriptionGroup, dueDateGroup, colorGroup, membersGroup] = formGroups;
    const setGroupLabel = (group, text) => {
        const label = group?.querySelector('label');
        if (label) {
            label.textContent = text;
        }
    };
    const setHint = (group, text) => {
        const hint = group?.querySelector('.input-hint');
        if (hint) {
            hint.textContent = text;
        }
    };

    setGroupLabel(nameGroup, 'Tên dự án');
    setGroupLabel(descriptionGroup, 'Mô tả dự án');
    setGroupLabel(typeGroup, 'Loại dự án');
    setHint(typeGroup, 'Phân loại dự án theo cấp độ (Công ty / Phòng ban).');

    const objectiveLabels = objectiveGroup?.querySelectorAll('label') || [];
    if (objectiveLabels.length > 1) {
        objectiveLabels[0].remove();
    }
    setGroupLabel(objectiveGroup, 'Mục tiêu chất lượng');
    setHint(objectiveGroup, 'Bước 1: chọn mục tiêu chất lượng duy nhất.');

    setGroupLabel(objectiveDescriptionGroup, 'Mô tả mục tiêu chất lượng');
    setHint(objectiveDescriptionGroup, 'Bước 2: chọn mô tả thuộc mục tiêu đã chọn.');

    const dueDateInput = dueDateGroup?.querySelector('#projectDueDate');
    if (dueDateGroup && dueDateInput) {
        let dueDateLabel = dueDateGroup.querySelector('label');
        if (!dueDateLabel) {
            dueDateLabel = document.createElement('label');
            dueDateGroup.insertBefore(dueDateLabel, dueDateInput);
        }
        dueDateLabel.textContent = 'Ngày hoàn thành dự kiến';
    }
    setHint(dueDateGroup, 'Dùng để theo dõi tiến độ hoàn thành dự án.');

    setGroupLabel(colorGroup, 'Màu nhận diện');
    setGroupLabel(membersGroup, 'Thành viên dự án');
    setHint(membersGroup, 'Danh sách này sẽ được dùng trong vùng phân công của popup New Task.');

    const cancelButton = document.getElementById('cancelProject');
    if (cancelButton) {
        cancelButton.textContent = 'Hủy';
    }
    const submitButton = document.querySelector('#projectForm button[type="submit"]');
    if (submitButton) {
        submitButton.textContent = 'Lưu dự án';
    }
}

async function loadProjectTypes() {
    try {
        const projectTypes = await apiCall('/projects/types/list');
        const select = document.getElementById('projectType');
        if (!select) return;

        // Lưu giá trị hiện tại
        const currentValue = select.value;

        // Clear và thêm options
        select.innerHTML = '<option value="">-- Chọn loại dự án --</option>';

        if (projectTypes && projectTypes.length > 0) {
            projectTypes.forEach(type => {
                const option = document.createElement('option');
                option.value = type.id;
                option.textContent = type.name;
                select.appendChild(option);
            });
        }

        // Khôi phục giá trị nếu có
        if (currentValue) {
            select.value = currentValue;
        }
    } catch (error) {
        console.error('Error loading project types:', error);
    }
}

async function loadProjectObjectives() {
    try {
        const objectiveSelect = document.getElementById('projectObjectiveGroup');
        const descriptionSelect = document.getElementById('projectObjectiveDescription');
        if (!objectiveSelect || !descriptionSelect) return;

        const currentValue = objectiveSelect.value;
        const mtclData = await apiCall('/mtcl/');
        projectObjectiveItems = Array.isArray(mtclData) ? mtclData : [];
        objectiveSelect.innerHTML = '<option value="">-- Chọn mục tiêu chất lượng --</option>';
        descriptionSelect.innerHTML = '<option value="">-- Chọn mô tả mục tiêu chất lượng --</option>';

        const uniqueGroups = [...new Set(projectObjectiveItems
            .map((item) => item.objective_group)
            .filter(Boolean))];

        uniqueGroups.forEach((groupName) => {
            const option = document.createElement('option');
            option.value = groupName;
            option.textContent = groupName;
            objectiveSelect.appendChild(option);
        });

        if (currentValue) {
            objectiveSelect.value = currentValue;
        }
    } catch (error) {
        console.error('Error loading MTCL objectives:', error);
    }
}

function syncProjectObjectiveSelection(selectedDescription = '') {
    const objectiveSelect = document.getElementById('projectObjectiveGroup');
    const descriptionSelect = document.getElementById('projectObjectiveDescription');
    if (!objectiveSelect || !descriptionSelect) return;

    const selectedGroup = objectiveSelect.value;
    const descriptions = projectObjectiveItems.filter((item) => item.objective_group === selectedGroup);
    descriptionSelect.innerHTML = '<option value="">-- Chọn mô tả mục tiêu chất lượng --</option>';

    descriptions.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.description || '';
        option.textContent = item.description || '';
        descriptionSelect.appendChild(option);
    });

    if (selectedDescription && descriptions.some((item) => item.description === selectedDescription)) {
        descriptionSelect.value = selectedDescription;
    } else {
        descriptionSelect.value = '';
    }
}

function closeProjectModal() {
    document.getElementById('projectModal').classList.remove('active');
    projectModalTeamMembers = [];
    projectModalOwnerId = null;
}

function handleProjectSubmit(e) {
    e.preventDefault();
    const projectId = document.getElementById('projectId').value;
    const projectTypeId = document.getElementById('projectType').value;
    const objectiveGroup = document.getElementById('projectObjectiveGroup').value;
    const objectiveDescription = document.getElementById('projectObjectiveDescription').value;
    const dueDateValue = document.getElementById('projectDueDate').value;
    const normalizedDueDate = normalizeDateInput(dueDateValue);
    if (objectiveGroup && !objectiveDescription) {
        alert('Vui lòng chọn mô tả mục tiêu chất lượng tương ứng.');
        return;
    }
    if (dueDateValue && !normalizedDueDate) {
        alert('Ngày hoàn thành dự án không hợp lệ. Vui lòng nhập theo định dạng dd/mm/yyyy hoặc chọn ngày từ lịch.');
        return;
    }
    const projectData = {
        name: document.getElementById('projectName').value,
        description: document.getElementById('projectDescription').value,
        objective_group: objectiveGroup || null,
        objective_description: objectiveGroup ? objectiveDescription : null,
        color: document.getElementById('projectColor').value,
        project_type_id: projectTypeId ? parseInt(projectTypeId) : null,
        due_date: normalizedDueDate
    };

    if (projectId) {
        updateProject(parseInt(projectId), projectData);
    } else {
        createProject(projectData);
    }
}

function updateProjectSummaryInfo() {
    const summarySection = document.getElementById('projectSummarySection');
    const descriptionLabel = document.getElementById('projectDescriptionDisplay');
    const objectiveLabel = document.getElementById('projectObjectiveDisplay');
    const timelineLabel = document.getElementById('projectTimelineDisplay');
    if (!summarySection) return;
    if (!currentProject) {
        summarySection.style.display = 'none';
        if (descriptionLabel) descriptionLabel.textContent = '--';
        if (objectiveLabel) objectiveLabel.innerHTML = '<span class="summary-pill muted">--</span>';
        if (timelineLabel) timelineLabel.textContent = '--';
        updateProjectSummaryProgress(true);
        projectMembers = [];
        selectedProjectMemberId = null;
        renderProjectGoals();
        renderProjectMembers();
        return;
    }
    summarySection.style.display = 'grid';
    if (descriptionLabel) {
        descriptionLabel.textContent = currentProject.description || 'Chưa có mô tả dự án.';
    }
    if (objectiveLabel) {
        const pills = [];
        if (currentProject.objective_group) {
            pills.push(`<span class="summary-pill">${escapeHtml(currentProject.objective_group)}</span>`);
        }
        objectiveLabel.innerHTML = pills.join('') || '<span class="summary-pill muted">Chưa liên kết MTCL</span>';
    }
    if (timelineLabel) {
        const startText = formatDateDisplay(currentProject.created_at);
        const endText = currentProject.due_date ? formatDateDisplay(currentProject.due_date) : 'Chưa thiết lập';
        timelineLabel.textContent = `${startText} - ${endText}`;
    }
    renderProjectGoals();
}

function updateProjectSummaryProgress(reset = false) {
    const text = document.getElementById('projectProgressText');
    const fill = document.getElementById('projectProgressFill');
    if (!text || !fill) return;
    if (reset || !currentProjectId) {
        text.textContent = '0% (0/0)';
        fill.style.width = '0%';
        fill.style.background = getProgressColor(0);
        return;
    }
    const total = filteredTasks.length;
    const done = filteredTasks.filter(t => t.status === 'done').length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    text.textContent = `${percent}% (${done}/${total})`;
    fill.style.width = `${percent}%`;
    fill.style.background = getProgressColor(percent);
}

function isProjectOverdue(project, now = new Date()) {
    if (!project?.due_date) return false;
    const due = new Date(project.due_date);
    return due < now && project.status !== 'completed';
}

function isProjectAtRisk(project, taskMap, now = new Date()) {
    if (!project?.due_date || project.status === 'completed') return false;
    const due = new Date(project.due_date);
    if (due <= now) return false;
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + AT_RISK_DAYS_THRESHOLD);
    if (due > cutoff) return false;
    const progressInfo = getProjectProgressInfo(project.id, taskMap);
    return progressInfo.percent < AT_RISK_PROGRESS_THRESHOLD;
}

function getProjectProgressInfo(projectId, taskMap) {
    const projectTasks = taskMap[projectId] || [];
    const total = projectTasks.length;
    const done = projectTasks.filter(t => t.status === 'done').length;
    return {
        total,
        done,
        percent: total ? done / total : 0
    };
}

function updateWarningCards(atRiskProjects, overdueProjects) {
    const atRiskCountEl = document.getElementById('warningAtRiskCount');
    const atRiskListEl = document.getElementById('warningAtRiskList');
    const overdueCountEl = document.getElementById('warningOverdueCount');
    const overdueListEl = document.getElementById('warningOverdueList');

    if (atRiskCountEl) atRiskCountEl.textContent = atRiskProjects.length;
    if (atRiskListEl) {
        atRiskListEl.innerHTML = formatWarningList(atRiskProjects);
    }
    if (overdueCountEl) overdueCountEl.textContent = overdueProjects.length;
    if (overdueListEl) {
        overdueListEl.innerHTML = formatWarningList(overdueProjects);
    }
}

function formatWarningList(projects) {
    if (!projects || projects.length === 0) {
        return 'Không có dự án nào';
    }
    const top = projects.slice(0, 3).map(project => {
        const due = project.due_date ? formatDateDisplay(project.due_date) : 'Chưa có hạn';
        return `<span>${escapeHtml(project.name)} (${due})</span>`;
    }).join('');
    if (projects.length > 3) {
        return top + `<span>+${projects.length - 3} dự án khác</span>`;
    }
    return top;
}

async function loadProjectMembers(projectId) {
    const memberList = document.getElementById('projectMembersList');
    if (!memberList) return;

    if (!projectId) {
        projectMembers = [];
        selectedProjectMemberId = null;
        renderProjectMembers();
        return;
    }

    const roleMap = new Map();
    if (currentProject?.owner_id) {
        roleMap.set(currentProject.owner_id, 'owner');
    }

    try {
        const data = await apiCall(`/teams/project/${projectId}`);
        if (Array.isArray(data)) {
            data.forEach((member) => {
                if (member?.user_id) {
                    roleMap.set(member.user_id, member.role || roleMap.get(member.user_id) || 'member');
                }
            });
        }
    } catch (error) {
        console.error('Failed to load project members:', error);
    }

    const taskAssigneeMap = new Map();
    (tasks || []).forEach((task) => {
        (task.assignees || []).forEach((assignee) => {
            if (!assignee?.id) return;
            if (!taskAssigneeMap.has(assignee.id)) {
                taskAssigneeMap.set(assignee.id, assignee);
            }
            if (!roleMap.has(assignee.id)) {
                roleMap.set(assignee.id, 'assignee');
            }
        });
    });

    const userLookup = new Map((users || []).map((user) => [user.id, user]));
    taskAssigneeMap.forEach((value, key) => {
        if (!userLookup.has(key)) {
            userLookup.set(key, value);
        }
    });

    projectMembers = Array.from(roleMap.entries()).map(([userId, role]) => {
        const user = userLookup.get(userId) || { id: userId, username: `U${userId}` };
        const isOwner = role === 'owner';
        const ownedTasks = isOwner ? [] : (tasks || []).filter((task) => (task.assignees || []).some((assignee) => assignee.id === userId));
        return {
            id: userId,
            role,
            user,
            responsibilities: ownedTasks.map((task) => task.title),
            responsibilityCount: ownedTasks.length
        };
    }).sort((a, b) => {
        const roleOrder = { owner: 0, admin: 1, member: 2, assignee: 3 };
        const roleDiff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
        if (roleDiff !== 0) return roleDiff;
        return (a.user.full_name || a.user.username || '').localeCompare((b.user.full_name || b.user.username || ''), 'vi');
    });

    if (!projectMembers.some((member) => member.id === selectedProjectMemberId)) {
        selectedProjectMemberId = projectMembers[0]?.id || null;
    }

    renderProjectMembers();
    updateAssigneesList();
}

function renderProjectGoals() {
    const container = document.getElementById('activityList');
    if (!container) return;

    if (!currentProject) {
        container.innerHTML = '<div class="project-members-empty">Chưa có mục tiêu nào.</div>';
        return;
    }

    const goals = [];
    if (currentProject.objective_group) {
        goals.push({
            title: 'MTCL liên kết',
            body: currentProject.objective_group
        });
    }
    if (currentProject.objective_description) {
        goals.push({
            title: 'Mô tả mục tiêu',
            body: currentProject.objective_description
        });
    }
    if (!goals.length) {
        container.innerHTML = '<div class="project-members-empty">Chưa có mục tiêu nào.</div>';
        return;
    }

    container.innerHTML = goals.map((goal) => `
        <article class="goal-item">
            <span class="goal-item-label">${escapeHtml(goal.title)}</span>
            <p>${escapeHtml(goal.body || '--')}</p>
        </article>
    `).join('');
}

const _PM_AVATAR_PALETTES = [
    ['#4361ee','#7c89f7'], ['#10b981','#34d399'], ['#f59e0b','#fbbf24'],
    ['#8b5cf6','#a78bfa'], ['#ef4444','#f87171'], ['#0ea5e9','#38bdf8'],
    ['#ec4899','#f472b6'], ['#14b8a6','#2dd4bf'],
];
function _pmAvatarGradient(id) {
    const [a, b] = _PM_AVATAR_PALETTES[(id || 0) % _PM_AVATAR_PALETTES.length];
    return `linear-gradient(135deg,${a},${b})`;
}
function _pmInitials(name) {
    return (name || 'U').split(' ').map(p => p[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join('');
}

function renderProjectMembers() {
    const list = document.getElementById('projectMembersList');
    if (!list) return;

    if (!projectMembers.length) {
        list.innerHTML = '<div class="project-members-empty">Chưa có thành viên nào.</div>';
        return;
    }

    list.innerHTML = `<div class="pm-cards-grid">${projectMembers.map(member => {
        const user    = member.user || {};
        const name    = user.full_name || user.username || `User ${member.id}`;
        const initials = _pmInitials(name);
        const roleText = formatProjectMemberRole(member.role);
        const roleCls  = member.role === 'owner' ? 'pm-role-owner'
                       : member.role === 'admin'  ? 'pm-role-admin' : 'pm-role-member';
        const ringCls  = member.role === 'owner'  ? ' pm-owner-ring' : '';
        const tc       = member.responsibilityCount || 0;
        const avatarInner = user.avatar_url
            ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">${initials}`
            : initials;

        return `<button type="button" class="pm-card" onclick="openMemberPopup(${member.id}, event)">
            <div class="pm-avatar${ringCls}" style="background:${_pmAvatarGradient(member.id)}">${avatarInner}</div>
            <div class="pm-name">${escapeHtml(name)}</div>
            <span class="pm-role-badge ${roleCls}">${escapeHtml(roleText)}</span>
            ${member.role !== 'owner' ? `<div class="pm-task-count">${tc > 0 ? `${tc} task` : 'Chưa có task'}</div>` : ''}
        </button>`;
    }).join('')}</div>`;
}

let _memberPopupOpenId = null;

function openMemberPopup(memberId, event) {
    event?.stopPropagation();
    closeMemberPopup();

    const member = projectMembers.find(m => m.id === memberId);
    if (!member) return;
    _memberPopupOpenId = memberId;

    const user     = member.user || {};
    const name     = user.full_name || user.username || `User ${memberId}`;
    const initials = _pmInitials(name);
    const roleText = formatProjectMemberRole(member.role);
    const roleCls  = member.role === 'owner' ? 'pm-role-owner'
                   : member.role === 'admin'  ? 'pm-role-admin' : 'pm-role-member';
    const code     = user.username ? `${user.username}` : '';
    const dept     = user.department || '';
    const pos      = user.position || '';
    const meta     = [code, dept, pos].filter(Boolean).join(' · ');

    const isOwner = member.role === 'owner';
    const memberTasks = isOwner ? [] : (tasks || []).filter(t => (t.assignees || []).some(a => a.id === memberId));
    const doneCount   = memberTasks.filter(t => t.status === 'done').length;
    const progCount   = memberTasks.filter(t => t.status === 'in_progress').length;
    const todoCount   = memberTasks.filter(t => t.status === 'todo').length;
    const memberTaskItems = getCollapsedTaskItems(memberTasks);

    const taskListHtml = memberTaskItems.slice(0, 6).map(item => {
        if (item.type === 'series') {
            const series = item.series;
            const rep = series.representative || series.tasks[0];
            const dot = series.status === 'done' ? '#10b981' : series.status === 'in_progress' ? '#4361ee' : '#cbd5e1';
            return `<button type="button" class="mp-task-item" onclick="closeMemberPopup(); openTaskSeriesModal(decodeURIComponent('${encodeURIComponent(series.key)}'))">
                <div class="mp-task-dot" style="background:${dot}"></div>
                <span class="mp-task-title">${escapeHtml(rep.title)}</span>
                <span class="mp-task-badge">${series.doneCount}/${series.totalCount}</span>
            </button>`;
        }
        const t = item.task;
        const dot = t.status === 'done' ? '#10b981' : t.status === 'in_progress' ? '#4361ee' : '#cbd5e1';
        return `<button type="button" class="mp-task-item" onclick="openTaskModal(tasks.find(x=>x.id==${t.id}),false);closeMemberPopup()">
            <div class="mp-task-dot" style="background:${dot}"></div>
            <span class="mp-task-title">${escapeHtml(t.title)}</span>
        </button>`;
    }).join('');

    const avatarHeader = user.avatar_url
        ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(name)}">`
        : initials;

    const popup = document.createElement('div');
    popup.id = 'memberPopup';
    popup.className = 'member-popup';
    popup.innerHTML = `
        <div class="mp-header" style="background:${_pmAvatarGradient(memberId)}">
            <div class="mp-avatar-lg">${avatarHeader}</div>
            <div class="mp-identity">
                <div class="mp-full-name">${escapeHtml(name)}</div>
                <div class="mp-code-dept">${escapeHtml(meta || 'Chưa có thông tin')}</div>
            </div>
            <button class="mp-close-btn" onclick="closeMemberPopup()">×</button>
        </div>
        <div class="mp-body">
            <div class="mp-role-row">
                <span class="mp-role-label">Vai trò</span>
                <span class="mp-role-pill ${roleCls}">${escapeHtml(roleText)}</span>
            </div>
            <div class="mp-stats-row">
                <div class="mp-stat mp-stat-done"><div class="mp-stat-num">${doneCount}</div><div class="mp-stat-lbl">Hoàn thành</div></div>
                <div class="mp-stat mp-stat-prog"><div class="mp-stat-num">${progCount}</div><div class="mp-stat-lbl">Đang làm</div></div>
                <div class="mp-stat mp-stat-todo"><div class="mp-stat-num">${todoCount}</div><div class="mp-stat-lbl">Chưa làm</div></div>
            </div>
            ${memberTaskItems.length > 0 ? `
            <div class="mp-tasks-label">Công việc được giao (${memberTaskItems.length})</div>
            <div class="mp-task-list">${taskListHtml}</div>
            ${memberTaskItems.length > 6 ? `<div style="font-size:11px;color:#9ca3af;margin-top:6px">+${memberTaskItems.length-6} task khác</div>` : ''}
            ` : '<div style="font-size:12px;color:#9ca3af;padding:4px 0">Chưa được giao task nào.</div>'}
        </div>`;

    document.body.appendChild(popup);

    // Position popup near clicked card
    const card = event?.currentTarget || event?.target?.closest('.pm-card');
    if (card) {
        const rect  = card.getBoundingClientRect();
        const pw    = 290;
        const ph    = popup.offsetHeight || 360;
        let left    = rect.right + 8;
        let top     = rect.top;
        if (left + pw > window.innerWidth - 8) left = rect.left - pw - 8;
        if (top + ph  > window.innerHeight - 8) top  = window.innerHeight - ph - 8;
        if (top < 8) top = 8;
        popup.style.left = `${left}px`;
        popup.style.top  = `${top}px`;
    } else {
        popup.style.left = '50%';
        popup.style.top  = '50%';
        popup.style.transform = 'translate(-50%,-50%)';
    }

    // Overlay to close on outside click
    const overlay = document.createElement('div');
    overlay.id = 'memberPopupOverlay';
    overlay.className = 'mp-overlay';
    overlay.addEventListener('click', closeMemberPopup);
    document.body.insertBefore(overlay, popup);
}

function closeMemberPopup() {
    document.getElementById('memberPopup')?.remove();
    document.getElementById('memberPopupOverlay')?.remove();
    _memberPopupOpenId = null;
}

function getProjectMemberStatusInfo(member) {
    if (member.role === 'owner') {
        return { key: 'owner' };
    }
    if (member.responsibilityCount > 2) {
        return { key: 'busy' };
    }
    if (member.responsibilityCount > 0) {
        return { key: 'active' };
    }
    return { key: 'idle' };
}

function getProjectMemberResponsibilitySummary(member) {
    const responsibilities = member.responsibilities || [];
    if (!responsibilities.length) {
        return 'Chưa có task cụ thể';
    }
    const topItems = responsibilities.slice(0, 2).join(', ');
    const remaining = responsibilities.length - 2;
    return remaining > 0 ? `${topItems} +${remaining}` : topItems;
}

function formatProjectMemberRole(role) {
    const roleMap = {
        owner: 'Project Owner',
        admin: 'Quản trị',
        member: 'Thành viên',
        assignee: 'Phụ trách task'
    };
    return roleMap[role] || role || 'Thành viên';
}
