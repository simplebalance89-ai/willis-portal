/* Willis Portal — Frontend Logic */

const API = '';

// ── State ───────────────────────────────────────────────────────────────────
let tasks = [];
let cases = [];
let leads = [];
let chatMessages = [];
let activeTab = 'dashboard';
let timerInterval = null;
let timerStartTime = null;

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    setupNavigation();
    setupDropZone();
    await loadTasks();
    await loadCases();
    renderDashboard();
    renderTasks();
    renderCases();
    renderTestSites();
    await loadChatMessages();
    await loadFiles();
    await loadTimeLog();
    await loadLeads();
    initChatUsername();
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

    // Auto-refresh on tab switch
    if (tabName === 'chat') loadChatMessages();
    if (tabName === 'filedrop') loadFiles();
    if (tabName === 'timetrack') loadTimeLog();
    if (tabName === 'pipeline') loadLeads();
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

    // Also populate the time tracker task dropdown
    const timeSelect = document.getElementById('time-task-select');
    if (timeSelect) {
        timeSelect.innerHTML = tasks.map(t =>
            `<option value="${t.id}">${t.title}</option>`
        ).join('');
    }
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

// ── Test Sites ──────────────────────────────────────────────────────────────
const RENDER_SERVICES = [
    { name: 'Edge Crew V2', url: 'https://edge-crew-v2.onrender.com' },
    { name: 'Edge Crew Sandbox', url: 'https://edge-crew-alyssa.onrender.com' },
    { name: 'C365 AI Platform', url: 'https://c365-ai-platform-v2.onrender.com' },
    { name: 'EnPro FM Portal', url: 'https://enpro-fm-portal.onrender.com' },
    { name: 'Casa Gianelli', url: 'https://casa-gianelli-work.onrender.com' },
    { name: 'Willis Portal', url: 'https://willis-portal.onrender.com' },
];

function renderTestSites() {
    const grid = document.getElementById('test-sites-grid');
    grid.innerHTML = RENDER_SERVICES.map((svc, i) => `
        <div class="test-site-card" id="site-card-${i}">
            <div class="test-site-name">${svc.name}</div>
            <a href="${svc.url}" target="_blank" class="test-site-url">${svc.url}</a>
            <div class="test-site-status" id="site-status-${i}">
                <span class="status-indicator status-unknown"></span>
                <span>Not checked</span>
            </div>
            <div class="test-site-time" id="site-time-${i}"></div>
            <button class="btn btn-outline btn-sm" onclick="testSiteHealth(${i})">Test Health</button>
        </div>
    `).join('');
}

async function testSiteHealth(index) {
    const svc = RENDER_SERVICES[index];
    const statusEl = document.getElementById(`site-status-${index}`);
    const timeEl = document.getElementById(`site-time-${index}`);

    statusEl.innerHTML = '<span class="status-indicator status-checking"></span><span>Checking...</span>';

    try {
        const start = Date.now();
        const res = await fetch(svc.url + '/health', { mode: 'cors', signal: AbortSignal.timeout(10000) });
        const elapsed = Date.now() - start;

        if (res.ok) {
            statusEl.innerHTML = `<span class="status-indicator status-healthy"></span><span>Healthy (${elapsed}ms)</span>`;
        } else {
            statusEl.innerHTML = `<span class="status-indicator status-unhealthy"></span><span>Error ${res.status}</span>`;
        }
    } catch (e) {
        // CORS may block the response but the service could still be up — try with no-cors
        try {
            const res2 = await fetch(svc.url, { mode: 'no-cors', signal: AbortSignal.timeout(10000) });
            statusEl.innerHTML = '<span class="status-indicator status-healthy"></span><span>Reachable (CORS blocked details)</span>';
        } catch (e2) {
            statusEl.innerHTML = '<span class="status-indicator status-unhealthy"></span><span>Unreachable</span>';
        }
    }

    timeEl.textContent = 'Checked: ' + new Date().toLocaleTimeString();
}

function testAllSites() {
    RENDER_SERVICES.forEach((_, i) => testSiteHealth(i));
}

// ── Team Chat ───────────────────────────────────────────────────────────────
function initChatUsername() {
    if (!localStorage.getItem('willis_chat_user')) {
        const name = prompt('Enter your name for Team Chat:');
        if (name && name.trim()) {
            localStorage.setItem('willis_chat_user', name.trim());
        } else {
            localStorage.setItem('willis_chat_user', 'Anonymous');
        }
    }
}

function getChatUsername() {
    return localStorage.getItem('willis_chat_user') || 'Anonymous';
}

async function loadChatMessages() {
    try {
        const res = await fetch(`${API}/api/chat/messages`);
        const data = await res.json();
        chatMessages = data.messages;
        renderChatMessages();
    } catch (e) {
        console.error('Failed to load chat:', e);
    }
}

function renderChatMessages() {
    const container = document.getElementById('chat-messages');
    if (!chatMessages.length) {
        container.innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px;">No messages yet. Start the conversation.</div>';
        return;
    }

    container.innerHTML = chatMessages.map(m => {
        const isMe = m.username === getChatUsername();
        const time = new Date(m.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `
            <div class="chat-msg ${isMe ? 'chat-msg-mine' : ''}">
                <div class="chat-msg-header">
                    <span class="chat-msg-user">${escapeHtml(m.username)}</span>
                    <span class="chat-msg-time">${time}</span>
                </div>
                <div class="chat-msg-text">${escapeHtml(m.message)}</div>
            </div>
        `;
    }).join('');

    container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;

    const username = getChatUsername();

    try {
        await fetch(`${API}/api/chat/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, message }),
        });
        input.value = '';
        await loadChatMessages();
    } catch (e) {
        showToast('Failed to send message', true);
    }
}

// ── File Drop ───────────────────────────────────────────────────────────────
function setupDropZone() {
    const zone = document.getElementById('drop-zone');
    if (!zone) return;

    zone.addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        handleFileSelect(e.dataTransfer.files);
    });
}

async function handleFileSelect(files) {
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            showLoading(`Uploading ${file.name}...`);
            const res = await fetch(`${API}/api/files/upload`, {
                method: 'POST',
                body: formData,
            });
            hideLoading();

            if (res.ok) {
                showToast(`Uploaded: ${file.name}`);
            } else {
                const err = await res.json();
                showToast(err.detail || 'Upload failed', true);
            }
        } catch (e) {
            hideLoading();
            showToast('Upload failed: ' + e.message, true);
        }
    }
    await loadFiles();
}

async function loadFiles() {
    try {
        const res = await fetch(`${API}/api/files/list`);
        const data = await res.json();
        renderFiles(data.files);
    } catch (e) {
        console.error('Failed to load files:', e);
    }
}

function renderFiles(files) {
    const container = document.getElementById('file-list');
    if (!files.length) {
        container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:16px;text-align:center;">No files uploaded yet.</div>';
        return;
    }

    container.innerHTML = `
        <table class="file-table">
            <thead>
                <tr>
                    <th>File</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${files.map(f => `
                    <tr>
                        <td>${escapeHtml(f.name)}</td>
                        <td>${formatFileSize(f.size)}</td>
                        <td>${new Date(f.uploaded).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                        <td><a href="${API}/api/files/download/${encodeURIComponent(f.name)}" class="btn btn-outline btn-sm" download>Download</a></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// ── Time Tracking ───────────────────────────────────────────────────────────
async function loadTimeLog() {
    try {
        const res = await fetch(`${API}/api/time/log`);
        const data = await res.json();

        // If there's an active timer, resume the display
        if (data.active) {
            timerStartTime = new Date(data.active.started);
            startTimerDisplay();
            const btn = document.getElementById('time-start-btn');
            btn.textContent = 'Stop';
            btn.className = 'btn btn-red btn-sm';
        }

        renderTimeLog(data.entries || []);
    } catch (e) {
        console.error('Failed to load time log:', e);
    }
}

function renderTimeLog(entries) {
    const container = document.getElementById('time-log-list');
    if (!entries.length) {
        container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:16px;text-align:center;">No time entries yet.</div>';
        return;
    }

    // Show most recent first
    const sorted = [...entries].reverse();
    container.innerHTML = `
        <table class="file-table">
            <thead>
                <tr>
                    <th>Task</th>
                    <th>Date</th>
                    <th>Duration</th>
                </tr>
            </thead>
            <tbody>
                ${sorted.map(e => `
                    <tr>
                        <td>${escapeHtml(e.task_title || 'Task #' + e.task_id)}</td>
                        <td>${new Date(e.started).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                        <td>${formatDuration(e.duration_seconds)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startTimerDisplay() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const now = new Date();
        const diff = Math.floor((now - timerStartTime) / 1000);
        document.getElementById('time-display').textContent = formatDuration(diff);
    }, 1000);
}

function stopTimerDisplay() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    document.getElementById('time-display').textContent = '00:00:00';
}

async function toggleTimer() {
    const btn = document.getElementById('time-start-btn');
    const isRunning = btn.textContent === 'Stop';

    if (isRunning) {
        // Stop
        try {
            await fetch(`${API}/api/time/stop`, { method: 'POST' });
            stopTimerDisplay();
            btn.textContent = 'Start';
            btn.className = 'btn btn-green btn-sm';
            timerStartTime = null;
            showToast('Timer stopped');
            await loadTimeLog();
        } catch (e) {
            showToast('Failed to stop timer', true);
        }
    } else {
        // Start
        const select = document.getElementById('time-task-select');
        const taskId = select.value;
        const taskTitle = select.options[select.selectedIndex]?.text || '';

        try {
            const res = await fetch(`${API}/api/time/start?task_id=${taskId}&task_title=${encodeURIComponent(taskTitle)}`, { method: 'POST' });
            if (res.ok) {
                timerStartTime = new Date();
                startTimerDisplay();
                btn.textContent = 'Stop';
                btn.className = 'btn btn-red btn-sm';
                showToast('Timer started');
            } else {
                const err = await res.json();
                showToast(err.detail || 'Failed to start timer', true);
            }
        } catch (e) {
            showToast('Failed to start timer', true);
        }
    }
}

// ── Sales Pipeline ──────────────────────────────────────────────────────────
const PIPELINE_STAGES = [
    { key: 'prospect', label: 'Prospect' },
    { key: 'qualified', label: 'Qualified' },
    { key: 'demo_scheduled', label: 'Demo Scheduled' },
    { key: 'proposal', label: 'Proposal' },
    { key: 'closed_won', label: 'Closed Won' },
    { key: 'closed_lost', label: 'Closed Lost' },
];

async function loadLeads() {
    try {
        const res = await fetch(`${API}/api/leads`);
        const data = await res.json();
        leads = data.leads;
        renderPipeline();
    } catch (e) {
        console.error('Failed to load leads:', e);
    }
}

function renderPipeline() {
    const board = document.getElementById('pipeline-board');
    board.innerHTML = PIPELINE_STAGES.map(stage => {
        const stageLeads = leads.filter(l => l.stage === stage.key);
        const totalValue = stageLeads.reduce((sum, l) => sum + (l.value || 0), 0);
        return `
            <div class="pipeline-column">
                <div class="pipeline-column-header">
                    <span>${stage.label}</span>
                    <span class="count">${stageLeads.length}</span>
                </div>
                ${totalValue > 0 ? `<div class="pipeline-value">$${totalValue.toLocaleString()}</div>` : ''}
                <div class="pipeline-cards">
                    ${stageLeads.map(l => `
                        <div class="pipeline-card" onclick="openLeadDetail('${l.id}')">
                            <div class="pipeline-card-company">${escapeHtml(l.company)}</div>
                            <div class="pipeline-card-contact">${escapeHtml(l.contact)}</div>
                            ${l.value ? `<div class="pipeline-card-value">$${l.value.toLocaleString()}</div>` : ''}
                        </div>
                    `).join('') || '<div style="color:var(--muted);font-size:12px;text-align:center;padding:16px;">No leads</div>'}
                </div>
            </div>
        `;
    }).join('');
}

async function createLead() {
    const company = document.getElementById('lead-company').value.trim();
    const contact = document.getElementById('lead-contact').value.trim();
    const value = parseFloat(document.getElementById('lead-value').value) || 0;

    if (!company || !contact) {
        showToast('Company and contact required', true);
        return;
    }

    try {
        await fetch(`${API}/api/leads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company, contact, value, stage: 'prospect', notes: '' }),
        });
        document.getElementById('lead-company').value = '';
        document.getElementById('lead-contact').value = '';
        document.getElementById('lead-value').value = '';
        await loadLeads();
        showToast('Lead created');
    } catch (e) {
        showToast('Failed to create lead', true);
    }
}

function openLeadDetail(id) {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;

    const modal = document.getElementById('lead-modal');
    document.getElementById('modal-lead-title').textContent = lead.company;
    document.getElementById('modal-lead-body').innerHTML = `
        <div class="form-group">
            <label>Company</label>
            <input type="text" id="modal-lead-company" value="${escapeHtml(lead.company)}">
        </div>
        <div class="form-group">
            <label>Contact</label>
            <input type="text" id="modal-lead-contact" value="${escapeHtml(lead.contact)}">
        </div>
        <div style="display:flex;gap:16px;">
            <div class="form-group" style="flex:1;">
                <label>Stage</label>
                <select id="modal-lead-stage">
                    ${PIPELINE_STAGES.map(s => `<option value="${s.key}" ${lead.stage === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}
                </select>
            </div>
            <div class="form-group" style="flex:1;">
                <label>Est. Value ($)</label>
                <input type="number" id="modal-lead-value" value="${lead.value || 0}" min="0">
            </div>
        </div>
        <div class="form-group">
            <label>Notes</label>
            <textarea id="modal-lead-notes" rows="3">${escapeHtml(lead.notes || '')}</textarea>
        </div>
        <div style="font-size:11px;color:var(--muted);">Created: ${new Date(lead.created).toLocaleString()} | Updated: ${new Date(lead.updated).toLocaleString()}</div>
    `;

    document.getElementById('modal-lead-actions').innerHTML = `
        <button class="btn btn-outline btn-sm" onclick="closeLeadModal()">Cancel</button>
        <button class="btn btn-blue btn-sm" onclick="updateLeadFromModal('${id}')">Save</button>
    `;

    modal.classList.add('active');
}

function closeLeadModal() {
    document.getElementById('lead-modal').classList.remove('active');
}

async function updateLeadFromModal(id) {
    const company = document.getElementById('modal-lead-company').value.trim();
    const contact = document.getElementById('modal-lead-contact').value.trim();
    const stage = document.getElementById('modal-lead-stage').value;
    const value = parseFloat(document.getElementById('modal-lead-value').value) || 0;
    const notes = document.getElementById('modal-lead-notes').value.trim();

    try {
        await fetch(`${API}/api/leads/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company, contact, stage, value, notes }),
        });
        closeLeadModal();
        await loadLeads();
        showToast('Lead updated');
    } catch (e) {
        showToast('Failed to update lead', true);
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
