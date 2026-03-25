/* Willis Portal — Frontend Logic */

const API = '';

// ── State ───────────────────────────────────────────────────────────────────
let tasks = [];
let cases = [];
let activeTab = 'dashboard';

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    setupNavigation();
    await loadTasks();
    await loadCases();
    renderDashboard();
    renderTasks();
    renderCases();
});

// ── Navigation ──────────────────────────────────────────────────────────────
function setupNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            switchTab(target);
        });
    });
}

function switchTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`section-${tabName}`).classList.add('active');
}

// ── Dashboard ───────────────────────────────────────────────────────────────
function renderDashboard() {
    const completed = tasks.filter(t => t.status === 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const openCases = cases.filter(c => c.status !== 'closed').length;

    document.getElementById('stat-tasks-done').textContent = `${completed}/${tasks.length}`;
    document.getElementById('stat-tasks-active').textContent = inProgress;
    document.getElementById('stat-cases-open').textContent = openCases;
    document.getElementById('stat-date').textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Tasks ───────────────────────────────────────────────────────────────────
async function loadTasks() {
    try {
        const res = await fetch(`${API}/api/tasks`);
        const data = await res.json();
        tasks = data.tasks;
    } catch (e) {
        console.error('Failed to load tasks:', e);
    }
}

function renderTasks() {
    const list = document.getElementById('task-list');
    list.innerHTML = tasks.map(t => `
        <li class="task-item ${t.status}" data-id="${t.id}">
            <div class="task-number">${t.id}</div>
            <div class="task-info">
                <h4>${t.title}</h4>
                <div class="task-meta">
                    <span>Priority: ${t.priority}</span>
                    <span>Time: ${t.time}</span>
                    ${t.recurring ? '<span style="color: var(--purple);">Recurring</span>' : ''}
                </div>
                ${t.notes ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;">${t.notes}</div>` : ''}
            </div>
            <div class="task-actions">
                <select class="status-select" onchange="updateTaskStatus(${t.id}, this.value)">
                    <option value="not_started" ${t.status === 'not_started' ? 'selected' : ''}>Not Started</option>
                    <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="completed" ${t.status === 'completed' ? 'selected' : ''}>Completed</option>
                    <option value="blocked" ${t.status === 'blocked' ? 'selected' : ''}>Blocked</option>
                </select>
            </div>
        </li>
    `).join('');
}

async function updateTaskStatus(id, status) {
    try {
        await fetch(`${API}/api/tasks/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, notes: '' }),
        });
        await loadTasks();
        renderTasks();
        renderDashboard();
        showToast(`Task #${id} updated to ${status.replace('_', ' ')}`);
    } catch (e) {
        showToast('Failed to update task', true);
    }
}

// ── Cases (NetSuite Case Center) ────────────────────────────────────────────
async function loadCases() {
    try {
        const res = await fetch(`${API}/api/cases`);
        const data = await res.json();
        cases = data.cases;
    } catch (e) {
        console.error('Failed to load cases:', e);
    }
}

function renderCases() {
    const statuses = ['new', 'in_progress', 'waiting', 'closed'];
    statuses.forEach(status => {
        const col = document.getElementById(`cases-${status}`);
        const filtered = cases.filter(c => c.status === status);
        const countEl = col.parentElement.querySelector('.count');
        if (countEl) countEl.textContent = filtered.length;

        col.innerHTML = filtered.map(c => `
            <div class="case-card" onclick="openCaseDetail(${c.id})">
                <div class="case-title">${c.title}</div>
                <div class="case-meta">
                    <span class="priority-badge priority-${c.priority}">${c.priority}</span>
                    <span>${c.category}</span>
                </div>
            </div>
        `).join('') || '<div style="color:var(--muted);font-size:12px;text-align:center;padding:20px;">No cases</div>';
    });
    renderDashboard();
}

async function createCase() {
    const title = document.getElementById('case-title').value.trim();
    const desc = document.getElementById('case-desc').value.trim();
    const priority = document.getElementById('case-priority').value;
    const category = document.getElementById('case-category').value;

    if (!title || !desc) {
        showToast('Title and description required', true);
        return;
    }

    try {
        await fetch(`${API}/api/cases`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description: desc, priority, category }),
        });
        document.getElementById('case-title').value = '';
        document.getElementById('case-desc').value = '';
        await loadCases();
        renderCases();
        showToast('Case created');
    } catch (e) {
        showToast('Failed to create case', true);
    }
}

function openCaseDetail(id) {
    const c = cases.find(x => x.id === id);
    if (!c) return;

    const modal = document.getElementById('case-modal');
    document.getElementById('modal-case-title').textContent = `Case #${c.id}: ${c.title}`;
    document.getElementById('modal-case-body').innerHTML = `
        <div class="form-group">
            <label>Description</label>
            <p style="font-size:14px;line-height:1.6;">${c.description}</p>
        </div>
        <div style="display:flex;gap:16px;margin-bottom:16px;">
            <div><label>Priority</label><span class="priority-badge priority-${c.priority}">${c.priority}</span></div>
            <div><label>Category</label><span>${c.category}</span></div>
            <div><label>Status</label>
                <select class="status-select" id="modal-case-status">
                    <option value="new" ${c.status === 'new' ? 'selected' : ''}>New</option>
                    <option value="in_progress" ${c.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="waiting" ${c.status === 'waiting' ? 'selected' : ''}>Waiting</option>
                    <option value="closed" ${c.status === 'closed' ? 'selected' : ''}>Closed</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <label>Add Note</label>
            <textarea id="modal-case-note" rows="2" placeholder="Add a note..."></textarea>
        </div>
        ${c.notes && c.notes.length ? `
        <div class="form-group">
            <label>History</label>
            ${c.notes.map(n => `<div style="font-size:12px;color:var(--muted);padding:4px 0;border-bottom:1px solid var(--border);">[${new Date(n.time).toLocaleString()}] ${n.text}</div>`).join('')}
        </div>` : ''}
    `;

    document.getElementById('modal-case-actions').innerHTML = `
        <button class="btn btn-outline btn-sm" onclick="closeCaseModal()">Cancel</button>
        <button class="btn btn-blue btn-sm" onclick="updateCaseFromModal(${c.id})">Save</button>
        <button class="btn btn-gold btn-sm" onclick="sendCaseToPeter(${c.id})">Send to Peter</button>
    `;

    modal.classList.add('active');
}

function closeCaseModal() {
    document.getElementById('case-modal').classList.remove('active');
}

async function updateCaseFromModal(id) {
    const status = document.getElementById('modal-case-status').value;
    const note = document.getElementById('modal-case-note').value.trim();

    try {
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (note) params.append('note', note);

        await fetch(`${API}/api/cases/${id}?${params.toString()}`, { method: 'PUT' });
        closeCaseModal();
        await loadCases();
        renderCases();
        showToast('Case updated');
    } catch (e) {
        showToast('Failed to update case', true);
    }
}

async function sendCaseToPeter(id) {
    try {
        showLoading('Sending to Peter...');
        const res = await fetch(`${API}/api/cases/${id}/send`, { method: 'POST' });
        hideLoading();
        if (res.ok) {
            const data = await res.json();
            closeCaseModal();
            showToast(`Case sent to ${data.to}`);
        } else {
            const err = await res.json();
            showToast(err.detail || 'Failed to send', true);
        }
    } catch (e) {
        hideLoading();
        showToast('Failed to send case', true);
    }
}

// ── Crowdsource ─────────────────────────────────────────────────────────────
async function runCrowdsource() {
    const prompt = document.getElementById('crowd-prompt').value.trim();
    const systemPrompt = document.getElementById('crowd-system').value.trim();

    if (!prompt) {
        showToast('Enter a prompt', true);
        return;
    }

    showLoading('Crowdsourcing across models...');
    const resultsDiv = document.getElementById('crowd-results');
    resultsDiv.innerHTML = '';

    try {
        const res = await fetch(`${API}/api/crowdsource`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, system_prompt: systemPrompt || undefined }),
        });

        hideLoading();

        if (!res.ok) {
            const err = await res.json();
            showToast(err.detail || 'Crowdsource failed', true);
            return;
        }

        const data = await res.json();
        resultsDiv.innerHTML = data.results.map(r => `
            <div class="model-result ${r.status}">
                <div class="model-name">${r.model}</div>
                <div class="model-meta">
                    <span>${r.latency}s</span>
                    <span>${r.tokens_in} in / ${r.tokens_out} out</span>
                    <span class="priority-badge ${r.status === 'success' ? 'priority-low' : 'priority-high'}">${r.status}</span>
                </div>
                <div class="model-response">${escapeHtml(r.response)}</div>
            </div>
        `).join('');
    } catch (e) {
        hideLoading();
        showToast('Crowdsource failed: ' + e.message, true);
    }
}

// ── Prof Read ───────────────────────────────────────────────────────────────
async function runProofread() {
    const text = document.getElementById('proof-input').value.trim();
    const style = document.getElementById('proof-style').value;

    if (!text) {
        showToast('Paste text to proofread', true);
        return;
    }

    showLoading('Proofreading...');
    const resultDiv = document.getElementById('proof-result');

    try {
        const res = await fetch(`${API}/api/proofread`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, style }),
        });

        hideLoading();

        if (!res.ok) {
            const err = await res.json();
            showToast(err.detail || 'Proofread failed', true);
            return;
        }

        const data = await res.json();
        resultDiv.innerHTML = `
            <div style="margin-bottom:8px;font-size:12px;color:var(--muted);">
                ${data.latency}s | ${data.tokens_in} in / ${data.tokens_out} out
            </div>
            <div>${renderMarkdown(data.result)}</div>
        `;
    } catch (e) {
        hideLoading();
        showToast('Proofread failed: ' + e.message, true);
    }
}

// ── Email Peter ─────────────────────────────────────────────────────────────
async function emailPeter() {
    const subject = document.getElementById('email-subject').value.trim();
    const body = document.getElementById('email-body').value.trim();

    if (!subject || !body) {
        showToast('Subject and body required', true);
        return;
    }

    try {
        showLoading('Sending email...');
        const res = await fetch(`${API}/api/email-peter`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject, body }),
        });
        hideLoading();

        if (res.ok) {
            document.getElementById('email-subject').value = '';
            document.getElementById('email-body').value = '';
            showToast('Email sent to Peter');
        } else {
            const err = await res.json();
            showToast(err.detail || 'Failed to send', true);
        }
    } catch (e) {
        hideLoading();
        showToast('Email failed', true);
    }
}

// ── Utilities ───────────────────────────────────────────────────────────────
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderMarkdown(text) {
    return text
        .replace(/^### (.+)$/gm, '<h4 style="color:var(--gold);margin:12px 0 6px;">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 style="color:var(--gold);margin:16px 0 8px;">$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code style="background:var(--surface);padding:2px 6px;border-radius:4px;">$1</code>')
        .replace(/^- (.+)$/gm, '<li style="margin-left:16px;">$1</li>')
        .replace(/^(\d+)\. (.+)$/gm, '<li style="margin-left:16px;">$2</li>')
        .replace(/\n/g, '<br>');
}

function showToast(msg, isError = false) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showLoading(msg = 'Loading...') {
    const overlay = document.getElementById('loading');
    overlay.querySelector('.loading-text').textContent = msg;
    overlay.classList.add('active');
}

function hideLoading() {
    document.getElementById('loading').classList.remove('active');
}
