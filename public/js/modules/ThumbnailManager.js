export class ThumbnailManager {
    constructor(options) {
        this.getApiPath = options.getApiPath;
        this.socket = options.socket;
        this.getCurrentDir = options.getCurrentDir;

        // DOM Elements
        this.recentImagesDropdown = document.getElementById('recent-images-dropdown');
        this.recentImagePreview = document.getElementById('recent-image-preview');
        this.btnInsertSelected = document.getElementById('btn-insert-selected');
        
        this.modal = document.getElementById('image-modal');
        this.modalImg = document.getElementById('modal-img');
        
        const closeElements = document.getElementsByClassName('close');
        this.closeModal = closeElements.length > 0 ? closeElements[0] : null;

        // State
        this.recentThumbnails = []; // 최대 5개

        this.init();
    }

    init() {
        this._bindEvents();
    }

    _bindEvents() {
        if (this.btnInsertSelected) {
            this.btnInsertSelected.onclick = () => {
                if (!this.recentImagesDropdown) return;
                const selectedPath = this.recentImagesDropdown.value;
                if (!selectedPath) return;
                
                if (this.socket) {
                    this.socket.emit('input', `@${selectedPath} `);
                }
            };
        }

        if (this.closeModal) {
            this.closeModal.onclick = () => {
                if (this.modal) this.modal.style.display = "none";
            };
        }

        // 전역 클릭 이벤트 (모달 외부 클릭 시 닫기)
        // app.js에도 비슷한 전역 클릭이 있으나, 각 매니저가 자기 모달만 신경쓰도록 함
        window.addEventListener('click', (event) => {
            if (this.modal && event.target === this.modal) {
                this.modal.style.display = "none";
            }
        });
    }

    async loadLatestThumbnails(dir) {
        const targetDir = dir !== undefined ? dir : (this.getCurrentDir ? this.getCurrentDir() : '');
        try {
            const query = targetDir ? `?dir=${encodeURIComponent(targetDir)}` : '';
            const response = await fetch(this.getApiPath(`/api/latest-images${query}`));
            const images = await response.json();
            this.recentThumbnails = images; // {url, filepath} 객체 배열
            this.renderThumbnails();
        } catch (err) {
            console.error('Failed to load latest thumbnails:', err);
        }
    }

    addThumbnail(info) {
        this.recentThumbnails.unshift(info);
        if (this.recentThumbnails.length > 5) {
            this.recentThumbnails.pop();
        }
        this.renderThumbnails();
    }

    renderThumbnails() {
        if (!this.recentImagesDropdown || !this.recentImagePreview) return;
        this.recentImagesDropdown.innerHTML = '';

        if (this.recentThumbnails.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '최근 업로드 이미지 없음';
            this.recentImagesDropdown.appendChild(opt);
            this.recentImagePreview.style.display = 'none';
            return;
        }

        // 배열이 이미 최신순(Recent First)으로 유지되므로 그대로 렌더링
        this.recentThumbnails.forEach((info, idx) => {
            const opt = document.createElement('option');
            opt.value = info.filepath;

            // 파일명만 추출하여 표시 (예: image.png)
            const filename = info.filepath.split('/').pop() || info.filepath;
            opt.textContent = `[${idx+1}] ${filename}`;
            
            this.recentImagesDropdown.appendChild(opt);
        });

        // 드롭다운 변경 시 옆의 썸네일 자동 갱신
        this.recentImagesDropdown.onchange = () => {
            const selectedPath = this.recentImagesDropdown.value;
            if (!selectedPath) {
                this.recentImagePreview.style.display = 'none';
                return;
            }
            const info = this.recentThumbnails.find(t => t.filepath === selectedPath);
            if (info) {
                this.recentImagePreview.src = this.getApiPath(info.url);
                this.recentImagePreview.style.display = 'inline-block';
                this.recentImagePreview.onclick = () => this.openModal(this.getApiPath(info.url));
            }
        };

        // 처음 렌더링 후 첫 번째 항목(최신 이미지) 자동 선택 및 썸네일 표시
        this.recentImagesDropdown.selectedIndex = 0;
        this.recentImagesDropdown.onchange();
    }

    openModal(url) {
        if (this.modal && this.modalImg) {
            this.modal.style.display = "flex";
            this.modalImg.src = url;
        }
    }
}