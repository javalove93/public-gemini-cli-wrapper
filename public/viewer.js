import { socketClient } from './js/core/SocketClient.js';
import { fileManager } from './js/core/FileManager.js';
import { ViewerFactory } from './js/modules/ViewerFactory.js';

console.log('[VIEWER.JS] ---> LOADED AT:', new Date().toISOString(), '| VERSION: MERMAID MODAL V2 <---');

// 설정 동기화 유틸리티
const uiSettings = window.__GCW_SETTINGS__ || {};
async function saveUiSetting(key, value) {
    uiSettings[key] = String(value);
    try {
        await fetch(socketClient.getApiPath('/api/ui-settings'), {
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

document.addEventListener('DOMContentLoaded', () => {
    const filePathSpan = document.getElementById('file-path');
    const textContainer = document.getElementById('text-container');
    const textContent = document.getElementById('text-content');
    const markdownContainer = document.getElementById('markdown-container');
    const mdRaw = document.getElementById('md-raw');
    const mdRendered = document.getElementById('md-rendered');

    const openBtn = document.getElementById('open-btn');
    const fileModal = document.getElementById('file-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalCurrentDir = document.getElementById('modal-current-dir');
    const modalFileList = document.getElementById('modal-file-list');
    
    const sortNameHeader = document.getElementById('sort-name');
    const sortDateHeader = document.getElementById('sort-date');

    const urlParams = new URLSearchParams(window.location.search);
    let filePath = urlParams.get('path');
    let instanceName = null;

    const updateTitle = () => {
        const titlePrefix = instanceName ? `${instanceName}-` : '';
        if (filePath) {
            filePathSpan.textContent = filePath;
            document.title = `${titlePrefix}${filePath.split('/').pop()} - Viewer`;
        } else {
            filePathSpan.textContent = 'No file selected.';
            document.title = `${titlePrefix}Viewer`;
        }
    };

    // 인스턴스 정보 가져오기 (비차단)
    const fetchSystemInfo = async () => {
        try {
            const res = await fetch(socketClient.getApiPath('/api/system-info'));
            const data = await res.json();
            instanceName = data.instanceName;
            updateTitle();
        } catch (e) {
            console.warn('Failed to fetch system info in viewer', e);
        }
    };

    // 초기 타이틀 즉시 설정 및 정보 로드 시작
    updateTitle();
    fetchSystemInfo();

    // Socket.io 연결 및 파일 감시 요청
    const socket = socketClient.connect('viewer');
    if (filePath) socketClient.emit('watch_file', filePath);

    // File Browser Modal Logic
    let currentModalDir = '';
    let currentFilesData = [];
    
    // Sort State
    let sortCol = getUiSetting('GCW_UI_VIEWER_SORT_COL') || 'date';
    let sortDir = getUiSetting('GCW_UI_VIEWER_SORT_DIR') || 'desc';
    const getDirName = (pathStr) => {
        const parts = pathStr.split('/');
        parts.pop();
        return parts.join('/') || '/';
    };

    const formatDate = (ms) => {
        if (!ms) return '';
        const d = new Date(ms);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };
    
    const updateSortIcons = () => {
        sortNameHeader.querySelector('.sort-icon').textContent = sortCol === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : '';
        sortDateHeader.querySelector('.sort-icon').textContent = sortCol === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : '';
    };

    const handleSortClick = (col) => {
        if (sortCol === col) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            sortCol = col;
            sortDir = col === 'date' ? 'desc' : 'asc';
        }
        saveUiSetting('GCW_UI_VIEWER_SORT_COL', sortCol);
        saveUiSetting('GCW_UI_VIEWER_SORT_DIR', sortDir);
        updateSortIcons();
        renderModalFiles(currentFilesData);
    };

    sortNameHeader.onclick = () => handleSortClick('name');
    sortDateHeader.onclick = () => handleSortClick('date');

    // --- 뷰어 공장 패턴 도입 ---
    const viewerFactory = new ViewerFactory(markdownContainer, textContainer, textContent, mdRaw, mdRendered);

    // --- 동기식 스크롤 (Sync Scroll) 로직 복구 ---
    if (mdRaw && mdRendered) {
        // 실제 스크롤(overflow: auto)이 발생하는 부모 컨테이너를 찾음
        const leftPane = mdRaw.closest('.pane');
        const rightPane = mdRendered.closest('.pane');

        if (leftPane && rightPane) {
            let isSyncingLeft = false;
            let isSyncingRight = false;

            leftPane.onscroll = () => {
                if (isSyncingLeft) {
                    isSyncingLeft = false;
                    return;
                }
                isSyncingRight = true;
                const percentage = leftPane.scrollTop / (leftPane.scrollHeight - leftPane.clientHeight);
                rightPane.scrollTop = percentage * (rightPane.scrollHeight - rightPane.clientHeight);
            };

            rightPane.onscroll = () => {
                if (isSyncingRight) {
                    isSyncingRight = false;
                    return;
                }
                isSyncingLeft = true;
                const percentage = rightPane.scrollTop / (rightPane.scrollHeight - rightPane.clientHeight);
                leftPane.scrollTop = percentage * (leftPane.scrollHeight - leftPane.clientHeight);
            };
        }
    }
    // ------------------------------------------

    // Swap panes button for split view
    const swapPanesBtn = document.getElementById('swap-panes-btn');
    swapPanesBtn.onclick = () => {
        markdownContainer.classList.toggle('swapped');
    };

    socket.on('file_changed', (data) => {
        if (data.path === filePath) {
            console.log('[DEBUG] File changed, reloading content...');
            loadContent();
        }
    });

    const loadContent = async () => {
        try {
            // 처음 렌더링 시에도 파일 감지 요청 등록
            if (socketClient && socketClient.socket && filePath) {
                socketClient.socket.emit('watch_file', filePath);
            }
            
            // [P-02] 바이너리 가드 통과 여부 검사
            const fileTypeCheck = ViewerFactory.isBinaryOrNative(filePath);
            
            if (fileTypeCheck.action === 'redirect') {
                window.location.replace(socketClient.getApiPath(`/api/image?path=${encodeURIComponent(filePath)}`));
                return;
            } else if (fileTypeCheck.action === 'download') {
                textContent.textContent = `[바이너리 보호] 브라우저에서 안전하게 열 수 없는 형식입니다. 다운로드를 권장합니다.`;
                textContent.style.display = 'block';
                markdownContainer.style.display = 'none';
                swapPanesBtn.classList.add('hidden');
                return;
            }

            // 파일 내용 요청 (Core 사용)
            const content = await fileManager.getFileContent(filePath);
            
            // 공장에서 적절한 뷰어로 렌더링
            viewerFactory.renderContent(content, filePath);
            
            // Show/hide swap button based on file type (markdown uses split view)
            if (filePath && filePath.toLowerCase().endsWith('.md')) {
                swapPanesBtn.classList.remove('hidden');
            } else {
                swapPanesBtn.classList.add('hidden');
                markdownContainer.classList.remove('swapped'); // Reset state
            }
            
        } catch (error) {
            console.error('Failed to load file:', error);
            textContent.textContent = `Error loading file content.\n\nDetails: ${error.message}`;
            textContent.style.display = 'block';
            markdownContainer.style.display = 'none';
        }
    };

    const fetchModalFiles = async () => {
        console.log('[DEBUG] fetchModalFiles called. currentModalDir:', currentModalDir);
        try {
            const query = currentModalDir ? `?dir=${encodeURIComponent(currentModalDir)}` : '';
            const url = socketClient.getApiPath(`/api/files${query}`);
            console.log('[DEBUG] Fetching file list from:', url);
            const res = await fetch(url);
            currentFilesData = await res.json();
            console.log('[DEBUG] File list fetched successfully. Items:', currentFilesData.length);
            renderModalFiles(currentFilesData);
            modalCurrentDir.textContent = currentModalDir || '/';
        } catch (err) {
            console.error('[ERROR] Failed to load files for modal:', err);
        }
    };

    const renderModalFiles = (files) => {
        console.log('[DEBUG] renderModalFiles called.');
        modalFileList.innerHTML = '';
        
        let sortedFiles = [...files];
        sortedFiles.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            
            let cmp = 0;
            if (sortCol === 'name') {
                cmp = a.name.localeCompare(b.name);
            } else if (sortCol === 'date') {
                cmp = (a.mtime || 0) - (b.mtime || 0);
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

        if (currentModalDir && currentModalDir !== '.') {
            const upDiv = document.createElement('div');
            upDiv.className = 'modal-file-item dir';
            upDiv.innerHTML = `<span class="col-name">📁 ..</span><span class="col-date"></span>`;
            upDiv.onclick = () => {
                console.log('[DEBUG] Up directory clicked.');
                currentModalDir = getDirName(currentModalDir);
                fetchModalFiles();
            };
            modalFileList.appendChild(upDiv);
        }

        sortedFiles.forEach(f => {
            const div = document.createElement('div');
            div.className = `modal-file-item ${f.isDirectory ? 'dir' : 'file'}`;
            const dateStr = formatDate(f.mtime);
            
            let nameHtml = `<span class="col-name">${f.isDirectory ? '📁 ' : '📄 '}${f.name}</span>`;
            if (!f.isDirectory) {
                // [새로 열기] 버튼 추가
                nameHtml = `<span class="col-name">${f.isDirectory ? '📁 ' : '📄 '}${f.name} <button class="btn-new-tab" data-path="${f.path}" title="새 탭에서 열기">[새로 열기]</button></span>`;
            }
            
            div.innerHTML = `${nameHtml}<span class="col-date">${dateStr}</span>`;
            
            if (f.isDirectory) {
                div.onclick = () => {
                    currentModalDir = f.path;
                    fetchModalFiles();
                };
            } else {
                div.onclick = (e) => {
                    // [새로 열기] 버튼 클릭 시 이벤트 전파 방지 및 전용 로직 실행
                    if (e.target.classList.contains('btn-new-tab')) {
                        const path = e.target.getAttribute('data-path');
                        const newUrl = new URL(window.location.origin + window.location.pathname);
                        newUrl.searchParams.set('path', path);
                        window.open(newUrl.toString(), '_blank');
                        e.stopPropagation();
                        // 다이얼로그 닫기
                        fileModal.classList.add('hidden');
                        return;
                    }

                    filePath = f.path;
                    updateTitle();
                    
                    const newUrl = new URL(window.location);
                    newUrl.searchParams.set('path', filePath);
                    window.history.pushState({}, '', newUrl);

                    // style.display='none' 대신 .hidden 클래스 추가로 통일
                    fileModal.classList.add('hidden');
                    
                    loadContent();
                };
            }
            modalFileList.appendChild(div);
        });
    };

    openBtn.onclick = async () => {
        console.log('[DEBUG] "Open" button clicked!');
        currentModalDir = filePath ? getDirName(filePath) : '/';
        await fetchModalFiles();
        updateSortIcons();
        fileModal.classList.remove('hidden'); // hidden 클래스 제거
        console.log('[DEBUG] Modal shown (class "hidden" removed).');
    };

    modalCloseBtn.onclick = () => {
        fileModal.classList.add('hidden'); // hidden 클래스 추가
    };

    window.onclick = (e) => {
        if (e.target === fileModal) {
            fileModal.classList.add('hidden');
        }
    };

    if (filePath) {
        loadContent();
    }
});
