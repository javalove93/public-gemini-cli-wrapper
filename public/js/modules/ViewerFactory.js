import { socketClient } from '../core/SocketClient.js';

/**
 * Fallback: 일반 텍스트 뷰어
 */
export class PlainTextViewer {
    constructor(markdownContainer, textContainer, textContent) {
        this.markdownContainer = markdownContainer;
        this.textContainer = textContainer;
        this.textContent = textContent;
    }

    render(content, filePath) {
        this.markdownContainer.classList.add('hidden'); 
        this.textContainer.classList.remove('hidden'); 
        if (this.textContent) {
            // HTML Tagging을 위해 innerHTML 사용 (wrapBase64 내부에서 escape 처리됨)
            if (window.wrapBase64) {
                this.textContent.innerHTML = window.wrapBase64(content);
            } else {
                this.textContent.textContent = content;
            }
        }
    }
}

/**
 * ViewerFactory
 * 확장자에 따라 적절한 뷰어 모듈을 Dynamic Import로 로드하여 렌더링을 위임함
 */
export class ViewerFactory {
    constructor(markdownContainer, textContainer, textContent, mdRaw, mdRendered) {
        this.markdownContainer = markdownContainer;
        this.textContainer = textContainer;
        this.textContent = textContent;
        this.mdRaw = mdRaw;
        this.mdRendered = mdRendered;
        
        // 런타임에 생성된 인스턴스 캐싱용
        this._viewers = {
            plain: new PlainTextViewer(markdownContainer, textContainer, textContent)
        };
    }

    static isBinaryOrNative(filePath) {
        const lowerPath = filePath.toLowerCase();
        const nativeExts = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.mp4', '.mp3'];
        const binaryExts = ['.exe', '.bin', '.zip', '.tar.gz', '.db', '.sqlite', '.docx', '.xlsx'];

        if (nativeExts.some(ext => lowerPath.endsWith(ext))) return { type: 'native', action: 'redirect' };
        if (binaryExts.some(ext => lowerPath.endsWith(ext))) return { type: 'binary', action: 'download' };
        return { type: 'text', action: 'render' };
    }

    /**
     * 적절한 뷰어를 선택하여 동적으로 로드 후 렌더링 (Dynamic Import 적용)
     */
    async renderContent(content, filePath) {
        const lowerPath = filePath.toLowerCase();
        
        try {
            if (lowerPath.endsWith('.md')) {
                if (!this._viewers.markdown) {
                    console.log('[VIEWER] Dynamically importing MarkdownViewer...');
                    const { MarkdownViewer } = await import(`./viewers/MarkdownViewer.js?v=${Date.now()}`);
                    this._viewers.markdown = new MarkdownViewer(this.markdownContainer, this.textContainer, this.mdRaw, this.mdRendered);
                }
                this._viewers.markdown.render(content, filePath);
                
            } else if (lowerPath.endsWith('.html') || lowerPath.endsWith('.htm')) {
                if (!this._viewers.html) {
                    console.log('[VIEWER] Dynamically importing HtmlViewer...');
                    const { HtmlViewer } = await import('./viewers/HtmlViewer.js');
                    this._viewers.html = new HtmlViewer(this.markdownContainer, this.textContainer, this.mdRaw, this.mdRendered);
                }
                this._viewers.html.render(content, filePath);
                
            } else {
                this._viewers.plain.render(content, filePath);
            }
        } catch (err) {
            console.error('[VIEWER] Failed to load viewer module:', err);
            // 모듈 로드 실패 시(예: 문법 에러) Fallback으로 일반 텍스트 뷰어 실행
            console.warn('[VIEWER] Falling back to PlainTextViewer due to module error.');
            this._viewers.plain.render(`[Error loading viewer for ${filePath}]\n\nDetails: ${err.message}\n\n--- Content ---\n${content}`, filePath);
        }
    }
}
