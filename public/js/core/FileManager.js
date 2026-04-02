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
        socketClient.on('directory_changed', (data) => {
            if (this.currentDir === data.dir || (this.currentDir === '' && data.dir === '.')) {
                console.log('[CORE] External directory change detected. Refreshing...');
                this.loadFileTree(this.currentDir);
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
        socketClient.emit('delete_file', { filepath: filePath });
    }

    renameFile(oldPath, newName) {
        socketClient.emit('rename_file', { oldPath: oldPath, newName: newName });
    }

    uploadFile(filename, data, dir = this.currentDir) {
        socketClient.emit('upload_file', { filename, data, dir });
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
