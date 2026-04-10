import { socketClient } from './SocketClient.js';

/**
 * FileManager.js
 * 파일 시스템 데이터(목록, 내용) 획득, 조작 및 현재 경로 상태 관리
 */
export class FileManager {
    constructor() {
        this.currentDir = '';
        this.fileList = [];
        this._setupListeners();
    }

    /**
     * 서버로부터의 파일 시스템 변화 알림 리스너 설정
     */
    _setupListeners() {
        // 파일 이름 변경 성공 시
        socketClient.on('file_renamed', () => {
            console.log('[CORE] File renamed successfully. Refreshing tree...');
            this.loadFileTree(this.currentDir);
        });

        // 파일 삭제 성공 시
        socketClient.on('file_deleted', () => {
            console.log('[CORE] File deleted successfully. Refreshing tree...');
            this.loadFileTree(this.currentDir);
        });

        // 일반 파일 업로드 성공 시
        socketClient.on('file_uploaded', (info) => {
            console.log('[CORE] File uploaded successfully. Refreshing tree...');
            if (this.currentDir === info.dir || (this.currentDir === '' && !info.dir)) {
                this.loadFileTree(this.currentDir);
            }
        });

        // 디렉토리 변경 알림 수신 (서버 감시자로부터)
        let refreshTimeout = null;
        socketClient.on('directory_changed', (data) => {
            if (this.currentDir === data.dir || (this.currentDir === '' && data.dir === '.')) {
                console.log('[CORE] External directory change detected. Debouncing refresh...');
                
                if (refreshTimeout) clearTimeout(refreshTimeout);
                refreshTimeout = setTimeout(() => {
                    this.loadFileTree(this.currentDir);
                    refreshTimeout = null;
                }, 500);
            }
        });
    }

    /**
     * 디렉토리 파일 목록 조회
     */
    async loadFileTree(dir = this.currentDir) {
        this.currentDir = dir;
        const query = dir ? `?dir=${encodeURIComponent(dir)}` : '';
        const url = socketClient.getApiPath(`/api/files${query}`);

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch file list');
            
            this.fileList = await response.json();
            return this.fileList;
        } catch (error) {
            console.error('[CORE] Error loading file tree:', error);
            throw error;
        }
    }

    /**
     * 특정 디렉토리 감시 시작 요청
     */
    watchDirectory(dir = this.currentDir) {
        socketClient.emit('watch_directory', dir || '.');
    }

    /**
     * 파일 조작 (명령 전송)
     */
    deleteFile(filePath) {
        socketClient.emit('delete_file', { path: filePath });
    }

    renameFile(oldPath, newName) {
        socketClient.emit('rename_file', { oldPath: oldPath, newName: newName });
    }

    /**
     * 파일 업로드 (청크 방식)
     * @param {string} filename - 파일 이름
     * @param {ArrayBuffer} data - 파일 데이터
     * @param {string} dir - 대상 디렉토리
     * @param {function} onProgress - 진행률 콜백 (percent) => {}
     */
    async uploadFile(filename, data, dir = this.currentDir, onProgress = null) {
        const MAX_SIZE = 1024 * 1024 * 1024; // 1GB
        if (data.byteLength > MAX_SIZE) {
            alert(`파일 용량이 너무 큽니다. (최대 1GB, 현재: ${(data.byteLength / (1024 * 1024)).toFixed(2)}MB)\n1GB 이상의 파일은 SSH 또는 외부 툴을 이용해 업로드해주세요.`);
            return;
        }

        const uploadId = (typeof crypto.randomUUID === 'function') 
            ? crypto.randomUUID() 
            : Math.random().toString(36).substring(2, 15);
        const totalSize = data.byteLength;
        const chunkSize = 256 * 1024; // 256KB 청크 단위
        let offset = 0;

        // 업로드 시작 알림
        socketClient.emit('upload_file_start', { uploadId, filename, totalSize, dir });

        // 서버의 ACK를 기다려 순차적으로 전송 (안정성 확보)
        const sendNextChunk = () => {
            if (offset < totalSize) {
                const length = Math.min(chunkSize, totalSize - offset);
                const chunk = data.slice(offset, offset + length);
                
                socketClient.emit('upload_file_chunk', { uploadId, data: chunk });
                offset += length;

                if (onProgress) {
                    const percent = Math.round((offset / totalSize) * 100);
                    onProgress(percent, uploadId, filename);
                }
            } else {
                // 모든 청크 전송 완료
                socketClient.emit('upload_file_end', { uploadId });
                // 리스너 해제
                socketClient.off('upload_file_ack', ackHandler);
            }
        };

        const ackHandler = (payload) => {
            if (payload.uploadId === uploadId) {
                sendNextChunk();
            }
        };

        socketClient.on('upload_file_ack', ackHandler);

        // 첫 번째 청크 전송 시작
        sendNextChunk();
    }

    async getFileContent(path) {
        const url = socketClient.getApiPath(`/api/files/content?path=${encodeURIComponent(path)}`);
        const response = await fetch(url);
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Server returned ${response.status}: ${errText}`);
        }
        return await response.text();
    }
}

export const fileManager = new FileManager();
