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
        this.clipboardHistoryList = document.getElementById('clipboard-history'); // Fix ID mismatch

        // State
        this.clipboardHistory = [];
        this.shortcuts = options.shortcuts || {};
        this.optMapStt = options.optMapStt;
        this.optMapSttCancel = options.optMapSttCancel;
        this.sttManager = options.sttManager;
        this.onPwdSyncTrigger = options.onPwdSyncTrigger || (() => {});
        this.onPasteFromClipboard = options.onPasteFromClipboard; // 추가: 공용 붙여넣기 콜백
        
        // 내장 테마 색상 정의
        this.lightThemeColors = {
            background: '#f5f5f5',
            foreground: '#333333',
            cursor: '#333333',
            black: '#000000',
            red: '#cd3131',
            green: '#00bc00',
            yellow: '#949800',
            blue: '#0451a5',
            magenta: '#bc05bc',
            cyan: '#0598bc',
            white: '#555555',
            brightBlack: '#666666',
            brightRed: '#cd3131',
            brightGreen: '#14ce14',
            brightYellow: '#b5ba00',
            brightBlue: '#0451a5',
            brightMagenta: '#bc05bc',
            brightCyan: '#0598bc',
            brightWhite: '#a5a5a5'
        };

        this.darkThemeColors = {
            background: '#000000',
            foreground: '#ffffff',
            cursor: '#ffffff',
            black: '#000000',
            red: '#f14c4c',
            green: '#23d18b',
            yellow: '#f5f543',
            blue: '#3b8eea',
            magenta: '#d670d6',
            cyan: '#29b8db',
            white: '#ffffff',
            brightBlack: '#a5a5a5',
            brightRed: '#f14c4c',
            brightGreen: '#23d18b',
            brightYellow: '#f5f543',
            brightBlue: '#3b8eea',
            brightMagenta: '#d670d6',
            brightCyan: '#29b8db',
            brightWhite: '#ffffff'
        };

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
            if (e.type === 'keydown') {
                // console.log('[DEBUG] Key pressed in terminal:', e.key, e.code, 'STT Recording:', this.sttManager?.isRecording);
            }

            // STT Cancel (Dual Shortcut) - Two-step internal confirmation
            if (this.optMapSttCancel && this.optMapSttCancel.checked && this.sttManager && this.sttManager.isRecording &&
                (this._matchShortcut(e, this.shortcuts['sttCancel']) || this._matchShortcut(e, this.shortcuts['sttCancel_2']))) {
                if (e.type === 'keydown') {
                    this.sttManager.cancel();
                }
                return false;
            }

            // STT 진행 중 Enter 키 입력 시 즉시 종료 (최종 인식된 텍스트 전송 트리거)
            if (e.key === 'Enter' && !e.shiftKey && this.sttManager && this.sttManager.isRecording) {
                if (e.type === 'keydown') {
                    console.log('[STT] Finalizing by Enter key in Terminal');
                    this.sttManager.stop();
                }
                // 기존 터미널 Enter 로직을 타지 않게 막음
                return false;
            }

            // STT Punctuation Finalizer (마침표, 쉼표, 물음표 입력 시 어펜드 하지 않고 즉시 STT 종료 후 소켓으로 딜레이 전송)
            if (this.sttManager && this.sttManager.isRecording) {
                // Ctrl, Alt, Meta 조합은 제외하되, '?' 입력을 위해 Shift는 허용
                if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                    const isPunctuation = e.key === '.' || e.key === ',' || e.key === '?';
                    if (isPunctuation) {
                        if (e.type === 'keydown') {
                            console.log('[STT] Stopping STT and scheduling punctuation:', e.key);
                            this.sttManager.stop(); // 1. STT 텍스트 완성 및 전송 트리거
                            
                            // 2. STT 텍스트가 서버에 완전히 붙여넣기 될 때까지 약간 대기한 후, 구두점만 따로 소켓으로 전송
                            setTimeout(() => {
                                console.log('[STT] Emitting delayed punctuation:', e.key);
                                this.socket.emit('input', e.key);
                            }, 400); // 400ms 딜레이 (STT onend 대기 100ms + 여유)
                        }
                        // 브라우저의 다른 전역 단축키(도움말 등) 호출을 막기 위해 전파 차단
                        if (e.preventDefault) e.preventDefault();
                        if (e.stopPropagation) e.stopPropagation();
                        return false;
                    }
                }
            }

            if (e.key === 'Enter' && !e.shiftKey && e.type === 'keydown') {
                if (this.onPwdSyncTrigger) this.onPwdSyncTrigger();
            }

            if (this.optCmdC.checked && e.metaKey && (e.key === 'c' || e.key === 'C')) {
                if (e.type === 'keydown') this.socket.emit('input', '\x03');
                if (e.preventDefault) e.preventDefault();
                if (e.stopPropagation) e.stopPropagation();
                return false;
            }

            // Custom Shortcuts mapping (Dual)
            if (this._handleDualShortcut(e, this.optCmdY, 'custom', 'custom_2', '\x19')) return false;
            if (this._handleDualShortcut(e, this.optCmdO, 'customO', 'customO_2', '\x0f')) return false;
            if (this._handleDualShortcut(e, this.optMapHome, 'home', 'home_2', '\x1b[H')) return false;
            if (this._handleDualShortcut(e, this.optMapEnd, 'end', 'end_2', '\x1b[F')) return false;
            if (this._handleDualShortcut(e, this.optMapPrefix, 'prefix', 'prefix_2', '\x02')) return false;

            // Paste shortcut (Special handling - Dual)
            if (this.optMapPaste && this.optMapPaste.checked && 
                (this._matchShortcut(e, this.shortcuts['paste']) || this._matchShortcut(e, this.shortcuts['paste_2']))) {
                if (e.type === 'keydown') {
                    window.lastCustomPasteTime = Date.now();
                    if (this.onPasteFromClipboard) {
                        this.onPasteFromClipboard(); // ThumbnailManager의 고도화된 붙여넣기 사용
                    } else {
                        this._pasteFromClipboard();
                    }
                }
                if (e.preventDefault) e.preventDefault();
                if (e.stopPropagation) e.stopPropagation();
                return false;
            }

            // STT toggle shortcut (Special handling - Dual)
            if (this.optMapStt && this.optMapStt.checked && 
                (this._matchShortcut(e, this.shortcuts['stt']) || this._matchShortcut(e, this.shortcuts['stt_2']))) {
                if (e.type === 'keydown') {
                    if (this.sttManager) {
                        this.sttManager.toggle();
                    } else {
                        console.warn('[STT] Speech Recognition not supported or not initialized.');
                    }
                }
                if (e.preventDefault) e.preventDefault();
                if (e.stopPropagation) e.stopPropagation();
                return false;
            }

            if (e.key === 'Enter' && e.shiftKey) {
                if (e.type === 'keydown') this.socket.emit('input', '\x0a');
                if (e.preventDefault) e.preventDefault();
                if (e.stopPropagation) e.stopPropagation();
                return false;
            }
            return true;
        });

        // 데이터 송신
        this.term.onData(data => {
            // STT 작동 중에는 사용자의 타이핑이 터미널(서버)로 넘어가는 것을 원천 차단
            if (this.sttManager && this.sttManager.isRecording) {
                console.log('[STT] Socket input blocked while recording.');
                return;
            }
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

    _handleDualShortcut(e, optionCheckbox, shortcutKey1, shortcutKey2, sequence) {
        if (optionCheckbox && optionCheckbox.checked && 
            (this._matchShortcut(e, this.shortcuts[shortcutKey1]) || this._matchShortcut(e, this.shortcuts[shortcutKey2]))) {
            if (e.type === 'keydown') {
                this.socket.emit('input', sequence);
            }
            if (e.preventDefault) e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
            return true; // Match found, prevent further xterm handling
        }
        return false;
    }

    async _pasteFromClipboard() {
        if (navigator.clipboard && navigator.clipboard.readText) {
            try {
                const text = await navigator.clipboard.readText();
                // [FIX] Use xterm's native paste to support bracketed paste mode
                if (text) this.term.paste(text);
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
