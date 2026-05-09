export class BackendDirBrowser {
    constructor() {
        // Create modal elements
        this._createModalElements();
        
        // State
        this.currentDir = '/';
        
        // Bind functions
        this.open = this.open.bind(this);
        this.close = this.close.bind(this);
        this._fetchDir = this._fetchDir.bind(this);
        this._render = this._render.bind(this);
        this._handleKeyDown = this._handleKeyDown.bind(this);
        this._initEvents();
    }

    _createModalElements() {
        const modalHtml = `
        <div id="backend-dir-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2000;">
            <div class="modal-content" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #252526; border: 1px solid #454545; border-radius: 8px; width: 80vw; max-width: 1000px; height: 80vh; max-height: 800px; display: flex; flex-direction: column; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 10px;">
                    <h2 style="margin: 0; font-size: 1.2em; color: #4fc1ff;">Browse Host Directory</h2>
                    <span id="backend-dir-close" style="cursor: pointer; font-size: 1.5em; color: #888;">&times;</span>
                </div>
                
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <input type="text" id="backend-dir-input" style="flex-grow: 1; background: #3c3c3c; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px;" placeholder="/path/to/project">
                    <button id="backend-dir-select-btn" style="background: #0e639c; color: #fff; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;">Select This Folder</button>
                </div>
                
                <div style="display: flex; gap: 8px; margin-bottom: 15px; align-items: center;">
                    <button id="backend-dir-home-btn" style="background: #3e3e3e; color: #ccc; border: 1px solid #555; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.9em; display: none;">🏠 Home</button>
                    <button id="backend-dir-cwd-btn" style="background: #3e3e3e; color: #ccc; border: 1px solid #555; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.9em; display: none;">📁 CWD</button>
                    <div style="flex-grow: 1;"></div>
                    <input type="text" id="backend-dir-filter" style="width: 250px; background: #2d2d2d; border: 1px solid #555; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 0.9em;" placeholder="🔍 Filter...">
                </div>
                
                <ul id="backend-dir-list" style="flex-grow: 1; overflow-y: auto; list-style: none; padding: 0; margin: 0; border: 1px solid #333; background: #1e1e1e; border-radius: 4px;">
                    <!-- Directory list renders here -->
                </ul>
            </div>
        </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        this.modal = document.getElementById('backend-dir-modal');
        this.closeBtn = document.getElementById('backend-dir-close');
        this.input = document.getElementById('backend-dir-input');
        this.selectBtn = document.getElementById('backend-dir-select-btn');
        this.listContainer = document.getElementById('backend-dir-list');
        this.filterInput = document.getElementById('backend-dir-filter');
        
        // Add current items state
        this.currentItems = [];
    }

    _initEvents() {
        this.closeBtn.addEventListener('click', this.close);
        
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });
        
        this.input.addEventListener('keydown', this._handleKeyDown);
        
        this.selectBtn.addEventListener('click', () => {
            const targetInput = document.getElementById('add-proj-dir');
            if (targetInput) {
                targetInput.value = this.currentDir;
                if (window.autoFillProjectNames) {
                    window.autoFillProjectNames(this.currentDir);
                } else if (window.masterController && window.masterController.autoFillProjectNames) {
                    window.masterController.autoFillProjectNames(this.currentDir);
                }
            }
            this.close();
        });
        
        const homeBtn = document.getElementById('backend-dir-home-btn');
        const cwdBtn = document.getElementById('backend-dir-cwd-btn');
        
        homeBtn.addEventListener('click', () => {
            if (this.homePath) this._fetchDir(this.homePath);
        });
        
        cwdBtn.addEventListener('click', () => {
            if (this.cwdPath) this._fetchDir(this.cwdPath);
        });
        
        this.filterInput.addEventListener('input', () => {
            this._applyFilter();
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'flex') {
                this.close();
            }
        });
        
        // Add dynamic CSS
        const style = document.createElement('style');
        style.innerHTML = `
            .backend-dir-item { padding: 8px 12px; border-bottom: 1px solid #333; cursor: pointer; display: flex; align-items: center; color: #dcdcaa; }
            .backend-dir-item:hover { background: #2a2d2e; }
            .backend-dir-item.file { color: #ccc; cursor: default; }
            .backend-dir-item.file:hover { background: transparent; }
        `;
        document.head.appendChild(style);
    }

    async open(initialPath = '/') {
        this.filterInput.value = ''; // clear filter on open
        const inputElement = document.getElementById('add-proj-dir');
        if (inputElement && inputElement.value) {
            initialPath = inputElement.value;
        }
        
        this.modal.style.display = 'flex';
        
        // Fetch env paths once
        if (!this.envFetched) {
            try {
                const res = await fetch('/api/host/env');
                if (res.ok) {
                    const envData = await res.json();
                    this.homePath = envData.home;
                    this.cwdPath = envData.cwd;
                    
                    const homeBtn = document.getElementById('backend-dir-home-btn');
                    const cwdBtn = document.getElementById('backend-dir-cwd-btn');
                    
                    if (this.homePath) homeBtn.style.display = 'inline-block';
                    if (this.cwdPath) cwdBtn.style.display = 'inline-block';
                    
                    this.envFetched = true;
                    
                    // If no initial path was set from the input, default to CWD
                    if (initialPath === '/' && this.cwdPath) {
                        initialPath = this.cwdPath;
                    }
                }
            } catch (e) {
                console.error('[BackendDirBrowser] Failed to fetch host env', e);
            }
        }
        
        this._fetchDir(initialPath);
    }

    close() {
        this.modal.style.display = 'none';
    }

    async _handleKeyDown(e) {
        if (e.key === 'Enter') {
            await this._fetchDir(this.input.value.trim());
        }
    }

    async _fetchDir(targetPath) {
        try {
            this.listContainer.innerHTML = '<li style="padding: 10px; color: #888;">Loading...</li>';
            
            const res = await fetch(`/api/host/files?dir=${encodeURIComponent(targetPath)}`);
            if (!res.ok) {
                throw new Error('Failed to load directory');
            }
            
            const data = await res.json();
            this.currentDir = data.dir;
            this.input.value = this.currentDir;
            
            // Clear filter when changing directory
            this.filterInput.value = '';
            
            this.currentItems = data.list;
            this._render(this.currentItems);
            
        } catch (err) {
            console.error('[BackendDirBrowser] Error:', err);
            this.listContainer.innerHTML = `<li style="padding: 10px; color: #ff5555;">Error: ${err.message}</li>`;
        }
    }
    
    _applyFilter() {
        const term = this.filterInput.value.toLowerCase().trim();
        if (!term) {
            this._render(this.currentItems);
            return;
        }
        
        const filtered = this.currentItems.filter(item => {
            if (item.name === '..') return true; // always show parent dir
            return item.name.toLowerCase().includes(term);
        });
        
        this._render(filtered);
    }

    _render(items) {
        this.listContainer.innerHTML = '';
        
        // Sort: directories first, then alphabetically
        items.sort((a, b) => {
            if (a.name === '..') return -1;
            if (b.name === '..') return 1;
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
        
        items.forEach(item => {
            const li = document.createElement('li');
            
            if (item.isDirectory) {
                li.className = 'backend-dir-item';
                const icon = item.isSymlink ? '🔗' : '📁';
                li.innerHTML = `${icon} <span style="margin-left: 8px;">${item.name}</span>`;
                li.onclick = () => this._fetchDir(item.path);
            } else {
                // Dim display for files as this is a directory browser
                li.className = 'backend-dir-item file';
                const icon = item.isSymlink ? '🔗' : '📄';
                li.innerHTML = `${icon} <span style="margin-left: 8px;">${item.name}</span>`;
            }
            
            this.listContainer.appendChild(li);
        });
        
        if (items.length === 0) {
            this.listContainer.innerHTML = '<li style="padding: 10px; color: #888;">Empty directory</li>';
        }
    }
}
