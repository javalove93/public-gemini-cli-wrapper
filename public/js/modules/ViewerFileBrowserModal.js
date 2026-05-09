export class ViewerFileBrowserModal {
    constructor(options) {
        this.getApiPath = options.getApiPath;
        this.onFileSelect = options.onFileSelect;
        this.basePath = options.basePath || '/';

        this.fileModal = document.getElementById('file-modal');
        this.modalCloseBtn = document.getElementById('modal-close-btn');
        this.modalCurrentDir = document.getElementById('modal-current-dir');
        this.modalFileList = document.getElementById('modal-file-list');
        this.sortName = document.getElementById('sort-name');
        this.sortDate = document.getElementById('sort-date');

        this.currentModalDir = '/';
        this.currentFilesData = [];
        this.sortCol = 'date';
        this.sortDir = 'desc';

        this.init();
    }

    init() {
        this._bindEvents();
    }

    _bindEvents() {
        if (this.modalCloseBtn) {
            this.modalCloseBtn.onclick = () => {
                this.fileModal.classList.add('hidden');
            };
        }

        if (this.sortName) {
            this.sortName.onclick = () => {
                if (this.sortCol === 'name') {
                    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortCol = 'name';
                    this.sortDir = 'asc';
                }
                this.updateSortIcons();
                this.renderModalFiles(this.currentFilesData);
            };
        }

        if (this.sortDate) {
            this.sortDate.onclick = () => {
                if (this.sortCol === 'date') {
                    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortCol = 'date';
                    this.sortDir = 'desc';
                }
                this.updateSortIcons();
                this.renderModalFiles(this.currentFilesData);
            };
        }
    }

    open(initialDir = '/') {
        this.currentModalDir = initialDir;
        this.fetchModalFiles();
        this.updateSortIcons();
        this.fileModal.classList.remove('hidden');
    }

    getDirName(path) {
        const lastSlash = path.lastIndexOf('/');
        return lastSlash <= 0 ? '/' : path.substring(0, lastSlash);
    }

    formatDate(ms) {
        if (!ms) return '';
        const d = new Date(ms);
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    }

    async fetchModalFiles() {
        try {
            const query = this.currentModalDir ? '?dir=' + encodeURIComponent(this.currentModalDir) : '';
            const url = this.getApiPath('/api/files' + query);
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch modal files');
            this.currentFilesData = await res.json();
            this.renderModalFiles(this.currentFilesData);
            this.modalCurrentDir.textContent = this.currentModalDir || '/';
        } catch (err) {
            console.error('[ERROR] Failed to load files for modal:', err);
        }
    }

    updateSortIcons() {
        if (this.sortName) this.sortName.querySelector('.sort-icon').textContent = this.sortCol === 'name' ? (this.sortDir === 'asc' ? '▲' : '▼') : '';
        if (this.sortDate) this.sortDate.querySelector('.sort-icon').textContent = this.sortCol === 'date' ? (this.sortDir === 'asc' ? '▲' : '▼') : '';
    }

    renderModalFiles(files) {
        this.modalFileList.innerHTML = '';
        
        let sortedFiles = [...files];
        sortedFiles.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            
            let cmp = 0;
            if (this.sortCol === 'name') {
                cmp = a.name.localeCompare(b.name);
            } else if (this.sortCol === 'date') {
                cmp = (a.mtime || 0) - (b.mtime || 0);
            }
            return this.sortDir === 'asc' ? cmp : -cmp;
        });

        if (this.currentModalDir && this.currentModalDir !== '.') {
            const upDiv = document.createElement('div');
            upDiv.className = 'modal-file-item dir';
            upDiv.innerHTML = '<span class="col-name">📁 ..</span><span class="col-date"></span>';
            upDiv.onclick = () => {
                this.currentModalDir = this.getDirName(this.currentModalDir);
                this.fetchModalFiles();
            };
            this.modalFileList.appendChild(upDiv);
        }

        sortedFiles.forEach(f => {
            const div = document.createElement('div');
            div.className = 'modal-file-item ' + (f.isDirectory ? 'dir' : 'file');
            const dateStr = this.formatDate(f.mtime);
            
            let nameHtml = '<span class="col-name">' + (f.isDirectory ? '📁 ' : '📄 ') + f.name + '</span>';
            if (!f.isDirectory) {
                nameHtml = '<span class="col-name">' + (f.isDirectory ? '📁 ' : '📄 ') + f.name + ' <button class="btn-new-tab" data-path="' + f.path + '" title="새 탭에서 열기">[새로 열기]</button></span>';
            }
            
            div.innerHTML = nameHtml + '<span class="col-date">' + dateStr + '</span>';
            
            if (f.isDirectory) {
                div.onclick = () => {
                    this.currentModalDir = f.path;
                    this.fetchModalFiles();
                };
            } else {
                div.onclick = (e) => {
                    if (e.target.classList.contains('btn-new-tab')) {
                        const path = e.target.getAttribute('data-path');
                        const newUrl = new URL(window.location.origin + window.location.pathname);
                        newUrl.searchParams.set('path', path);
                        window.open(newUrl.toString(), '_blank');
                        e.stopPropagation();
                        this.fileModal.classList.add('hidden');
                        return;
                    }

                    if (this.onFileSelect) {
                        this.onFileSelect(f.path);
                    }
                    this.fileModal.classList.add('hidden');
                };
            }
            this.modalFileList.appendChild(div);
        });
    }
}
