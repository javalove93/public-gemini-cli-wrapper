/**
 * SplitViewer.js
 * 좌우 분할 패널을 가지고 동기식 스크롤(Sync Scroll)을 지원하는 뷰어의 공통 부모 클래스
 */
export class SplitViewer {
    constructor(container, leftPane, rightPane) {
        this.container = container;
        this.leftPane = leftPane;
        this.rightPane = rightPane;
        
        // 인스턴스 생성 시 스크롤 동기화 이벤트 자동 바인딩
        this._initSyncScroll();
    }

    _initSyncScroll() {
        if (!this.leftPane || !this.rightPane) return;

        let isSyncingLeft = false;
        let isSyncingRight = false;

        this.leftPane.onscroll = () => {
            if (isSyncingLeft) {
                isSyncingLeft = false;
                return;
            }
            isSyncingRight = true;
            const percentage = this.leftPane.scrollTop / (this.leftPane.scrollHeight - this.leftPane.clientHeight);
            this.rightPane.scrollTop = percentage * (this.rightPane.scrollHeight - this.rightPane.clientHeight);
        };

        this.rightPane.onscroll = () => {
            if (isSyncingRight) {
                isSyncingRight = false;
                return;
            }
            isSyncingLeft = true;
            const percentage = this.rightPane.scrollTop / (this.rightPane.scrollHeight - this.rightPane.clientHeight);
            this.leftPane.scrollTop = percentage * (this.leftPane.scrollHeight - this.leftPane.clientHeight);
        };
    }

    /**
     * 자식 클래스에서 반드시 구현해야 하는 렌더링 메서드
     * @param {string} content - 파일의 원본 텍스트 내용
     * @param {string} filePath - 파일의 절대/상대 경로
     */
    render(content, filePath) {
        throw new Error("render() method must be implemented by subclass");
    }
}
