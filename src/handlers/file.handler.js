const fs = require('fs');
const path = require('path');

// --- 유틸리티 함수 ---
function getNextImageFilename(dirPath, ext) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    const files = fs.readdirSync(dirPath);
    let maxIdx = -1;
    files.forEach(file => {
        const match = file.match(/^(\d{5})\./);
        if (match) {
            const idx = parseInt(match[1], 10);
            if (idx > maxIdx) maxIdx = idx;
        }
    });
    return String(maxIdx + 1).padStart(5, '0') + '.' + ext;
}

function getScreenshotsDir(dir) {
    const targetDir = dir ? path.resolve(process.cwd(), dir) : process.cwd();
    return path.join(targetDir, 'screenshots');
}
// -------------------

/**
 * 파일 시스템 조작을 위한 HTTP API 라우트 등록
 * @param {object} app - Express 앱 인스턴스
 */
function registerFileApiRoutes(app) {
    // API: 현재 작업 디렉토리의 파일 트리 조회 (간단한 버전)
    app.get('/api/files', (req, res) => {
        const queryDir = req.query.dir || '';
        const dir = path.isAbsolute(queryDir) ? queryDir : path.resolve(process.cwd(), queryDir);

        try {
            if (!fs.existsSync(dir)) {
                return res.json([]);
            }
            const items = fs.readdirSync(dir, { withFileTypes: true });
            const result = items.map(item => {
                const fullPath = path.join(dir, item.name);
                let mtime = 0;
                try {
                    // 심볼릭 링크나 권한 에러 방지
                    mtime = fs.statSync(fullPath).mtimeMs;
                } catch (e) {
                    // 에러 발생 시 mtime을 0으로 설정하고 계속 진행
                }
                return {
                    name: item.name,
                    isDirectory: item.isDirectory(),
                    path: fullPath,
                    mtime: mtime
                };
            });
            res.json(result);
        } catch (err) {
            console.error('[FILE] Error loading directory:', dir, err);
            res.status(500).json({ error: err.message });
        }
    });

    // API: 파일 내용 읽기
    app.get('/api/files/content', (req, res) => {
        try {
            const filePath = req.query.path;
            if (!filePath) {
                return res.status(400).json({ error: 'File path is required' });
            }

            const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

            if (!fs.existsSync(absolutePath)) {
                return res.status(404).json({ error: 'File not found' });
            }

            const content = fs.readFileSync(absolutePath, 'utf8');
            res.send(content);
        } catch (error) {
            console.error('Error reading file:', error);
            res.status(500).json({ error: 'Failed to read file' });
        }
    });

    const express = require('express');
    // API: 파일 내용 저장 (Edit 기능 지원)
    app.post('/api/files/save', express.json({ limit: '50mb' }), (req, res) => {
        try {
            const { path: filePath, content } = req.body;
            if (!filePath) {
                return res.status(400).json({ error: 'File path is required' });
            }

            const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

            // 파일에 쓰기 (UTF-8)
            fs.writeFileSync(absolutePath, content, 'utf8');
            console.log(`[FILE] File saved via API: ${absolutePath}`);
            
            res.json({ success: true });
        } catch (error) {
            console.error('Error saving file:', error);
            res.status(500).json({ error: 'Failed to save file: ' + error.message });
        }
    });

    // API: 현재 디렉토리의 최근 저장된 이미지 5개 목록 조회
    app.get('/api/latest-images', (req, res) => {
        try {
            const screenshotsDir = getScreenshotsDir(req.query.dir);

            if (!fs.existsSync(screenshotsDir)) return res.json([]);

            const files = fs.readdirSync(screenshotsDir);
            const imageFiles = files
                .filter(file => file.match(/^(\d{5})\.(png|jpe?g|gif)$/))
                .sort((a, b) => b.localeCompare(a)) // 역순 정렬 (최신순)
                .slice(0, 5) // 최근 5개
                .map(file => {
                    const filepath = path.join(screenshotsDir, file).replace(/\\/g, '/');
                    return {
                        filename: file,
                        filepath: filepath,
                        url: `/api/image?path=${encodeURIComponent(filepath)}`,
                        dir: req.query.dir
                    };
                });

            res.json(imageFiles);
        } catch (err) {
            console.error('Failed to get latest images', err);
            res.status(500).json({ error: 'Failed' });
        }
    });

    // API: 저장된 이미지 로드 (CORS 문제 우회용)
    app.get('/api/image', (req, res) => {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).send('Path is required');

        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

        if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
            res.sendFile(absolutePath, { root: '/' });
        } else {
            res.status(404).send('Image not found');
        }
    });

    // API: 파일 다운로드
    app.get('/api/download', (req, res) => {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).send('Path is required');
        
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
        
        if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
            res.download(absolutePath, path.basename(absolutePath), { root: '/' });
        } else {
            res.status(404).send('File not found');
        }
    });
}

/**
 * 파일 시스템 조작 소켓 이벤트 핸들러
 * @param {object} socket - 연결된 클라이언트 소켓
 * @param {object} io - Socket.IO 서버 인스턴스
 */
function registerFileHandlers(socket, io) {
    let fileWatcher = null;

    // 뷰어를 위한 단일 파일 실시간 감지
    let fileWatchTimeout = null;
    socket.on('watch_file', (filePath) => {
        if (fileWatcher) fileWatcher.close();
        if (fileWatchTimeout) clearTimeout(fileWatchTimeout);
        
        try {
            const absPath = path.resolve(process.cwd(), filePath);
            if (!fs.existsSync(absPath)) return;
            
            // 파일 변경 시 (저장 등) 뷰어에 변경 알림 전송
            fileWatcher = fs.watch(absPath, (eventType) => {
                if (eventType === 'change') {
                    if (fileWatchTimeout) clearTimeout(fileWatchTimeout);
                    fileWatchTimeout = setTimeout(() => {
                        socket.emit('file_changed', { path: filePath });
                        fileWatchTimeout = null;
                    }, 300);
                }
            });
        } catch (err) {
            console.error('[ERROR] Failed to watch file:', err);
        }
    });

    socket.on('disconnect', () => {
        if (fileWatcher) fileWatcher.close();
        if (fileWatchTimeout) clearTimeout(fileWatchTimeout);
    });

    // --- 청크 기반 업로드 관리 ---
    const activeUploads = new Map(); // uploadId -> { chunks, filename, dir, totalSize, receivedSize }

    socket.on('upload_file_start', (payload) => {
        const { uploadId, filename, totalSize, dir } = payload;
        console.log(`[FILE] Chunk upload started: ${filename} (${totalSize} bytes), ID: ${uploadId}`);
        activeUploads.set(uploadId, {
            chunks: [],
            filename,
            dir,
            totalSize,
            receivedSize: 0
        });
    });

    socket.on('upload_file_chunk', (payload) => {
        const { uploadId, data } = payload;
        const upload = activeUploads.get(uploadId);
        if (!upload) return;

        const chunkBuffer = Buffer.from(data);
        upload.chunks.push(chunkBuffer);
        upload.receivedSize += chunkBuffer.length;

        // 클라이언트에게 ACK 전송 (다음 청크 요청 및 진행률 확인용)
        socket.emit('upload_file_ack', { 
            uploadId, 
            receivedSize: upload.receivedSize,
            totalSize: upload.totalSize
        });
    });

    socket.on('upload_file_end', (payload) => {
        const { uploadId } = payload;
        const upload = activeUploads.get(uploadId);
        if (!upload) return;

        try {
            const { filename, dir, chunks } = upload;
            const targetDir = dir ? path.resolve(process.cwd(), dir) : process.cwd();
            const absolutePath = path.join(targetDir, filename);
            
            const finalBuffer = Buffer.concat(chunks);
            fs.writeFileSync(absolutePath, finalBuffer);
            
            console.log(`[FILE] Chunk upload complete: ${absolutePath}`);
            activeUploads.delete(uploadId);
            
            // 모든 클라이언트에 업로드 완료 알림 (탐색기 갱신용)
            io.emit('file_uploaded', { dir: dir || '', filename });
            socket.emit('upload_success', { uploadId, filename });
        } catch (error) {
            console.error("File upload save error:", error);
            socket.emit('error', 'Failed to save uploaded file.');
            activeUploads.delete(uploadId);
        }
    });

    // upload_image 핸들러 (기존 유지)
    socket.on('upload_image', (payload) => {
        console.log('[DEBUG] Received upload_image event. Payload ext:', payload.ext, 'dir:', payload.dir);
        try {
            const screenshotsDir = getScreenshotsDir(payload.dir);
            const ext = payload.ext || 'png';
            const filename = getNextImageFilename(screenshotsDir, ext);
            const filepath = path.join(screenshotsDir, filename);
            
            // payload.data는 ArrayBuffer
            fs.writeFileSync(filepath, Buffer.from(payload.data));
            
            console.log(`[FILE] Image saved: ${filepath}`);
            
            // 절대 경로
            const absoluteFilepath = filepath.replace(/\\/g, '/');
            const imageUrl = `/api/image?path=${encodeURIComponent(absoluteFilepath)}`;

            // 저장된 경로를 클라이언트에게 전달
            socket.emit('image_uploaded', { 
                url: imageUrl, 
                filepath: absoluteFilepath,
                dir: payload.dir
            });
        } catch (err) {
            console.error('Error saving image:', err);
            socket.emit('error', 'Failed to save image.');
        }
    });

    // upload_file 핸들러 (일반 파일)
    socket.on('upload_file', (payload) => {
        try {
            const { filename, data, dir } = payload;
            // dir이 없으면 현재 작업 디렉토리 사용. 절대 경로인 경우 그대로 사용됨.
            const targetDir = dir ? path.resolve(process.cwd(), dir) : process.cwd();
            const absolutePath = path.join(targetDir, filename);
            
            console.log(`[FILE] Uploading to: ${absolutePath}`);

            // payload.data는 ArrayBuffer/Buffer로 수신됨
            const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
            fs.writeFileSync(absolutePath, dataBuffer);
            console.log(`[FILE] File saved: ${absolutePath}`);
            
            // 모든 클라이언트에 업로드 완료 알림 (탐색기 갱신용)
            io.emit('file_uploaded', { dir: dir || '' });
        } catch (error) {
            console.error("File upload error:", error);
            socket.emit('error', 'Failed to save file.');
        }
    });

    // rename_file 핸들러
    socket.on('rename_file', (payload) => {
        try {
            if (!payload.oldPath) {
                return socket.emit('error', 'oldPath is required.');
            }

            const oldPath = path.resolve(process.cwd(), payload.oldPath);
            let newPath;

            if (payload.newPath) {
                newPath = path.resolve(process.cwd(), payload.newPath);
            } else if (payload.newName) {
                // If only newName is provided, place it in the same directory as oldPath
                const dir = path.dirname(oldPath);
                newPath = path.join(dir, payload.newName);
            } else {
                return socket.emit('error', 'newPath or newName is required.');
            }

            fs.renameSync(oldPath, newPath);
            console.log(`[FILE] Renamed: ${oldPath} -> ${newPath}`);
            socket.emit('file_renamed', { oldPath: payload.oldPath, newPath: newPath, success: true });
        } catch (error) {
            console.error('Error renaming file:', error);
            socket.emit('error', 'Failed to rename file: ' + error.message);
        }
    });

    // delete_file 핸들러
    socket.on('delete_file', (payload) => {
        try {
            const targetPath = payload.path || payload.filepath;
            if (!targetPath || typeof targetPath !== 'string') {
                console.error('[FILE] Delete failed: Invalid path provided', payload);
                return socket.emit('error', 'Invalid path for deletion.');
            }
            const absolutePath = path.resolve(process.cwd(), targetPath);
            if (fs.existsSync(absolutePath)) {
                const stat = fs.statSync(absolutePath);
                if (stat.isDirectory()) {
                    fs.rmdirSync(absolutePath, { recursive: true });
                } else {
                    fs.unlinkSync(absolutePath);
                }
                console.log(`[FILE] Deleted: ${absolutePath}`);
                socket.emit('file_deleted', { path: targetPath, success: true });
            }
        } catch (error) {
            console.error('Error deleting file/directory:', error);
            socket.emit('error', 'Failed to delete file.');
        }
    });

    // 폴더 생성 (추가됨)
    socket.on('create_directory', (dirPath) => {
        try {
            const absolutePath = path.resolve(process.cwd(), dirPath);
            fs.mkdirSync(absolutePath, { recursive: true });
            socket.emit('directory_created', { path: dirPath, success: true });
            io.emit('directory_changed', { type: 'create_dir', path: dirPath });
        } catch (error) {
            console.error('Error creating directory:', error);
            socket.emit('error', 'Failed to create directory.');
        }
    });
}

module.exports = { registerFileApiRoutes, registerFileHandlers };