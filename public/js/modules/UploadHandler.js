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
        // [FIX] 브라우저의 navigator.clipboard.read() API가 포커스 상태에 따라 
        // 캡처 도구의 이미지를 types: [] 로 오인하는 심각한 OS 레벨 버그가 존재함.
        // 따라서 비동기 API를 완전히 폐기하고, 숨겨진 textarea를 이용해 
        // 네이티브 paste 이벤트를 강제로 발생시키는 고전적인 해킹 기법으로 회귀함.
        
        const pasteTarget = document.createElement("textarea");
        pasteTarget.style.position = "fixed";
        pasteTarget.style.left = "-9999px";
        pasteTarget.style.top = "0";
        pasteTarget.style.opacity = "0";
        
        document.body.appendChild(pasteTarget);
        pasteTarget.focus();
        
        try {
            // 이 명령이 성공하면 브라우저가 이 파일 하단의 _bindPasteEvent()를 트리거함
            const successful = document.execCommand('paste');
            
            // 만약 execCommand가 보안상 막혔다면 최후의 수단으로 텍스트만이라도 가져옴
            if (!successful) {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                        if (this.pasteTextFallback) this.pasteTextFallback(text);
                        else if (this.socket) this.socket.emit('input', text);
                    }
                }
            }
        } catch (err) {
            console.error('[UploadHandler] Error during forced paste:', err);
        } finally {
            setTimeout(() => {
                if (document.body.contains(pasteTarget)) {
                    document.body.removeChild(pasteTarget);
                }
            }, 100);
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