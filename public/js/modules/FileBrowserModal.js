export class FileBrowserModal {
    constructor(options) {
        this.getApiPath = options.getApiPath;
        this.saveUiSetting = options.saveUiSetting;
        this.getUiSetting = options.getUiSetting;
        this.basePath = options.basePath;
        this.getCurrentDir = options.getCurrentDir;

        // DOM Elements
        this.btnOpenViewerMain = document.getElementById('btn-open-viewer-main');
        this.fileModalMain = document.getElementById('file-modal-main');
        this.modalCloseBtnMain = document.getElementById('modal-close-btn-main');
        this.modalCurrentDirMain = document.getElementById('modal-current-dir-main');
        this.modalFileListMain = document.getElementById('modal-file-list-main');
        this.sortNameMain = document.getElementById('sort-name-main');
        this.sortDateMain = document.getElementById('sort-date-main');

        // State
        this.currentModalDirMain = '';
        this.currentFilesDataMain = [];
        this.sortColMain = this.getUiSetting('GCW_UI_VIEWER_SORT_COL') || 'date';
        this.sortDirMain = this.getUiSetting('GCW_UI_VIEWER_SORT_DIR') || 'desc';

        this.init();
    }

    init() {
        this._bindEvents();
    }

    _bindEvents() {
        if (this.btnOpenViewerMain) {
            this.btnOpenViewerMain.onclick = () => {
                this.currentModalDirMain = this.getCurrentDir() || '/';
                this.fetchModalFilesMain();
                this.fileModalMain.style.display = 'flex';
            };
        }

        if (this.modalCloseBtnMain) {
            this.modalCloseBtnMain.onclick = () => {
                this.fileModalMain.style.display = 'none';
            };
        }

        if (this.fileModalMain) {
            this.fileModalMain.onclick = (e) => {
                if (e.target === this.fileModalMain) {
                    this.fileModalMain.style.display = 'none';
                }
            };
        }

        if (this.sortNameMain) this.sortNameMain.onclick = () => this.handleSortClickMain('name');
        if (this.sortDateMain) this.sortDateMain.onclick = () => this.handleSortClickMain('date');

        if (this.modalCurrentDirMain) {
            this.modalCurrentDirMain.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    const inputPath = this.modalCurrentDirMain.value.trim();
                    if (!inputPath) return;
                    
                    try {
                        const res = await fetch(this.getApiPath(`/api/files?dir=${encodeURIComponent(inputPath)}`));
                        if (!res.ok) {
                            window.open(`${this.basePath}viewer.html?path=${encodeURIComponent(inputPath)}`, '_blank');
                            this.fileModalMain.style.display = 'none';
                            return;
                        }
                        
                        const data = await res.json();
                        if(data.length === 1 && !data[0].isDirectory && data[0].path === inputPath) {
                             window.open(`${this.basePath}viewer.html?path=${encodeURIComponent(inputPath)}`, '_blank');
                             this.fileModalMain.style.display = 'none';
                             return;
                        }
                        
                        this.currentModalDirMain = inputPath;
                        this.currentFilesDataMain = data;
                        this.updateSortIconsMain();
                        this.renderFileListMain();
                    } catch (err) {
                        console.error('Invalid path or file', err);
                        alert("존재하지 않는 경로이거나 파일입니다.");
                    }
                }
            });
        }

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.fileModalMain && this.fileModalMain.style.display === 'flex') {
                this.fileModalMain.style.display = 'none';
            }
        });
    }

    async fetchModalFilesMain() {
        try {
            if(this.modalCurrentDirMain) this.modalCurrentDirMain.value = this.currentModalDirMain;
            const res = await fetch(this.getApiPath(`/api/files?dir=${encodeURIComponent(this.currentModalDirMain)}`));
            if (!res.ok) throw new Error('Failed to fetch files');
            this.currentFilesDataMain = await res.json();
            this.updateSortIconsMain();
            this.renderFileListMain();
        } catch (e) {
            console.error(e);
            if(this.modalFileListMain) this.modalFileListMain.innerHTML = `<li style="color:red;">Error loading directory contents</li>`;
        }
    }

    handleSortClickMain(col) {
        if (this.sortColMain === col) {
            this.sortDirMain = this.sortDirMain === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColMain = col;
            this.sortDirMain = col === 'date' ? 'desc' : 'asc';
        }
        this.saveUiSetting('GCW_UI_VIEWER_SORT_COL', this.sortColMain);
        this.saveUiSetting('GCW_UI_VIEWER_SORT_DIR', this.sortDirMain);
        this.updateSortIconsMain();
        this.renderFileListMain();
    }

    updateSortIconsMain() {
        if (!this.sortNameMain || !this.sortDateMain) return;
        this.sortNameMain.querySelector('.sort-icon-main').textContent = this.sortColMain === 'name' ? (this.sortDirMain === 'asc' ? '▲' : '▼') : '';
        this.sortDateMain.querySelector('.sort-icon-main').textContent = this.sortColMain === 'date' ? (this.sortDirMain === 'asc' ? '▲' : '▼') : '';
    }

    renderFileListMain() {
        if(!this.modalFileListMain) return;
        this.modalFileListMain.innerHTML = '';
        
        if (this.currentModalDirMain && this.currentModalDirMain !== '/') {
            const upLi = document.createElement('li');
            upLi.className = 'directory';
            upLi.innerHTML = `📁 <span class="file-name-main">..</span> <span class="file-mtime-main"></span>`;
            upLi.onclick = () => {
                const parts = this.currentModalDirMain.split('/');
                parts.pop();
                this.currentModalDirMain = parts.join('/') || '/';
                this.fetchModalFilesMain();
            };
            this.modalFileListMain.appendChild(upLi);
        }

        const sortedFiles = [...this.currentFilesDataMain];

        sortedFiles.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            
            let result = 0;
            if (this.sortColMain === 'name') {
                result = a.name.localeCompare(b.name);
            } else if (this.sortColMain === 'date') {
                result = a.mtime - b.mtime;
            }
            return this.sortDirMain === 'asc' ? result : -result;
        });

        sortedFiles.forEach(file => {
            const li = document.createElement('li');
            li.className = file.isDirectory ? 'directory' : 'file';
            const icon = file.isDirectory ? '📁' : '📄';
            
            if (file.isDirectory) {
                li.innerHTML = `${icon} <span class="file-name-main">${file.name}</span> <span class="file-mtime-main">${this._formatDate(file.mtime)}</span>`;
                li.onclick = () => {
                    this.currentModalDirMain = file.path;
                    this.fetchModalFilesMain();
                };
            } else {
                li.innerHTML = `${icon} <span class="file-name-main">${file.name}</span> <span class="file-mtime-main">${this._formatDate(file.mtime)}</span>`;
                li.onclick = () => {
                    window.open(`${this.basePath}viewer.html?path=${encodeURIComponent(file.path)}`, '_blank');
                    this.fileModalMain.style.display = 'none';
                };
            }
            this.modalFileListMain.appendChild(li);
        });
    }

    _formatDate(ms) {
        if (!ms) return '';
        const d = new Date(ms);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
}