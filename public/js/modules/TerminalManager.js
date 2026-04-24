/**
 * TerminalManager.js
 * Xterm.js 인스턴스 초기화, 테마/폰트 제어, 터미널 리사이징 및 클립보드 연동 담당
 */
export class TerminalManager {
    constructor(options = {}) {
        this.term = null;
        this.fitAddon = null;
        this.socket = options.socket;
        this.getUiSetting = options.getUiSetting;
        this.saveUiSetting = options.saveUiSetting;
        
        // UI Elements
        this.selectFont = document.getElementById('select-font');
        this.btnFontPlus = document.getElementById('btn-font-plus');
        this.btnFontMinus = document.getElementById('btn-font-minus');
        this.optTheme = document.getElementById('opt-theme');
        this.optCmdC = document.getElementById('opt-cmd-c');
        this.optCmdY = document.getElementById('opt-cmd-y');
        this.optCmdO = document.getElementById('opt-cmd-o');
        this.optMapHome = document.getElementById('opt-map-home');
        this.optMapEnd = document.getElementById('opt-map-end');
        this.optMapPrefix = document.getElementById('opt-map-prefix');
        this.optMapPaste = document.getElementById('opt-map-paste');
        this.clipboardHistoryList = document.getElementById('clipboard-history-list');

        // State
        this.clipboardHistory = [];
        this.customShortcut = options.customShortcut;
        this.customOShortcut = options.customOShortcut;
        this.customHomeShortcut = options.customHomeShortcut;
        this.customEndShortcut = options.customEndShortcut;
        this.customPrefixShortcut = options.customPrefixShortcut;
        this.customPasteShortcut = options.customPasteShortcut;
        
        this.lightThemeColors = options.lightThemeColors;
        this.darkThemeColors = options.darkThemeColors;

        this.onPwdSyncTrigger = options.onPwdSyncTrigger || (() => {});
    }

    init() {
        let savedFontFamily = this.getUiSetting('GCW_UI_TERMINAL_FONT_FAMILY');
        let savedFontSize = parseInt(this.getUiSetting('GCW_UI_TERMINAL_FONT_SIZE')) || 17;
        
        console.log('[TerminalManager] Initializing terminal with font:', savedFontFamily, 'size:', savedFontSize);

        if (savedFontFamily && this.selectFont) {
            this.selectFont.value = savedFontFamily;
            if (!this.selectFont.value) {
                this.selectFont.value = this.selectFont.options[0].value;
            }
        }
        
        const selectedFont = savedFontFamily || (this.selectFont ? this.selectFont.value : 'monospace');

        this.term = new Terminal({
            cursorBlink: true,
            fontFamily: selectedFont,
            fontSize: savedFontSize,
            theme: this.optTheme.value === 'light' ? this.lightThemeColors : this.darkThemeColors,
            allowProposedApi: true,
            macOptionClickForcesSelection: true
        });

        this._setupEvents();
        this._setupAddons();
        this.term.open(document.getElementById('terminal'));
        this.fit();

        return this.term;
    }

    _setupEvents() {
        // 폰트 변경
        if (this.selectFont) {
            this.selectFont.onchange = () => {
                const newFont = this.selectFont.value;
                this.term.options.fontFamily = newFont;
                this.saveUiSetting('GCW_UI_TERMINAL_FONT_FAMILY', newFont);
                setTimeout(() => this.fit(), 50);
            };
        }

        // 폰트 크기 증감
        if (this.btnFontPlus) {
            this.btnFontPlus.onclick = () => {
                const newSize = this.term.options.fontSize + 1;
                this.term.options.fontSize = newSize;
                this.saveUiSetting('GCW_UI_TERMINAL_FONT_SIZE', newSize);
                setTimeout(() => this.fit(), 50);
            };
        }

        if (this.btnFontMinus) {
            this.btnFontMinus.onclick = () => {
                const newSize = Math.max(8, this.term.options.fontSize - 1);
                this.term.options.fontSize = newSize;
                this.saveUiSetting('GCW_UI_TERMINAL_FONT_SIZE', newSize);
                setTimeout(() => this.fit(), 50);
            };
        }

        // 키 이벤트 핸들러
        this.term.attachCustomKeyEventHandler((e) => {
            if (e.key === 'Enter' && !e.shiftKey && e.type === 'keydown') {
                this.onPwdSyncTrigger();
            }

            if (this.optCmdC.checked && e.metaKey && (e.key === 'c' || e.key === 'C')) {
                if (e.type === 'keydown') this.socket.emit('input', '\x03');
                return false;
            }

            // Custom Shortcuts mapping
            if (this._handleCustomShortcut(e, this.optCmdY, this.customShortcut, '\x19')) return false;
            if (this._handleCustomShortcut(e, this.optCmdO, this.customOShortcut, '\x0f')) return false;
            if (this._handleCustomShortcut(e, this.optMapHome, this.customHomeShortcut, '\x1b[H')) return false;
            if (this._handleCustomShortcut(e, this.optMapEnd, this.customEndShortcut, '\x1b[F')) return false;
            if (this._handleCustomShortcut(e, this.optMapPrefix, this.customPrefixShortcut, '\x02')) return false;

            // Paste shortcut (Special handling)
            if (this.optMapPaste && this.optMapPaste.checked && this._matchShortcut(e, this.customPasteShortcut)) {
                if (e.type === 'keydown') {
                    window.lastCustomPasteTime = Date.now();
                    this._pasteFromClipboard();
                }
                return false;
            }

            if (e.key === 'Enter' && e.shiftKey) {
                if (e.type === 'keydown') this.socket.emit('input', '\x0a');
                return false;
            }
            return true;
        });

        // 데이터 송신
        this.term.onData(data => {
            this.socket.emit('input', data);
        });

        // OSC 52 및 선택 영역 복사
        this._setupClipboardHandlers();
    }

    _matchShortcut(e, shortcut) {
        if (!shortcut) return false;
        return e.metaKey === shortcut.metaKey &&
               e.ctrlKey === shortcut.ctrlKey &&
               e.altKey === shortcut.altKey &&
               e.shiftKey === shortcut.shiftKey &&
               e.key.toLowerCase() === shortcut.key;
    }

    _handleCustomShortcut(e, option, shortcut, sequence) {
        if (option && option.checked && this._matchShortcut(e, shortcut)) {
            if (e.type === 'keydown') this.socket.emit('input', sequence);
            return true;
        }
        return false;
    }

    async _pasteFromClipboard() {
        if (navigator.clipboard && navigator.clipboard.readText) {
            try {
                const text = await navigator.clipboard.readText();
                if (text) this.socket.emit('input', text);
            } catch (err) {
                console.error('Failed to read clipboard: ', err);
            }
        }
    }

    _setupAddons() {
        this.fitAddon = new FitAddon.FitAddon();
        this.term.loadAddon(this.fitAddon);

        const webLinksAddon = new WebLinksAddon.WebLinksAddon((e, uri) => {
            if (e.ctrlKey || e.metaKey) window.open(uri, '_blank');
        });
        this.term.loadAddon(webLinksAddon);
    }

    _setupClipboardHandlers() {
        // OSC 52
        this.term.parser.registerOscHandler(52, (data) => {
            try {
                const parts = data.split(';');
                if (parts.length >= 2) {
                    const b64Data = parts[1];
                    const binString = atob(b64Data);
                    const bytes = new Uint8Array(binString.length);
                    for (let i = 0; i < binString.length; i++) bytes[i] = binString.charCodeAt(i);
                    const text = new TextDecoder('utf-8').decode(bytes);
                    if (text && text.length > 2) this.copyToClipboard(text);
                    return true;
                }
            } catch (e) { console.error('OSC 52 error:', e); }
            return false;
        });

        // Selection Change
        this.term.onSelectionChange(() => {
            const text = this.term.getSelection();
            if (text && text.length > 2) this.copyToClipboard(text);
        });
    }

    copyToClipboard(text) {
        if (!text || text.trim() === '') return;
        this.addToClipboardHistory(text);

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).catch(err => this._fallbackCopy(text));
        } else {
            this._fallbackCopy(text);
        }
    }

    _fallbackCopy(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    }

    addToClipboardHistory(text) {
        const index = this.clipboardHistory.indexOf(text);
        if (index !== -1) this.clipboardHistory.splice(index, 1);
        this.clipboardHistory.unshift(text);
        if (this.clipboardHistory.length > 5) this.clipboardHistory.pop();
        this.renderClipboardHistory();
    }

    renderClipboardHistory() {
        if (!this.clipboardHistoryList) return;
        this.clipboardHistoryList.innerHTML = '';
        this.clipboardHistory.forEach(text => {
            const div = document.createElement('div');
            div.className = 'clipboard-item';
            div.textContent = text.trim();
            div.title = text;
            div.onclick = () => {
                this.copyToClipboard(text);
                div.style.backgroundColor = '#007acc';
                setTimeout(() => div.style.backgroundColor = '', 200);
            };
            this.clipboardHistoryList.appendChild(div);
        });
    }

    fit() {
        if (this.fitAddon && this.term) {
            this.fitAddon.fit();
            const safeCols = Math.max(20, this.term.cols - 1);
            const safeRows = Math.max(10, this.term.rows - 1);
            this.term.resize(safeCols, safeRows);
            this.socket.emit('resize', { cols: safeCols, rows: safeRows });
        }
    }

    updateTheme(isLight) {
        if (this.term) {
            this.term.options.theme = isLight ? this.lightThemeColors : this.darkThemeColors;
        }
    }
}
