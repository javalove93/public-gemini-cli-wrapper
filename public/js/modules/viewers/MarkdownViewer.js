import { socketClient } from '../../core/SocketClient.js';
import { SplitViewer } from './SplitViewer.js';

/**
 * MarkdownViewer.js
 * 마크다운 파일(.md) 전용 렌더러 (SplitViewer 상속)
 */
export class MarkdownViewer extends SplitViewer {
    /**
     * @param {HTMLElement} markdownContainer - 전체 분할 뷰 컨테이너 (div.split-view)
     * @param {HTMLElement} textContainer - 일반 텍스트 뷰어 컨테이너 (pre)
     * @param {HTMLElement} mdRaw - 마크다운 원본 소스 컨테이너 (code#md-raw)
     * @param {HTMLElement} mdRendered - 마크다운 렌더링 결과 컨테이너 (div#md-rendered)
     */
    constructor(markdownContainer, textContainer, mdRaw, mdRendered) {
        // 실제 스크롤이 발생하는 부모 .pane을 찾아서 SplitViewer에 넘김
        const leftPane = mdRaw ? mdRaw.closest('.pane') : null;
        const rightPane = mdRendered ? mdRendered.closest('.pane') : null;
        
        // 부모 클래스의 스크롤 동기화 활성화
        super(markdownContainer, leftPane, rightPane);
        
        // 마크다운 뷰어의 특수 의존성 추가
        this.textContainer = textContainer;
        this.mdRawContent = mdRaw;
        this.mdRenderedContent = mdRendered;
    }

    render(content, filePath) {
        const marked = window.marked;
        const hljs = window.hljs;
        const mermaid = window.mermaid;

        if (!marked) {
            console.error('[VIEWER] marked.js is not loaded');
            this.container.textContent = 'Error: Markdown parser not loaded.';
            return;
        }

        // --- 1. Mermaid 초기화 (이미 되어있지 않은 경우) ---
        if (mermaid && !this.mermaidInitialized) {
            mermaid.initialize({
                startOnLoad: false,
                theme: 'dark',
                securityLevel: 'loose'
            });
            this.mermaidInitialized = true;
        }

        // --- 2. 커스텀 렌더러 설정 (상대 경로 이미지 재계산) ---
        const renderer = new marked.Renderer();
        renderer.image = function(href, title, text) {
            let actualHref, actualTitle, actualText;
            
            if (typeof href === 'object' && href !== null) {
                actualHref = href.href;
                actualTitle = href.title;
                actualText = href.text;
            } else {
                actualHref = href;
                actualTitle = title;
                actualText = text;
            }

            if (actualHref && !actualHref.startsWith('http') && !actualHref.startsWith('data:')) {
                const currentDir = filePath.substring(0, filePath.lastIndexOf('/'));
                const absoluteImagePath = currentDir ? `${currentDir}/${actualHref}` : actualHref;
                actualHref = socketClient.getApiPath(`/api/image?path=${encodeURIComponent(absoluteImagePath)}`);
            }
            
            let out = `<img src="${actualHref}" alt="${actualText}"`;
            if (actualTitle) {
                out += ` title="${actualTitle}"`;
            }
            out += '>';
            return out;
        };

        marked.setOptions({
            renderer: renderer,
            highlight: function(code, lang) {
                if (lang === 'mermaid') {
                    return code; // Mermaid 코드는 원본 그대로 반환하여 language-mermaid 클래스 유지
                }
                if (!hljs) return code;
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            langPrefix: 'hljs language-',
            breaks: true,
            gfm: true
        });

        // --- 3. 뷰 전환 제어 ---
        this.textContainer.classList.add('hidden');
        this.container.classList.remove('hidden');

        // --- 4. 콘텐츠 삽입 ---
        if (this.mdRawContent) this.mdRawContent.textContent = content;
        if (this.mdRenderedContent) this.mdRenderedContent.innerHTML = marked.parse(content);
        
        // --- 5. 후처리 (구문 강조 및 복사/렌더 버튼) ---
        if (this.mdRenderedContent) {
            this.mdRenderedContent.querySelectorAll('pre code').forEach((block) => {
                // 클래스 확인 (highlightElement 실행 전에 확인해야 함!)
                const className = block.className || '';
                const isMermaid = className.includes('language-mermaid') || className.includes('mermaid');
                
                console.log(`[VIEWER DEBUG] Block class: '${className}', isMermaid: ${isMermaid}`);

                // 구문 강조 적용 (Mermaid가 아닐 때만)
                if (hljs && !isMermaid) {
                    try {
                        hljs.highlightElement(block);
                    } catch(err) {
                        console.warn('[VIEWER DEBUG] highlightElement error:', err);
                    }
                }
                
                const pre = block.parentNode;
                if (pre && pre.tagName === 'PRE') {
                    pre.style.position = 'relative';
                    
                    // 기존 Copy 버튼
                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'copy-btn';
                    copyBtn.textContent = 'Copy';
                    copyBtn.onclick = () => {
                        navigator.clipboard.writeText(block.textContent).then(() => {
                            copyBtn.textContent = 'Copied!';
                            setTimeout(() => copyBtn.textContent = 'Copy', 2000);
                        });
                    };
                    pre.appendChild(copyBtn);
                    
                    // Mermaid 블록인 경우 Render 버튼 추가
                    if (isMermaid) {
                        const renderBtn = document.createElement('button');
                        renderBtn.className = 'copy-btn'; // 클래스 이름은 같게하여 스타일 공유
                        renderBtn.style.right = '60px'; // Copy 버튼 옆에 위치
                        renderBtn.textContent = 'Render';
                        renderBtn.onclick = () => {
                            // 모달 띄우기 로직 (외부에서 구현)
                            if (window.showMermaidModal) {
                                window.showMermaidModal(block.textContent);
                            }
                        };
                        pre.appendChild(renderBtn);
                    }
                }
            });
        }
    }
}
