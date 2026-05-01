export class SidebarManager {
    constructor(options) {
        // 의존성 주입 (Dependency Injection)
        this.fileManager = options.fileManager;
        this.tmuxManager = options.tmuxManager;
        this.socket = options.socket;
        this.getUiSetting = options.getUiSetting;
        this.saveUiSetting = options.saveUiSetting; // 누락된 할당 추가
        this.getApiPath = options.getApiPath; // 추가됨
        
        // 콜백 함수
        this.onLoadThumbnails = options.onLoadThumbnails;

        // DOM Elements 캐싱
        this.fileTree = document.getElementById('file-tree');
        this.dirInput = document.getElementById('dir-input');
        this.btnSyncTmux = document.getElementById('btn-sync-tmux');
        this.btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
        this.sidebar = document.getElementById('sidebar');
        this.contextMenu = document.getElementById('context-menu');
        this.btnFileSort = document.getElementById('btn-file-sort');
        this.btnFileTruncate = document.getElementById('btn-file-truncate');

        // 컨텍스트 메뉴 액션 버튼 캐싱 (실제 HTML ID로 매핑)
        this.ctxDownload = document.getElementById('menu-download');
        this.ctxCopyPath = document.getElementById('menu-copy-path'); // 존재 여부 불확실, 안전 장치 작동
        this.ctxCopyFileName = document.getElementById('menu-copy-filename'); // 존재 여부 불확실
        this.ctxDelete = document.getElementById('menu-delete');
        this.ctxRename = document.getElementById('menu-rename');
        this.ctxOpenViewer = document.getElementById('menu-view');

        // 상태 변수
        this.selectedFileContext = null;

        this.init();
    }

    init() {
        this._initSortButton();
        this._initTruncateButton();
        this._bindEvents();
        
        // 전역 클릭 시 컨텍스트 메뉴 숨기기
        document.addEventListener('click', () => {
            if (this.contextMenu && !this.contextMenu.classList.contains('hidden')) {
                this.contextMenu.classList.add('hidden');
            }
        });
    }

    _initSortButton() {
        if (!this.btnFileSort) return;

        const modes = ['0', '2']; // 0: name, 2: date (to keep backward compatibility with legacy STYLE key)
        const icons = ['Aa', '🕒'];
        const titles = ['Sort: Alphabetical', 'Sort: Recent Date'];
        
        // Use the legacy key GCW_UI_FILE_TREE_STYLE for sorting
        let savedMode = this.getUiSetting ? (this.getUiSetting('GCW_UI_FILE_TREE_STYLE') || '0') : '0';
        // Fallback: If it was '1' (legacy mid-truncate), treat it as '0' for sorting purposes
        if (savedMode === '1') savedMode = '0';
        
        let initialIndex = modes.indexOf(savedMode) !== -1 ? modes.indexOf(savedMode) : 0;
        
        this.btnFileSort.textContent = icons[initialIndex];
        this.btnFileSort.title = titles[initialIndex];

        this.btnFileSort.onclick = () => {
            let currentMode = this.getUiSetting ? (this.getUiSetting('GCW_UI_FILE_TREE_STYLE') || '0') : '0';
            if (currentMode === '1') currentMode = '0';
            
            let nextIndex = (modes.indexOf(currentMode) + 1) % 2;
            let nextMode = modes[nextIndex];
            
            if (this.saveUiSetting) {
                this.saveUiSetting('GCW_UI_FILE_TREE_STYLE', nextMode);
            }
            
            this.btnFileSort.textContent = icons[nextIndex];
            this.btnFileSort.title = titles[nextIndex];
            
            if (this.fileManager && this.fileManager.currentDir !== undefined) {
                this.loadFileTree(this.fileManager.currentDir);
            }
        };
    }

    _initTruncateButton() {
        if (!this.btnFileTruncate) return;

        const modes = ['end', 'mid'];
        const icons = ['A...', 'A..z'];
        const titles = ['Truncate: End (CSS default)', 'Truncate: Middle'];
        
        // Define a completely new key for truncation
        let savedMode = this.getUiSetting ? (this.getUiSetting('GCW_UI_FILE_TREE_TRUNCATE') || 'end') : 'end';
        let initialIndex = modes.indexOf(savedMode) !== -1 ? modes.indexOf(savedMode) : 0;
        
        this.btnFileTruncate.textContent = icons[initialIndex];
        this.btnFileTruncate.title = titles[initialIndex];

        this.btnFileTruncate.onclick = () => {
            let currentMode = this.getUiSetting ? (this.getUiSetting('GCW_UI_FILE_TREE_TRUNCATE') || 'end') : 'end';
            let nextIndex = (modes.indexOf(currentMode) + 1) % 2;
            let nextMode = modes[nextIndex];
            
            if (this.saveUiSetting) {
                this.saveUiSetting('GCW_UI_FILE_TREE_TRUNCATE', nextMode);
            }
            
            this.btnFileTruncate.textContent = icons[nextIndex];
            this.btnFileTruncate.title = titles[nextIndex];
            
            if (this.fileManager && this.fileManager.currentDir !== undefined) {
                this.loadFileTree(this.fileManager.currentDir);
            }
        };
    }

    _bindEvents() {
        // 디렉토리 입력창 엔터 처리
        if (this.dirInput) {
            this.dirInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.loadFileTree(this.dirInput.value.trim());
                }
            });
        }

        // Tmux 경로 동기화
        if (this.btnSyncTmux) {
            this.btnSyncTmux.onclick = async () => {
                if (!this.tmuxManager || !this.tmuxManager.currentSession) return;
                try {
                    const pwd = await this.tmuxManager.fetchSessionPwd();
                    if (pwd) {
                        if (this.fileManager.currentDir !== pwd) {
                            console.log(`[DEBUG] PWD changed from '${this.fileManager.currentDir}' to '${pwd}'. Syncing file tree...`);
                            this.loadFileTree(pwd);
                        } else {
                            console.log(`[DEBUG] PWD is same ('${this.fileManager.currentDir}'). Skipping sync.`);
                        }
                    }
                } catch (err) {
                    console.error('Failed to sync tmux pwd:', err);
                }
            };
        }

        // 사이드바 토글
        if (this.btnToggleSidebar) {
            this.btnToggleSidebar.onclick = () => {
                if (this.sidebar) {
                    this.sidebar.classList.toggle('hidden');
                }
            };
        }

        // 컨텍스트 메뉴 액션 바인딩
        if (this.ctxDownload) {
            this.ctxDownload.onclick = () => {
                if (this.selectedFileContext && !this.selectedFileContext.isDirectory) {
                    const apiFn = this.getApiPath ? this.getApiPath : (ep) => ep;
                    const downloadUrl = apiFn(`/api/download?path=${encodeURIComponent(this.selectedFileContext.path)}`);
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = this.selectedFileContext.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }
                this.contextMenu.classList.add('hidden');
            };
        }

        if (this.ctxCopyPath) {
            this.ctxCopyPath.onclick = () => {
                if (this.selectedFileContext) {
                    navigator.clipboard.writeText(this.selectedFileContext.path).catch(err => {
                        console.error('Failed to copy path:', err);
                    });
                }
                this.contextMenu.classList.add('hidden');
            };
        }

        if (this.ctxCopyFileName) {
            this.ctxCopyFileName.onclick = () => {
                if (this.selectedFileContext) {
                    navigator.clipboard.writeText(this.selectedFileContext.name).catch(err => {
                        console.error('Failed to copy file name:', err);
                    });
                }
                this.contextMenu.classList.add('hidden');
            };
        }

        if (this.ctxDelete) {
            this.ctxDelete.onclick = () => {
                if (this.selectedFileContext) {
                    const isDir = this.selectedFileContext.isDirectory;
                    const msg = isDir ? `'${this.selectedFileContext.name}' 폴더와 그 안의 모든 내용을 삭제하시겠습니까?` : `'${this.selectedFileContext.name}' 파일을 삭제하시겠습니까?`;
                    if (confirm(msg)) {
                        this.fileManager.deleteFile(this.selectedFileContext.path);
                    }
                }
                this.contextMenu.classList.add('hidden');
            };
        }

        if (this.ctxRename) {
            this.ctxRename.onclick = () => {
                if (this.selectedFileContext) {
                    const newName = prompt(`새 이름을 입력하세요 (${this.selectedFileContext.name}):`, this.selectedFileContext.name);
                    if (newName && newName.trim() !== '' && newName !== this.selectedFileContext.name) {
                        this.fileManager.renameFile(this.selectedFileContext.path, newName.trim());
                    }
                }
                this.contextMenu.classList.add('hidden');
            };
        }

        if (this.ctxOpenViewer) {
            this.ctxOpenViewer.onclick = () => {
                if (this.selectedFileContext && !this.selectedFileContext.isDirectory) {
                    // basePath를 알아내기 위해 현재 URL을 활용하거나, FileManager 등에서 주입받아야 함
                    // 현재는 간단히 절대 경로 기반으로 처리
                    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
                    const viewerUrl = `${basePath}viewer.html?path=${encodeURIComponent(this.selectedFileContext.path)}`;
                    window.open(viewerUrl, '_blank');
                }
                this.contextMenu.classList.add('hidden');
            };
        }
    }

    async loadFileTree(dir = '') {
        if (!this.fileTree || !this.dirInput || !this.fileManager) return;

        const files = await this.fileManager.loadFileTree(dir);
        this.fileManager.watchDirectory(dir);

        try {
            this.fileTree.innerHTML = '';
            
            // 입력창에 현재 경로 표시
            this.dirInput.value = dir || '.';
            
            // 썸네일 불러오기 (콜백 통해 app.js로 위임)
            if (this.onLoadThumbnails) {
                this.onLoadThumbnails(dir);
            }

            // 스타일 모드 읽기
            let sortMode = this.getUiSetting ? (this.getUiSetting('GCW_UI_FILE_TREE_STYLE') || '0') : '0';
            let truncateMode = this.getUiSetting ? (this.getUiSetting('GCW_UI_FILE_TREE_TRUNCATE') || 'end') : 'end';
            let sortedFiles = [...files];

            if (sortMode === '2') {
                // 최신날짜 순 정렬
                sortedFiles.sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return (b.mtime || 0) - (a.mtime || 0);
                });
            } else {
                // 알파벳 순 정렬
                sortedFiles.sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.name.localeCompare(b.name);
                });
            }

            // 하위 폴더인 경우 상위로 돌아가는(..) 항목 추가
            if (dir && dir !== '.') {
                const upDiv = document.createElement('div');
                upDiv.className = 'file-item dir';
                upDiv.textContent = '📁 ..';
                upDiv.title = 'Go back to parent directory';
                upDiv.onclick = () => {
                    const parts = dir.split('/');
                    parts.pop(); // 현재 폴더 제거
                    this.loadFileTree(parts.join('/'));
                };
                this.fileTree.appendChild(upDiv);
            }

            sortedFiles.forEach(f => {
                const div = document.createElement('div');
                div.className = `file-item ${f.isDirectory ? 'dir' : 'file'}`;
                
                let displayName = f.name;
                // Mode mid: 중간 자르기 (Mid-Truncate)
                if (truncateMode === 'mid' && displayName.length > 25) {
                    const startLen = 12;
                    const endLen = 10;
                    if (displayName.length > startLen + endLen) {
                        displayName = displayName.substring(0, startLen) + '...' + displayName.substring(displayName.length - endLen);
                    }
                }
                
                div.textContent = (f.isDirectory ? '📁 ' : '📄 ') + displayName;
                div.title = f.name;
                
                // 폴더 클릭 이벤트
                if (f.isDirectory) {
                    div.onclick = () => {
                        this.loadFileTree(f.path);
                    };
                }
                
                // 더블클릭 이벤트 (터미널에 경로 삽입)
                div.ondblclick = (e) => {
                    if (this.socket) {
                        this.socket.emit('input', `@${f.path} `);
                    }
                };
                
                // 우클릭 컨텍스트 메뉴
                div.oncontextmenu = (e) => {
                    e.preventDefault();
                    this.selectedFileContext = f;
                    
                    if (this.contextMenu) {
                        this.contextMenu.style.left = `${e.pageX}px`;
                        this.contextMenu.style.top = `${e.pageY}px`;
                        this.contextMenu.classList.remove('hidden');
                    }
                };
                
                this.fileTree.appendChild(div);
            });
        } catch (err) {
            console.error('[SidebarManager] Error rendering file tree:', err);
            this.fileTree.innerHTML = '<p>파일 목록을 불러오지 못했습니다.</p>';
        }
    }
}