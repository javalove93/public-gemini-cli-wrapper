/**
 * SocketClient.js
 * 서버와의 실시간 통신(Socket.IO)을 전담하는 코어 모듈
 */
export class SocketClient {
    constructor() {
        this.socket = null;
        this.clientId = this._getOrCreateClientId();
        this.basePath = this._deriveBasePath();
    }

    /**
     * 클라이언트 ID 획득 또는 생성
     */
    _getOrCreateClientId() {
        let id = localStorage.getItem('gcw_client_id');
        if (!id) {
            id = Math.random().toString(36).substring(2, 8);
            localStorage.setItem('gcw_client_id', id);
        }
        return id;
    }

    /**
     * 현재 접속 URL을 기반으로 API Base Path 유도
     */
    _deriveBasePath() {
        return window.location.pathname
            .replace(/(index\.html|viewer\.html)$/, "")
            .replace(/\/$/, "") + "/";
    }

    /**
     * 소켓 연결 시작
     * @param {string} type - 'terminal' 또는 'viewer'
     */
    connect(type = 'terminal') {
        if (this.socket) return this.socket;

        // basePath가 이미 슬래시로 끝나므로 중복 슬래시 방지 처리
        const cleanBase = this.basePath.endsWith('/') ? this.basePath.slice(0, -1) : this.basePath;
        const socketPath = cleanBase + '/socket.io';

        console.log(`%c[CORE] Attempting socket connection. Path: ${socketPath}, Type: ${type}`, "color: yellow; background: #222; font-weight: bold;");

        this.socket = window.io({
            path: socketPath,
            query: { type, clientId: this.clientId },
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            console.log(`[CORE] Socket connected (ID: ${this.socket.id}, ClientID: ${this.clientId})`);
        });

        this.socket.on('connect_error', (err) => {
            console.error('[CORE] Socket connection error:', err);
        });

        return this.socket;
    }

    /**
     * 이벤트 리스너 등록
     */
    on(event, callback) {
        if (!this.socket) return;
        this.socket.on(event, callback);
    }

    /**
     * 이벤트 전송
     */
    emit(event, data) {
        if (!this.socket) return;
        this.socket.emit(event, data);
    }

    /**
     * API 호출을 위한 절대 경로 생성 유틸리티
     */
    getApiPath(endpoint) {
        const cleanEndpoint = endpoint.startsWith("/") ? endpoint.substring(1) : endpoint;
        return this.basePath + cleanEndpoint;
    }
}

// 싱글톤 인스턴스 내보내기
export const socketClient = new SocketClient();
