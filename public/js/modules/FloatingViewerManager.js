export class FloatingViewerManager {
    constructor(options) {
        this.basePath = options.basePath || '/';
        this.template = document.getElementById('floating-viewer-template');
        
        this.windows = new Map(); // filePath -> windowObject
        this.maxWindows = 3;
        this.topZIndex = 5000;

        // BroadcastChannel 초기화 (나중에 탭 목록 동기화에 사용)
        this.channel = new BroadcastChannel('gcw_viewer_channel');
    }

    init() {
        // 싱글톤 시절의 init은 더 이상 필요 없음 (동적 생성 시 각각 초기화)
    }

    /**
     * 특정 파일을 팝업으로 엶
     */
    open(filePath) {
        if (!this.template) return;

        // 1. 이미 열려있는지 확인
        if (this.windows.has(filePath)) {
            this.bringToFront(filePath);
            return;
        }

        // 2. 최대 개수 제한 확인
        if (this.windows.size >= this.maxWindows) {
            alert(`최대 ${this.maxWindows}개까지만 팝업을 열 수 있습니다.\n기존 팝업을 닫고 다시 시도해 주세요.`);
            return;
        }

        // 3. 새 창 생성
        const clone = this.template.content.cloneNode(true);
        const modal = clone.querySelector('.floating-modal');
        const iframe = modal.querySelector('iframe');
        const title = modal.querySelector('.viewer-title');
        const btnClose = modal.querySelector('.btn-close');
        const btnMinimize = modal.querySelector('.btn-minimize');

        const winId = `viewer-${Date.now()}`;
        modal.id = winId;
        title.textContent = `Viewer: ${filePath.split('/').pop()}`;
        
        // 초기 위치 설정 (계단식 배열)
        const offset = this.windows.size * 30;
        modal.style.top = (100 + offset) + 'px';
        modal.style.left = (400 + offset) + 'px';
        modal.style.zIndex = ++this.topZIndex;

        // Iframe URL 설정
        const viewerUrl = `${this.basePath}viewer.html?path=${encodeURIComponent(filePath)}&mode=popup`;
        iframe.src = viewerUrl;

        // 윈도우 객체 저장
        const winObj = {
            modal,
            iframe,
            isMinimized: false,
            preMinimizeHeight: null
        };
        this.windows.set(filePath, winObj);

        // DOM 추가
        document.body.appendChild(modal);

        // 이벤트 바인딩
        this._bindEvents(filePath, winObj);
        this._makeDraggable(filePath, winObj);
        this._makeResizable(filePath, winObj);

        // 자동 포커스 및 내부 클릭 감지 (Z-Order 전환)
        iframe.onload = () => {
            try {
                // 1. 자동 포커스
                iframe.contentWindow.focus();
                
                // 2. Iframe 내부 클릭 시 부모 창에서 bringToFront 호출할 수 있도록 이벤트 바인딩
                iframe.contentWindow.document.addEventListener('mousedown', () => {
                    this.bringToFront(filePath);
                });
                
                console.log(`[VIEWER] Iframe linked for Z-Order management: ${filePath}`);
            } catch (e) {
                console.warn('[VIEWER] Failed to link iframe for focus (possibly cross-origin or load error):', e);
            }
        };
        
        console.log(`[VIEWER] Opened new popup for: ${filePath}`);
    }

    close(filePath) {
        const win = this.windows.get(filePath);
        if (win) {
            win.modal.remove();
            this.windows.delete(filePath);
            console.log(`[VIEWER] Closed popup: ${filePath}`);
        }
    }

    bringToFront(filePath) {
        const win = this.windows.get(filePath);
        if (win) {
            win.modal.style.zIndex = ++this.topZIndex;
            if (win.isMinimized) this.toggleMinimize(filePath);
            try { win.iframe.contentWindow.focus(); } catch (e) {}
        }
    }

    toggleMinimize(filePath) {
        const win = this.windows.get(filePath);
        if (!win) return;

        if (win.isMinimized) {
            win.modal.style.height = win.preMinimizeHeight || '700px';
            win.modal.classList.remove('minimized');
            win.isMinimized = false;
            win.iframe.contentWindow.focus();
        } else {
            win.preMinimizeHeight = win.modal.style.height || getComputedStyle(win.modal).height;
            win.modal.style.height = '40px';
            win.modal.classList.add('minimized');
            win.isMinimized = true;
        }
    }

    _bindEvents(filePath, win) {
        const btnClose = win.modal.querySelector('.btn-close');
        const btnMinimize = win.modal.querySelector('.btn-minimize');

        btnClose.onclick = () => this.close(filePath);
        btnMinimize.onclick = () => this.toggleMinimize(filePath);

        // 창 영역 클릭 시 최상단으로
        win.modal.onmousedown = () => this.bringToFront(filePath);
    }

    _makeDraggable(filePath, win) {
        const header = win.modal.querySelector('.modal-header');
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        const dragMouseDown = (e) => {
            e.preventDefault();
            this.bringToFront(filePath);
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
            win.iframe.style.pointerEvents = 'none';
        };

        const elementDrag = (e) => {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            win.modal.style.top = (win.modal.offsetTop - pos2) + "px";
            win.modal.style.left = (win.modal.offsetLeft - pos1) + "px";
        };

        const closeDragElement = () => {
            document.onmouseup = null;
            document.onmousemove = null;
            win.iframe.style.pointerEvents = 'auto';
        };

        header.onmousedown = dragMouseDown;
    }

    _makeResizable(filePath, win) {
        const resizers = win.modal.querySelectorAll('.resizer');
        let startX, startY, startWidth, startHeight, startTop, startLeft;
        let currentResizer = null;

        const initResize = (e) => {
            e.preventDefault();
            this.bringToFront(filePath);
            currentResizer = e.target;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = win.modal.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            startTop = rect.top;
            startLeft = rect.left;

            window.addEventListener('mousemove', resize, false);
            window.addEventListener('mouseup', stopResize, false);
            win.iframe.style.pointerEvents = 'none';
        };

        const resize = (e) => {
            if (!currentResizer) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            let newWidth = startWidth;
            let newHeight = startHeight;
            let newTop = startTop;
            let newLeft = startLeft;

            if (currentResizer.classList.contains('r') || currentResizer.classList.contains('tr') || currentResizer.classList.contains('br')) {
                newWidth = startWidth + dx;
            } else if (currentResizer.classList.contains('l') || currentResizer.classList.contains('tl') || currentResizer.classList.contains('bl')) {
                newWidth = startWidth - dx;
                newLeft = startLeft + dx;
            }

            if (currentResizer.classList.contains('b') || currentResizer.classList.contains('bl') || currentResizer.classList.contains('br')) {
                newHeight = startHeight + dy;
            } else if (currentResizer.classList.contains('t') || currentResizer.classList.contains('tl') || currentResizer.classList.contains('tr')) {
                newHeight = startHeight - dy;
                newTop = startTop + dy;
            }

            if (newWidth > 300) {
                win.modal.style.width = newWidth + 'px';
                win.modal.style.left = newLeft + 'px';
            }
            if (newHeight > 200 && !win.isMinimized) {
                win.modal.style.height = newHeight + 'px';
                win.modal.style.top = newTop + 'px';
            }
        };

        const stopResize = () => {
            window.removeEventListener('mousemove', resize, false);
            window.removeEventListener('mouseup', stopResize, false);
            win.iframe.style.pointerEvents = 'auto';
            currentResizer = null;
        };

        resizers.forEach(r => r.addEventListener('mousedown', initResize, false));
    }
}
