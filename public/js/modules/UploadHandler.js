export class UploadHandler {
    constructor(options) {
        this.socket = options.socket;
        this.fileManager = options.fileManager;
        this.mainLayout = options.mainLayout;
        
        // DOM Elements
        this.sidebar = document.getElementById('sidebar');
        this.uploadStatusContainer = document.getElementById('upload-status-container');

        this.init();
    }

    init() {
        this._bindPasteEvent();
        this._bindDragAndDrop();
    }

    _bindPasteEvent() {
        window.addEventListener('paste', (e) => {
            const clipboardData = e.clipboardData || window.clipboardData;
            if (!clipboardData) return;

            let hasImage = false;
            if (clipboardData.items) {
                for (let i = 0; i < clipboardData.items.length; i++) {
                    if (clipboardData.items[i].type.startsWith('image/')) {
                        hasImage = true;
                        break;
                    }
                }
            }

            // 커스텀 단축키 중복 실행 방지
            if (!hasImage && window.lastCustomPasteTime && (Date.now() - window.lastCustomPasteTime < 100)) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            if (this.mainLayout && this.mainLayout.style.display === 'none') return;

            const textData = clipboardData.getData('text/plain');
            if (textData && !hasImage) return; // Let xterm handle plain text

            const items = clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    const reader = new FileReader();
                    
                    reader.onload = (event) => {
                        const ext = item.type.split('/')[1] || 'png';
                        this.socket.emit('upload_image', {
                            data: event.target.result,
                            ext: ext,
                            dir: this.fileManager.currentDir
                        });
                    };
                    reader.readAsArrayBuffer(blob);
                    e.preventDefault(); 
                    return;
                }
            }
        }, true);
    }

    _bindDragAndDrop() {
        if (!this.sidebar) return;

        this.sidebar.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.sidebar.classList.add('drag-over');
        });

        this.sidebar.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.sidebar.classList.remove('drag-over');
        });

        this.sidebar.addEventListener('drop', (e) => {
            e.preventDefault();
            this.sidebar.classList.remove('drag-over');
            
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                for (let i = 0; i < e.dataTransfer.files.length; i++) {
                    const file = e.dataTransfer.files[i];
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        this.fileManager.uploadFile(file.name, event.target.result, this.fileManager.currentDir, (percent, uploadId, filename) => {
                            this.updateUploadUI(percent, uploadId, filename);
                        });
                    };
                    reader.readAsArrayBuffer(file);
                }
            }
        });
    }

    updateUploadUI(percent, uploadId, filename) {
        if (!this.uploadStatusContainer) return;
        let item = document.getElementById(`upload-${uploadId}`);
        
        if (!item) {
            this.uploadStatusContainer.classList.remove('hidden');
            item = document.createElement('div');
            item.id = `upload-${uploadId}`;
            item.className = 'upload-item';
            item.innerHTML = `
                <div class="upload-info">
                    <span class="upload-filename" title="${filename}">${filename}</span>
                    <span class="upload-percent">${percent}%</span>
                </div>
                <div class="upload-progress-bg">
                    <div class="upload-progress-fill" style="width: ${percent}%"></div>
                </div>
            `;
            this.uploadStatusContainer.appendChild(item);
        } else {
            item.querySelector('.upload-percent').textContent = `${percent}%`;
            item.querySelector('.upload-progress-fill').style.width = `${percent}%`;
            
            if (percent >= 100) {
                item.classList.add('complete');
                setTimeout(() => {
                    item.remove();
                    if (this.uploadStatusContainer.querySelectorAll('.upload-item').length === 0) {
                        this.uploadStatusContainer.classList.add('hidden');
                    }
                }, 3000);
            }
        }
    }
}