import { socketClient } from './js/core/SocketClient.js';
import { fileManager } from './js/core/FileManager.js';
import { tmuxManager } from './js/core/TmuxManager.js';

// 기존 전역 변수 유지 (리팩토링 진행함에 따라 점진적 제거 예정)
const basePath = socketClient.basePath;
const getApiPath = (endpoint) => socketClient.getApiPath(endpoint);
const clientId = socketClient.clientId;

// 현재 세션 상태는 tmuxManager에서 관리


// 현재 탐색기 디렉토리 상태는 fileManager에서 관리
const currentDir = () => fileManager.currentDir; 
const setCurrentDir = (val) => fileManager.currentDir = val;
const uiSettings = window.__GCW_SETTINGS__ || {};
console.log('[DEBUG] UI Settings loaded from server:', uiSettings);

async function saveUiSetting(key, value) {
    uiSettings[key] = String(value);
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
const optKeepTmux = document.getElementById('opt-keep-tmux');
const btnRecordShortcut = document.getElementById('record-custom-shortcut');
const btnRecordOShortcut = document.getElementById('record-o-shortcut');
const btnRecordHomeShortcut = document.getElementById('record-home-shortcut');
const btnRecordEndShortcut = document.getElementById('record-end-shortcut');
const btnRecordPrefixShortcut = document.getElementById('record-prefix-shortcut');
const btnRecordPasteShortcut = document.getElementById('record-paste-shortcut');
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

// 파일 브라우저 (Open) 관련 DOM
const btnOpenViewerMain = document.getElementById('btn-open-viewer-main');
const btnFileTreeStyle = document.getElementById('btn-file-tree-style');
const fileModalMain = document.getElementById('file-modal-main');
const modalCloseBtnMain = document.getElementById('modal-close-btn-main');
const modalCurrentDirMain = document.getElementById('modal-current-dir-main');
const modalFileListMain = document.getElementById('modal-file-list-main');
const sortNameMain = document.getElementById('sort-name-main');
const sortDateMain = document.getElementById('sort-date-main');

let currentModalDirMain = '';
let currentFilesDataMain = [];
let sortColMain = getUiSetting('GCW_UI_VIEWER_SORT_COL') || 'date';
let sortDirMain = getUiSetting('GCW_UI_VIEWER_SORT_DIR') || 'desc';
const getDirNameMain = (path) => {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/') || '/';
};

const formatDateMain = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const updateSortIconsMain = () => {
    sortNameMain.querySelector('.sort-icon-main').textContent = sortColMain === 'name' ? (sortDirMain === 'asc' ? '▲' : '▼') : '';
    sortDateMain.querySelector('.sort-icon-main').textContent = sortColMain === 'date' ? (sortDirMain === 'asc' ? '▲' : '▼') : '';
};

const handleSortClickMain = (col) => {
    if (sortColMain === col) {
        sortDirMain = sortDirMain === 'asc' ? 'desc' : 'asc';
    } else {
        sortColMain = col;
        sortDirMain = col === 'date' ? 'desc' : 'asc';
    }
    saveUiSetting('GCW_UI_VIEWER_SORT_COL', sortColMain);
    saveUiSetting('GCW_UI_VIEWER_SORT_DIR', sortDirMain);
    updateSortIconsMain();
    renderFileListMain();
};

if(sortNameMain) sortNameMain.onclick = () => handleSortClickMain('name');
if(sortDateMain) sortDateMain.onclick = () => handleSortClickMain('date');

const renderFileListMain = () => {
    if(!modalFileListMain) return;
    modalFileListMain.innerHTML = '';
    
    if (currentModalDirMain && currentModalDirMain !== '/') {
        const upLi = document.createElement('li');
        upLi.className = 'directory';
        upLi.innerHTML = `📁 <span class="file-name-main">..</span> <span class="file-mtime-main"></span>`;
        upLi.onclick = () => {
            const parts = currentModalDirMain.split('/');
            parts.pop();
            currentModalDirMain = parts.join('/') || '/';
            fetchModalFilesMain();
        };
        modalFileListMain.appendChild(upLi);
    }

    const sortedFiles = [...currentFilesDataMain];

    sortedFiles.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        
        let result = 0;
        if (sortColMain === 'name') {
            result = a.name.localeCompare(b.name);
        } else if (sortColMain === 'date') {
            result = a.mtime - b.mtime;
        }
        return sortDirMain === 'asc' ? result : -result;
    });

    sortedFiles.forEach(file => {
        const li = document.createElement('li');
        li.className = file.isDirectory ? 'directory' : 'file';
        const icon = file.isDirectory ? '📁' : '📄';
        
        if (file.isDirectory) {
            li.innerHTML = `${icon} <span class="file-name-main">${file.name}</span> <span class="file-mtime-main">${formatDateMain(file.mtime)}</span>`;
            li.onclick = () => {
                currentModalDirMain = file.path;
                fetchModalFilesMain();
            };
        } else {
            // 메인 UI 모달에서는 무조건 새 창 열기로 동작
            li.innerHTML = `${icon} <span class="file-name-main">${file.name}</span> <span class="file-mtime-main">${formatDateMain(file.mtime)}</span>`;
            li.onclick = () => {
                window.open(`${basePath}viewer.html?path=${encodeURIComponent(file.path)}`, '_blank');
                fileModalMain.style.display = 'none';
            };
        }
        modalFileListMain.appendChild(li);
    });
};

const fetchModalFilesMain = async () => {
    try {
        if(modalCurrentDirMain) modalCurrentDirMain.value = currentModalDirMain; // Changed from textContent to value
        const res = await fetch(getApiPath(`/api/files?dir=${encodeURIComponent(currentModalDirMain)}`));
        if (!res.ok) throw new Error('Failed to fetch files');
        currentFilesDataMain = await res.json();
        updateSortIconsMain();
        renderFileListMain();
    } catch (e) {
        console.error(e);
        if(modalFileListMain) modalFileListMain.innerHTML = `<li style="color:red;">Error loading directory contents</li>`;
    }
};

// 직접 경로를 입력하고 엔터를 치는 기능 지원
if(modalCurrentDirMain) {
    modalCurrentDirMain.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const inputPath = modalCurrentDirMain.value.trim();
            if (!inputPath) return;
            
            try {
                // API 호출을 통해 입력한 경로가 파일인지 디렉토리인지 확인
                const res = await fetch(getApiPath(`/api/files?dir=${encodeURIComponent(inputPath)}`));
                
                // 만약 디렉토리가 아닌 단일 파일이면 API가 에러를 던지거나, 길이가 1인 배열이 아닐 수 있음.
                // 더 정확한 파일/디렉토리 검증을 위해 응답을 확인. 
                // 백엔드 /api/files는 디렉토리만 리스팅하므로 에러가 나면 파일일 확률이 높음.
                if (!res.ok) {
                    // 파일로 간주하고 바로 새 창에서 열기
                    window.open(`${basePath}viewer.html?path=${encodeURIComponent(inputPath)}`, '_blank');
                    fileModalMain.style.display = 'none';
                    return;
                }
                
                const data = await res.json();
                if(data.length === 1 && !data[0].isDirectory && data[0].path === inputPath) {
                     // 정확히 이 파일을 가리키는 경우
                     window.open(`${basePath}viewer.html?path=${encodeURIComponent(inputPath)}`, '_blank');
                     fileModalMain.style.display = 'none';
                     return;
                }
                
                // 디렉토리인 경우 이동
                currentModalDirMain = inputPath;
                currentFilesDataMain = data;
                updateSortIconsMain();
                renderFileListMain();
            } catch (err) {
                console.error('Invalid path or file', err);
                alert("존재하지 않는 경로이거나 파일입니다.");
            }
        }
    });
}

if(btnOpenViewerMain) {
    btnOpenViewerMain.onclick = () => {
        currentModalDirMain = fileManager.currentDir || '/';
        fetchModalFilesMain();
        fileModalMain.style.display = 'flex';
    };
}

if(btnFileTreeStyle) {
    // 0: Default(Alpha), 1: Mid-Truncate(Alpha), 2: Recent Date
    const modeIcons = ['Aa', 'A..z', '🕒'];
    const modeTitles = ['Style: Default (Alphabetical)', 'Style: Mid-Truncate (Alphabetical)', 'Style: Recent Date'];
    
    // 초기 로드 시 버튼 텍스트 설정
    let initialMode = parseInt(getUiSetting('GCW_UI_FILE_TREE_STYLE') || '0', 10);
    btnFileTreeStyle.textContent = modeIcons[initialMode] || 'Aa';
    btnFileTreeStyle.title = modeTitles[initialMode] || modeTitles[0];

    btnFileTreeStyle.onclick = () => {
        let currentMode = parseInt(getUiSetting('GCW_UI_FILE_TREE_STYLE') || '0', 10);
        let nextMode = (currentMode + 1) % 3;
        saveUiSetting('GCW_UI_FILE_TREE_STYLE', nextMode);
        
        btnFileTreeStyle.textContent = modeIcons[nextMode];
        btnFileTreeStyle.title = modeTitles[nextMode];
        
        // 탐색기 새로고침
        loadFileTree(fileManager.currentDir);
    };
}

if(modalCloseBtnMain) {
    modalCloseBtnMain.onclick = () => {
        fileModalMain.style.display = 'none';
    };
}

if(fileModalMain) {
    fileModalMain.onclick = (e) => {
        if (e.target === fileModalMain) {
            fileModalMain.style.display = 'none';
        }
    };
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fileModalMain && fileModalMain.style.display === 'flex') {
        fileModalMain.style.display = 'none';
    }
});

let term;
let fitAddon;
let recentThumbnails = []; // 최대 5개
let selectedFileContext = null; // 컨텍스트 메뉴가 열린 대상 파일 정보
let clipboardHistory = []; // 최대 5개 저장
let instanceName = null; // 인스턴스 구분자 (예: DEV, PROD)

let customShortcut = {
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    key: 'y'
};
let customOShortcut = {
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    key: 'o'
};
let customHomeShortcut = {
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    key: 'arrowleft'
};
let customEndShortcut = {
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    key: 'arrowright'
};
let customPrefixShortcut = {
    metaKey: false,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    key: 'b'
};
let customPasteShortcut = {
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    key: 'v'
};
let recordingTarget = null; // null, 'ctrl-y', 'ctrl-o', 'home', 'end', 'paste'

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

// 설정 로드
const loadSettings = () => {
    const isCmdC = getUiSetting('GCW_UI_OPT_CMDC_TO_CTRLC') === 'true';
    optCmdC.checked = isCmdC;

    const isCmdY = getUiSetting('GCW_UI_OPT_CMDY_TO_CTRLY') === 'true';
    optCmdY.checked = isCmdY;

    const isCmdO = getUiSetting('GCW_UI_OPT_CMDO_TO_CTRLO') === 'true';
    if (optCmdO) optCmdO.checked = isCmdO;

    const savedShortcut = getUiSetting('GCW_UI_CUSTOM_SHORTCUT');
    if (savedShortcut) {
        try { customShortcut = JSON.parse(savedShortcut); } catch(e) {}
    }
    if (btnRecordShortcut) btnRecordShortcut.textContent = formatShortcut(customShortcut);

    const savedOShortcut = getUiSetting('GCW_UI_CUSTOM_O_SHORTCUT');
    if (savedOShortcut) {
        try { customOShortcut = JSON.parse(savedOShortcut); } catch(e) {}
    }
    if (btnRecordOShortcut) btnRecordOShortcut.textContent = formatShortcut(customOShortcut);

    const isMapHome = getUiSetting('GCW_UI_OPT_MAP_HOME') === 'true';
    if (optMapHome) optMapHome.checked = isMapHome;

    const savedHomeShortcut = getUiSetting('GCW_UI_HOME_SHORTCUT');
    if (savedHomeShortcut) {
        try { customHomeShortcut = JSON.parse(savedHomeShortcut); } catch(e) {}
    }
    if (btnRecordHomeShortcut) btnRecordHomeShortcut.textContent = formatShortcut(customHomeShortcut);

    const isMapEnd = getUiSetting('GCW_UI_OPT_MAP_END') === 'true';
    if (optMapEnd) optMapEnd.checked = isMapEnd;

    const isKeepTmux = getUiSetting('GCW_UI_OPT_KEEP_TMUX') !== 'false';
    if (optKeepTmux) optKeepTmux.checked = isKeepTmux;

    const savedEndShortcut = getUiSetting('GCW_UI_END_SHORTCUT');
    if (savedEndShortcut) {
        try { customEndShortcut = JSON.parse(savedEndShortcut); } catch(e) {}
    }
    if (btnRecordEndShortcut) btnRecordEndShortcut.textContent = formatShortcut(customEndShortcut);

    const isMapPrefix = getUiSetting('GCW_UI_OPT_MAP_PREFIX') === 'true';
    if (optMapPrefix) optMapPrefix.checked = isMapPrefix;

    const savedPrefixShortcut = getUiSetting('GCW_UI_PREFIX_SHORTCUT');
    if (savedPrefixShortcut) {
        try { customPrefixShortcut = JSON.parse(savedPrefixShortcut); } catch(e) {}
    }
    if (btnRecordPrefixShortcut) btnRecordPrefixShortcut.textContent = formatShortcut(customPrefixShortcut);

    const isMapPaste = getUiSetting('GCW_UI_OPT_MAP_PASTE') !== 'false'; // Default to true
    if (optMapPaste) optMapPaste.checked = isMapPaste;

    const savedPasteShortcut = getUiSetting('GCW_UI_PASTE_SHORTCUT');
    if (savedPasteShortcut) {
        try { customPasteShortcut = JSON.parse(savedPasteShortcut); } catch(e) {}
    }
    if (btnRecordPasteShortcut) btnRecordPasteShortcut.textContent = formatShortcut(customPasteShortcut);

    const theme = getUiSetting('GCW_UI_THEME') || 'dark';
    optTheme.value = theme;
    applyTheme(theme);
};
const lightThemeColors = {
    background: '#f5f5f5',
    foreground: '#333333',
    cursor: '#333333',
    black: '#000000',
    red: '#cd3131',
    green: '#00bc00',
    yellow: '#949800',
    blue: '#0451a5',
    magenta: '#bc05bc',
    cyan: '#0598bc',
    white: '#555555',
    brightBlack: '#666666',
    brightRed: '#cd3131',
    brightGreen: '#14ce14',
    brightYellow: '#b5ba00',
    brightBlue: '#0451a5',
    brightMagenta: '#bc05bc',
    brightCyan: '#0598bc',
    brightWhite: '#a5a5a5'
};

const darkThemeColors = {
    background: '#000000',
    foreground: '#ffffff',
    cursor: '#ffffff',
    black: '#000000',
    red: '#f14c4c',
    green: '#23d18b',
    yellow: '#f5f543',
    blue: '#3b8eea',
    magenta: '#d670d6',
    cyan: '#29b8db',
    white: '#ffffff',
    brightBlack: '#a5a5a5',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#ffffff'
};

const applyTheme = (theme) => {
    if (theme === 'light') {
        document.body.classList.add('light-theme');
        if (term) term.options.theme = lightThemeColors;
    } else {
        document.body.classList.remove('light-theme');
        if (term) term.options.theme = darkThemeColors;
    }
    
    // Tmux 백엔드에 테마 변경 알림 (비활성 패널 배경색 연동)
    if (socket && socket.connected) {
        socket.emit('theme_change', theme);
    }
};

// 모달 및 설정 이벤트
btnSettings.onclick = () => {
    settingsModal.style.display = 'flex';
};
closeSettings.onclick = () => {
    settingsModal.style.display = 'none';
};
window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
    }
});

optCmdC.onchange = () => {
    saveUiSetting('GCW_UI_OPT_CMDC_TO_CTRLC', optCmdC.checked);
};
optCmdY.onchange = () => {
    saveUiSetting('GCW_UI_OPT_CMDY_TO_CTRLY', optCmdY.checked);
};
if (optCmdO) {
    optCmdO.onchange = () => {
        saveUiSetting('GCW_UI_OPT_CMDO_TO_CTRLO', optCmdO.checked);
    };
}

if (optMapHome) {
    optMapHome.onchange = () => {
        saveUiSetting('GCW_UI_OPT_MAP_HOME', optMapHome.checked);
    };
}
if (optMapEnd) {
    optMapEnd.onchange = () => {
        saveUiSetting('GCW_UI_OPT_MAP_END', optMapEnd.checked);
    };
}
if (optMapPrefix) {
    optMapPrefix.onchange = () => {
        saveUiSetting('GCW_UI_OPT_MAP_PREFIX', optMapPrefix.checked);
    };
}
if (optMapPaste) {
    optMapPaste.onchange = () => {
        saveUiSetting('GCW_UI_OPT_MAP_PASTE', optMapPaste.checked);
    };
}
if (optKeepTmux) {
    optKeepTmux.onchange = () => {
        saveUiSetting('GCW_UI_OPT_KEEP_TMUX', optKeepTmux.checked);
    };
}

const handleRecordClick = (btn, targetName) => {
    recordingTarget = targetName;
    btn.textContent = 'Press keys...';
    btn.classList.add('active');
    btn.blur();
};

if (btnRecordShortcut) {
    btnRecordShortcut.onclick = () => handleRecordClick(btnRecordShortcut, 'ctrl-y');
}
if (btnRecordOShortcut) {
    btnRecordOShortcut.onclick = () => handleRecordClick(btnRecordOShortcut, 'ctrl-o');
}
if (btnRecordHomeShortcut) {
    btnRecordHomeShortcut.onclick = () => handleRecordClick(btnRecordHomeShortcut, 'home');
}
if (btnRecordEndShortcut) {
    btnRecordEndShortcut.onclick = () => handleRecordClick(btnRecordEndShortcut, 'end');
}
if (btnRecordPrefixShortcut) {
    btnRecordPrefixShortcut.onclick = () => handleRecordClick(btnRecordPrefixShortcut, 'prefix');
}
if (btnRecordPasteShortcut) {
    btnRecordPasteShortcut.onclick = () => handleRecordClick(btnRecordPasteShortcut, 'paste');
}

window.addEventListener('keydown', (e) => {
    if (!recordingTarget) return;
    e.preventDefault();

    // Ignore standalone modifier key presses to allow combinations
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return;
    }

    const newShortcut = {
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        key: e.key.toLowerCase()
    };

    if (recordingTarget === 'ctrl-y') {
        customShortcut = newShortcut;
        btnRecordShortcut.textContent = formatShortcut(customShortcut);
        btnRecordShortcut.classList.remove('active');
        saveUiSetting('GCW_UI_CUSTOM_SHORTCUT', JSON.stringify(customShortcut));
    } else if (recordingTarget === 'ctrl-o') {
        customOShortcut = newShortcut;
        btnRecordOShortcut.textContent = formatShortcut(customOShortcut);
        btnRecordOShortcut.classList.remove('active');
        saveUiSetting('GCW_UI_CUSTOM_O_SHORTCUT', JSON.stringify(customOShortcut));
    } else if (recordingTarget === 'home') {
        customHomeShortcut = newShortcut;
        btnRecordHomeShortcut.textContent = formatShortcut(customHomeShortcut);
        btnRecordHomeShortcut.classList.remove('active');
        saveUiSetting('GCW_UI_HOME_SHORTCUT', JSON.stringify(customHomeShortcut));
    } else if (recordingTarget === 'end') {
        customEndShortcut = newShortcut;
        btnRecordEndShortcut.textContent = formatShortcut(customEndShortcut);
        btnRecordEndShortcut.classList.remove('active');
        saveUiSetting('GCW_UI_END_SHORTCUT', JSON.stringify(customEndShortcut));
    } else if (recordingTarget === 'prefix') {
        customPrefixShortcut = newShortcut;
        btnRecordPrefixShortcut.textContent = formatShortcut(customPrefixShortcut);
        btnRecordPrefixShortcut.classList.remove('active');
        saveUiSetting('GCW_UI_PREFIX_SHORTCUT', JSON.stringify(customPrefixShortcut));
    } else if (recordingTarget === 'paste') {
        customPasteShortcut = newShortcut;
        btnRecordPasteShortcut.textContent = formatShortcut(customPasteShortcut);
        btnRecordPasteShortcut.classList.remove('active');
        saveUiSetting('GCW_UI_PASTE_SHORTCUT', JSON.stringify(customPasteShortcut));
    }

    recordingTarget = null;
}, { capture: true });
optTheme.onchange = () => {
    const theme = optTheme.value;
    saveUiSetting('GCW_UI_THEME', theme);
    applyTheme(theme);
};

loadSettings();

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
// 파일 트리 로드
async function loadFileTree(dir = '') {
    const files = await fileManager.loadFileTree(dir);
    fileManager.watchDirectory(dir);

    try {
        fileTree.innerHTML = '';
        
        // 입력창에 현재 경로 표시
        dirInput.value = dir || '.';
        
        // 썸네일 불러오기 (현재 디렉토리 기준)
        loadLatestThumbnails(dir);

        // 스타일 모드 읽기
        let fileTreeStyleMode = parseInt(getUiSetting('GCW_UI_FILE_TREE_STYLE') || '0', 10);
        let sortedFiles = [...files];

        if (fileTreeStyleMode === 2) {
            // 최신날짜 순 정렬 (디렉토리 무시하고 섞거나 유지. 보통은 디렉토리 우선)
            sortedFiles.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return (b.mtime || 0) - (a.mtime || 0);
            });
        } else {
            // 알파벳 순 정렬 (기본값)
            sortedFiles.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });
        }

        // 하위 폴더인 경우 상위로 돌아가는(..) 항목 추가
        if (dir && dir !== '.') {
            const upDiv = document.createElement('div');
            upDiv.className = 'file-item dir';
            upDiv.textContent = '📁 ..';
            upDiv.title = 'Go back to parent directory';
            upDiv.onclick = () => {
                const parts = dir.split('/');
                parts.pop(); // 현재 폴더 제거
                loadFileTree(parts.join('/'));
            };
            fileTree.appendChild(upDiv);
        }

        sortedFiles.forEach(f => {
            const div = document.createElement('div');
            div.className = `file-item ${f.isDirectory ? 'dir' : 'file'}`;
            
            let displayName = f.name;
            // Mode 1: 중간 자르기 (Mid-Truncate)
            if (fileTreeStyleMode === 1 && displayName.length > 25) {
                const startLen = 12;
                const endLen = 10;
                if (displayName.length > startLen + endLen) {
                    displayName = displayName.substring(0, startLen) + '...' + displayName.substring(displayName.length - endLen);
                }
            }
            
            div.textContent = (f.isDirectory ? '📁 ' : '📄 ') + displayName;
            div.title = f.name;
            
            // 폴더인 경우 한 번 클릭 시 해당 디렉토리로 이동
            if (f.isDirectory) {
                div.onclick = () => {
                    loadFileTree(f.path);
                };
            }
            
            // 더블클릭 시 터미널에 파일/폴더 절대 경로 삽입
            div.ondblclick = (e) => {
                socket.emit('input', `@${f.path} `);
            };
            
            // 우클릭 시 컨텍스트 메뉴 표시
            div.oncontextmenu = (e) => {
                e.preventDefault();
                selectedFileContext = f;
                
                contextMenu.style.left = `${e.pageX}px`;
                contextMenu.style.top = `${e.pageY}px`;
                contextMenu.classList.remove('hidden');
            };
            
            fileTree.appendChild(div);
        });
    } catch (err) {
        fileTree.innerHTML = '<p>파일 목록을 불러오지 못했습니다.</p>';
    }
}

// 디렉토리 입력창 엔터 키 처리
dirInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loadFileTree(dirInput.value.trim());
    }
});

// Tmux 경로 동기화 버튼
btnSyncTmux.onclick = async () => {
    if (!tmuxManager.currentSession) return;
    try {
        const pwd = await tmuxManager.fetchSessionPwd();
        if (pwd) {
            if (fileManager.currentDir !== pwd) {
                console.log(`[DEBUG] PWD changed from '${fileManager.currentDir}' to '${pwd}'. Syncing file tree...`);
                loadFileTree(pwd);
            } else {
                console.log(`[DEBUG] PWD is same ('${fileManager.currentDir}'). Skipping sync.`);
            }
        }
    } catch (err) {
        console.error('Failed to sync tmux pwd:', err);
    }
};

// 사이드바 토글
const fitTerminal = () => {
    if (fitAddon && term) {
        fitAddon.fit();
        // 마지막 줄이 잘리거나 우측 경계에 딱 붙는 것을 방지하기 위해 보수적으로 1씩 줄임
        const safeCols = Math.max(20, term.cols - 1);
        const safeRows = Math.max(10, term.rows - 1);
        term.resize(safeCols, safeRows);
        socket.emit('resize', { cols: safeCols, rows: safeRows });
    }
};

btnToggleSidebar.onclick = () => {
    sidebar.classList.toggle('hidden');
    // 사이드바 애니메이션(0.2s) 고려하여 리사이즈
    setTimeout(fitTerminal, 250);
};

// 터미널 초기화
function initTerminal() {
    let savedFontFamily = getUiSetting('GCW_UI_TERMINAL_FONT_FAMILY');
    let savedFontSize = parseInt(getUiSetting('GCW_UI_TERMINAL_FONT_SIZE')) || 17;
    
    console.log('[DEBUG] Initializing terminal with font:', savedFontFamily, 'size:', savedFontSize);

    // UI Select 박스 동기화 (목록에 있을 때만 선택됨)
    if (savedFontFamily) {
        selectFont.value = savedFontFamily;
        if (!selectFont.value) {
            console.warn('[DEBUG] Font in .gcw.conf does not match any <option>, using first default for UI:', selectFont.options[0].value);
            selectFont.value = selectFont.options[0].value;
        }
    }
    
    // 실제 터미널에는 설정 파일 값을 최우선 적용, 없으면 UI 현재 값을 사용
    const selectedFont = savedFontFamily || selectFont.value;

    term = new Terminal({
        cursorBlink: true,
        fontFamily: selectedFont,
        fontSize: savedFontSize,
        theme: optTheme.value === 'light' ? lightThemeColors : darkThemeColors,
        allowProposedApi: true, // OSC 52 (Clipboard) 지원 등 고급 API 허용
        macOptionClickForcesSelection: true // macOS에서 Option(Alt) 키를 눌러 tmux 마우스 모드를 우회하여 텍스트 선택 허용
    });

    // 폰트 변경 이벤트
    selectFont.onchange = () => {
        const newFont = selectFont.value;
        console.log('[DEBUG] Changing font to:', newFont);
        term.options.fontFamily = newFont;
        saveUiSetting('GCW_UI_TERMINAL_FONT_FAMILY', newFont);
        // 폰트 변경 후 레이아웃 재조정
        setTimeout(fitTerminal, 50);
    };

    // 폰트 크기 증감 이벤트
    btnFontPlus.onclick = () => {
        const newSize = term.options.fontSize + 1;
        term.options.fontSize = newSize;
        saveUiSetting('GCW_UI_TERMINAL_FONT_SIZE', newSize);
        setTimeout(fitTerminal, 50);
    };

    btnFontMinus.onclick = () => {
        const newSize = Math.max(8, term.options.fontSize - 1);
        term.options.fontSize = newSize;
        saveUiSetting('GCW_UI_TERMINAL_FONT_SIZE', newSize);
        setTimeout(fitTerminal, 50);
    };

let autoSyncTimeout = null;

function triggerPwdAutoSync() {
    if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
    autoSyncTimeout = setTimeout(() => {
        if (tmuxManager.currentSession && btnSyncTmux) {
            console.log('[DEBUG] Auto-syncing PWD after Enter key...');
            btnSyncTmux.onclick();
        }
    }, 500); // 500ms 지연 후 동기화 (cd 명령어 실행 시간 확보)
}

    // Shift+Enter 입력 시 줄바꿈(새 줄 삽입)만 수행하도록 \x0a(Ctrl+J) 전송
    term.attachCustomKeyEventHandler((e) => {
        // 일반 Enter(Return) 키 감지 시 PWD 자동 동기화 트리거
        if (e.key === 'Enter' && !e.shiftKey && e.type === 'keydown') {
            triggerPwdAutoSync();
        }

        // Map Cmd+C to Ctrl+C (SIGINT) 설정 확인
        if (optCmdC.checked && e.metaKey && (e.key === 'c' || e.key === 'C')) {
            if (e.type === 'keydown') {
                socket.emit('input', '\x03');
            }
            return false; // 브라우저 복사 이벤트 방지
        }

        if (recordingTarget) return false;

        // Map custom shortcut to Ctrl+Y 설정 확인
        if (optCmdY.checked && 
            e.metaKey === customShortcut.metaKey &&
            e.ctrlKey === customShortcut.ctrlKey &&
            e.altKey === customShortcut.altKey &&
            e.shiftKey === customShortcut.shiftKey &&
            e.key.toLowerCase() === customShortcut.key) {
            
            if (e.type === 'keydown') {
                socket.emit('input', '\x19');
            }
            return false; // 브라우저 기본 이벤트 방지
        }

        // Map custom shortcut to Ctrl+O 설정 확인
        if (optCmdO && optCmdO.checked &&
            e.metaKey === customOShortcut.metaKey &&
            e.ctrlKey === customOShortcut.ctrlKey &&
            e.altKey === customOShortcut.altKey &&
            e.shiftKey === customOShortcut.shiftKey &&
            e.key.toLowerCase() === customOShortcut.key) {
            
            if (e.type === 'keydown') {
                socket.emit('input', '\x0f'); // \x0f is Ctrl+O
            }
            return false;
        }

        // Map custom shortcut to Home 설정 확인
        if (optMapHome && optMapHome.checked &&
            e.metaKey === customHomeShortcut.metaKey &&
            e.ctrlKey === customHomeShortcut.ctrlKey &&
            e.altKey === customHomeShortcut.altKey &&
            e.shiftKey === customHomeShortcut.shiftKey &&
            e.key.toLowerCase() === customHomeShortcut.key) {
            
            if (e.type === 'keydown') {
                socket.emit('input', '\x1b[H'); // Standard ANSI sequence for Home
            }
            return false;
        }

        // Map custom shortcut to End 설정 확인
        if (optMapEnd && optMapEnd.checked &&
            e.metaKey === customEndShortcut.metaKey &&
            e.ctrlKey === customEndShortcut.ctrlKey &&
            e.altKey === customEndShortcut.altKey &&
            e.shiftKey === customEndShortcut.shiftKey &&
            e.key.toLowerCase() === customEndShortcut.key) {

            if (e.type === 'keydown') {
                socket.emit('input', '\x1b[F'); // Standard ANSI sequence for End
            }
            return false;
        }

        // Map custom shortcut to Ctrl+B (Prefix) 설정 확인
        if (optMapPrefix && optMapPrefix.checked &&
            e.metaKey === customPrefixShortcut.metaKey &&
            e.ctrlKey === customPrefixShortcut.ctrlKey &&
            e.altKey === customPrefixShortcut.altKey &&
            e.shiftKey === customPrefixShortcut.shiftKey &&
            e.key.toLowerCase() === customPrefixShortcut.key) {

            if (e.type === 'keydown') {
                socket.emit('input', '\x02'); // \x02 is Ctrl+B
            }
            return false;
        }

        // Map custom shortcut to Paste 설정 확인
        if (optMapPaste && optMapPaste.checked &&
            e.metaKey === customPasteShortcut.metaKey &&
            e.ctrlKey === customPasteShortcut.ctrlKey &&
            e.altKey === customPasteShortcut.altKey &&
            e.shiftKey === customPasteShortcut.shiftKey &&
            e.key.toLowerCase() === customPasteShortcut.key) {

            if (e.type === 'keydown') {
                window.lastCustomPasteTime = Date.now(); // Promise 완료 전 동기적으로 타임스탬프 기록
                if (navigator.clipboard && navigator.clipboard.readText) {
                    navigator.clipboard.readText()
                        .then(text => {
                            if (text) {
                                socket.emit('input', text);
                            }
                        })
                        .catch(err => {
                            console.error('Failed to read clipboard contents: ', err);
                        });
                } else {
                    console.error('Clipboard API not available');
                }
            }
            return false;
        }

        if (e.key === 'Enter' && e.shiftKey) {            if (e.type === 'keydown') {
                socket.emit('input', '\x0a');
            }
            return false; // keydown, keypress, keyup 모두 xterm 기본 처리 방지
        }
        return true;
    });

    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    // WebLinksAddon 추가: Ctrl 또는 Cmd 키를 누르고 클릭했을 때만 링크 열기
    const webLinksAddon = new WebLinksAddon.WebLinksAddon((e, uri) => {
        if (e.ctrlKey || e.metaKey) {
            window.open(uri, '_blank');
        }
    });
    term.loadAddon(webLinksAddon);

    term.open(document.getElementById('terminal'));
    fitTerminal();

    term.onData(data => {
        socket.emit('input', data);
    });

    // OSC 52 (클립보드 복사 시퀀스) 수신 핸들러 추가
    // tmux에서 set-clipboard on이 켜져 있으면 선택 시 이 시퀀스를 전송합니다.
    term.parser.registerOscHandler(52, (data) => {
        try {
            const parts = data.split(';');
            if (parts.length >= 2) {
                const b64Data = parts[1];
                // Base64 디코딩 후 UTF-8 문자로 변환 (한글 깨짐 방지)
                const binString = atob(b64Data);
                const bytes = new Uint8Array(binString.length);
                for (let i = 0; i < binString.length; i++) {
                    bytes[i] = binString.charCodeAt(i);
                }
                const text = new TextDecoder('utf-8').decode(bytes);
                
                // Tmux에서 마우스 클릭으로 인한 1~2글자 우발적 복사 방지
                if (text && text.length > 2) {
                    console.log('[DEBUG] OSC 52 Copy sequence received. Length:', text.length);
                    copyToClipboard(text);
                } else {
                    console.log('[DEBUG] OSC 52 Copy sequence ignored (too short). Length:', text.length);
                }
                return true;
            }
        } catch (e) {
            console.error('[DEBUG] Failed to parse OSC 52 data:', e);
        }
        return false;
    });

    // 텍스트 선택 시 클립보드 자동 복사 (Shift 드래그 등 우회 선택 시)
    term.onSelectionChange(() => {
        const selectedText = term.getSelection();
        // 한두 글자 선택은 클릭 시 발생할 수 있으므로 최소 2자 이상일 때만 복사 (우발적 복사 방지)
        if (selectedText && selectedText.length > 2) {
            console.log('[DEBUG] xterm selection detected. Length:', selectedText.length);
            copyToClipboard(selectedText);
        }
    });

    function copyToClipboard(text) {
        if (!text || text.trim() === '') return;
        
        // 히스토리에 추가
        addToClipboardHistory(text);

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                console.log('[DEBUG] Auto-copied using navigator.clipboard');
            }).catch(err => {
                console.warn('[DEBUG] navigator.clipboard failed, using fallback.', err);
                fallbackCopyTextToClipboard(text);
            });
        } else {
            fallbackCopyTextToClipboard(text);
        }
    }

    function addToClipboardHistory(text) {
        // 이미 존재하면 제거 (최상단으로 올리기 위해)
        const index = clipboardHistory.indexOf(text);
        if (index !== -1) {
            clipboardHistory.splice(index, 1);
        }
        
        clipboardHistory.unshift(text);
        
        // 최대 5개 유지
        if (clipboardHistory.length > 5) {
            clipboardHistory.pop();
        }
        
        renderClipboardHistory();
    }

    function renderClipboardHistory() {
        clipboardHistoryList.innerHTML = '';
        clipboardHistory.forEach(text => {
            const div = document.createElement('div');
            div.className = 'clipboard-item';
            div.textContent = text.trim();
            div.title = text; // 마우스 오버 시 전체 내용 표시
            div.onclick = () => {
                // 항목 클릭 시 클립보드에 다시 복사
                copyToClipboard(text);
                // 시각적 피드백
                div.style.backgroundColor = '#007acc';
                setTimeout(() => div.style.backgroundColor = '', 200);
            };
            clipboardHistoryList.appendChild(div);
        });
    }

    function fallbackCopyTextToClipboard(text) {
        console.log('[DEBUG] Executing fallbackCopyTextToClipboard');
        const textArea = document.createElement("textarea");
        textArea.value = text;
        
        // 화면 스크롤을 방지하기 위해 보이지 않는 곳에 고정
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                console.log('[DEBUG] Fallback copy successful');
            } else {
                console.error('[DEBUG] Fallback copy failed (execCommand returned false)');
            }
        } catch (err) {
            console.error('[DEBUG] Fallback copy error', err);
        }

        document.body.removeChild(textArea);
        term.focus(); // 터미널로 포커스 반환
    }

    window.addEventListener('resize', fitTerminal);

    socket.on('output', data => {
        term.write(data);
    });

    socket.on('exit', () => {
        detach();
    });
    
    // 우클릭 메뉴(Context Menu) 방지
    document.getElementById('terminal').addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, false);
}

// 최근 썸네일 로드 (현재 탐색기 디렉토리 기준)
async function loadLatestThumbnails(dir = fileManager.currentDir) {
    try {
        const query = dir ? `?dir=${encodeURIComponent(dir)}` : '';
        const response = await fetch(getApiPath(`/api/latest-images${query}`));
        const images = await response.json();
        recentThumbnails = images; // 이제 {url, filepath} 객체 배열
        renderThumbnails();
    } catch (err) {
        console.error('Failed to load latest thumbnails:', err);
    }
}

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
    
    if (!term) {
        initTerminal();
    } else {
        term.clear();
    }
    
    // Core를 통한 통신은 TmuxManager 내부에서 이미 처리됨
    // 여기서는 UI만 갱신함
    socketClient.emit('theme_change', optTheme.value);
    
    setTimeout(() => {
        if (term) tmuxManager.sendResize(term.cols, term.rows);
    }, 100);
    
    loadFileTree();
    loadLatestThumbnails();
    
    // 세션 전환 시 즉시 해당 세션의 PWD로 동기화
    setTimeout(() => {
        if (btnSyncTmux) btnSyncTmux.onclick();
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

// --- Tmux 관리 모달 로직 ---
const tmuxManageModal = document.getElementById('tmux-management-modal');
const btnManageTmux = document.getElementById('btn-manage-tmux');
const closeTmuxManage = document.getElementById('close-tmux-management');
const btnRefreshPanes = document.getElementById('btn-refresh-panes');
const manageWindowList = document.getElementById('manage-window-list');
const paneVisualMapContainer = document.getElementById('pane-visual-map-container');

if (btnManageTmux) {
    btnManageTmux.onclick = () => {
        tmuxManageModal.style.display = 'block';
        tmuxManager.fetchWindows();
        tmuxManager.fetchPanes();
    };
}

if (closeTmuxManage) {
    closeTmuxManage.onclick = () => {
        tmuxManageModal.style.display = 'none';
    };
}

if (btnRefreshPanes) {
    btnRefreshPanes.onclick = () => {
        tmuxManager.fetchPanes();
    };
}

// 윈도우 목록이 업데이트될 때 관리 모달 내 리스트도 갱신
const originalOnWindowListUpdated = tmuxManager.onWindowListUpdated;
tmuxManager.onWindowListUpdated = (windows) => {
    if (typeof originalOnWindowListUpdated === 'function') {
        originalOnWindowListUpdated(windows);
    }
    renderManageWindowList(windows);
};

function renderManageWindowList(windows) {
    if (!manageWindowList) return;
    manageWindowList.innerHTML = '';
    
    windows.forEach(win => {
        const item = document.createElement('li');
        item.className = 'manage-item';
        if (win.active) item.classList.add('active');
        
        item.innerHTML = `
            <div class="manage-item-info">
                <span class="manage-item-name">${win.index}: ${win.name}</span>
                <span class="manage-item-meta">${win.active ? '(Active Window)' : ''}</span>
            </div>
            <button class="btn-kill-small" data-index="${win.index}">Kill</button>
        `;
        
        item.onclick = () => tmuxManager.selectWindow(win.index);
        
        const killBtn = item.querySelector('.btn-kill-small');
        killBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Kill window ${win.index}?`)) {
                tmuxManager.killWindow(win.index);
            }
        };
        
        manageWindowList.appendChild(item);
    });
}

// 패널 목록 수신 시 비주얼 맵 렌더링
tmuxManager.onPaneListUpdated = (panes) => {
    if (!paneVisualMapContainer) return;
    paneVisualMapContainer.innerHTML = '';
    
    if (panes.length === 0) return;
    
    // 전체 좌표 범위 계산 (Tmux 좌표계는 0부터 시작)
    const maxWidth = Math.max(...panes.map(p => p.left + p.width));
    const maxHeight = Math.max(...panes.map(p => p.top + p.height));
    
    panes.forEach(pane => {
        const block = document.createElement('div');
        block.className = 'pane-block';
        if (pane.active) block.classList.add('active');
        
        // 백분율로 위치 계산
        block.style.left = `${(pane.left / maxWidth) * 100}%`;
        block.style.top = `${(pane.top / maxHeight) * 100}%`;
        block.style.width = `${(pane.width / maxWidth) * 100}%`;
        block.style.height = `${(pane.height / maxHeight) * 100}%`;
        
        block.innerHTML = `
            <div class="pane-block-index">#${pane.index}</div>
            <div class="pane-block-cmd">${pane.command}</div>
            <div class="pane-block-actions">
                <button class="btn-kill-small" title="Kill Pane">Kill</button>
            </div>
        `;
        
        const killBtn = block.querySelector('.btn-kill-small');
        killBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Kill pane #${pane.index}?`)) {
                tmuxManager.killPane(pane.index);
            }
        };
        
        paneVisualMapContainer.appendChild(block);
    });
};

// 연결 상태 처리
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

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
    if (tmuxManager.currentSession && mainLayout.style.display !== 'none') {
        console.log('[DEBUG] Reattaching to last used session:', tmuxManager.currentSession);
        tmuxManager.attachSession(tmuxManager.currentSession);
    }
});

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
tmuxManager.onSessionChanged = (name) => {
    console.log('[VIEW] Session changed:', name);
    attachSession(name); // 기존 UI 업데이트 로직 재사용
    
    // 세션이 변경되거나 재연결되면 오버레이를 숨김
    const overlay = document.getElementById('disconnect-overlay');
    if (overlay) overlay.style.display = 'none';
};

tmuxManager.onSessionExited = () => {
    if (term) term.write('\r\n\x1b[31m[Session Disconnected]\x1b[0m\r\n');
    
    // 연결이 끊어지면 오버레이를 표시
    const overlay = document.getElementById('disconnect-overlay');
    if (overlay) overlay.style.display = 'flex';
};

// 재연결 버튼 이벤트 리스너 추가
document.addEventListener('DOMContentLoaded', () => {
    const btnReconnect = document.getElementById('btn-reconnect');
    if (btnReconnect) {
        btnReconnect.addEventListener('click', () => {
            const currentSession = tmuxManager.currentSession;
            if (currentSession) {
                // UI 오버레이 즉시 숨김
                document.getElementById('disconnect-overlay').style.display = 'none';
                
                if (term) {
                    term.clear();
                    term.write('\r\n\x1b[33mReconnecting to session...\x1b[0m\r\n');
                }
                
                // attach 이벤트 발생시켜 재접속 (-d 옵션으로 강제 제어권 탈환)
                socket.emit('attach', currentSession);
            } else {
                // 세션 이름이 없는 경우 페이지 새로고침
                window.location.reload();
            }
        });
    }
});

tmuxManager.onWindowListUpdated = (windows) => {
    console.log('[VIEW] Window list updated:', windows);
    renderTmuxWindowTabs(windows);
};
// ---------------------------------------------------------

socket.on('error', (msg) => {
    alert(msg);
});

// 파일 시스템 변경 감지 이벤트 수신
socket.on('directory_changed', (data) => {
    console.log(`[DEBUG] Directory change detected in: ${data.dir}. Refreshing file tree...`);
    if (fileManager.currentDir === data.dir || (fileManager.currentDir === '' && data.dir === '.')) {
        loadFileTree(fileManager.currentDir);
    }
});

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
    if (confirm("현재 세션에 꼬인 클라이언트를 리셋하고 모든 접속을 해제하시겠습니까? (실행 후 새로고침 필요)")) {
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

// 클립보드 붙여넣기 (이미지 추출 및 업로드)
window.addEventListener('paste', (e) => {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) {
        console.log('[DEBUG] No clipboard data found');
        return;
    }

    // 텍스트 데이터는 xterm.js가 기본적으로 처리하도록 내버려둠 (중복 입력 방지)
    // 단, 이미지인 경우에만 이 리스너에서 가로채서 처리함
    let hasImage = false;
    if (clipboardData.items) {
        for (let i = 0; i < clipboardData.items.length; i++) {
            if (clipboardData.items[i].type.startsWith('image/')) {
                hasImage = true;
                break;
            }
        }
    }

    // 커스텀 단축키가 방금(100ms 이내) 실행되었다면 네이티브 붙여넣기 무시
    // 단, 이미지가 포함된 경우에는 업로드 로직을 위해 무시하지 않고 진행함
    if (!hasImage && window.lastCustomPasteTime && (Date.now() - window.lastCustomPasteTime < 100)) {
        console.log('[DEBUG] Ignoring native paste to prevent double entry (Text only)');
        e.preventDefault();
        e.stopPropagation();
        return;
    }

    console.log('[DEBUG] Paste event triggered');
    if (mainLayout.style.display === 'none') {
        console.log('[DEBUG] Main layout is hidden, ignoring paste');
        return;
    }

    const textData = clipboardData.getData('text/plain');
    if (textData && !hasImage) {
        console.log('[DEBUG] Plain text paste detected, letting xterm.js handle it');
        return;
    }

    const items = clipboardData.items;
    console.log(`[DEBUG] Found ${items.length} items in clipboard`);
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(`[DEBUG] Item ${i}: kind=${item.kind}, type=${item.type}`);
        
        // 브라우저에 따라 이미지의 type이 image/png, image/jpeg 등으로 잡힘
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            console.log(`[DEBUG] Image file found (${item.type}), processing...`);
            const blob = item.getAsFile();
            const reader = new FileReader();
            
            reader.onload = function(event) {
                console.log(`[DEBUG] File read complete. Size: ${event.target.result.byteLength} bytes. Emitting to server...`);
                const ext = item.type.split('/')[1] || 'png';
                socket.emit('upload_image', {
                    data: event.target.result,
                    ext: ext,
                    dir: fileManager.currentDir
                });
            };
            
            reader.readAsArrayBuffer(blob);
            
            // 이미지인 경우 기본 붙여넣기 이벤트를 막아 터미널에 이상한 문자가 입력되지 않게 함
            e.preventDefault(); 
            return;
        }
    }
    console.log('[DEBUG] No image file found in clipboard data');
}, true); // useCapture를 true로 설정하여 xterm.js보다 먼저 이벤트를 가로챔

const uploadStatusContainer = document.getElementById('upload-status-container');

/**
 * 업로드 진행 상태를 UI에 표시하고 업데이트합니다.
 */
function updateUploadUI(percent, uploadId, filename) {
    let item = document.getElementById(`upload-${uploadId}`);
    
    if (!item) {
        // 새 항목 생성
        uploadStatusContainer.classList.remove('hidden');
        item = document.createElement('div');
        item.id = `upload-${uploadId}`;
        item.className = 'upload-item';
        item.innerHTML = `
            <div class="upload-info">
                <span class="upload-filename" title="${filename}">${filename}</span>
                <span class="upload-percent">${percent}%</span>
            </div>
            <div class="upload-progress-bg">
                <div class="upload-progress-fill" style="width: ${percent}%"></div>
            </div>
        `;
        uploadStatusContainer.appendChild(item);
    } else {
        // 기존 항목 업데이트
        item.querySelector('.upload-percent').textContent = `${percent}%`;
        item.querySelector('.upload-progress-fill').style.width = `${percent}%`;
        
        if (percent >= 100) {
            item.classList.add('complete');
            // 3초 후 항목 삭제 및 컨테이너 체크
            setTimeout(() => {
                item.remove();
                if (uploadStatusContainer.querySelectorAll('.upload-item').length === 0) {
                    uploadStatusContainer.classList.add('hidden');
                }
            }, 3000);
        }
    }
}

// 이미지 업로드 완료 수신
socket.on('image_uploaded', (info) => {
    // 서버가 전달해준 절대 경로를 터미널에 입력 (공백 포함하여 바로 다음 명령어 입력 가능하게)
    socket.emit('input', `@${info.filepath} `);

    // 썸네일 바 업데이트 (현재 디렉토리와 일치할 때만)
    if (fileManager.currentDir === info.dir || (fileManager.currentDir === '' && !info.dir)) {
        addThumbnail(info);
    }

    // 파일 트리 갱신 (현재 디렉토리와 일치할 때만)
    if (fileManager.currentDir === info.dir || (fileManager.currentDir === '' && !info.dir)) {
        loadFileTree(fileManager.currentDir);
    }
});
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

function addThumbnail(info) {
    recentThumbnails.unshift(info);
    if (recentThumbnails.length > 5) {
        recentThumbnails.pop();
    }
    renderThumbnails();
}

function renderThumbnails() {
    if (!recentImagesDropdown || !recentImagePreview) return;
    recentImagesDropdown.innerHTML = '';

    if (recentThumbnails.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '최근 업로드 이미지 없음';
        recentImagesDropdown.appendChild(opt);
        recentImagePreview.style.display = 'none';
        return;
    }

    // 배열이 이미 최신순(Recent First)으로 유지되므로 그대로 렌더링
    recentThumbnails.forEach((info, idx) => {
        const opt = document.createElement('option');
        opt.value = info.filepath;

        // 파일명만 추출하여 표시 (예: image.png)
        const filename = info.filepath.split('/').pop() || info.filepath;
        opt.textContent = `[${idx+1}] ${filename}`;
        
        recentImagesDropdown.appendChild(opt);
    });

    // 드롭다운 변경 시 옆의 썸네일 자동 갱신
    recentImagesDropdown.onchange = () => {
        const selectedPath = recentImagesDropdown.value;
        if (!selectedPath) {
            recentImagePreview.style.display = 'none';
            return;
        }
        const info = recentThumbnails.find(t => t.filepath === selectedPath);
        if (info) {
            recentImagePreview.src = getApiPath(info.url);
            recentImagePreview.style.display = 'inline-block';
            recentImagePreview.onclick = () => openModal(getApiPath(info.url));
        }
    };

    // 처음 렌더링 후 첫 번째 항목(최신 이미지) 자동 선택 및 썸네일 표시
    recentImagesDropdown.selectedIndex = 0;
    recentImagesDropdown.onchange();
}

// 드롭다운에서 선택된 이미지 삽입
btnInsertSelected.onclick = () => {
    if (!recentImagesDropdown) return;
    const selectedPath = recentImagesDropdown.value;
    if (!selectedPath) return;

    socket.emit('input', `@${selectedPath} `);
};
// 모달 제어
function openModal(url) {
    modal.style.display = "flex";
    modalImg.src = url;
}

closeModal.onclick = function() {
    modal.style.display = "none";
}

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
    if (event.target == envModal) {
        envModal.style.display = "none";
    }

    // 컨텍스트 메뉴 외부 클릭 시 닫기
    if (!event.target.classList.contains('context-menu-item')) {
        contextMenu.classList.add('hidden');
    }
}

// 컨텍스트 메뉴: 뷰어에서 보기 (새 탭)
menuView.onclick = () => {
    if (!selectedFileContext) return;
    if (selectedFileContext.isDirectory) {
        alert("폴더는 뷰어에서 열 수 없습니다.");
        contextMenu.classList.add('hidden');
        return;
    }
    
    // 새 창으로 전용 뷰어 실행
    const viewerUrl = `${basePath}viewer.html?path=${encodeURIComponent(selectedFileContext.path)}`;
    window.open(viewerUrl, '_blank');
    
    contextMenu.classList.add('hidden');
};

// 컨텍스트 메뉴: 다운로드
menuDownload.onclick = () => {
    if (!selectedFileContext) return;
    if (selectedFileContext.isDirectory) {
        alert("폴더 다운로드는 아직 지원하지 않습니다.");
        contextMenu.classList.add('hidden');
        return;
    }
    
    const downloadUrl = getApiPath(`/api/download?path=${encodeURIComponent(selectedFileContext.path)}`);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = selectedFileContext.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    contextMenu.classList.add('hidden');
};

// 컨텍스트 메뉴: 이름 변경
menuRename.onclick = () => {
    if (!selectedFileContext) return;
    
    const newName = prompt("새 이름을 입력하세요:", selectedFileContext.name);
    if (newName && newName.trim() !== "" && newName !== selectedFileContext.name) {
        fileManager.renameFile(selectedFileContext.path, newName.trim());
    }
    contextMenu.classList.add('hidden');
};

// 컨텍스트 메뉴: 삭제
menuDelete.onclick = () => {
    if (!selectedFileContext) return;
    
    if (confirm(`'${selectedFileContext.name}'을(를) 정말 삭제하시겠습니까?`)) {
        fileManager.deleteFile(selectedFileContext.path);
    }
    contextMenu.classList.add('hidden');
};

// 파일 탐색기 드래그 앤 드롭 업로드 처리
sidebar.addEventListener('dragover', (e) => {
    e.preventDefault();
    sidebar.classList.add('drag-over');
});

sidebar.addEventListener('dragleave', (e) => {
    e.preventDefault();
    sidebar.classList.remove('drag-over');
});

sidebar.addEventListener('drop', (e) => {
    e.preventDefault();
    sidebar.classList.remove('drag-over');
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
            const file = e.dataTransfer.files[i];
            console.log('[DEBUG] Dropped file:', file.name, file.size);
            
            const reader = new FileReader();
            reader.onload = function(event) {
                // 청크 방식 업로드 호출 및 UI 콜백 전달
                fileManager.uploadFile(file.name, event.target.result, fileManager.currentDir, (percent, uploadId, filename) => {
                    updateUploadUI(percent, uploadId, filename);
                });
            };
            reader.readAsArrayBuffer(file);
        }
    }
});

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

        // 명시적인 세션 선택 요청(?select=true)이 없고, 세션 정보가 있으면 자동 접속 시도
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

initApp();

// 주기적 폴링 (2초마다 윈도우 전환이나 외부 디렉토리 변경 감지)
setInterval(() => {
    // 사용자가 현재 브라우저 탭을 보고 있고, 세션이 연결된 상태일 때만 실행
    if (document.visibilityState === 'visible' && tmuxManager.currentSession && btnSyncTmux) {
        btnSyncTmux.onclick();
    }
}, 2000);

