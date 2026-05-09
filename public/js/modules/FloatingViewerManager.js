export class FloatingViewerManager {
    constructor(options) {
        this.basePath = options.basePath || '/';
        
        // DOM Elements
        this.modal = document.getElementById('floating-viewer-modal');
        this.header = document.getElementById('floating-viewer-header');
        this.iframe = document.getElementById('floating-viewer-iframe');
        this.title = document.getElementById('floating-viewer-title');
        this.btnClose = document.getElementById('btn-floating-close');
        this.btnMinimize = document.getElementById('btn-floating-minimize');
        this.resizer = document.getElementById('floating-viewer-resizer');

        this.isMinimized = false;
        this.preMinimizeHeight = null;

        this.init();
    }

    init() {
        this._bindEvents();
        this._makeDraggable();
        this._makeResizable();
    }

    _bindEvents() {
        if (this.btnClose) {
            this.btnClose.onclick = () => this.hide();
        }

        if (this.btnMinimize) {
            this.btnMinimize.onclick = () => this.toggleMinimize();
        }
    }

    open(filePath) {
        if (!this.modal || !this.iframe) return;

        const viewerUrl = `${this.basePath}viewer.html?path=${encodeURIComponent(filePath)}&mode=popup`;
        this.iframe.src = viewerUrl;
        this.title.textContent = `Viewer: ${filePath.split('/').pop()}`;
        this.modal.classList.remove('hidden');
        
        // 창이 처음 열릴 때 화면 중앙 부근에 배치 (이미 위치가 지정되어 있지 않다면)
        if (!this.modal.style.top || this.modal.style.top === '') {
            this.modal.style.top = '100px';
            this.modal.style.left = '400px';
        }

        if (this.isMinimized) {
            this.toggleMinimize();
        }
    }

    hide() {
        if (this.modal) {
            this.modal.classList.add('hidden');
            this.iframe.src = 'about:blank';
        }
    }

    toggleMinimize() {
        if (this.isMinimized) {
            this.modal.style.height = this.preMinimizeHeight || '700px';
            this.modal.classList.remove('minimized');
            this.isMinimized = false;
        } else {
            this.preMinimizeHeight = this.modal.style.height || getComputedStyle(this.modal).height;
            this.modal.style.height = '40px'; // 헤더 높이만큼
            this.modal.classList.add('minimized');
            this.isMinimized = true;
        }
    }

    _makeDraggable() {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        const dragMouseDown = (e) => {
            e.preventDefault();
            // get the mouse cursor position at startup:
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            // call a function whenever the cursor moves:
            document.onmousemove = elementDrag;
            
            // 드래그 시작 시 iframe에 pointer-events: none 처리 (드래그 끊김 방지)
            this.iframe.style.pointerEvents = 'none';
        };

        const elementDrag = (e) => {
            e.preventDefault();
            // calculate the new cursor position:
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            // set the element's new position:
            this.modal.style.top = (this.modal.offsetTop - pos2) + "px";
            this.modal.style.left = (this.modal.offsetLeft - pos1) + "px";
        };

        const closeDragElement = () => {
            // stop moving when mouse button is released:
            document.onmouseup = null;
            document.onmousemove = null;
            this.iframe.style.pointerEvents = 'auto';
        };

        if (this.header) {
            this.header.onmousedown = dragMouseDown;
        }
    }

    _makeResizable() {
        const resizer = this.resizer;
        if (!resizer) return;

        let startX, startY, startWidth, startHeight;

        const initResize = (e) => {
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(document.defaultView.getComputedStyle(this.modal).width, 10);
            startHeight = parseInt(document.defaultView.getComputedStyle(this.modal).height, 10);
            window.addEventListener('mousemove', resize, false);
            window.addEventListener('mouseup', stopResize, false);
            this.iframe.style.pointerEvents = 'none';
        };

        const resize = (e) => {
            const width = startWidth + (e.clientX - startX);
            const height = startHeight + (e.clientY - startY);
            if (width > 300) {
                this.modal.style.width = width + 'px';
            }
            if (height > 200 && !this.isMinimized) {
                this.modal.style.height = height + 'px';
            }
        };

        const stopResize = () => {
            window.removeEventListener('mousemove', resize, false);
            window.removeEventListener('mouseup', stopResize, false);
            this.iframe.style.pointerEvents = 'auto';
        };

        resizer.addEventListener('mousedown', initResize, false);
    }
}
