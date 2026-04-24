import { socketClient } from './js/core/SocketClient.js';
import { fileManager } from './js/core/FileManager.js';
import { ViewerFactory } from './js/modules/ViewerFactory.js';

console.log('[VIEWER.JS] ---> LOADED AT:', new Date().toISOString(), '| VERSION: BASE64 VIRTUAL FOLDING <---');

// --- Base64 Virtual Folding Utility (A안) ---
// 텍스트 내의 Base64 문자열을 찾아 CSS로 제어 가능한 span 태그로 감쌈
window.wrapBase64 = function(text) {
    if (!text) return '';
    
    // HTML 이스케이프 (innerHTML 사용을 위해 안전하게 처리)
    const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // "data:image/png;base64," 뒷부분의 긴 문자열을 span으로 감쌈
    // (보통 500자 이상의 긴 데이터만 대상으로 함)
    // 인라인(Inline) 문법 지원을 위해 괄호 유무에 상관없이 매칭하도록 유연하게 변경
    return escaped.replace(/(data:image\/[^;]+;base64,)([a-zA-Z0-9+/=\s]{500,})/g, (match, prefix, data) => {
        const fullSrc = (prefix + data).replace(/\s/g, '');
        return `<img src="${fullSrc}" class="base64-mini-preview" title="Hover to zoom" onclick="if(window.openModal) window.openModal('${fullSrc}')"><span class="base64-fold" title="Click to expand/collapse">${prefix}${data}</span>`;
    });
};

/**
 * 마크다운의 참조 방식 이미지 정의([image1]: data:...)를 
 * 실제 본문에서 호출하는 위치(![...][image1]) 바로 뒤로 이동시킴 (뷰어 소스 전용)
 */
window.reorderMarkdownImages = function(text) {
    if (!text) return '';
    const lines = text.split('\n');
    const imageDefs = {}; // id -> content (full line)
    const otherLines = [];
    const usedIds = new Set();

    // 1. 하단의 이미지 정의문([id]: data:...) 추출
    // 예: [image1]: data:image/png... 또는 [image1]: <data:image/png...>
    const defRegex = /^\[([^\]]+)\]:\s*<?\s*(data:image\/[^;]+;base64,[a-zA-Z0-9+/=\s]+)\s*>?/;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(defRegex);
        if (match) {
            imageDefs[match[1]] = lines[i]; // 원본 줄 그대로 저장
        } else {
            otherLines.push(lines[i]);
        }
    }

    // 2. 본문에서 참조 위치(![alt][id])를 찾아 바로 뒤에 정의문 삽입
    const finalLines = [];
    const refRegex = /!\[[^\]]*\]\[([^\]]+)\]/; // ![설명][id] 형태
    
    for (let i = 0; i < otherLines.length; i++) {
        const line = otherLines[i];
        finalLines.push(line);
        
        const match = line.match(refRegex);
        if (match) {
            const id = match[1];
            if (imageDefs[id]) {
                finalLines.push(imageDefs[id]); // 바로 아래에 데이터 삽입
                usedIds.add(id);
            }
        }
    }

    // 3. 혹시 본문에서 참조되지 않은 정의가 있다면 맨 뒤에 다시 붙여줌
    Object.keys(imageDefs).forEach(id => {
        if (!usedIds.has(id)) {
            finalLines.push(imageDefs[id]);
        }
    });

    return finalLines.join('\n');
};

// 전역 클릭 이벤트 리스너 (위임)
document.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('base64-fold')) {
        e.target.classList.toggle('expanded');
    }
});
// --------------------------------------------

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
    const editBtn = document.getElementById('edit-btn');
    const fileModal = document.getElementById('file-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalCurrentDir = document.getElementById('modal-current-dir');
    const modalFileList = document.getElementById('modal-file-list');
    
    // Edit Modal Elements
    const editModal = document.getElementById('edit-modal');
    const editFilePath = document.getElementById('edit-file-path');
    const editTextarea = document.getElementById('edit-textarea');
    const editSaveBtn = document.getElementById('edit-save-btn');
    const editCancelBtn = document.getElementById('edit-cancel-btn');
    let currentRawContent = '';
    let savedScrollPercentage = 0;

    // --- Editor Base64 Tokenizer & Safety Guard ---
    const base64TokenCache = new Map();
    let tokenCounter = 0;

    const TOKEN_PREFIX = '[♦︎ BASE64_IMAGE_';
    const TOKEN_SUFFIX = ' ♦︎]';
    // 꺾쇠 괄호 없이 순수 data: URI 패턴을 매칭 (마크다운 인라인 렌더링 호환)
    const BASE64_REGEX = /(data:image\/[^;]+;base64,[a-zA-Z0-9+/=\s]+)/g;

    /**
     * 텍스트에서 Base64를 찾아 토큰으로 치환하고 캐시에 저장 (에디터 열 때)
     */
    const tokenizeBase64 = (text) => {
        base64TokenCache.clear();
        tokenCounter = 0;
        
        return text.replace(BASE64_REGEX, (match) => {
            const tokenId = `${TOKEN_PREFIX}${tokenCounter++}${TOKEN_SUFFIX}`;
            base64TokenCache.set(tokenId, match);
            return tokenId;
        });
    };

    /**
     * 텍스트의 토큰을 다시 Base64로 복구 (저장할 때)
     */
    const restoreBase64 = (text) => {
        let restoredText = text;
        for (const [tokenId, base64Data] of base64TokenCache.entries()) {
            restoredText = restoredText.replace(tokenId, base64Data);
        }
        return restoredText;
    };

    /**
     * 사용자가 실수로 토큰을 지웠는지 검사 (Safety Guard)
     */
    const validateTokens = (text) => {
        const missingTokens = [];
        for (const tokenId of base64TokenCache.keys()) {
            if (!text.includes(tokenId)) {
                missingTokens.push(tokenId);
            }
        }
        return missingTokens;
    };
    // ---------------------------------------------

    // --- Editor Image Paste & Embedding Logic ---
    /**
     * 이미지 파일을 최적화된 Base64 데이터 URL로 변환 (1024px 초과 시 리사이징)
     */
    const optimizeImageToBase64 = (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const MAX_WIDTH = 1024;
                    let width = img.width;
                    let height = img.height;

                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                        
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        resolve(canvas.toDataURL('image/jpeg', 0.8));
                    } else {
                        resolve(e.target.result);
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    };

    const getNextImageId = (text) => {
        const regex = /\[image(\d+)\]:/g;
        let maxIdx = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const idx = parseInt(match[1], 10);
            if (idx > maxIdx) maxIdx = idx;
        }
        return `image${maxIdx + 1}`;
    };

    editTextarea.addEventListener('paste', async (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        let imageFile = null;

        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                imageFile = item.getAsFile();
                break;
            }
        }

        if (imageFile) {
            e.preventDefault();

            const base64Data = await optimizeImageToBase64(imageFile);
            
            // 토큰 생성 및 캐시 저장
            const tokenId = `${TOKEN_PREFIX}${tokenCounter++}${TOKEN_SUFFIX}`;
            // 인라인 문법과 호환성을 위해 꺾쇠 괄호 없이 순수 데이터로 저장
            base64TokenCache.set(tokenId, base64Data);

            const start = editTextarea.selectionStart;
            const end = editTextarea.selectionEnd;
            const currentText = editTextarea.value;

            // 인라인(Inline) 방식으로 커서 위치에 즉시 삽입
            // 뷰어에서 렌더링될 때는 <data:...> 형태로 복원되므로 마크다운 엔진이 이미지로 인식
            const inlineTag = `![image](${tokenId})`;
            const newText = currentText.substring(0, start) + inlineTag + currentText.substring(end);
            
            editTextarea.value = newText;

            // 커서 위치 복구 (태그 바로 뒤로)
            const newCursorPos = start + inlineTag.length;
            editTextarea.setSelectionRange(newCursorPos, newCursorPos);
            
            console.log(`[EDITOR] Image embedded inline with token ${tokenId}.`);
        }
    });
    // ---------------------------------------------
    
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

    // --- Copy Buttons Logic ---
    const setupCopyBtn = (btnId, targetElement, isHtml = false) => {
        const btn = document.getElementById(btnId);
        if (!btn || !targetElement) return;

        btn.onclick = () => {
            const textToCopy = isHtml ? targetElement.innerText : targetElement.textContent;
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text:', err);
            });
        };
    };

    setupCopyBtn('copy-text-btn', textContent);
    setupCopyBtn('copy-raw-btn', mdRaw);
    setupCopyBtn('copy-rendered-btn', mdRendered, true); // Rendered view uses innerText

    // --- Print & PDF Buttons Logic ---
    const bindPrintEvents = () => {
        document.querySelectorAll('.print-btn, .pdf-btn').forEach(btn => {
            btn.onclick = () => {
                window.print();
            };
        });
    };
    bindPrintEvents();
    // ---------------------------

    let fileRefreshTimeout = null;
    socket.on('file_changed', (data) => {
        if (data.path === filePath) {
            console.log('[DEBUG] File changed, debouncing reload...');
            if (fileRefreshTimeout) clearTimeout(fileRefreshTimeout);
            fileRefreshTimeout = setTimeout(() => {
                loadContent();
                fileRefreshTimeout = null;
            }, 1000);
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
                editBtn.classList.add('hidden');
                return;
            }

            // 텍스트 파일인 경우 Edit 버튼 표시
            editBtn.classList.remove('hidden');

            // 파일 내용 요청 (Core 사용)
            const content = await fileManager.getFileContent(filePath);
            currentRawContent = content; // 편집용으로 저장
            
            // 공장에서 적절한 뷰어로 렌더링
            viewerFactory.renderContent(content, filePath);
            
            // Show/hide swap button based on file type (markdown uses split view)
            if (filePath && filePath.toLowerCase().endsWith('.md')) {
                swapPanesBtn.classList.remove('hidden');
            } else {
                swapPanesBtn.classList.add('hidden');
                markdownContainer.classList.remove('swapped'); // Reset state
            }
            
            // 저장 후 스크롤 복구 로직
            if (savedScrollPercentage > 0) {
                setTimeout(() => {
                    const activePane = (filePath && filePath.toLowerCase().endsWith('.md')) ? mdRaw.closest('.pane') : textContent.closest('.full-view');
                    if (activePane) {
                        activePane.scrollTop = savedScrollPercentage * (activePane.scrollHeight - activePane.clientHeight);
                    }
                    savedScrollPercentage = 0; // 복구 후 초기화
                }, 100);
            }
            
        } catch (error) {
            console.error('Failed to load file:', error);
            textContent.textContent = `Error loading file content.\n\nDetails: ${error.message}`;
            textContent.style.display = 'block';
            markdownContainer.style.display = 'none';
            editBtn.classList.add('hidden');
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

    // --- Edit Modal Logic ---
    editBtn.onclick = () => {
        if (!filePath) return;
        
        // 현재 활성화된 뷰 컨테이너 찾기 및 스크롤 비율 계산
        let scrollPercentage = 0;
        const activePane = filePath.toLowerCase().endsWith('.md') 
            ? mdRaw.closest('.pane') 
            : textContent.closest('.full-view');
        
        if (activePane && activePane.scrollHeight > activePane.clientHeight) {
            scrollPercentage = activePane.scrollTop / (activePane.scrollHeight - activePane.clientHeight);
        }

        // 모달 준비
        editFilePath.textContent = `Editing: ${filePath}`;
        
        // [Safety Tokenizer] 원본 텍스트를 토큰화하여 에디터에 주입
        const tokenizedContent = tokenizeBase64(currentRawContent);
        if (editTextarea.value !== tokenizedContent) {
            editTextarea.value = tokenizedContent;
        }
        
        editModal.classList.remove('hidden');

        // Textarea 스크롤 및 커서 동기화 (DOM 렌더링 후 적용)
        setTimeout(() => {
            const valLen = editTextarea.value.length;
            // 뷰어의 스크롤 비율에 맞춰 에디터의 커서 위치를 대략적으로 계산
            const targetCharIdx = Math.floor(valLen * scrollPercentage);
            
            // 1. 커서 위치를 먼저 이동 (브라우저의 자동 스크롤 유도)
            editTextarea.setSelectionRange(targetCharIdx, targetCharIdx);
            // 2. 포커스
            editTextarea.focus();
            
            // 3. 스크롤 위치를 뷰어 비율에 맞춰 정밀하게 재보정
            if (editTextarea.scrollHeight > editTextarea.clientHeight) {
                editTextarea.scrollTop = scrollPercentage * (editTextarea.scrollHeight - editTextarea.clientHeight);
            }
        }, 100);
    };

    editCancelBtn.onclick = () => {
        editModal.classList.add('hidden');
    };

    // Textarea 내에서 Tab 키 입력 시 4칸 띄어쓰기로 동작하도록 가로채기
    editTextarea.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = this.value.substring(0, start) + "    " + this.value.substring(end);
            this.selectionStart = this.selectionEnd = start + 4;
        }
    });

    // 파일 저장
    editSaveBtn.onclick = async () => {
        const currentEditorText = editTextarea.value;
        
        // [Safety Guard] Check if the user accidentally deleted Base64 tokens or intended to delete them
        const missingTokens = validateTokens(currentEditorText);
        if (missingTokens.length > 0) {
            const isIntentional = confirm(`⚠️ Image Token Deletion Detected\n\nThe following images have been removed from the document:\n[${missingTokens.join(', ')}]\n\nDo you want to permanently delete these images from the file?\n(If you deleted them by mistake, click 'Cancel' and use Ctrl+Z to restore them.)`);
            if (!isIntentional) {
                return; // Stop saving
            }
        }

        // [Restore] Restore only the remaining tokens to their original Base64 data (deleted tokens are ignored)
        const newContent = restoreBase64(currentEditorText);

        const originalText = editSaveBtn.textContent;
        editSaveBtn.textContent = 'Saving...';
        editSaveBtn.disabled = true;

        try {
            const res = await fetch(socketClient.getApiPath('/api/files/save'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath, content: newContent })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to save');
            }

            // 저장 성공 시 스크롤 위치 저장 후 다시 로드
            if (editTextarea.scrollHeight > editTextarea.clientHeight) {
                savedScrollPercentage = editTextarea.scrollTop / (editTextarea.scrollHeight - editTextarea.clientHeight);
            }
            
            editModal.classList.add('hidden');
            loadContent(); // 뷰어 내용 갱신 (저장 성공 시 fileWatcher보다 더 확실하게 갱신됨)
            
        } catch (error) {
            console.error('Save error:', error);
            alert(`Save failed: ${error.message}`);
        } finally {
            editSaveBtn.textContent = originalText;
            editSaveBtn.disabled = false;
        }
    };
    // ------------------------

    if (filePath) {
        loadContent();
    }
});
