export class SettingsManager {
    constructor(options) {
        this.getUiSetting = options.getUiSetting;
        this.saveUiSetting = options.saveUiSetting;
        this.formatShortcut = options.formatShortcut; // app.js에 있는 헬퍼 함수를 주입받거나 내부 구현

        // DOM 캐싱
        this.optCmdC = document.getElementById('opt-cmd-c');
        this.optCmdY = document.getElementById('opt-cmd-y');
        this.optCmdO = document.getElementById('opt-cmd-o');
        
        this.optMapHome = document.getElementById('opt-map-home');
        this.optMapEnd = document.getElementById('opt-map-end');
        this.optMapPrefix = document.getElementById('opt-map-prefix');
        this.optMapPaste = document.getElementById('opt-map-paste');
        this.optMapStt = document.getElementById('opt-map-stt');
        this.optMapSttCancel = document.getElementById('opt-map-stt-cancel');
        this.optKeepTmux = document.getElementById('opt-keep-tmux');
        
        // 버튼 맵핑 설정
        this.buttonMappings = [
            { key: 'custom', domId: 'record-custom-shortcut', settingKey: 'GCW_UI_CUSTOM_SHORTCUT' },
            { key: 'custom_2', domId: 'record-custom-shortcut-2', settingKey: 'GCW_UI_CUSTOM_SHORTCUT_2' },
            { key: 'customO', domId: 'record-o-shortcut', settingKey: 'GCW_UI_CUSTOM_O_SHORTCUT' },
            { key: 'customO_2', domId: 'record-o-shortcut-2', settingKey: 'GCW_UI_CUSTOM_O_SHORTCUT_2' },
            { key: 'home', domId: 'record-home-shortcut', settingKey: 'GCW_UI_HOME_SHORTCUT' },
            { key: 'home_2', domId: 'record-home-shortcut-2', settingKey: 'GCW_UI_HOME_SHORTCUT_2' },
            { key: 'end', domId: 'record-end-shortcut', settingKey: 'GCW_UI_END_SHORTCUT' },
            { key: 'end_2', domId: 'record-end-shortcut-2', settingKey: 'GCW_UI_END_SHORTCUT_2' },
            { key: 'prefix', domId: 'record-prefix-shortcut', settingKey: 'GCW_UI_PREFIX_SHORTCUT' },
            { key: 'prefix_2', domId: 'record-prefix-shortcut-2', settingKey: 'GCW_UI_PREFIX_SHORTCUT_2' },
            { key: 'paste', domId: 'record-paste-shortcut', settingKey: 'GCW_UI_PASTE_SHORTCUT' },
            { key: 'paste_2', domId: 'record-paste-shortcut-2', settingKey: 'GCW_UI_PASTE_SHORTCUT_2' },
            { key: 'stt', domId: 'record-stt-shortcut', settingKey: 'GCW_UI_STT_SHORTCUT' },
            { key: 'stt_2', domId: 'record-stt-shortcut-2', settingKey: 'GCW_UI_STT_SHORTCUT_2' },
            { key: 'sttCancel', domId: 'record-stt-cancel-shortcut', settingKey: 'GCW_UI_STT_CANCEL_SHORTCUT' },
            { key: 'sttCancel_2', domId: 'record-stt-cancel-shortcut-2', settingKey: 'GCW_UI_STT_CANCEL_SHORTCUT_2' }
        ];

        // 캐싱 및 기본 상태 초기화
        this.buttons = {};
        this.shortcuts = {};
        
        const defaultShortcuts = {
            custom: { metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, key: 'y' },
            customO: { metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, key: 'o' },
            home: { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, key: 'home' },
            end: { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, key: 'end' },
            prefix: { metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, key: 'b' },
            paste: { metaKey: false, ctrlKey: true, altKey: false, shiftKey: true, key: 'v' },
            stt: { metaKey: false, ctrlKey: false, altKey: true, shiftKey: false, key: 'z' },
            sttCancel: { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, key: 'escape' }
        };

        this.buttonMappings.forEach(mapping => {
            this.buttons[mapping.key] = document.getElementById(mapping.domId);
            this.shortcuts[mapping.key] = defaultShortcuts[mapping.key] || null; // 기본값 할당, 없으면 null(_2 계열)
        });

        this.recordingTarget = null; // 현재 녹화 중인 단축키 타겟 (문자열 key)

        this.init();
    }

    init() {
        this.loadSettings();
        this._bindCheckboxEvents();
        this._bindRecordButtons();
        this._bindKeydownEvent();
    }

    _formatShortcut(sc) {
        if (!sc) return 'Unassigned';
        const parts = [];
        if (sc.metaKey) parts.push(navigator.platform.includes('Mac') ? 'Cmd' : 'Win');
        if (sc.ctrlKey) parts.push('Ctrl');
        if (sc.altKey) parts.push('Alt');
        if (sc.shiftKey) parts.push('Shift');
        parts.push(sc.key.toUpperCase());
        return parts.join('+');
    }

    loadSettings() {
        // 체크박스 상태 로드
        if (this.optCmdC) this.optCmdC.checked = (this.getUiSetting('GCW_UI_OPT_CMDC_TO_CTRLC') !== 'false');
        if (this.optCmdY) this.optCmdY.checked = (this.getUiSetting('GCW_UI_OPT_CMDY_TO_CTRLY') !== 'false');
        if (this.optCmdO) this.optCmdO.checked = (this.getUiSetting('GCW_UI_OPT_CMDO_TO_CTRLO') !== 'false');
        
        if (this.optMapHome) this.optMapHome.checked = (this.getUiSetting('GCW_UI_OPT_MAP_HOME') !== 'false');
        if (this.optMapEnd) this.optMapEnd.checked = (this.getUiSetting('GCW_UI_OPT_MAP_END') !== 'false');
        if (this.optMapPrefix) this.optMapPrefix.checked = (this.getUiSetting('GCW_UI_OPT_MAP_PREFIX') !== 'false');
        if (this.optMapPaste) this.optMapPaste.checked = (this.getUiSetting('GCW_UI_OPT_MAP_PASTE') !== 'false');
        if (this.optMapStt) this.optMapStt.checked = (this.getUiSetting('GCW_UI_OPT_MAP_STT') !== 'false');
        if (this.optMapSttCancel) this.optMapSttCancel.checked = (this.getUiSetting('GCW_UI_OPT_MAP_STT_CANCEL') !== 'false');
        if (this.optKeepTmux) this.optKeepTmux.checked = (this.getUiSetting('GCW_UI_OPT_KEEP_TMUX') === 'true');

        // 커스텀 단축키 로드
        this.buttonMappings.forEach(mapping => {
            const saved = this.getUiSetting(mapping.settingKey);
            if (saved) {
                try { this.shortcuts[mapping.key] = JSON.parse(saved); } catch(e) {}
            }
            if (this.buttons[mapping.key]) {
                this.buttons[mapping.key].textContent = this.shortcuts[mapping.key] ? this._formatShortcut(this.shortcuts[mapping.key]) : 'Unassigned';
            }
        });
    }

    _bindCheckboxEvents() {
        const bindOpt = (elem, key) => {
            if (elem) elem.onchange = () => this.saveUiSetting(key, elem.checked);
        };

        bindOpt(this.optCmdC, 'GCW_UI_OPT_CMDC_TO_CTRLC');
        bindOpt(this.optCmdY, 'GCW_UI_OPT_CMDY_TO_CTRLY');
        bindOpt(this.optCmdO, 'GCW_UI_OPT_CMDO_TO_CTRLO');
        bindOpt(this.optMapHome, 'GCW_UI_OPT_MAP_HOME');
        bindOpt(this.optMapEnd, 'GCW_UI_OPT_MAP_END');
        bindOpt(this.optMapPrefix, 'GCW_UI_OPT_MAP_PREFIX');
        bindOpt(this.optMapPaste, 'GCW_UI_OPT_MAP_PASTE');
        bindOpt(this.optMapStt, 'GCW_UI_OPT_MAP_STT');
        bindOpt(this.optMapSttCancel, 'GCW_UI_OPT_MAP_STT_CANCEL');
        bindOpt(this.optKeepTmux, 'GCW_UI_OPT_KEEP_TMUX');
    }

    _handleRecordClick(targetKey) {
        const btn = this.buttons[targetKey];
        if (!btn) return;

        if (this.recordingTarget === targetKey) {
            // 녹화 취소
            this.recordingTarget = null;
            btn.classList.remove('active');
            btn.textContent = this.shortcuts[targetKey] ? this._formatShortcut(this.shortcuts[targetKey]) : 'Unassigned';
        } else {
            // 다른 버튼들 초기화
            this.buttonMappings.forEach(mapping => {
                const b = this.buttons[mapping.key];
                if (b) {
                    b.classList.remove('active');
                    b.textContent = this.shortcuts[mapping.key] ? this._formatShortcut(this.shortcuts[mapping.key]) : 'Unassigned';
                }
            });

            // 대상 버튼 활성화
            this.recordingTarget = targetKey;
            btn.classList.add('active');
            btn.textContent = 'Press any key...';
        }
    }

    _bindRecordButtons() {
        this.buttonMappings.forEach(mapping => {
            if (this.buttons[mapping.key]) {
                this.buttons[mapping.key].onclick = () => this._handleRecordClick(mapping.key);
            }
        });
    }

    _bindKeydownEvent() {
        window.addEventListener('keydown', (e) => {
            if (!this.recordingTarget) return;
            e.preventDefault();

            if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
                return;
            }

            const newShortcut = {
                metaKey: e.metaKey,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                shiftKey: e.shiftKey,
                key: e.key.toLowerCase()
            };

            const mapping = this.buttonMappings.find(m => m.key === this.recordingTarget);
            if (mapping) {
                this.shortcuts[this.recordingTarget] = newShortcut;
                if (this.buttons[mapping.key]) {
                    this.buttons[mapping.key].textContent = this._formatShortcut(newShortcut);
                    this.buttons[mapping.key].classList.remove('active');
                }
                this.saveUiSetting(mapping.settingKey, JSON.stringify(newShortcut));
            }

            this.recordingTarget = null;
        });
    }

    // 외부 모듈(TerminalManager 등)에 단축키 상태를 전달하기 위한 getter
    getShortcuts() {
        return this.shortcuts;
    }
    
    // 외부 모듈(TerminalManager 등)에 체크박스 상태를 전달하기 위한 getter
    getCheckboxOptions() {
        return {
            optCmdC: this.optCmdC,
            optCmdY: this.optCmdY,
            optCmdO: this.optCmdO,
            optMapStt: this.optMapStt,
            optMapSttCancel: this.optMapSttCancel
        };
    }
}