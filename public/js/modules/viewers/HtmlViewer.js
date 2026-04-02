import { SplitViewer } from './SplitViewer.js';

/**
 * HtmlViewer.js
 * HTML 파일 전용 렌더러 (SplitViewer 상속)
 * 좌측에는 HTML 소스코드, 우측에는 렌더링된 결과물(DOM)을 보여준다.
 */
export class HtmlViewer extends SplitViewer {
    constructor(markdownContainer, textContainer, mdRaw, mdRendered) {
        // 실제 스크롤이 발생하는 부모 .pane을 찾아서 SplitViewer에 넘김
        const leftPane = mdRaw ? mdRaw.closest('.pane') : null;
        const rightPane = mdRendered ? mdRendered.closest('.pane') : null;
        
        super(markdownContainer, leftPane, rightPane);
        
        this.textContainer = textContainer;
        this.mdRawContent = mdRaw;
        this.mdRenderedContent = mdRendered;
    }

    render(content, filePath) {
        const hljs = window.hljs;

        // --- 1. 뷰 전환 제어 ---
        this.textContainer.classList.add('hidden');
        this.container.classList.remove('hidden');

        // --- 2. 왼쪽 창: 원본 소스 삽입 (Highlight.js 지원) ---
        if (this.mdRawContent) {
            this.mdRawContent.textContent = content;
            this.mdRawContent.className = 'language-html'; // HTML 구문 강조 지정
            if (hljs) {
                hljs.highlightElement(this.mdRawContent);
            }
        }
        
        // --- 3. 오른쪽 창: iframe을 통한 샌드박스 렌더링 ---
        if (this.mdRenderedContent) {
            // 기존 내용 비우기
            this.mdRenderedContent.innerHTML = '';
            
            // 안전한 렌더링을 위해 iframe 생성 (Inception 방지 및 CSS/JS 격리)
            const iframe = document.createElement('iframe');
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            iframe.style.backgroundColor = 'white'; // HTML 렌더링은 보통 흰 바탕
            
            // 💡 [Deep Cleaning] DOMParser를 사용하여 모든 동적 요소를 완벽하게 제거
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            
            // 1. 모든 <script> 태그 삭제
            const scripts = doc.querySelectorAll('script');
            scripts.forEach(s => s.remove());
            
            // 2. 모든 요소의 인라인 이벤트 핸들러(on*) 및 javascript: 링크 삭제
            const allElements = doc.querySelectorAll('*');
            allElements.forEach(el => {
                const attrs = el.attributes;
                for (let i = attrs.length - 1; i >= 0; i--) {
                    const attrName = attrs[i].name.toLowerCase();
                    if (attrName.startsWith('on') || (attrs[i].value.toLowerCase().startsWith('javascript:'))) {
                        el.removeAttribute(attrs[i].name);
                    }
                }
            });

            // 3. 샌드박스 설정 및 정화된 내용 주입
            iframe.sandbox = 'allow-forms allow-modals'; 
            iframe.srcdoc = doc.documentElement.outerHTML;
            
            this.mdRenderedContent.appendChild(iframe);
        }

        console.log(`[VIEWER] HTML Rendered for: ${filePath}`);
    }
}
