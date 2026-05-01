export class TmuxVisualizer {
    constructor(options) {
        this.tmuxManager = options.tmuxManager;

        // DOM Elements
        this.tmuxManageModal = document.getElementById('tmux-management-modal');
        this.btnManageTmux = document.getElementById('btn-manage-tmux');
        this.closeTmuxManage = document.getElementById('close-tmux-management');
        this.btnRefreshPanes = document.getElementById('btn-refresh-panes');
        this.manageWindowList = document.getElementById('manage-window-list');
        this.paneVisualMapContainer = document.getElementById('pane-visual-map-container');

        this.init();
    }

    init() {
        this._bindEvents();
        this._overrideTmuxManagerCallbacks();
    }

    _bindEvents() {
        if (this.btnManageTmux) {
            this.btnManageTmux.onclick = () => {
                if (this.tmuxManageModal) this.tmuxManageModal.style.display = 'block';
                if (this.tmuxManager) {
                    this.tmuxManager.fetchWindows();
                    this.tmuxManager.fetchPanes();
                }
            };
        }

        if (this.closeTmuxManage) {
            this.closeTmuxManage.onclick = () => {
                if (this.tmuxManageModal) this.tmuxManageModal.style.display = 'none';
            };
        }

        if (this.btnRefreshPanes) {
            this.btnRefreshPanes.onclick = () => {
                if (this.tmuxManager) this.tmuxManager.fetchPanes();
            };
        }
    }

    _overrideTmuxManagerCallbacks() {
        if (!this.tmuxManager) return;

        // 윈도우 목록 업데이트 시 관리 모달 내 리스트 갱신 연동
        const originalOnWindowListUpdated = this.tmuxManager.onWindowListUpdated;
        this.tmuxManager.onWindowListUpdated = (windows) => {
            if (typeof originalOnWindowListUpdated === 'function') {
                originalOnWindowListUpdated(windows);
            }
            this.renderManageWindowList(windows);
        };

        // 패널 목록 수신 시 비주얼 맵 렌더링 연동
        const originalOnPaneListUpdated = this.tmuxManager.onPaneListUpdated;
        this.tmuxManager.onPaneListUpdated = (panes) => {
            if (typeof originalOnPaneListUpdated === 'function') {
                originalOnPaneListUpdated(panes);
            }
            this.renderPaneVisualMap(panes);
        };
    }

    renderManageWindowList(windows) {
        if (!this.manageWindowList) return;
        this.manageWindowList.innerHTML = '';
        
        windows.forEach(win => {
            const item = document.createElement('li');
            item.className = 'manage-item';
            if (win.active) item.classList.add('active');
            
            item.innerHTML = `
                <div class="manage-item-info">
                    <span class="manage-item-name">${win.index}: ${win.name}</span>
                    <span class="manage-item-meta">${win.active ? '(Active Window)' : ''}</span>
                </div>
                <button class="btn-kill-small" data-index="${win.index}">Kill</button>
            `;
            
            item.onclick = () => {
                if (this.tmuxManager) this.tmuxManager.selectWindow(win.index);
            };
            
            const killBtn = item.querySelector('.btn-kill-small');
            if (killBtn) {
                killBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`Kill window ${win.index}?`)) {
                        if (this.tmuxManager) this.tmuxManager.killWindow(win.index);
                    }
                };
            }
            
            this.manageWindowList.appendChild(item);
        });
    }

    renderPaneVisualMap(panes) {
        if (!this.paneVisualMapContainer) return;
        this.paneVisualMapContainer.innerHTML = '';
        
        if (panes.length === 0) return;
        
        // 전체 좌표 범위 계산 (Tmux 좌표계는 0부터 시작)
        const maxWidth = Math.max(...panes.map(p => p.left + p.width));
        const maxHeight = Math.max(...panes.map(p => p.top + p.height));
        
        panes.forEach(pane => {
            const block = document.createElement('div');
            block.className = 'pane-block';
            if (pane.active) block.classList.add('active');
            
            // 백분율로 위치 계산
            block.style.left = `${(pane.left / maxWidth) * 100}%`;
            block.style.top = `${(pane.top / maxHeight) * 100}%`;
            block.style.width = `${(pane.width / maxWidth) * 100}%`;
            block.style.height = `${(pane.height / maxHeight) * 100}%`;
            
            block.innerHTML = `
                <div class="pane-block-index">#${pane.index}</div>
                <div class="pane-block-cmd">${pane.command}</div>
                <div class="pane-block-actions">
                    <button class="btn-kill-small" title="Kill Pane">Kill</button>
                </div>
            `;
            
            const killBtn = block.querySelector('.btn-kill-small');
            if (killBtn) {
                killBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`Kill pane #${pane.index}?`)) {
                        if (this.tmuxManager) this.tmuxManager.killPane(pane.index);
                    }
                };
            }
            
            this.paneVisualMapContainer.appendChild(block);
        });
    }
}