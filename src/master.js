const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT_ARG_INDEX = process.argv.indexOf('--port');
const PORT = PORT_ARG_INDEX !== -1 ? parseInt(process.argv[PORT_ARG_INDEX + 1], 10) : 5001;
const BIND_HOST = '0.0.0.0';
const LOCAL_HOST = '127.0.0.1';

// .gcw.conf 파일 파싱 함수
function parseConfig() {
    const cwdConfig = path.join(process.cwd(), '.gcw.conf');
    const rootConfig = path.join(process.cwd(), '..', '.gcw.conf');
    const configPath = fs.existsSync(cwdConfig) ? cwdConfig : rootConfig;
    
    const result = {
        projects: {},
        startPort: 53001
    };

    if (fs.existsSync(configPath)) {
        console.log(`[Master] Loading config from: ${configPath}`);
        const content = fs.readFileSync(configPath, 'utf8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;

            if (trimmed.startsWith('PROJECT_')) {
                const parts = trimmed.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join('=').trim();
                    const name = key.replace('PROJECT_', '');
                    if (name && value) {
                        const valueParts = value.split(/\s+/);
                        const dir = valueParts[0];
                        const sessionName = valueParts.slice(1).join('-') || ''; // 공백으로 연결된 나머지 부분은 dash로 연결
                        result.projects[name] = { dir, sessionName };
                    }
                }
            } else if (trimmed.startsWith('SERVER_PORTS=')) {
                const portVal = parseInt(trimmed.split('=')[1], 10);
                if (!isNaN(portVal)) {
                    result.startPort = portVal;
                }
            } else if (trimmed.startsWith('GCW_INSTANCE=')) {
                const val = trimmed.split('=')[1];
                if (val) {
                    process.env.GCW_INSTANCE = val.trim();
                }
            }
        });
    }
    
    // TEMP 워크스페이스 상시 대기 (현재 디렉토리 기준)
    if (!result.projects['TEMP']) {
        result.projects['TEMP'] = { dir: process.cwd(), sessionName: 'gcw-temp', isTemp: true };
    }
    
    return result;
}

const config = parseConfig();
const projects = config.projects;
const childProcesses = {};
let nextPort = config.startPort;

// 클라이언트 연결 상태 관리
const connectionState = {
    active: {}, // { workspaceName: [ { ip, userAgent, time, socketId } ] }
    recent: {}  // { workspaceName: [ { ip, duration, disconnectTime } ] }
};

const app = express();
const server = http.createServer(app);
const proxies = {}; // 각 프로젝트별 프록시 인스턴스 저장

function startProject(name, projectConfig) {
    const { dir, sessionName } = projectConfig;
    const childPort = nextPort++;
    const targetUrl = `http://${LOCAL_HOST}:${childPort}`;
    
    console.log(`[Master] Starting project '${name}' at ${dir} on internal port ${childPort}`);
    
    // server.js를 자식 프로세스로 실행, cwd를 해당 프로젝트 폴더로 설정
    const childEnv = { ...process.env, GCW_PROJECT_NAME: name, GCW_MASTER_PORT: PORT.toString() };
    if (sessionName) {
        childEnv.GCW_DEFAULT_SESSION = sessionName;
    }

    const child = spawn('node', [path.join(__dirname, 'server.js'), '--port', childPort.toString()], {
        cwd: dir,
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'], // IPC 채널 열기
        env: childEnv // 필요 시 자식 프로세스에서 식별할 수 있도록 환경변수 추가
    });
    
    // IPC 메시지 수신 처리
    child.on('message', (msg) => {
        if (!msg || !msg.type || !msg.workspace) return;
        
        const wsName = msg.workspace; // dir basename 이지만 편의상 사용 (정확히는 프로젝트 name 매핑이 더 좋음)
        // 위 프로젝트 설정 이름(name)과 워크스페이스(dir basename)가 다를 수 있으므로 name을 키로 사용
        const targetName = name; 

        if (msg.type === 'client_connect') {
            if (!connectionState.active[targetName]) connectionState.active[targetName] = [];
            
            // 동일한 Client ID와 타입(Viewer/Terminal)이 이미 있다면, 기존 연결은 버려진(Ghost) 것으로 간주하고 삭제
            const clientId = msg.clientId || 'Unknown';
            const clientType = msg.clientType || 'Terminal'; // 기본값 설정

            if (clientId !== 'Unknown') {
                const existingIdx = connectionState.active[targetName].findIndex(c => c.clientId === clientId && c.clientType === clientType);
                if (existingIdx !== -1) {
                    connectionState.active[targetName].splice(existingIdx, 1);
                }
            }

            connectionState.active[targetName].push({
                ip: msg.ip,
                clientId: clientId,
                clientType: clientType,
                userAgent: msg.userAgent,
                time: msg.time,
                socketId: msg.socketId
            });
        } else if (msg.type === 'client_disconnect') {
            if (connectionState.active[targetName]) {
                const idx = connectionState.active[targetName].findIndex(c => c.socketId === msg.socketId);
                if (idx !== -1) {
                    const client = connectionState.active[targetName].splice(idx, 1)[0];
                    if (!connectionState.recent[targetName]) connectionState.recent[targetName] = [];
                    connectionState.recent[targetName].unshift({
                        ip: client.ip,
                        clientId: client.clientId,
                        clientType: client.clientType,
                        duration: Date.now() - client.time,
                        disconnectTime: msg.time
                    });
                    // 최근 기록 10개로 제한
                    if (connectionState.recent[targetName].length > 10) {
                        connectionState.recent[targetName].pop();
                    }
                }
            }
        }
    });

    childProcesses[name] = { process: child, port: childPort, url: targetUrl, config: projectConfig };

    // Trailing Slash 리다이렉트 미들웨어 (브라우저 상대 경로 에러 방지)
    // 중복 등록 방지를 위해 이전에 등록된 라우터가 있으면 고려해야 하지만,
    // 현재 구조상 새 프로젝트가 런타임에 동적으로 추가될 때만 호출됨.
    app.use(`/${name}`, (req, res, next) => {
        const pathname = req.originalUrl.split('?')[0];
        if (pathname === `/${name}`) {
            const query = req.originalUrl.includes('?') ? req.originalUrl.substring(req.originalUrl.indexOf('?')) : '';
            return res.redirect(301, `/${name}/${query}`);
        }
        next();
    });

    // 프로젝트별 프록시 인스턴스 생성
    const projectProxy = createProxyMiddleware({
        target: targetUrl,
        changeOrigin: true,
        ws: true, // WebSocket 지원
        pathFilter: `/${name}`, // HTTP와 WebSocket(upgrade) 모두에서 이 경로 필터링
        pathRewrite: (path, req) => {
            // /GCW/api/files -> /api/files 로 경로 재작성
            return path.replace(new RegExp(`^/${name}`), '');
        },
        onError: (err, req, res) => {
            console.error(`[Proxy Error] for ${name}:`, err.message);
            if (res && res.writeHead) {
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end('Bad Gateway');
            }
        }
    });

    // 라우터를 거치지 않고 전역 미들웨어로 등록하여 프록시 자체가 경로를 필터링하도록 함
    app.use(projectProxy);
}

// 최초 실행 시 기존 설정된 프로젝트 띄우기
Object.entries(projects).forEach(([name, projectConfig]) => {
    startProject(name, projectConfig);
});

// 5. Tmux 세션 관리 API
app.get('/api/tmux/sessions', (req, res) => {
    const { exec } = require('child_process');
    exec('tmux ls', (error, stdout) => {
        if (error) return res.json([]);
        
        // 설정에 등록된 모든 세션 이름 수집 (자신 포함)
        const configuredSessions = new Set(['gemini-cli-wrapper']);
        for (const pConfig of Object.values(projects)) {
            if (pConfig.sessionName && pConfig.sessionName !== 'gcw-temp') {
                configuredSessions.add(pConfig.sessionName);
            }
        }

        const sessions = stdout.trim().split('\n').filter(l => l).reduce((acc, line) => {
            const parts = line.split(':');
            const name = parts[0];
            
            // 등록된 세션이 아니면 목록에 추가
            if (!configuredSessions.has(name)) {
                acc.push({
                    name: name,
                    info: parts.slice(1).join(':').trim()
                });
            }
            return acc;
        }, []);

        res.json(sessions);
    });
});

app.post('/api/tmux/sessions', express.json(), (req, res) => {
    const { name } = req.body;
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        return res.status(400).json({ error: 'Invalid session name' });
    }
    const { exec } = require('child_process');
    exec(`tmux new-session -d -s "${name}" "gemini"`, (error) => {
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true });
    });
});

app.delete('/api/tmux/sessions/:name', (req, res) => {
    const { name } = req.params;
    const { exec } = require('child_process');
    exec(`tmux kill-session -t "${name}"`, (error) => {
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true });
    });
});

app.get('/api/tmux/pwd', (req, res) => {
    const { exec } = require('child_process');
    const sessionName = req.query.session;
    if (!sessionName) return res.status(400).json({ error: 'Session name is required' });
    exec(`tmux display-message -p -F "#{pane_current_path}" -t "${sessionName}"`, (error, stdout) => {
        if (error) return res.status(500).json({ error: error.message });
        res.json({ pwd: stdout.trim() });
    });
});

// 루트 접속 시 안내 페이지 (최신 .gcw.conf 로드 후 목록 표시 및 새로운 프로젝트 구동)
app.get('/', (req, res) => {
    // 1. 최신 설정 다시 읽기 (Hot Reloading of Config)
    const freshConfig = parseConfig();
    const freshProjects = freshConfig.projects;
    const instanceName = process.env.GCW_INSTANCE ? `[${process.env.GCW_INSTANCE}] ` : '';

    // 2. 설정 파일에 있는 프로젝트들을 순회하며 새로운 프로젝트 띄우기
    // 주의(Note): 
    // - 이 로직은 오직 "새로 추가된 프로젝트"만 감지하여 프로세스를 구동합니다.
    // - 이미 구동 중인 프로젝트의 설정(경로, 세션 이름 등)이 변경되었을 때 
    //   이를 죽이고(Kill) 재시작하는 기능은 Express 미들웨어 중복 누적 문제 및
    //   기존 사용자의 터미널 세션 강제 종료 위험성 때문에 지원하지 않습니다.
    // - 기존 프로젝트의 설정을 변경하려면, master.js 서버 전체를 재시작해야 합니다.
    Object.entries(freshProjects).forEach(([name, projectConfig]) => {
        if (!childProcesses[name]) {
            console.log(`[Master] New project detected in config: ${name}. Starting...`);
            startProject(name, projectConfig);
            projects[name] = projectConfig; // 메모리 갱신
        }
    });

    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>${instanceName}Gemini CLI Wrapper - Workspaces</title>
        <style>
            body { font-family: sans-serif; background-color: #1e1e1e; color: #d4d4d4; padding: 2rem; max-width: 800px; margin: 0 auto; }
            h1 { color: #569cd6; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            ul { list-style: none; padding: 0; }
            .project-card { background-color: #252526; border: 1px solid #3c3c3c; border-radius: 6px; margin-bottom: 15px; padding: 15px; }
            .project-header { margin-bottom: 15px; }
            .project-header strong { font-size: 1.2em; color: #4fc1ff; }
            .path { font-size: 0.85em; color: #808080; display: block; margin-top: 5px; word-break: break-all; }
            .links { display: flex; gap: 10px; }
            .btn { display: inline-block; padding: 8px 15px; text-decoration: none; border-radius: 4px; font-size: 0.9em; transition: background-color 0.2s; }
            .proxy-btn { background-color: #0e639c; color: #ffffff; }
            .proxy-btn:hover { background-color: #1177bb; }
            .direct-btn { background-color: #383a42; color: #d4d4d4; border: 1px solid #454545; }
            .direct-btn:hover { background-color: #4d5057; }
            
            /* Connection Monitor Styles */
            .status-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:12px; font-size:0.8em; margin-left:10px; cursor:pointer; user-select:none; }
            .status-badge.active { background:#1e4620; color:#4caf50; border: 1px solid #2e6b31; }
            .status-badge.active:hover { background:#2e6b31; }
            .status-badge.recent { color:#888; border: 1px solid #444; background: #2a2a2a; }
            .status-badge.recent:hover { background:#3a3a3a; }
            
            .connection-details { position:absolute; top:100%; left:10px; margin-top:5px; background:#252526; border:1px solid #454545; border-radius:6px; padding:12px; box-shadow:0 6px 16px rgba(0,0,0,0.6); z-index:100; min-width:400px; white-space:nowrap; }
            .connection-details h4 { margin:0 0 8px 0; font-size:0.85em; color:#dcdcaa; text-transform:uppercase; letter-spacing:0.5px; border-bottom: 1px solid #333; padding-bottom: 4px; }
            .connection-details ul { margin:0 0 12px 0; font-size:0.85em; padding-left: 0; }
            .connection-details ul:last-child { margin-bottom:0; }
            .connection-details li { margin-bottom:6px; display:flex; gap:10px; align-items:center; }
            .connection-details .client-id { color:#c586c0; font-family:monospace; font-weight:bold; }
            .connection-details .ip { color:#569cd6; font-family:monospace; }
            .connection-details .time { color:#888; font-size:0.9em; }
            .connection-details .ua { color:#ce9178; font-size:0.85em; overflow:hidden; text-overflow:ellipsis; max-width: 350px; }

            /* Temp Workspace Styles */
            .header-row { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; margin-bottom: 20px; }
            .header-row h1 { border-bottom: none; margin-bottom: 0; }
            .temp-ws-btn { background-color: #3e3e3e; color: #ccc; border: 1px solid #555; padding: 5px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85em; }
            .temp-ws-btn:hover { background-color: #4e4e4e; color: #fff; }
            
            #temp-ws-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; }
            .modal-content { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #252526; border: 1px solid #454545; border-radius: 8px; width: 500px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 10px; }
            .modal-header h2 { margin: 0; font-size: 1.2em; color: #4fc1ff; }
            .close-modal { cursor: pointer; font-size: 1.5em; color: #888; }
            .close-modal:hover { color: #fff; }
            
            .session-list { max-height: 300px; overflow-y: auto; margin-bottom: 15px; }
            .session-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid #333; }
            .session-item:hover { background: #2a2d2e; }
            .session-name { color: #dcdcaa; font-family: monospace; cursor: pointer; font-weight: bold; flex-grow: 1; }
            .session-info { font-size: 0.8em; color: #888; margin-left: 10px; }
            .kill-btn { color: #ff5555; cursor: pointer; padding: 2px 8px; font-size: 0.8em; border: 1px solid transparent; }
            .kill-btn:hover { border: 1px solid #ff5555; border-radius: 3px; }
            .create-row { display: flex; gap: 8px; margin-top: 15px; padding-top: 15px; border-top: 1px solid #333; }
            .create-row input { flex-grow: 1; background: #3c3c3c; border: 1px solid #555; color: #fff; padding: 5px 10px; border-radius: 4px; }
            .create-row button { background: #0e639c; color: #fff; border: none; padding: 5px 15px; border-radius: 4px; cursor: pointer; }
            .create-row button:hover { background: #1177bb; }
            .configured-tag { font-size: 0.7em; background: #1e4620; color: #4caf50; padding: 1px 4px; border-radius: 3px; margin-left: 8px; }
        </style>
        <script>
            function toggleDetails(name) {
                const el = document.getElementById('details-' + name);
                if (el.style.display === 'none') {
                    // Close others
                    document.querySelectorAll('.connection-details').forEach(d => d.style.display = 'none');
                    el.style.display = 'block';
                    } else {
                    el.style.display = 'none';
                    }
                    }

                    async function openTempWS() {
                    document.getElementById('temp-ws-modal').style.display = 'block';
                    refreshSessions();
                    }

                    function closeTempWS() {
                    document.getElementById('temp-ws-modal').style.display = 'none';
                    }

                    async function refreshSessions() {
                    const listEl = document.getElementById('session-list');
                    listEl.innerHTML = '<div style="padding:10px;">Loading sessions...</div>';

                    try {
                    const res = await fetch('/api/tmux/sessions');
                    const sessions = await res.json();

                    listEl.innerHTML = '';
                    if (sessions.length === 0) {
                        listEl.innerHTML = '<div style="padding:10px; color:#888;">No active tmux sessions.</div>';
                    }

                    sessions.forEach(s => {
                        const item = document.createElement('div');
                        item.className = 'session-item';

                        const nameDiv = document.createElement('div');
                        nameDiv.className = 'session-name';
                        nameDiv.onclick = () => window.location.href = '/TEMP/?session=' + s.name;
                        nameDiv.innerHTML = s.name;

                        const infoDiv = document.createElement('div');
                        infoDiv.className = 'session-info';
                        infoDiv.textContent = s.info.split(']')[0] + ']';

                        const killBtn = document.createElement('div');
                        killBtn.className = 'kill-btn';
                        killBtn.textContent = 'Kill';
                        killBtn.onclick = (e) => killSession(s.name, e);

                        item.appendChild(nameDiv);
                        item.appendChild(infoDiv);
                        item.appendChild(killBtn);
                        listEl.appendChild(item);
                    });
                    } catch (e) {
                    listEl.innerHTML = '<div style="padding:10px; color:#ff5555;">Failed to load sessions.</div>';
                    }
                    }

                    async function createSession() {
                    const input = document.getElementById('new-session-name');
                    const name = input.value.trim();
                    if (!name) return;

                    try {
                    const res = await fetch('/api/tmux/sessions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name })
                    });
                    if (res.ok) {
                        input.value = '';
                        // 생성 후 TEMP 워크스페이스를 통해 접속
                        window.location.href = '/TEMP/?session=' + name;
                    } else {
                        const err = await res.json();
                        alert('Error: ' + err.error);
                    }
                    } catch (e) {
                    alert('Failed to create session');
                    }
                    }

                    async function killSession(name, event) {
                    event.stopPropagation();
                    if (!window.confirm('Kill session: ' + name + '?')) return;

                    try {
                    const res = await fetch('/api/tmux/sessions/' + name, { method: 'DELETE' });
                    if (res.ok) refreshSessions();
                    } catch (e) {
                    alert('Failed to kill session');
                    }
                    }

            // Close dropdowns when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.project-header')) {
                    document.querySelectorAll('.connection-details').forEach(d => d.style.display = 'none');
                }
            });
        </script>
    </head>
    <body>
        <div class="header-row">
            <h1>${instanceName}Gemini CLI Wrapper - Workspaces</h1>
            <button class="temp-ws-btn" onclick="openTempWS()">[ Temp Workspace ]</button>
        </div>

        <div id="temp-ws-modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Tmux Session Manager</h2>
                    <span class="close-modal" onclick="closeTempWS()">&times;</span>
                </div>
                <div id="session-list" class="session-list">
                    <!-- Sessions will be loaded here -->
                </div>
                <div class="create-row">
                    <input type="text" id="new-session-name" placeholder="New session name..." onkeydown="if(event.key==='Enter') createSession()">
                    <button onclick="createSession()">Create & Connect</button>
                </div>
            </div>
        </div>

        <ul>
    `;
    
    if (Object.keys(projects).length === 0) {
        html += `<li>No projects found. Please configure <code>PROJECT_*</code> in <code>.gcw.conf</code>.</li>`;
    } else {
        for (const [name, projectConfig] of Object.entries(projects)) {
            const { dir, sessionName } = projectConfig;
            const sessionBadge = sessionName ? `<span style="background:#5c5c5c;color:#fff;padding:2px 6px;border-radius:3px;font-size:0.8em;margin-left:8px;">Session: ${sessionName}</span>` : '';
            const childInfo = childProcesses[name];
            const directPort = childInfo ? childInfo.port : 'N/A';
            
            // 연결 상태(Connection Status) 렌더링 로직 추가
            const maskIp = (ip) => {
                if (!ip) return 'Unknown';
                return ip; // 마스킹 제거: 전체 IP 표시
            };
            const timeAgo = (ms) => {
                const diff = Math.floor((Date.now() - ms) / 1000);
                if (diff < 60) return `${diff}s ago`;
                if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
                return `${Math.floor(diff/3600)}h ago`;
            };

            const activeList = connectionState.active[name] || [];
            const recentList = connectionState.recent[name] || [];
            
            let statusBadge = '';
            let detailPopup = '';
            if (activeList.length > 0 || recentList.length > 0) {
                let activeHtml = '';
                if (activeList.length > 0) {
                    statusBadge = `<span class="status-badge active" onclick="toggleDetails('${name}')">🟢 ${activeList.length} Active ▾</span>`;
                    activeList.forEach(c => {
                        const typeIcon = c.clientType === 'Viewer' ? '👁️' : '💻';
                        const safeClientId = c.clientId ? c.clientId.substring(0, 6) : '????';
                        activeHtml += `
                        <li>
                            <div class="client-main-info">
                                <span class="type" title="${c.clientType}">${typeIcon}</span> 
                                <span class="client-id" title="Client ID">[${safeClientId}]</span>
                                <span class="ip">${maskIp(c.ip)}</span> 
                                <span class="time">${timeAgo(c.time)}</span>
                            </div>
                            <div class="client-meta-info">${c.userAgent}</div>
                        </li>`;
                    });
                } else if (recentList.length > 0) {
                    const last = recentList[0];
                    statusBadge = `<span class="status-badge recent" onclick="toggleDetails('${name}')">⚪ Last: ${timeAgo(last.disconnectTime)} ▾</span>`;
                }

                let recentHtml = '';
                recentList.slice(0, 5).forEach(c => {
                    const typeIcon = c.clientType === 'Viewer' ? '👁️' : '💻';
                    const safeClientId = c.clientId ? c.clientId.substring(0, 6) : '????';
                    recentHtml += `
                    <li>
                        <div class="client-main-info">
                            <span class="type" title="${c.clientType}">${typeIcon}</span> 
                            <span class="client-id" title="Client ID">[${safeClientId}]</span>
                            <span class="ip">${maskIp(c.ip)}</span> 
                            <span class="time">left ${timeAgo(c.disconnectTime)}</span>
                        </div>
                        <div class="client-meta-info">${c.userAgent || 'Unknown Agent'}</div>
                    </li>`;
                });

                detailPopup = `
                <div id="details-${name}" class="connection-details" style="display:none;">
                    ${activeList.length > 0 ? `<h4>Active Connections</h4><ul>${activeHtml}</ul>` : ''}
                    ${recentList.length > 0 ? `<h4>Recent Disconnects</h4><ul>${recentHtml}</ul>` : ''}
                </div>`;
            }
            
            html += `
            <li class="project-card">
                <div class="project-header">
                    <strong>${name}</strong> ${sessionBadge}
                    <div style="display:inline-block; position:relative;">
                        ${statusBadge}
                        ${detailPopup}
                    </div>
                    <span class="path">${dir}</span>
                </div>
                <div class="links">
                    <a href="/${name}/" class="btn proxy-btn">Proxy Access (Port ${PORT})</a>
                    <a href="http://${req.hostname || LOCAL_HOST}:${directPort}/" class="btn direct-btn">Direct Access (Port ${directPort} - Faster)</a>
                </div>
            </li>
            `;
        }
    }
    
    html += `
        </ul>
    </body>
    </html>
    `;
    res.send(html);
});

// 프로세스 종료 시 자식 프로세스 확실히 정리
function cleanupAndExit() {
    console.log('\n[Master] Shutting down all child processes...');
    Object.values(childProcesses).forEach(info => {
        try {
            info.process.kill('SIGKILL'); // EADDRINUSE 방지를 위해 즉각 종료
        } catch (e) {
            // 이미 종료된 경우 무시
        }
    });
    process.exit(0);
}

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);
process.on('exit', () => {
    Object.values(childProcesses).forEach(info => {
        try { info.process.kill('SIGKILL'); } catch (e) {}
    });
});

server.listen(PORT, BIND_HOST, () => {
    console.log(`[Master] Multi-Project Router running at http://${BIND_HOST}:${PORT}`);
});
