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
        this.optKeepTmux = document.getElementById('opt-keep-tmux');
        
        this.btnRecordShortcut = document.getElementById('record-custom-shortcut');
        this.btnRecordOShortcut = document.getElementById('record-o-shortcut');
        this.btnRecordHomeShortcut = document.getElementById('record-home-shortcut');
        this.btnRecordEndShortcut = document.getElementById('record-end-shortcut');
        this.btnRecordPrefixShortcut = document.getElementById('record-prefix-shortcut');
        this.btnRecordPasteShortcut = document.getElementById('record-paste-shortcut');
        this.btnRecordSttShortcut = document.getElementById('record-stt-shortcut');
        this.btnRecordSttShortcut2 = document.getElementById('record-stt-shortcut-2');

        // 상태 변수 (단축키 기본값)
        this.shortcuts = {
            custom: { metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, key: 'y' },
            customO: { metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, key: 'o' },
            home: { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, key: 'home' },
            end: { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, key: 'end' },
            prefix: { metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, key: 'b' },
            paste: { metaKey: false, ctrlKey: true, altKey: false, shiftKey: true, key: 'v' },
            stt: { metaKey: false, ctrlKey: false, altKey: true, shiftKey: false, key: 'z' },
            stt2: null // Mac 한영 대응 등
        };

        this.recordingTarget = null; // 현재 녹화 중인 단축키 타겟

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
        if (this.optKeepTmux) this.optKeepTmux.checked = (this.getUiSetting('GCW_UI_OPT_KEEP_TMUX') === 'true');

        // 커스텀 단축키 로드
        const loadShortcut = (key, settingName, btnElement) => {
            const saved = this.getUiSetting(settingName);
            if (saved) {
                try { this.shortcuts[key] = JSON.parse(saved); } catch(e) {}
            }
            if (btnElement) {
                btnElement.textContent = this.shortcuts[key] ? this._formatShortcut(this.shortcuts[key]) : 'Unassigned';
            }
        };

        loadShortcut('custom', 'GCW_UI_CUSTOM_SHORTCUT', this.btnRecordShortcut);
        loadShortcut('customO', 'GCW_UI_CUSTOM_O_SHORTCUT', this.btnRecordOShortcut);
        loadShortcut('home', 'GCW_UI_HOME_SHORTCUT', this.btnRecordHomeShortcut);
        loadShortcut('end', 'GCW_UI_END_SHORTCUT', this.btnRecordEndShortcut);
        loadShortcut('prefix', 'GCW_UI_PREFIX_SHORTCUT', this.btnRecordPrefixShortcut);
        loadShortcut('paste', 'GCW_UI_PASTE_SHORTCUT', this.btnRecordPasteShortcut);
        loadShortcut('stt', 'GCW_UI_STT_SHORTCUT', this.btnRecordSttShortcut);
        loadShortcut('stt2', 'GCW_UI_STT_SHORTCUT_2', this.btnRecordSttShortcut2);
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
        bindOpt(this.optKeepTmux, 'GCW_UI_OPT_KEEP_TMUX');
    }

    _handleRecordClick(btn, targetName) {
        if (this.recordingTarget === targetName) {
            this.recordingTarget = null;
            btn.classList.remove('active');
            btn.textContent = this.shortcuts[targetName] ? this._formatShortcut(this.shortcuts[targetName]) : 'Unassigned';
        } else {
            // 다른 버튼 취소 처리
            const buttons = [
                this.btnRecordShortcut, this.btnRecordOShortcut, this.btnRecordHomeShortcut, 
                this.btnRecordEndShortcut, this.btnRecordPrefixShortcut, this.btnRecordPasteShortcut, 
                this.btnRecordSttShortcut, this.btnRecordSttShortcut2
            ];
            const keys = ['custom', 'customO', 'home', 'end', 'prefix', 'paste', 'stt', 'stt2'];
            
            buttons.forEach((b, idx) => {
                if (b) {
                    b.classList.remove('active');
                    b.textContent = this.shortcuts[keys[idx]] ? this._formatShortcut(this.shortcuts[keys[idx]]) : 'Unassigned';
                }
            });

            this.recordingTarget = targetName;
            btn.classList.add('active');
            btn.textContent = 'Press any key...';
        }
    }

    _bindRecordButtons() {
        if (this.btnRecordShortcut) this.btnRecordShortcut.onclick = () => this._handleRecordClick(this.btnRecordShortcut, 'custom');
        if (this.btnRecordOShortcut) this.btnRecordOShortcut.onclick = () => this._handleRecordClick(this.btnRecordOShortcut, 'customO');
        if (this.btnRecordHomeShortcut) this.btnRecordHomeShortcut.onclick = () => this._handleRecordClick(this.btnRecordHomeShortcut, 'home');
        if (this.btnRecordEndShortcut) this.btnRecordEndShortcut.onclick = () => this._handleRecordClick(this.btnRecordEndShortcut, 'end');
        if (this.btnRecordPrefixShortcut) this.btnRecordPrefixShortcut.onclick = () => this._handleRecordClick(this.btnRecordPrefixShortcut, 'prefix');
        if (this.btnRecordPasteShortcut) this.btnRecordPasteShortcut.onclick = () => this._handleRecordClick(this.btnRecordPasteShortcut, 'paste');
        if (this.btnRecordSttShortcut) this.btnRecordSttShortcut.onclick = () => this._handleRecordClick(this.btnRecordSttShortcut, 'stt');
        if (this.btnRecordSttShortcut2) this.btnRecordSttShortcut2.onclick = () => this._handleRecordClick(this.btnRecordSttShortcut2, 'stt2');
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

            const targetMap = {
                'custom': { btn: this.btnRecordShortcut, setting: 'GCW_UI_CUSTOM_SHORTCUT' },
                'customO': { btn: this.btnRecordOShortcut, setting: 'GCW_UI_CUSTOM_O_SHORTCUT' },
                'home': { btn: this.btnRecordHomeShortcut, setting: 'GCW_UI_HOME_SHORTCUT' },
                'end': { btn: this.btnRecordEndShortcut, setting: 'GCW_UI_END_SHORTCUT' },
                'prefix': { btn: this.btnRecordPrefixShortcut, setting: 'GCW_UI_PREFIX_SHORTCUT' },
                'paste': { btn: this.btnRecordPasteShortcut, setting: 'GCW_UI_PASTE_SHORTCUT' },
                'stt': { btn: this.btnRecordSttShortcut, setting: 'GCW_UI_STT_SHORTCUT' },
                'stt2': { btn: this.btnRecordSttShortcut2, setting: 'GCW_UI_STT_SHORTCUT_2' }
            };

            const map = targetMap[this.recordingTarget];
            if (map) {
                this.shortcuts[this.recordingTarget] = newShortcut;
                if (map.btn) {
                    map.btn.textContent = this._formatShortcut(newShortcut);
                    map.btn.classList.remove('active');
                }
                this.saveUiSetting(map.setting, JSON.stringify(newShortcut));
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
            optMapStt: this.optMapStt
        };
    }
}