import { socketClient } from './core/SocketClient.js';
import { tmuxManager } from './core/TmuxManager.js';
import { fileManager } from './core/FileManager.js';

// 코어 모듈을 통해 소켓 연결 활성화 및 소켓 인스턴스 획득
const socket = socketClient.connect('terminal');

let term;
let fitAddon;

// --- 초기화 로직 ---
function initMobileApp() {
    console.log('[MOBILE] Initializing Mobile App...');
    initTerminal();
    setupModals();
    setupVirtualKeyboard();
    
    // 세션 변경 시 상단 UI 뱃지 업데이트 등록
    tmuxManager.onSessionChanged = (sessionName) => {
        console.log(`[MOBILE] Session changed event: ${sessionName}`);
        const badge = document.getElementById('mobile-session-badge');
        if (badge) {
            badge.textContent = `💻 ${sessionName}`;
        }
    };
    
    // 이미 연결되어 있다면 바로 실행, 아니라면 connect 이벤트 대기
    if (socket.connected) {
        loadSessionsAndAttach();
    } else {
        socket.on('connect', () => {
            loadSessionsAndAttach();
        });
    }

    // PWD 갱신 이벤트
    const btnSync = document.getElementById('btn-mobile-sync-pwd');
    if (btnSync) {
        btnSync.onclick = async () => {
            const pwd = await tmuxManager.fetchSessionPwd();
            if (pwd) {
                document.getElementById('mobile-pwd').textContent = pwd;
                loadMobileFileTree(pwd);
            }
        };
    }
}

// --- 터미널 사이즈 재계산 전담 함수 ---
function triggerResize(delay = 100) {
    setTimeout(() => {
        if (!fitAddon || !term) return;
        try {
            fitAddon.fit();
            const safeCols = Math.max(20, term.cols - 1);
            const safeRows = Math.max(10, term.rows - 1);
            term.resize(safeCols, safeRows);
            console.log(`[MOBILE] Terminal resized conservatively to Cols: ${safeCols}, Rows: ${safeRows}`);
            if (safeCols && safeRows) {
                tmuxManager.sendResize(safeCols, safeRows);
            }
        } catch (err) {
            console.error('[MOBILE] Resize error:', err);
        }
    }, delay);
}

function initTerminal() {
    // xterm.js가 글로벌로 로드되어 있으므로 전역 객체 참조
    term = new window.Terminal({
        cursorBlink: true,
        theme: { background: '#000000' },
        fontSize: 14,
        fontFamily: "'Courier New', Courier, monospace"
    });
    
    fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    
    const container = document.getElementById('terminal');
    term.open(container);
    
    // 초기 렌더링 및 세션 연결 지연 처리 보완
    triggerResize(500);

    // 모바일 기기 키보드 활성화를 위한 강제 포커스 이벤트 추가
    container.addEventListener('click', () => {
        if (term) term.focus();
    });
    container.addEventListener('touchstart', () => {
        if (term) term.focus();
    });

    term.onData(data => {
        tmuxManager.sendInput(data);
    });

    window.addEventListener('resize', () => {
        // 화면 회전이나 리사이즈 시 안정적인 재조정
        triggerResize(300);
    });

    socket.on('output', data => {
        term.write(data);
    });
}

// --- 세션 제어 로직 ---
async function loadSessionsAndAttach() {
    console.log('[MOBILE] Loading sessions...');
    const sessions = await fetchSessions();
    if (sessions.length > 0) {
        // 첫 번째 세션이나 이전에 기억한 세션에 연결
        const target = localStorage.getItem('geminiLastSession') || sessions[0].name;
        console.log('[MOBILE] Attaching to session:', target);
        term.clear();
        tmuxManager.attachSession(target);
        
        // 세션 접속 성공 후 한 번 더 확실하게 터미널 크기 조정
        triggerResize(600);
    } else {
        console.log('[MOBILE] No active sessions found.');
        // 세션이 하나도 없으면 세션 매니저 모달을 자동으로 띄워줌
        document.getElementById('btn-nav-sessions').onclick();
    }
}

async function fetchSessions() {
    try {
        const res = await fetch(socketClient.getApiPath('/api/sessions'));
        return await res.json();
    } catch (e) {
        console.error('Fetch sessions error:', e);
        return [];
    }
}

async function renderMobileSessionList() {
    const listDiv = document.getElementById('mobile-session-list');
    listDiv.innerHTML = '<p>Loading...</p>';
    const sessions = await fetchSessions();
    listDiv.innerHTML = '';
    
    if (sessions.length === 0) {
        listDiv.innerHTML = '<p>No active sessions.</p>';
        return;
    }

    sessions.forEach(s => {
        const btn = document.createElement('div');
        btn.className = 'session-item';
        if (s.name === tmuxManager.currentSession) btn.style.borderLeft = '4px solid #569cd6';
        btn.textContent = `${s.name} (${s.info})`;
        btn.onclick = () => {
            term.clear(); // 기존 화면 지우기
            tmuxManager.attachSession(s.name);
            localStorage.setItem('geminiLastSession', s.name); // 사용자 접속 세션 기억
            hideAllModals();
            triggerResize(200); // 뷰포트 변경 후 재계산 및 갱신
        };
        listDiv.appendChild(btn);
    });
}

// --- 파일 제어 로직 ---
async function loadMobileFileTree(dir = '') {
    const treeDiv = document.getElementById('mobile-file-tree');
    treeDiv.innerHTML = '<p>Loading...</p>';
    const files = await fileManager.loadFileTree(dir);
    treeDiv.innerHTML = '';

    files.forEach(f => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.textContent = (f.isDirectory ? '📁 ' : '📄 ') + f.name;
        item.onclick = () => {
            if (f.isDirectory) {
                document.getElementById('mobile-pwd').textContent = f.path;
                loadMobileFileTree(f.path);
            } else {
                // 모바일 뷰어 기능은 나중에 통합 (현재는 콘솔에 경로만 찍음)
                console.log('Selected file:', f.path);
            }
        };
        treeDiv.appendChild(item);
    });
}

// --- 가상 키보드 및 이벤트 ---
function setupVirtualKeyboard() {
    document.querySelectorAll('.v-key').forEach(btn => {
        btn.onclick = () => {
            const key = btn.getAttribute('data-key');
            let seq = '';
            switch(key) {
                case 'Ctrl+C': seq = '\x03'; break;
                case 'Ctrl+Y': seq = '\x19'; break;
                case 'Esc': seq = '\x1b'; break;
                case 'Up': seq = '\x1b[A'; break;
                case 'Down': seq = '\x1b[B'; break;
                case 'Enter': seq = '\r'; break;
            }
            if (seq) {
                tmuxManager.sendInput(seq);
                hideAllModals(); // 전송 후 자동 닫기
            }
        };
    });
}

// --- UI / 모달 제어 ---
function setupModals() {
    const modals = ['sessions', 'files', 'keyboard', 'settings'];
    
    modals.forEach(name => {
        const btn = document.getElementById(`btn-nav-${name}`);
        const modal = document.getElementById(`mobile-${name}-modal`);
        
        if (btn && modal) {
            btn.onclick = () => {
                hideAllModals();
                modal.style.display = 'flex';
                btn.classList.add('active');
                
                if (name === 'sessions') renderMobileSessionList();
                if (name === 'files') {
                    const pwd = document.getElementById('mobile-pwd').textContent;
                    if (pwd === '/') document.getElementById('btn-mobile-sync-pwd').onclick();
                }
            };
        }
    });

    document.querySelectorAll('.close-sheet').forEach(btn => {
        btn.onclick = hideAllModals;
    });
}

function hideAllModals() {
    document.querySelectorAll('.bottom-sheet').forEach(m => m.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
}

// 모듈 진입점
document.addEventListener('DOMContentLoaded', initMobileApp);