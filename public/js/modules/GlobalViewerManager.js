/**
 * GlobalViewerManager.js
 * 내부 팝업(Floating Popups)과 외부 브라우저 탭(External Tabs)을 통합 관리함.
 * 드롭다운 목록 UI를 통해 공간을 절약함.
 */
export class GlobalViewerManager {
    constructor(options) {
        this.container = document.getElementById('viewer-dropdown-content');
        this.wrapper = document.getElementById('viewer-list-container');
        this.countBadge = document.getElementById('viewer-count');
        this.onActivatePopup = options.onActivatePopup; 
        
        this.viewers = new Map(); // id -> viewerInfo
        this.channel = new BroadcastChannel('gcw_viewer_channel');
        this.mainTabId = 'main-app-' + Date.now();
        
        this.init();
    }

    init() {
        this.channel.onmessage = (event) => {
            const { type, payload } = event.data;
            
            switch (type) {
                case 'VIEWER_OPENED':
                    this._registerExternalViewer(payload);
                    break;
                case 'VIEWER_CLOSED':
                    this._unregisterExternalViewer(payload.id);
                    break;
                case 'VIEWER_PONG':
                    this._registerExternalViewer(payload);
                    break;
            }
        };

        setInterval(() => {
            this.channel.postMessage({ type: 'PING_VIEWERS' });
        }, 3000);
    }

    registerPopup(filePath) {
        const id = `popup-${filePath}`;
        this.viewers.set(id, {
            id,
            type: 'popup',
            path: filePath,
            title: filePath.split('/').pop()
        });
        this.render();
    }

    unregisterPopup(filePath) {
        const id = `popup-${filePath}`;
        if (this.viewers.has(id)) {
            this.viewers.delete(id);
            this.render();
        }
    }

    _registerExternalViewer(payload) {
        const id = payload.id;
        if (!this.viewers.has(id)) {
            this.viewers.set(id, {
                id,
                type: 'external',
                path: payload.path,
                title: payload.path.split('/').pop()
            });
            this.render();
        }
    }

    _unregisterExternalViewer(id) {
        if (this.viewers.has(id)) {
            this.viewers.delete(id);
            this.render();
        }
    }

    activateViewer(id) {
        const viewer = this.viewers.get(id);
        if (!viewer) return;

        if (viewer.type === 'popup') {
            if (this.onActivatePopup) this.onActivatePopup(viewer.path);
        } else {
            this.channel.postMessage({ type: 'ACTIVATE_VIEWER', payload: { id } });
        }
    }

    render() {
        if (!this.container || !this.wrapper) return;
        this.container.innerHTML = '';

        const total = this.viewers.size;
        if (total === 0) {
            this.wrapper.style.display = 'none';
            return;
        }

        this.wrapper.style.display = 'inline-block';
        if (this.countBadge) this.countBadge.textContent = total;

        const sorted = Array.from(this.viewers.values()).sort((a, b) => {
            if (a.type === b.type) return 0;
            return a.type === 'popup' ? -1 : 1;
        });

        sorted.forEach(info => {
            const item = document.createElement('div');
            item.className = `viewer-list-item ${info.type}`;
            item.title = info.path;
            
            const icon = info.type === 'popup' ? '🪟 ' : '🌐 ';
            
            const infoBox = document.createElement('div');
            infoBox.style.display = 'flex';
            infoBox.style.alignItems = 'center';
            infoBox.style.flex = '1';
            infoBox.style.minWidth = '0';
            infoBox.innerHTML = `<span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${icon}${info.title}</span>`;

            const pathInfo = document.createElement('span');
            pathInfo.className = 'path';
            pathInfo.textContent = info.path;

            item.appendChild(infoBox);
            item.appendChild(pathInfo);
            
            item.onclick = (e) => {
                e.stopPropagation();
                this.activateViewer(info.id);
                // 드롭다운 닫기 유도 (hover 방식이라 자동으로 닫히지만 명시적 처리 가능)
            };
            
            this.container.appendChild(item);
        });
    }
}
