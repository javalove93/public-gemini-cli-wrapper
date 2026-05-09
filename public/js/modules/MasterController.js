/**
 * MasterController.js
 * Frontend logic for the Master Router landing page.
 * Handles project management, tmux sessions, and UI modals.
 */
export class MasterController {
    constructor() {
        this.init();
    }

    init() {
        this._bindGlobals();
        this._initClickOutside();
        console.log('[MasterController] Initialized.');
    }

    /**
     * Bind functions to window object for legacy onclick handlers in the master HTML.
     */
    _bindGlobals() {
        window.toggleDetails = this.toggleDetails.bind(this);
        window.openTempWS = this.openTempWS.bind(this);
        window.closeTempWS = this.closeTempWS.bind(this);
        window.refreshSessions = this.refreshSessions.bind(this);
        window.createSession = this.createSession.bind(this);
        window.killSession = this.killSession.bind(this);
        window.openAddProjectModal = this.openAddProjectModal.bind(this);
        window.closeAddProjectModal = this.closeAddProjectModal.bind(this);
        window.browseDirectory = this.browseDirectory.bind(this);
        window.submitAddProject = this.submitAddProject.bind(this);
        window.autoFillProjectNames = this.autoFillProjectNames.bind(this);
    }

    autoFillProjectNames(dirPath) {
        if (!dirPath || dirPath === '/') return;
        
        const projNameInput = document.getElementById('add-proj-name');
        const sessionInput = document.getElementById('add-proj-session');
        
        // Extract the last folder name from the path
        const parts = dirPath.split('/').filter(p => p.trim() !== '');
        if (parts.length === 0) return;
        
        const folderName = parts[parts.length - 1];
        
        // Auto-fill Project Name (Uppercase, replace non-alphanumeric with underscore)
        if (projNameInput) {
            projNameInput.value = folderName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        }
        
        // Auto-fill Tmux Session Name (Lowercase, keep dashes and underscores)
        if (sessionInput) {
            sessionInput.value = folderName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        }
    }

    _initClickOutside() {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.project-header')) {
                document.querySelectorAll('.connection-details').forEach(d => d.style.display = 'none');
            }
        });
    }

    toggleDetails(name) {
        const el = document.getElementById('details-' + name);
        if (el.style.display === 'none') {
            document.querySelectorAll('.connection-details').forEach(d => d.style.display = 'none');
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    }

    async openTempWS() {
        document.getElementById('temp-ws-modal').style.display = 'block';
        this.refreshSessions();
    }

    closeTempWS() {
        document.getElementById('temp-ws-modal').style.display = 'none';
    }

    async refreshSessions() {
        const listEl = document.getElementById('session-list');
        listEl.innerHTML = '<div style="padding:10px;">Loading sessions...</div>';

        try {
            const res = await fetch('/api/tmux/sessions');
            const sessions = await res.json();

            listEl.innerHTML = '';
            if (sessions.length === 0) {
                listEl.innerHTML = '<div style="padding:10px; color:#888;">No active tmux sessions.</div>';
            }

            sessions.forEach(s => {
                const item = document.createElement('div');
                item.className = 'session-item';

                const nameDiv = document.createElement('div');
                nameDiv.className = 'session-name';
                nameDiv.onclick = () => window.top.location.href = '/TEMP/?session=' + s.name;
                nameDiv.innerHTML = s.name;

                const infoDiv = document.createElement('div');
                infoDiv.className = 'session-info';
                infoDiv.textContent = s.info.split(']')[0] + ']';

                const killBtn = document.createElement('div');
                killBtn.className = 'kill-btn';
                killBtn.textContent = 'Kill';
                killBtn.onclick = (e) => this.killSession(s.name, e);

                item.appendChild(nameDiv);
                item.appendChild(infoDiv);
                item.appendChild(killBtn);
                listEl.appendChild(item);
            });
        } catch (e) {
            listEl.innerHTML = '<div style="padding:10px; color:#ff5555;">Failed to load sessions.</div>';
        }
    }

    async createSession() {
        const input = document.getElementById('new-session-name');
        const name = input.value.trim();
        if (!name) return;

        try {
            const res = await fetch('/api/tmux/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (res.ok) {
                input.value = '';
                window.top.location.href = '/TEMP/?session=' + name;
            } else {
                const err = await res.json();
                alert('Error: ' + err.error);
            }
        } catch (e) {
            alert('Failed to create session');
        }
    }

    async killSession(name, event) {
        event.stopPropagation();
        if (!window.confirm('Kill session: ' + name + '?')) return;

        try {
            const res = await fetch('/api/tmux/sessions/' + name, { method: 'DELETE' });
            if (res.ok) this.refreshSessions();
        } catch (e) {
            alert('Failed to kill session');
        }
    }

    openAddProjectModal() {
        document.getElementById('add-proj-modal').style.display = 'block';
    }

    closeAddProjectModal() {
        document.getElementById('add-proj-modal').style.display = 'none';
    }

    async browseDirectory() {
        if (window.backendDirBrowser) {
            window.backendDirBrowser.open();
        } else {
            alert('Backend browser module is not loaded yet.');
        }
    }

    async submitAddProject() {
        const name = document.getElementById('add-proj-name').value.trim();
        const dir = document.getElementById('add-proj-dir').value.trim();
        const session = document.getElementById('add-proj-session').value.trim();

        if (!name || !dir) {
            alert('Project Name and Directory are required.');
            return;
        }

        try {
            const res = await fetch('/api/projects/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, dir, sessionName: session })
            });
            const result = await res.json();
            if (res.ok) {
                alert('Project added successfully! Refreshing...');
                window.location.reload();
            } else {
                alert('Error: ' + result.error);
            }
        } catch (e) {
            alert('Failed to add project');
        }
    }
}
