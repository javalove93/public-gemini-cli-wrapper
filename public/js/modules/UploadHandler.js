export class UploadHandler {
    constructor(options) {
        this.socket = options.socket;
        this.fileManager = options.fileManager;
        this.mainLayout = options.mainLayout;
        this.pasteTextFallback = options.pasteTextFallback;
        
        // DOM Elements
        this.sidebar = document.getElementById('sidebar');
        this.uploadStatusContainer = document.getElementById('upload-status-container');
        this.btnPasteClipboard = document.getElementById('btn-paste-clipboard');
        
        console.log('[UploadHandler] Constructor - btnPasteClipboard found:', !!this.btnPasteClipboard);

        this.init();
    }

    init() {
        this._bindPasteEvent();
        this._bindDragAndDrop();
        this._bindButtonEvents();
    }

    _bindButtonEvents() {
        if (this.btnPasteClipboard) {
            console.log('[UploadHandler] _bindButtonEvents - Binding onclick listener');
            this.btnPasteClipboard.onclick = () => {
                console.log('[UploadHandler] btnPasteClipboard CLICKED!');
                this.pasteFromClipboard();
            };
        } else {
            console.error('[UploadHandler] _bindButtonEvents - btnPasteClipboard is NULL! Cannot bind event.');
        }
    }

    /**
     * 클립보드에서 이미지를 추출하여 업로드하거나, 텍스트를 터미널에 입력함.
     * 버튼 클릭 및 커스텀 단축키에서 공용으로 사용됨.
     */
    async pasteFromClipboard() {
        if (!navigator.clipboard || !navigator.clipboard.read) {
            console.warn('[UploadHandler] Clipboard API not supported');
            return;
        }

        try {
            const clipboardItems = await navigator.clipboard.read();
            let imageFound = false;

            for (const clipboardItem of clipboardItems) {
                // 1. 이미지 처리 (최우선)
                const imageTypes = clipboardItem.types.filter(type => type.startsWith('image/'));
                if (imageTypes.length > 0) {
                    const imageType = imageTypes[0];
                    const blob = await clipboardItem.getType(imageType);
                    this._processImageBlob(blob, imageType);
                    imageFound = true;
                    break; 
                }
            }

            // 2. 이미지가 없으면 텍스트 처리
            if (!imageFound) {
                const text = await navigator.clipboard.readText();
                if (text) {
                    console.log('[DEBUG] Pasting text from clipboard via Async API');
                    if (this.pasteTextFallback) this.pasteTextFallback(text);
                    else if (this.socket) this.socket.emit('input', text);
                }
            }
        } catch (err) {
            console.error('[UploadHandler] Failed to read clipboard:', err);
            if (err.name === 'NotAllowedError') {
                alert('클립보드 접근 권한이 필요합니다.');
            }
        }
    }

    /**
     * 이미지 Blob을 처리하여 서버로 업로드 (공용 로직)
     */
    _processImageBlob(blob, type) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const ext = type.split('/')[1] || 'png';
            const dir = this.fileManager.currentDir || '';
            console.log(`[DEBUG] Uploading image blob. Type: ${type}, Dir: ${dir}`);
            this.socket.emit('upload_image', {
                data: event.target.result,
                ext: ext,
                dir: dir
            });
        };
        reader.readAsArrayBuffer(blob);
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

            if (this.mainLayout && this.mainLayout.style.display === 'none') return;

            const textData = clipboardData.getData('text/plain');
            if (textData && !hasImage) return; // Let xterm handle plain text natively

            const items = clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    this._processImageBlob(blob, item.type);
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