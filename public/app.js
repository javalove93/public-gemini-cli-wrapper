import { socketClient } from './js/core/SocketClient.js';
import { fileManager } from './js/core/FileManager.js';
import { tmuxManager } from './js/core/TmuxManager.js';
import { TerminalManager } from './js/modules/TerminalManager.js';
import { STTManager } from './js/modules/STTManager.js';
import { SidebarManager } from './js/modules/SidebarManager.js';
import { AppSocketHandler } from './js/modules/AppSocketHandler.js';
import { UIController } from './js/modules/UIController.js';
import { SettingsManager } from './js/modules/SettingsManager.js';
import { FileBrowserModal } from './js/modules/FileBrowserModal.js';
import { UploadHandler } from './js/modules/UploadHandler.js';
import { ThumbnailManager } from './js/modules/ThumbnailManager.js';
import { TmuxVisualizer } from './js/modules/TmuxVisualizer.js';

// 기존 전역 변수 유지 (리팩토링 진행함에 따라 점진적 제거 예정)
const basePath = socketClient.basePath;
const getApiPath = (endpoint) => socketClient.getApiPath(endpoint);

// 현재 세션 상태는 tmuxManager에서 관리


// 현재 탐색기 디렉토리 상태는 fileManager에서 관리
const currentDir = () => fileManager.currentDir; 
const setCurrentDir = (val) => fileManager.currentDir = val;
const uiSettings = window.__GCW_SETTINGS__ || {};
console.log('[DEBUG] UI Settings loaded from server:', uiSettings);

async function saveUiSetting(key, value) {
    uiSettings[key] = String(value); // 로컬 캐시 즉시 업데이트
    console.log(`[DEBUG-UI] Saving UI setting: ${key} = ${value}`);
    try {
        await fetch(getApiPath('/api/ui-settings'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: value })
        });
    } catch (e) {
        console.error('Failed to save UI setting', key, e);
    }
}
function getUiSetting(key) {
    return uiSettings[key];
}

// 소켓 초기화 (Core 모듈 사용)
const socket = socketClient.connect('terminal');
// 소켓 연결 후 TmuxManager의 이벤트 리스너 초기화
tmuxManager.initListeners();

let terminalManager; // TerminalManager 인스턴스
let term; // xterm 인스턴스 (기존 코드 호환을 위해 유지하되, manager에서 참조)

const sessionManager = document.getElementById('session-manager');
const mainLayout = document.getElementById('main-layout');
const terminalContainer = document.getElementById('terminal-container');
const sessionList = document.getElementById('session-list');
const btnNewSession = document.getElementById('btn-new-session');
const inputNewSessionName = document.getElementById('new-session-name');
const btnSettings = document.getElementById('btn-settings');
const settingsModal = document.getElementById('settings-modal');
const closeSettings = document.getElementsByClassName('close-settings')[0];
const optCmdC = document.getElementById('opt-cmd-c');
const optCmdY = document.getElementById('opt-cmd-y');
const optCmdO = document.getElementById('opt-cmd-o');
const optMapHome = document.getElementById('opt-map-home');
const optMapEnd = document.getElementById('opt-map-end');
const optMapPrefix = document.getElementById('opt-map-prefix');
const optMapPaste = document.getElementById('opt-map-paste');
const optMapStt = document.getElementById('opt-map-stt');
const optKeepTmux = document.getElementById('opt-keep-tmux');
const btnRecordShortcut = document.getElementById('record-custom-shortcut');
const btnRecordOShortcut = document.getElementById('record-o-shortcut');
const btnRecordHomeShortcut = document.getElementById('record-home-shortcut');
const btnRecordEndShortcut = document.getElementById('record-end-shortcut');
const btnRecordPrefixShortcut = document.getElementById('record-prefix-shortcut');
const btnRecordPasteShortcut = document.getElementById('record-paste-shortcut');
const btnRecordSttShortcut = document.getElementById('record-stt-shortcut');
const btnRecordSttShortcut2 = document.getElementById('record-stt-shortcut-2'); // 두 번째 단축키 버튼
const optTheme = document.getElementById('opt-theme');
const currentSessionNameSpan = document.getElementById('current-session-name');
const btnRenameSession = document.getElementById('btn-rename-session');
const btnEnvInfo = document.getElementById('btn-env-info');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const sidebar = document.getElementById('sidebar');
const dirInput = document.getElementById('dir-input');
const btnSyncTmux = document.getElementById('btn-sync-tmux');
const fileTree = document.getElementById('file-tree');
const selectFont = document.getElementById('select-font');
const btnFontMinus = document.getElementById('btn-font-minus');
const btnFontPlus = document.getElementById('btn-font-plus');
const btnSplitH = document.getElementById('btn-split-h');
const btnSplitV = document.getElementById('btn-split-v');
const btnResetClients = document.getElementById('btn-reset-clients');
const recentImagesDropdown = document.getElementById('recent-images-dropdown');
const recentImagePreview = document.getElementById('recent-image-preview');
const btnInsertSelected = document.getElementById('btn-insert-selected');
const navDropdown = document.getElementById('nav-dropdown');
const modal = document.getElementById('image-modal');
const modalImg = document.getElementById('modal-img');
const closeModal = document.getElementsByClassName('close')[0];

const envModal = document.getElementById('env-modal');
const envContent = document.getElementById('env-content');
const closeEnvModal = document.getElementById('close-env-modal');

const connectionStatus = document.getElementById('connection-status');

const contextMenu = document.getElementById('context-menu');
const menuView = document.getElementById('menu-view');
const menuDownload = document.getElementById('menu-download');
const menuRename = document.getElementById('menu-rename');
const menuDelete = document.getElementById('menu-delete');

const clipboardHistoryList = document.getElementById('clipboard-history');

// 파일 브라우저(Open) 관련 로직은 FileBrowserModal 로 분리됨

// --- Auto-Connect Stealth Mode State ---
let isAutoConnectEnabled = localStorage.getItem('gcw_auto_connect') !== 'false';
const connectionWrapper = document.getElementById('connection-wrapper');
const autoConnectLabel = document.getElementById('auto-connect-label');

function updateAutoConnectUI() {
    if (!autoConnectLabel) return;
    if (isAutoConnectEnabled) {
        autoConnectLabel.textContent = 'Auto-ON';
        autoConnectLabel.classList.remove('off');
    } else {
        autoConnectLabel.textContent = 'Auto-OFF';
        autoConnectLabel.classList.add('off');
    }
}

if (connectionWrapper) {
    connectionWrapper.onclick = () => {
        // 이미 연결이 끊긴 상태라면 기본 재연결 로직 수행 (아래 connectionStatus.onclick 참고)
        if (connectionStatus.classList.contains('status-disconnected')) {
            return;
        }
        
        // 연결된 상태에서는 Auto-Connect ON/OFF 토글
        isAutoConnectEnabled = !isAutoConnectEnabled;
        localStorage.setItem('gcw_auto_connect', isAutoConnectEnabled);
        updateAutoConnectUI();
        console.log(`[DEBUG] Auto-Connect changed to: ${isAutoConnectEnabled}`);
    };
}
// ----------------------------------------

// 파일 브라우저(Open) 관련 로직은 FileBrowserModal 로 분리됨

let recentThumbnails = []; // 최대 5개
let selectedFileContext = null; // 컨텍스트 메뉴가 열린 대상 파일 정보
let instanceName = null; // 인스턴스 구분자 (예: DEV, PROD)

const formatShortcut = (sc) => {
    const parts = [];
    if (sc.metaKey) parts.push(navigator.platform.includes('Mac') ? 'Cmd' : 'Win');
    if (sc.ctrlKey) parts.push('Ctrl');
    if (sc.altKey) parts.push('Alt');
    if (sc.shiftKey) parts.push('Shift');
    let keyName = sc.key;
    if (keyName === ' ') keyName = 'Space';
    if (!['control', 'shift', 'alt', 'meta'].includes(sc.key.toLowerCase())) {
        parts.push(keyName.length === 1 ? keyName.toUpperCase() : keyName);
    }
    return parts.join('+') || keyName;
};

// 단축키 설정 및 로컬 스토리지 연동(loadSettings) 로직은 SettingsManager로 분리됨
// 기타 모달, 테마 조작 로직은 UIController로 분리됨

// 세션 목록 로드
async function loadSessions() {
    try {
        const response = await fetch(getApiPath('/api/sessions'));
        const sessions = await response.json();

        // 좌측 세션 관리자 리스트 갱신 (메인 레이아웃이 꺼져있을 때 주로 사용)
        if (sessionList) {
            sessionList.innerHTML = '';
            if (sessions.length === 0) {
                sessionList.innerHTML = '<p>활성화된 Tmux 세션이 없습니다.</p>';
            } else {
                sessions.forEach(s => {
                    const div = document.createElement('div');
                    div.className = 'session-item';
                    div.textContent = `${s.name} (${s.info})`;
                    div.onclick = () => attachSession(s.name);
                    sessionList.appendChild(div);
                });
            }
        }

    } catch (err) {
        console.error('Failed to load sessions:', err);
    }
}
// 파일 트리 관련 로직은 SidebarManager로 분리됨

// TerminalManager 인스턴스 생성 및 초기화
function createTerminalManager() {
    if (terminalManager) return terminalManager;

    const shortcuts = settingsManager ? settingsManager.getShortcuts() : {};
    const checkboxOpts = settingsManager ? settingsManager.getCheckboxOptions() : {};

    terminalManager = new TerminalManager({
        socket: socket,
        getUiSetting: getUiSetting,
        saveUiSetting: saveUiSetting,
        shortcuts: shortcuts, // 전체 shortcuts 객체 통째로 전달
        optMapStt: checkboxOpts.optMapStt,
        optMapSttCancel: checkboxOpts.optMapSttCancel,
        sttManager: sttManager,
        onPwdSyncTrigger: () => {
            if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
            autoSyncTimeout = setTimeout(async () => {
                if (tmuxManager.currentSession && sidebarManager) {
                    console.log('[DEBUG] Auto-syncing PWD after Enter key...');
                    try {
                        const pwd = await tmuxManager.fetchSessionPwd();
                        if (pwd) sidebarManager.loadFileTree(pwd);
                    } catch (err) {}
                }
            }, 500);
        }
    });

    term = terminalManager.init();
    return terminalManager;
}

let sidebarManager = null;

// SidebarManager 인스턴스 생성 및 초기화
function createSidebarManager() {
    if (sidebarManager) return sidebarManager;

    sidebarManager = new SidebarManager({
        fileManager: fileManager,
        tmuxManager: tmuxManager,
        socket: socket,
        getUiSetting: getUiSetting,
        saveUiSetting: saveUiSetting,
        getApiPath: getApiPath,
        onLoadThumbnails: (dir) => {
            if (thumbnailManager) thumbnailManager.loadLatestThumbnails(dir);
        }
    });

    return sidebarManager;
}

let appSocketHandler = null;

// AppSocketHandler 인스턴스 생성 및 초기화
function createAppSocketHandler() {
    if (appSocketHandler) return appSocketHandler;

    appSocketHandler = new AppSocketHandler({
        socket: socket,
        socketClient: socketClient,
        fileManager: fileManager,
        tmuxManager: tmuxManager,
        sidebarManager: sidebarManager,
        getApiPath: getApiPath,
        optTheme: optTheme,
        getTerm: () => term,
        onDetach: () => detach(),
        onAttachSession: (name) => attachSession(name),
        onAddThumbnail: (info) => {
            if (thumbnailManager) thumbnailManager.addThumbnail(info);
        },
        onRenderTmuxWindowTabs: (windows) => renderTmuxWindowTabs(windows)
    });

    return appSocketHandler;
}

let settingsManager = null;
function createSettingsManager() {
    if (settingsManager) return settingsManager;
    settingsManager = new SettingsManager({
        getUiSetting: getUiSetting,
        saveUiSetting: saveUiSetting,
        formatShortcut: formatShortcut
    });
    return settingsManager;
}

let uiController = null;

function createUIController() {
    if (uiController) return uiController;

    uiController = new UIController({
        getUiSetting: getUiSetting,
        saveUiSetting: saveUiSetting,
        socketClient: socketClient,
        getApiPath: getApiPath,
        getTerm: () => term,
        getTerminalManager: () => terminalManager
    });

    return uiController;
}

let fileBrowserModal = null;
function createFileBrowserModal() {
    if (fileBrowserModal) return fileBrowserModal;
    fileBrowserModal = new FileBrowserModal({
        getApiPath: getApiPath,
        saveUiSetting: saveUiSetting,
        getUiSetting: getUiSetting,
        basePath: basePath,
        getCurrentDir: () => fileManager.currentDir
    });
    return fileBrowserModal;
}

let uploadHandler = null;
function createUploadHandler() {
    if (uploadHandler) return uploadHandler;
    uploadHandler = new UploadHandler({
        socket: socket,
        fileManager: fileManager,
        mainLayout: mainLayout
    });
    return uploadHandler;
}

let thumbnailManager = null;
function createThumbnailManager() {
    if (thumbnailManager) return thumbnailManager;
    thumbnailManager = new ThumbnailManager({
        getApiPath: getApiPath,
        socket: socket,
        getCurrentDir: () => fileManager.currentDir
    });
    return thumbnailManager;
}

let tmuxVisualizer = null;
function createTmuxVisualizer() {
    if (tmuxVisualizer) return tmuxVisualizer;
    tmuxVisualizer = new TmuxVisualizer({
        tmuxManager: tmuxManager
    });
    return tmuxVisualizer;
}

let autoSyncTimeout = null;

    window.addEventListener('resize', () => {
        if (terminalManager) terminalManager.fit();
    });

    // 우클릭 메뉴(Context Menu) 방지
    document.getElementById('terminal').addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, false);

    // 세션 분리
    async function detach() {
    try {
        if (basePath !== '/') {
            window.location.href = '/';
            return;
        }

        const response = await fetch(getApiPath('/api/system-info'));
        const info = await response.json();
        const targetUrl = `${window.location.protocol}//${window.location.hostname}:${info.masterPort}/`;
        window.location.href = targetUrl;
    } catch (e) {
        window.location.href = '/';
    }
    }

// 썸네일 로직은 ThumbnailManager 로 분리됨

// 세션 연결 (UI 업데이트 전용)
function attachSession(name) {
    // 1. 상태 업데이트 (Core에 기록)
    tmuxManager.currentSession = name;

    // 2. UI 전환
    sessionManager.style.display = 'none';
    mainLayout.style.display = 'flex';
    currentSessionNameSpan.textContent = `Session: ${name}`;
    
    updateDocumentTitle();
    
    btnSplitH.style.display = 'flex';
    btnSplitV.style.display = 'flex';
    btnResetClients.style.display = 'flex';
    
    if (term) {
        term.clear();
    }

    // Core를 통한 통신은 TmuxManager 내부에서 이미 처리됨
    // 여기서는 UI만 갱신함
    socketClient.emit('theme_change', optTheme.value);
    
    // UI 전환 후 컨테이너 크기가 결정된 다음 터미널 크기 재계산 (Fit)
    setTimeout(() => {
        if (terminalManager) terminalManager.fit();
        if (term) tmuxManager.sendResize(term.cols, term.rows);
    }, 150);
    
    if (sidebarManager) sidebarManager.loadFileTree();
    if (thumbnailManager) thumbnailManager.loadLatestThumbnails();
    
    // 세션 전환 시 즉시 해당 세션의 PWD로 동기화
    setTimeout(async () => {
        if (tmuxManager.currentSession && sidebarManager) {
            try {
                const pwd = await tmuxManager.fetchSessionPwd();
                if (pwd) sidebarManager.loadFileTree(pwd);
            } catch (err) {}
        }
    }, 200);
}

// Tmux 윈도우 탭 렌더링 함수
function renderTmuxWindowTabs(windows) {
    const tabsContainer = document.getElementById('tmux-window-tabs');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = '';
    windows.forEach(win => {
        const tab = document.createElement('div');
        tab.className = 'tab-item';
        if (win.active) {
            tab.classList.add('active');
        }

        const indexSpan = document.createElement('span');
        indexSpan.textContent = `${win.index}: `;
        indexSpan.style.opacity = '0.5';
        indexSpan.style.marginRight = '4px';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = win.name;

        const closeBtn = document.createElement('span');
        closeBtn.className = 'btn-close-tab';
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Kill this window';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Kill window "${win.name}" (index ${win.index})?`)) {
                tmuxManager.killWindow(win.index);
            }
        };

        tab.appendChild(indexSpan);
        tab.appendChild(nameSpan);
        tab.appendChild(closeBtn);

        tab.onclick = () => {
            tmuxManager.selectWindow(win.index);
        };
        tabsContainer.appendChild(tab);
    });
}

// 윈도우 목록 수동 갱신 버튼
const btnRefreshWindows = document.getElementById('btn-refresh-windows');
if (btnRefreshWindows) {
    btnRefreshWindows.onclick = () => {
        tmuxManager.fetchWindows();
    };
}

// --- STT Manager Initialization ---
const btnSttToggle = document.getElementById('btn-stt-toggle');
const sttOverlay = document.getElementById('stt-overlay');
const sttInterimText = document.getElementById('stt-interim-text');
const sttStatusIcon = document.getElementById('stt-status-icon');
const sttStatusText = document.getElementById('stt-status-text');

let sttManager = null;
if (window.SpeechRecognition || window.webkitSpeechRecognition) {
    sttManager = new STTManager(
        (finalText) => {
            // On final result, send to terminal via tmuxManager
            console.log('[STT] Final Result:', finalText);
            if (tmuxManager && finalText) {
                tmuxManager.sendInput(finalText);
            }
        },
        (state, data) => {
            // Handle state changes (recording, stopped, interim, error)
            if (state === 'recording') {
                btnSttToggle.style.backgroundColor = '#ef4444';
                sttOverlay.style.display = 'block';
                sttInterimText.textContent = '';
                sttStatusText.textContent = 'Listening...';
                sttStatusIcon.style.animation = 'pulse 1.5s infinite';
            } else if (state === 'stopped' || state === 'error') {
                btnSttToggle.style.backgroundColor = '';
                sttOverlay.style.display = 'none';
                sttStatusIcon.style.animation = 'none';
                if (state === 'error') console.error('[STT] Error:', data);
            } else if (state === 'interim') {
                sttInterimText.textContent = data;
            } else if (state === 'cancelling') {
                sttStatusText.textContent = 'Press again to CANCEL...';
                sttStatusText.style.color = '#ff5555';
            }
        }
    );

    btnSttToggle.addEventListener('click', () => {
        if (sttManager) {
            sttManager.toggle();
        }
    });

    // 설정 변경 시 UI 업데이트 연동
    const originalSaveUiSetting = window.saveUiSetting;
    window.saveUiSetting = function(key, value) {
        if (typeof originalSaveUiSetting === 'function') originalSaveUiSetting(key, value);
        if (key.startsWith('GCW_UI_STT_SHORTCUT') && uiController) {
            uiController.updateSttButtonTooltip();
        }
    };
} else {
    btnSttToggle.style.display = 'none';
    console.warn('[STT] Speech Recognition not supported, hiding microphone button.');
}

// --- Tmux 관리 모달 로직은 TmuxVisualizer 로 분리됨 ---

// 연결 상태 처리
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
let isFirstConnection = true;

socket.on('disconnect', () => {
    console.warn('[DEBUG] Socket disconnected.');
    connectionStatus.className = 'status-disconnected';
    connectionStatus.textContent = '🔴 Disconnected (Click to reconnect)';
    connectionStatus.title = 'Connection lost. Click to attempt reconnection.';

    if (term) {
        term.options.disableStdin = true;
    }
});

socket.on('connect', () => {
    console.log('[DEBUG] Socket connected.');
    connectionStatus.className = 'status-connected';
    connectionStatus.textContent = '🟢 Connected';
    connectionStatus.title = 'Connection is active';
    reconnectAttempts = 0; // 재연결 횟수 초기화

    if (term) {
        term.options.disableStdin = false;
    }

    // 이전에 사용 중이던 세션이 있다면 다시 연결 시도
    // [전략 3+1] 자동 접속 방지 로직 도입
    if (tmuxManager.currentSession && mainLayout.style.display !== 'none') {
        // 최초 접속(새로고침 등)일 때는 Auto-OFF 여부와 무관하게 1회 무조건 연결 허용
        if (isFirstConnection) {
            console.log('[DEBUG] First connection detected. Attaching to session:', tmuxManager.currentSession);
            tmuxManager.attachSession(tmuxManager.currentSession);
            isFirstConnection = false;
        } 
        // 이후 재연결 상황일 때만 Auto-OFF 및 포커스 방어막 작동
        else if (isAutoConnectEnabled && document.visibilityState === 'visible') {
            console.log('[DEBUG] Auto-reattaching to last used session:', tmuxManager.currentSession);
            tmuxManager.attachSession(tmuxManager.currentSession);
        } else {
            console.log('[DEBUG] Auto-attach skipped: Tab is hidden or Auto-Connect is OFF.');
            // 자동 접속이 꺼져있거나 백그라운드인 경우, 세션 끊김 오버레이를  유지하여 사용자의 명시적 클릭 유도
            tmuxManager.onSessionExited(); 
        }
    } else {
        isFirstConnection = false;
    }
});

// 초기 설정 로드 후 UI 반영
updateAutoConnectUI();

connectionStatus.onclick = () => {
    if (connectionStatus.classList.contains('status-disconnected')) {
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            connectionStatus.className = 'status-reconnecting';
            connectionStatus.textContent = `🟡 Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`;
            connectionStatus.title = 'Attempting to reconnect...';
            
            socket.connect();
        } else {
            alert('Max reconnection attempts reached. Please refresh the page manually.');
            location.reload();
        }
    }
};

// 세션 생성
btnNewSession.onclick = () => {
    const customName = inputNewSessionName ? inputNewSessionName.value.trim() : '';
    tmuxManager.createSession(customName, optKeepTmux ? optKeepTmux.checked : false);
};

if (inputNewSessionName) {
    inputNewSessionName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            btnNewSession.onclick();
        }
    });
}

// ---------------------------------------------------------
// TmuxManager 콜백 설정
// ---------------------------------------------------------
// Tmux 관련 콜백 및 전역 소켓 통신은 AppSocketHandler 로 이관됨
// ---------------------------------------------------------

// Workspaces로 돌아가기 (navDropdown에서 호출)
async function returnToWorkspaces() {
    try {
        // 프록시 모드로 접속 중인 경우 (예: /GCW/ 경로 사용 중)
        // 현재 호스트와 포트(리버스 프록시 환경 포함)를 유지한 채 루트로 이동
        if (basePath !== '/') {
            window.location.href = '/';
            return;
        }

        // Direct Access 모드로 접속 중인 경우 (경로가 /)
        // 백엔드에서 마스터 포트를 받아와 명시적으로 해당 포트로 이동
        const response = await fetch(getApiPath('/api/system-info'));
        const info = await response.json();
        
        // window.location.protocol 적용하여 https/http 호환성 확보
        const targetUrl = `${window.location.protocol}//${window.location.hostname}:${info.masterPort}/`;
        window.location.href = targetUrl;
    } catch (e) {
        console.error('Failed to get system info, redirecting to fallback root.', e);
        window.location.href = '/';
    }
}

// Tmux 화면 분할
btnSplitH.onclick = () => {
    socket.emit('tmux_split', 'horizontal');
};

btnSplitV.onclick = () => {
    socket.emit('tmux_split', 'vertical');
};

btnResetClients.onclick = () => {
    if (confirm("Do you want to reset clients in the current session and disconnect all connections? (Refresh required after execution)")) {
        socket.emit('tmux_reset_clients');
    }
};

// 세션 이름 변경
btnRenameSession.onclick = () => {
    if (!tmuxManager.currentSession) return;
    const newName = prompt("새 세션 이름을 입력하세요:", tmuxManager.currentSession);
    if (newName && newName.trim() !== "" && newName !== tmuxManager.currentSession) {
        tmuxManager.renameSession(tmuxManager.currentSession, newName.trim());
    }
};

// .gcw.conf 환경 변수 조회 로직
function checkGcwEnv() {
    fetch(getApiPath('/api/gcw-env'))
        .then(res => res.json())
        .then(data => {
            if (Object.keys(data).length > 0) {
                btnEnvInfo.style.display = 'inline-block';
            } else {
                btnEnvInfo.style.display = 'none';
            }
        })
        .catch(err => console.error('Failed to fetch .gcw.conf', err));
}
checkGcwEnv(); // 페이지 로드 시 1회 확인

btnEnvInfo.onclick = () => {
    fetch(getApiPath('/api/gcw-env'))
        .then(res => res.json())
        .then(data => {
            let content = '';
            for (const [key, value] of Object.entries(data)) {
                content += `${key}=${value}\n`;
            }
            envContent.textContent = content || 'No environment variables found.';
            envModal.style.display = 'block';
        })
        .catch(err => {
            envContent.textContent = 'Failed to load environment variables.';
            envModal.style.display = 'block';
        });
};

closeEnvModal.onclick = () => {
    envModal.style.display = "none";
};

// 클립보드 붙여넣기(이미지) 및 업로드 UI 로직은 UploadHandler 로 분리됨

// 내비게이션 드롭다운 처리
if (navDropdown) {
    navDropdown.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'sessions') {
            window.location.search = '?select=true';
        } else if (val === 'workspaces') {
            returnToWorkspaces();
        }
        // 초기화
        e.target.value = '';
    });
}

// 썸네일/모달 로직 및 레거시 컨텍스트 메뉴는 ThumbnailManager, SidebarManager 로 각각 분리됨

// 파일 탐색기 드래그 앤 드롭 업로드 처리 로직은 UploadHandler 로 분리됨

// 타이틀 업데이트 헬퍼 함수
function updateDocumentTitle() {
    if (!tmuxManager.currentSession) return;
    const titlePrefix = instanceName ? `${instanceName}-` : '';
    document.title = `${titlePrefix}${tmuxManager.currentSession} - Gemini CLI WebUI`;
}

/**
 * 서버에서 인스턴스 정보를 가져와 타이틀을 갱신합니다. (비차단 방식)
 */
async function loadInstanceName() {
    try {
        const sysInfoRes = await fetch(getApiPath('/api/system-info'));
        const sysInfo = await sysInfoRes.json();
        instanceName = sysInfo.instanceName;
        updateDocumentTitle();
        console.log(`[DEBUG] Instance name loaded: ${instanceName}`);
    } catch (e) {
        console.warn('[DEBUG] Failed to fetch instance name, using default title.', e);
    }
}

// 초기 실행
async function initApp() {
    // 인스턴스 정보 로드 시작 (await 하지 않음)
    loadInstanceName();

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const forceSelect = urlParams.get('select') === 'true';
        const sessionFromUrl = urlParams.get('session');

        // 서버 시스템 정보(마스터 포트 및 기본 세션 정보) 조회
        // 세션 자동 접속을 위해 필수 정보만 빠르게 가져옴 (최대 2초 타임아웃 권장하나 일단 await 유지)
        const sysInfoRes = await fetch(getApiPath('/api/system-info'));
        const sysInfo = await sysInfoRes.json();
        
        // 우선순위: URL 파라미터 > 서버 기본값
        const defaultSession = sessionFromUrl || sysInfo.defaultSession;

        // 명시적인 세션 선택 요청(?select=true)이 없고, 세션 정보가 있으면 초기 1회는 항상 접속 시도 (새로고침 대응)
        if (defaultSession && !forceSelect) {
            // 현재 세션 목록 확인
            const sessRes = await fetch(getApiPath('/api/sessions'));
            const sessions = await sessRes.json();
            
            const exists = sessions.some(s => s.name === defaultSession);
            if (exists) {
                // Core 모듈을 통한 세션 접속 (onSessionChanged가 호출되어 UI 갱신됨)
                tmuxManager.attachSession(defaultSession);
            } else {
                // 존재하지 않으면 새로 생성 후 접속
                tmuxManager.createSession(defaultSession, optKeepTmux.checked);
            }
            return;
        }
    } catch (e) {
        console.error('Failed during initApp auto-attach:', e);
    }
    
    // 자동 접속 조건이 아니거나 에러가 발생한 경우 기본 세션 목록 로드 화면을 보여줌
    loadSessions();
}

// 앱 구동 시 필요한 모든 매니저 사전 초기화 (초기화 데드락 방지)
createSettingsManager();
createTerminalManager();
createSidebarManager();
createAppSocketHandler();
createUIController();
createFileBrowserModal();
createUploadHandler();
createThumbnailManager();
createTmuxVisualizer();

initApp();

// 주기적 폴링 (2초마다 윈도우 전환이나 외부 디렉토리 변경 감지)
setInterval(async () => {
    // 사용자가 현재 브라우저 탭을 보고 있고, 세션이 연결된 상태일 때만 실행
    if (document.visibilityState === 'visible' && tmuxManager.currentSession && sidebarManager) {
        try {
            const pwd = await tmuxManager.fetchSessionPwd();
            if (pwd && fileManager.currentDir !== pwd) {
                console.log(`[DEBUG] Polling PWD changed from '${fileManager.currentDir}' to '${pwd}'. Syncing file tree...`);
                sidebarManager.loadFileTree(pwd);
            }
        } catch (err) {
            console.error('Failed to sync tmux pwd in interval:', err);
        }
    }
}, 2000);

