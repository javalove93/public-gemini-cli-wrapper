import { socketClient } from './SocketClient.js';

/**
 * TmuxManager.js
 * 터미널 세션 제어 및 상태(현재 세션명 등)를 관리하는 코어 모듈
 */
export class TmuxManager {
    constructor() {
        this.currentSession = null;
        this.windows = []; // 현재 세션의 윈도우 목록
    }

    /**
     * Socket이 연결된 후 명시적으로 리스너를 초기화해야 함
     */
    initListeners() {
        // 세션 생성 성공 수신
        socketClient.on('created', (sessionName) => {
            console.log(`[CORE] Tmux session created/attached: ${sessionName}`);
            this.currentSession = sessionName;
            this.onSessionChanged(sessionName);
            // 세션 연결 시 자동으로 윈도우 목록 조회
            this.fetchWindows();
        });

        // 세션 이름 변경 수신
        socketClient.on('session_renamed', (newName) => {
            console.log(`[CORE] Tmux session renamed to: ${newName}`);
            this.currentSession = newName;
            this.onSessionChanged(newName);
        });

        // Tmux 윈도우 목록 수신
        socketClient.on('window_list', (windows) => {
            console.log(`[CORE] Received tmux window list:`, windows);
            this.windows = windows;
            this.onWindowListUpdated(windows);
        });

        // 터미널 PTY 종료 수신
        socketClient.on('exit', () => {
            console.log('[CORE] PTY process exited.');
            this.onSessionExited();
        });
    }

    /**
     * 외부(View)에서 세션 변경 이벤트 구독용 콜백 오버라이드
     */
    onSessionChanged(sessionName) {
        // UI 레이어에서 오버라이드하여 사용
    }

    /**
     * 외부(View)에서 세션 종료 이벤트 구독용 콜백 오버라이드
     */
    onSessionExited() {
        // UI 레이어에서 오버라이드하여 사용
    }

    /**
     * 외부(View)에서 윈도우 목록 업데이트 이벤트 구독용 콜백 오버라이드
     */
    onWindowListUpdated(windows) {
        // UI 레이어에서 오버라이드하여 사용
    }

    /**
     * 현재 세션의 윈도우 목록 조회 요청
     */
    fetchWindows() {
        if (!this.currentSession) return;
        socketClient.emit('list_windows');
    }

    /**
     * 특정 윈도우 선택 요청
     */
    selectWindow(index) {
        if (!this.currentSession) return;
        socketClient.emit('select_window', index);
    }

    /**
     * 새로운 Tmux 세션 생성 요청
     */
    createSession(sessionName = '', keepAlive = false) {
        socketClient.emit('create', { sessionName, keepAlive });
    }

    /**
     * 기존 Tmux 세션에 Attach 요청
     */
    attachSession(sessionName) {
        this.currentSession = sessionName;
        socketClient.emit('attach', sessionName);
        this.onSessionChanged(sessionName);
    }

    /**
     * 세션 이름 변경 요청
     */
    renameSession(oldName, newName) {
        if (!oldName || !newName || oldName === newName) return;
        socketClient.emit('rename_session', { oldName, newName });
    }

    /**
     * 터미널에 문자열(명령어) 전송
     */
    sendInput(data) {
        socketClient.emit('input', data);
    }

    /**
     * 터미널 창 크기 변경 알림
     */
    sendResize(cols, rows) {
        socketClient.emit('resize', { cols, rows });
    }

    /**
     * PWD(현재 작업 디렉토리) 동기화 요청 (Promise 반환)
     */
    async fetchSessionPwd() {
        if (!this.currentSession) return null;
        try {
            const url = socketClient.getApiPath(`/api/tmux/pwd?session=${encodeURIComponent(this.currentSession)}`);
            const response = await fetch(url);
            const data = await response.json();
            return data.pwd || null;
        } catch (err) {
            console.error('[CORE] Failed to sync tmux pwd:', err);
            return null;
        }
    }
}

export const tmuxManager = new TmuxManager();
