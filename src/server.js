const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

// 기능별 핸들러 임포트
const { handleAuth } = require('./handlers/auth.handler');
const { registerFileApiRoutes, registerFileHandlers } = require('./handlers/file.handler');
const { registerHostFileApi } = require('./handlers/host_file.handler');
const { TerminalHandler } = require('./handlers/terminal.handler');

const isDebug = process.argv.includes('--debug');
function debugLog(...args) {
    if (isDebug) {
        console.log('[DEBUG]', new Date().toISOString(), ...args);
    }
}

// --- Configuration Migration Logic ---
// 워크스페이스별 설정을 격리하기 위해 .gcw.session.<name>.conf 파일을 사용합니다.
(function migrateSessionConfig() {
    const cwd = process.cwd();
    // 1. 전용 설정 파일 경로 (master.js에서 주입)
    const isolatedConfPath = process.env.GCW_SESSION_CONFIG_PATH;
    // 2. 공통/레거시 설정 파일 경로들
    const commonSessionConfPath = path.join(cwd, '.gcw.session.conf');
    const oldConfPath = path.join(cwd, '.gcw.conf');

    // 전용 파일이 없고, 복제할 템플릿(공통 설정)이 있는 경우
    if (isolatedConfPath && !fs.existsSync(isolatedConfPath)) {
        const projectName = process.env.GCW_PROJECT_NAME;
        const legacyIsolatedPath = projectName ? path.join(cwd, `.gcw.session.${projectName}.conf`) : null;

        // 1단계: 인스턴스명이 없는 기존 격리 파일이 있다면 이름 변경 (최우선 승계)
        if (legacyIsolatedPath && fs.existsSync(legacyIsolatedPath)) {
            try {
                fs.renameSync(legacyIsolatedPath, isolatedConfPath);
                console.log(`[Config Migration] Upgraded legacy config ${legacyIsolatedPath} to ${isolatedConfPath}`);
            } catch (e) {
                console.error('[Config Migration] Failed to upgrade legacy config:', e);
            }
        } else {
            // 2단계: 기존 파일이 없으면 공통 템플릿에서 복제
            const templatePath = fs.existsSync(commonSessionConfPath) ? commonSessionConfPath : (fs.existsSync(oldConfPath) ? oldConfPath : null);
            
            if (templatePath) {
            try {
                const content = fs.readFileSync(templatePath, 'utf8');
                // 마스터 설정인지 확인 (PROJECT_ 등으로 시작하는지)
                const isMasterConfig = content.includes('PROJECT_') || content.includes('SERVER_PORTS');

                if (isMasterConfig) {
                    // 마스터 설정에서 세션 관련 변수만 추출하여 전용 파일 생성 (추출 후 원본 유지 여부는 master.js 관리 영역)
                    const sessionLines = content.split('\n').filter(line => {
                        const t = line.trim();
                        return t !== '' && !t.startsWith('#') && !t.startsWith('PROJECT_') && !t.startsWith('SERVER_PORTS');
                    });
                    if (sessionLines.length > 0) {
                        fs.writeFileSync(isolatedConfPath, sessionLines.join('\n'));
                        console.log(`[Config Migration] Extracted isolated config ${isolatedConfPath} from master template.`);
                    }
                } else {
                    // 순수 세션 설정 파일인 경우 자신의 전용 파일명으로 이동 (Rename)
                    fs.renameSync(templatePath, isolatedConfPath);
                    console.log(`[Config Migration] Claimed shared config ${templatePath} as ${isolatedConfPath} (Rename).`);
                }
            } catch (e) {
                console.error('[Config Migration] Failed to clone template:', e);
            }
        }
    }
}
    
    // [레거시 마이그레이션 유지] .gcw.conf -> .gcw.session.conf (일반 모드 대응)
    if (!fs.existsSync(commonSessionConfPath) && fs.existsSync(oldConfPath)) {
        // (기존 로직과 동일하게 작동하되, isolatedConfPath가 없을 때만 유의미)
        try {
            const content = fs.readFileSync(oldConfPath, 'utf8');
            const isMasterConfig = content.includes('PROJECT_') || content.includes('SERVER_PORTS');
            if (!isMasterConfig) {
                fs.renameSync(oldConfPath, commonSessionConfPath);
            }
        } catch (e) {}
    }
})();
// ------------------------------------

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 1. 파일 시스템 관련 HTTP API 라우트 등록 (루트 기반)
registerFileApiRoutes(app);
registerHostFileApi(app);

/**
 * .gcw.session.conf에서 UI 설정을 읽어오는 유틸리티
 */
function getUiSettings(targetDir = null) {
    // 우선순위: 1. 환경변수 GCW_SESSION_CONFIG_PATH, 2. 명시적 전달 경로의 기본 파일, 3. 현재 작업 디렉토리의 기본 파일
    let configPath = process.env.GCW_SESSION_CONFIG_PATH;
    
    if (!configPath || targetDir) {
        const cwd = targetDir || process.env.GCW_HOME || process.cwd();
        configPath = path.join(cwd, '.gcw.session.conf');
    }

    const settings = {};
    console.log(`[DEBUG-UI] getUiSettings. Target Config: ${configPath}`);
    
    if (fs.existsSync(configPath)) {
        try {
            const content = fs.readFileSync(configPath, 'utf8');
            let count = 0;
            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    if (trimmed.startsWith('GCW_UI_') || trimmed.startsWith('GCW_INSTANCE=')) {
                        const [key, ...valueParts] = trimmed.split('=');
                        const value = valueParts.join('=').trim();
                        const k = key.trim();
                        settings[k] = value;
                        if (k === 'GCW_INSTANCE') process.env.GCW_INSTANCE = value;
                        count++;
                    }
                }
            });
            console.log(`[DEBUG-UI] Successfully loaded ${count} UI settings from ${configPath}`);
        } catch (err) {
            console.error('[DEBUG-UI] Error reading settings:', err);
        }
    }
    return settings;
}

// 세션 이름을 기반으로 프로젝트 경로를 찾는 유틸리티 (master .gcw.conf 참조)
function resolveProjectPathFromSession(sessionName) {
    if (!sessionName) return null;
    
    // 마스터 설정 파일 위치 확인 (현재 경로 또는 상위 경로)
    const cwdConfig = path.join(process.cwd(), '.gcw.conf');
    const rootConfig = path.join(process.cwd(), '..', '.gcw.conf');
    const configPath = fs.existsSync(cwdConfig) ? cwdConfig : (fs.existsSync(rootConfig) ? rootConfig : null);
    
    if (!configPath) return null;

    try {
        const content = fs.readFileSync(configPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('PROJECT_')) {
                const parts = trimmed.split('=');
                if (parts.length >= 2) {
                    const value = parts.slice(1).join('=').trim();
                    // 형식: [PATH] [SESSION_NAME]
                    const valueParts = value.split(/\s+/);
                    const dir = valueParts[0];
                    const sName = valueParts.slice(1).join('-') || '';
                    if (sName === sessionName) {
                        return dir;
                    }
                }
            }
        }
    } catch (e) {
        console.error('[DEBUG-UI] Failed to resolve project path:', e);
    }
    return null;
}

// 2. 정적 파일 및 UI 설정 주입 라우트
app.get(['/', '/index.html', '/viewer.html', '/mobile.html'], (req, res, next) => {
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
    }
    
    const indexPath = path.join(__dirname, '../public', filename);
    if (fs.existsSync(indexPath)) {
        // 세션 파라미터가 있으면 해당 워크스페이스의 설정을 로드
        const sessionName = req.query.session;
        const workspacePath = resolveProjectPathFromSession(sessionName);
        const settings = getUiSettings(workspacePath);
        
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

// 2.7 Clean URL Fallback (작업 디렉토리의 파일을 직접 호출 시 뷰어로 연결)
app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    
    // req.path는 기본적으로 디코딩된 상태임
    const filePath = req.path.substring(1); 
    if (!filePath || filePath.startsWith('api/') || filePath.includes('..')) return next();

    const absPath = path.resolve(process.cwd(), filePath);
    try {
        if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
            const ext = path.extname(absPath).toLowerCase();
            const viewableExts = ['.md', '.txt', '.js', '.json', '.sh', '.py', '.log', '.yaml', '.yml', '.mdx'];
            const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

            if (viewableExts.includes(ext)) {
                // 텍스트 계열은 뷰어로 리다이렉트
                return res.redirect(`/viewer.html?path=${encodeURIComponent(filePath)}`);
            } else if (imageExts.includes(ext)) {
                // 이미지는 직접 전송 (Express sendFile의 dotfile 차단 우회를 위해 stream 사용)
                const mimeTypes = {
                    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp'
                };
                res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
                return fs.createReadStream(absPath).pipe(res);
            }
        }
    } catch (e) {
        // 권한 에러 등은 무시하고 다음 미들웨어로
    }
    next();
});

// 3. UI 설정 저장 API
app.post('/api/ui-settings', (req, res) => {
    const { workspacePath, session, ...newSettings } = req.body;
    
    // [FIX] 환경 변수 GCW_SESSION_CONFIG_PATH가 있으면(격리 모드) 최우선 사용.
    // 파라미터로 전달된 workspacePath나 session은 환경 변수가 없을 때만(예: 단독 실행 시) 폴백으로 사용함.
    let configPath = process.env.GCW_SESSION_CONFIG_PATH;

    if (!configPath && (workspacePath || session)) {
        let targetDir = workspacePath || resolveProjectPathFromSession(session) || process.cwd();
        configPath = path.join(targetDir, '.gcw.session.conf');
    }

    if (!configPath) {
        configPath = path.join(process.cwd(), '.gcw.session.conf');
    }
    
    console.log(`[DEBUG-UI-SAVE] POST /api/ui-settings. Session: ${session}, Target: ${configPath}`);
    console.log(`[DEBUG-UI-SAVE] Payload:`, newSettings);

    let content = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    let lines = content.split('\n');

    let updatedCount = 0;
    Object.keys(newSettings).forEach(key => {
        if (!key.startsWith('GCW_UI_')) {
            console.log(`[DEBUG-UI-SAVE] Skipping key (invalid prefix): ${key}`);
            return;
        }
        const val = newSettings[key];
        let found = false;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith(`${key}=`)) {
                lines[i] = `${key}=${val}`;
                found = true;
                updatedCount++;
                break;
            }
        }
        if (!found) {
            if (lines.length > 0 && lines[lines.length - 1].trim() !== '') lines.push('');
            lines.push(`${key}=${val}`);
            updatedCount++;
        }
    });

    try {
        fs.writeFileSync(configPath, lines.join('\n'));
        console.log(`[DEBUG-UI-SAVE] Successfully saved ${updatedCount} settings to ${configPath}`);
        res.json({ success: true });
    } catch (e) {
        console.error(`[DEBUG-UI-SAVE] FAILED to write file:`, e);
        res.status(500).json({ error: e.message });
    }
});

// 4. 기타 시스템 정보 API
app.get('/api/system-info', (req, res) => {
    res.json({
        masterPort: process.env.GCW_MASTER_PORT || '5001',
        defaultSession: process.env.GCW_DEFAULT_SESSION || null,
        instanceName: process.env.GCW_INSTANCE || null
    });
});

app.get('/api/backend/pwd', (req, res) => {
    res.json({ pwd: process.cwd() });
});

// API: .gcw.session.conf 환경 변수 조회 (보안 마스킹 처리)
app.get('/api/gcw-env', (req, res) => {
    const configPath = process.env.GCW_SESSION_CONFIG_PATH || path.join(process.cwd(), '.gcw.session.conf');
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
    maxHttpBufferSize: 1e9 // 1 GB for uploads
});

const PORT_ARG_INDEX = process.argv.indexOf('--port');
const PORT = PORT_ARG_INDEX !== -1 ? parseInt(process.argv[PORT_ARG_INDEX + 1], 10) : 5001;
const HOST = '127.0.0.1';

io.on('connection', (socket) => {
    const { clientId, clientIp, workspaceName } = handleAuth(socket, io);
    TerminalHandler.register(socket, io);
    registerFileHandlers(socket, io);

    let dirWatcher = null;
    let dirWatchTimeout = null;
    socket.on('watch_directory', (dirPath) => {
        if (dirWatcher) dirWatcher.close();
        if (dirWatchTimeout) clearTimeout(dirWatchTimeout);
        
        try {
            const absPath = path.resolve(process.cwd(), dirPath || '.');
            if (!fs.existsSync(absPath)) return;
            
            dirWatcher = fs.watch(absPath, () => {
                // 디바운싱: 300ms 이내에 연속 발생 시 무시하고 마지막 한 번만 전송
                if (dirWatchTimeout) clearTimeout(dirWatchTimeout);
                dirWatchTimeout = setTimeout(() => {
                    socket.emit('directory_changed', { dir: dirPath });
                    dirWatchTimeout = null;
                }, 300);
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
        if (dirWatchTimeout) clearTimeout(dirWatchTimeout);
    });
});

// JSON 파싱 에러나 용량 초과(413) 등의 에러를 JSON 형태로 반환하기 위한 글로벌 에러 핸들러
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Payload too large (limit: 50MB)' });
    }
    if (req.path.startsWith('/api/')) {
        return res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
    }
    next(err);
});

server.listen(PORT, HOST, () => {
    console.log(`[SERVER] GCW Backend running at http://${HOST}:${PORT}`);
});
