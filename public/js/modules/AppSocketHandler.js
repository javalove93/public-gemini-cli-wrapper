export class AppSocketHandler {
    constructor(options) {
        // 의존성 주입 (Dependency Injection)
        this.socket = options.socket;
        this.socketClient = options.socketClient;
        this.fileManager = options.fileManager;
        this.tmuxManager = options.tmuxManager;
        this.terminalManager = options.terminalManager; // 추가
        this.sidebarManager = options.sidebarManager;
        this.getApiPath = options.getApiPath;
        this.optTheme = options.optTheme;
        this.getTerm = options.getTerm; // 추가: 터미널 인스턴스 접근용

        // 콜백 함수 주입 (app.js 내부의 상태/UI에 의존적인 함수들)
        this.onAttachSession = options.onAttachSession;
        this.onAddThumbnail = options.onAddThumbnail;
        this.onDetach = options.onDetach; // 추가: 세션 분리 로직
        this.onRenderTmuxWindowTabs = options.onRenderTmuxWindowTabs; // 추가: 윈도우 탭 렌더링

        this.init();
    }

    init() {
        this._bindGlobalSocketEvents();
        this._bindTmuxManagerCallbacks();
    }

    _bindGlobalSocketEvents() {
        if (!this.socket) return;

        // 1. 에러 이벤트
        this.socket.on('error', (msg) => {
            alert(msg);
        });

        // 터미널 출력 (output)
        this.socket.on('output', data => {
            const tm = this.terminalManager; // this 사용
            if (tm) {
                tm.writeWithBombDetection(data);
            } else {
                const term = this.getTerm ? this.getTerm() : null;
                if (term) term.write(data);
            }
        });

        // 터미널 스냅샷 (폭탄 로그 대응)
        this.socket.on('terminal_snapshot', snapshotData => {
            const tm = this.terminalManager; // this 사용
            if (tm) {
                tm.applySnapshot(snapshotData);
            }
        });

        // 세션 종료 (exit)
        this.socket.on('exit', () => {
            console.log('[DEBUG] PTY Exit received. UI will show disconnection overlay.');
            if (this.tmuxManager) {
                this.tmuxManager.onSessionExited();
            }
        });

        // 2. 디렉토리 변경 (fswatch) 이벤트
        this.socket.on('directory_changed', (data) => {
            console.log(`[DEBUG] Directory change detected in: ${data.dir}. Refreshing file tree...`);
            if (this.fileManager.currentDir === data.dir || (this.fileManager.currentDir === '' && data.dir === '.')) {
                if (this.sidebarManager) {
                    this.sidebarManager.loadFileTree(this.fileManager.currentDir);
                }
            }
        });

        // 3. 이미지 업로드 완료 이벤트
        this.socket.on('image_uploaded', (info) => {
            // 서버가 전달해준 절대 경로를 터미널에 입력 (공백 포함하여 바로 다음 명령어 입력 가능하게)
            this.socket.emit('input', `@${info.filepath} `);

            // 썸네일 바 업데이트 (현재 디렉토리와 일치할 때만)
            if (this.fileManager.currentDir === info.dir || (this.fileManager.currentDir === '' && !info.dir)) {
                if (this.onAddThumbnail) {
                    this.onAddThumbnail(info);
                }
            }

            // 파일 트리 갱신 (현재 디렉토리와 일치할 때만)
            if (this.fileManager.currentDir === info.dir || (this.fileManager.currentDir === '' && !info.dir)) {
                if (this.sidebarManager) {
                    this.sidebarManager.loadFileTree(this.fileManager.currentDir);
                }
            }
        });

        // 4. 시스템 정보 (현재 미사용이지만 확장을 위해 껍데기 유지)
        // this.socket.on('system_info', (data) => { ... });
    }

    _bindTmuxManagerCallbacks() {
        if (!this.tmuxManager) return;

        // Tmux 세션 변경 콜백
        this.tmuxManager.onSessionChanged = (name) => {
            console.log('[VIEW] Session changed:', name);
            if (this.onAttachSession) {
                this.onAttachSession(name); // app.js의 UI 업데이트 로직 재사용
            }
            
            // 세션이 변경되거나 재연결되면 오버레이를 숨김
            const overlay = document.getElementById('disconnect-overlay');
            if (overlay) overlay.style.display = 'none';
        };

        // Tmux 세션 종료 콜백
        this.tmuxManager.onSessionExited = () => {
            // TerminalManager 인스턴스에 직접 접근하기보다, xterm.js 화면에 연결 끊김 표시
            // (터미널 출력 제어는 가급적 TerminalManager가 해야 하지만 일단 기존 로직 포팅)
            const terminalContainer = document.getElementById('terminal');
            if (terminalContainer && terminalContainer.querySelector('.xterm')) {
                // 우회적인 텍스트 출력 방식 (옵션)
                // 실제로는 TerminalManager 인스턴스의 term.write()를 호출하는 것이 권장됨.
            }
            
            // 연결이 끊어지면 오버레이를 표시
            const overlay = document.getElementById('disconnect-overlay');
            if (overlay) overlay.style.display = 'flex';
        };

        // Tmux 윈도우 리스트 업데이트 콜백
        this.tmuxManager.onWindowListUpdated = (windows) => {
            console.log('[VIEW] Window list updated:', windows);
            if (this.onRenderTmuxWindowTabs) {
                this.onRenderTmuxWindowTabs(windows);
            }
        };
    }
}