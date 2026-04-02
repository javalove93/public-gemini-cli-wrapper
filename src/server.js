const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

// 기능별 핸들러 임포트
const { handleAuth } = require('./handlers/auth.handler');
const { registerFileApiRoutes, registerFileHandlers } = require('./handlers/file.handler');
const { TerminalHandler } = require('./handlers/terminal.handler');

const isDebug = process.argv.includes('--debug');
function debugLog(...args) {
    if (isDebug) {
        console.log('[DEBUG]', new Date().toISOString(), ...args);
    }
}

const app = express();

app.use(express.json());

// 1. 파일 시스템 관련 HTTP API 라우트 등록 (루트 기반)
registerFileApiRoutes(app);

/**
 * .gcw.conf에서 UI 설정을 읽어오는 유틸리티
 */
function getUiSettings() {
    const cwd = process.cwd();
    const configPath = path.join(cwd, '.gcw.conf');
    const settings = {};
    
    console.log(`[DEBUG-UI] getUiSettings called. __dirname: ${__dirname}, process.cwd(): ${cwd}`);
    console.log(`[DEBUG-UI] Attempting to load UI settings from: ${configPath}`);
    
    if (fs.existsSync(configPath)) {
        try {
            const content = fs.readFileSync(configPath, 'utf8');
            let count = 0;
            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.startsWith('GCW_UI_')) {
                    const [key, ...valueParts] = trimmed.split('=');
                    const value = valueParts.join('=').trim();
                    settings[key.trim()] = value;
                    count++;
                }
            });
            console.log(`[DEBUG-UI] Successfully loaded ${count} UI settings from .gcw.conf`);
        } catch (err) {
            console.error('[DEBUG-UI] Error reading .gcw.conf for UI settings:', err);
        }
    } else {
        console.log(`[DEBUG-UI] .gcw.conf not found at: ${configPath}`);
    }
    return settings;
}

// 2. 정적 파일 및 UI 설정 주입 라우트
app.get(['/', '/index.html', '/viewer.html', '/key-tester.html', '/mobile.html'], (req, res, next) => {
    let filename = 'index.html';
    
    // 모바일 기기 감지 (User-Agent)
    const ua = req.headers['user-agent'] || '';
    const isMobile = /Mobile|Android|iP(ad|hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua);
    
    if (req.path === '/') {
        filename = isMobile ? 'mobile.html' : 'index.html';
    } else if (req.path === '/index.html') {
        filename = 'index.html';
    } else if (req.path === '/mobile.html') {
        filename = 'mobile.html';
    } else if (req.path === '/viewer.html') {
        filename = 'viewer.html';
    } else if (req.path === '/key-tester.html') {
        filename = 'key-tester.html';
    }
    
    const indexPath = path.join(__dirname, '../public', filename);
    if (fs.existsSync(indexPath)) {
        const settings = getUiSettings();
        let html = fs.readFileSync(indexPath, 'utf8');
        const scriptTag = `<script>window.__GCW_SETTINGS__ = ${JSON.stringify(settings)};</script>`;
        html = html.replace('<head>', '<head>\n    ' + scriptTag);
        res.send(html);
    } else {
        next();
    }
});

// 2.5 Static File Serving (HTML 렌더링 이후에 위치해야 .gcw.conf 주입 라우터가 무시되지 않음)
const publicPath = path.resolve(__dirname, '../public');
app.use(express.static(publicPath));

// 3. UI 설정 저장 API
app.post('/api/ui-settings', (req, res) => {
    const newSettings = req.body;
    const configPath = path.join(process.cwd(), '.gcw.conf');
    let content = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    let lines = content.split('\n');

    Object.keys(newSettings).forEach(key => {
        if (!key.startsWith('GCW_UI_')) return;
        const val = newSettings[key];
        let found = false;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith(`${key}=`)) {
                lines[i] = `${key}=${val}`;
                found = true;
                break;
            }
        }
        if (!found) {
            if (lines.length > 0 && lines[lines.length - 1].trim() !== '') lines.push('');
            lines.push(`${key}=${val}`);
        }
    });

    fs.writeFileSync(configPath, lines.join('\n'));
    res.json({ success: true });
});

// 4. 기타 시스템 정보 API
app.get('/api/system-info', (req, res) => {
    res.json({
        masterPort: process.env.GCW_MASTER_PORT || '5001',
        defaultSession: process.env.GCW_DEFAULT_SESSION || null
    });
});

app.get('/api/backend/pwd', (req, res) => {
    res.json({ pwd: process.cwd() });
});

// API: .gcw.conf 환경 변수 조회 (보안 마스킹 처리)
app.get('/api/gcw-env', (req, res) => {
    const configPath = path.join(process.cwd(), '.gcw.conf');
    const result = {};
    if (fs.existsSync(configPath)) {
        try {
            const content = fs.readFileSync(configPath, 'utf8');
            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('PROJECT_') && trimmed.includes('=')) {
                    const [key, ...valueParts] = trimmed.split('=');
                    const value = valueParts.join('=').trim();
                    const k = key.trim();
                    if (k) {
                        // 값 마스킹 (처음 4자리, 끝 4자리만 노출, 길이에 따라 유동적)
                        if (value.length > 8) {
                            result[k] = value.substring(0, 4) + '*'.repeat(Math.min(value.length - 8, 10)) + value.substring(value.length - 4);
                        } else if (value.length > 2) {
                            result[k] = value.substring(0, 1) + '*'.repeat(value.length - 2) + value.substring(value.length - 1);
                        } else {
                            result[k] = '***';
                        }
                    }
                }
            });
        } catch (err) {
            console.error('Error reading .gcw.conf:', err);
        }
    }
    res.json(result);
});

// 5. Tmux 세션 목록 조회 (누락되었던 부분 복구)
app.get('/api/sessions', (req, res) => {
    const { exec } = require('child_process');
    exec('tmux ls', (error, stdout) => {
        if (error) return res.json([]);
        const sessions = stdout.trim().split('\n').map(line => {
            const parts = line.split(':');
            return { name: parts[0], info: parts.slice(1).join(':').trim() };
        });
        res.json(sessions);
    });
});

// 6. Tmux PWD 조회 (누락되었던 부분 복구)
app.get('/api/tmux/pwd', (req, res) => {
    const { exec } = require('child_process');
    const sessionName = req.query.session;
    if (!sessionName) return res.status(400).json({ error: 'Session name is required' });
    exec(`tmux display-message -p -F "#{pane_current_path}" -t "${sessionName}"`, (error, stdout) => {
        if (error) return res.status(500).json({ error: error.message });
        res.json({ pwd: stdout.trim() });
    });
});

const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // 100 MB for uploads
});

const PORT_ARG_INDEX = process.argv.indexOf('--port');
const PORT = PORT_ARG_INDEX !== -1 ? parseInt(process.argv[PORT_ARG_INDEX + 1], 10) : 5001;
const HOST = '127.0.0.1';

io.on('connection', (socket) => {
    const { clientId, clientIp, workspaceName } = handleAuth(socket, io);
    TerminalHandler.register(socket, io);
    registerFileHandlers(socket, io);

    let dirWatcher = null;
    socket.on('watch_directory', (dirPath) => {
        if (dirWatcher) dirWatcher.close();
        try {
            const absPath = path.resolve(process.cwd(), dirPath || '.');
            if (!fs.existsSync(absPath)) return;
            dirWatcher = fs.watch(absPath, () => {
                socket.emit('directory_changed', { dir: dirPath });
            });
        } catch (e) { console.error('Watcher error:', e); }
    });

    socket.on('disconnect', () => {
        if (process.send) {
            process.send({
                type: 'client_disconnect',
                ip: clientIp,
                clientId: clientId,
                workspace: workspaceName,
                socketId: socket.id,
                time: Date.now()
            });
        }
        if (dirWatcher) dirWatcher.close();
    });
});

server.listen(PORT, HOST, () => {
    console.log(`[SERVER] GCW Backend running at http://${HOST}:${PORT}`);
});
