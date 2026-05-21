export class UIController {
    constructor(options) {
        this.getUiSetting = options.getUiSetting;
        this.saveUiSetting = options.saveUiSetting;
        this.socketClient = options.socketClient;
        this.tmuxManager = options.tmuxManager; // 추가
        this.getApiPath = options.getApiPath;
        
        // 터미널 인스턴스/매니저 조작용 콜백
        this.getTerm = options.getTerm;
        this.getTerminalManager = options.getTerminalManager;

        // 테마 관련
        this.lightThemeColors = options.lightThemeColors;
        this.darkThemeColors = options.darkThemeColors;

        // DOM 캐싱 (필수 요소만)
        this.settingsModal = document.getElementById('settings-modal');
        this.btnSettings = document.getElementById('btn-settings');
        this.closeSettings = document.getElementById('close-settings');
        
        this.optTheme = document.getElementById('opt-theme');
        
        this.selectFont = document.getElementById('select-font');
        this.btnFontMinus = document.getElementById('btn-font-minus');
        this.btnFontPlus = document.getElementById('btn-font-plus');

        this.envModal = document.getElementById('env-modal');
        this.envContent = document.getElementById('env-content');
        this.btnEnvInfo = document.getElementById('btn-env-info');
        this.closeEnvModal = document.getElementById('close-env-modal');

        this.workspacesModal = document.getElementById('workspaces-modal');
        this.workspacesIframe = document.getElementById('workspaces-iframe');
        this.closeWorkspacesModal = document.getElementById('close-workspaces-modal');

        this.navDropdown = document.getElementById('nav-dropdown');
        this.btnSttToggle = document.getElementById('btn-stt-toggle');

        // Reconnect Overlay
        this.disconnectOverlay = document.getElementById('disconnect-overlay');
        this.btnReconnect = document.getElementById('btn-reconnect');
        this.onReconnect = options.onReconnect;

        this.init();
    }

    init() {
        this._bindSettingsModal();
        this._bindThemeToggle();
        this._bindFontControls();
        this._bindEnvModal();
        this._bindNavDropdown();
        this._bindWorkspacesModal();
        this._bindReconnectButton();
        this._initTheme();
        this.updateSttButtonTooltip();
    }

    _bindReconnectButton() {
        if (!this.btnReconnect) return;
        this.btnReconnect.onclick = () => {
            const currentSession = this.tmuxManager ? this.tmuxManager.currentSession : null;
            
            console.log('[UI] Reconnect clicked for session:', currentSession);
            if (currentSession && this.onReconnect) {
                if (this.disconnectOverlay) this.disconnectOverlay.style.display = 'none';
                const term = this.getTerm ? this.getTerm() : null;
                if (term) {
                    term.clear();
                    term.write('\r\n\x1b[33mReconnecting to session...\x1b[0m\r\n');
                }
                this.onReconnect(currentSession);
            } else {
                window.location.reload();
            }
        };
    }

    _bindWorkspacesModal() {
        if (this.closeWorkspacesModal) {
            this.closeWorkspacesModal.onclick = () => {
                if (this.workspacesModal) {
                    this.workspacesModal.style.display = "none";
                    this.workspacesIframe.src = 'about:blank'; // Unload
                }
            };
        }
    }

    // STT 버튼 툴팁 업데이트 (단축키 안내 표시)
    updateSttButtonTooltip() {
        const terminalManager = this.getTerminalManager ? this.getTerminalManager() : null;
        if (!this.btnSttToggle || !terminalManager) return;
        
        const shortcuts = terminalManager.shortcuts;
        if (!shortcuts) return;

        const format = (sc) => {
            if (!sc) return 'Unassigned';
            const parts = [];
            if (sc.metaKey) parts.push(navigator.platform.includes('Mac') ? 'Cmd' : 'Win');
            if (sc.ctrlKey) parts.push('Ctrl');
            if (sc.altKey) parts.push('Alt');
            if (sc.shiftKey) parts.push('Shift');
            parts.push(sc.key.toUpperCase());
            return parts.join('+');
        };

        const primary = format(shortcuts.stt);
        const secondary = shortcuts.stt_2 ? ` / ${format(shortcuts.stt_2)}` : '';
        this.btnSttToggle.title = `Voice Input (STT) - Click to toggle\nShortcut: ${primary}${secondary}`;
    }

    _bindSettingsModal() {
        if (this.btnSettings) {
            this.btnSettings.onclick = () => {
                if (this.settingsModal) this.settingsModal.style.display = "flex";
            };
        }
        if (this.closeSettings) {
            this.closeSettings.onclick = () => {
                if (this.settingsModal) this.settingsModal.style.display = "none";
            };
        }
        window.addEventListener('click', (event) => {
            if (event.target === this.settingsModal) {
                this.settingsModal.style.display = "none";
            }
            if (event.target === this.envModal) {
                this.envModal.style.display = "none";
            }
        });
    }

    _bindThemeToggle() {
        if (!this.optTheme) return;
        this.optTheme.onchange = () => {
            const theme = this.optTheme.value;
            this.saveUiSetting('GCW_UI_THEME', theme);
            this.applyTheme(theme);
            this.socketClient.emit('theme_change', theme);
        };
    }

    _initTheme() {
        const theme = this.getUiSetting('GCW_UI_THEME') || 'dark';
        if (this.optTheme) this.optTheme.value = theme;
        this.applyTheme(theme);
    }

    applyTheme(theme) {
        if (theme === 'light') {
            document.body.classList.add('theme-light');
            const term = this.getTerm ? this.getTerm() : null;
            if (term) term.options.theme = this.lightThemeColors;
        } else {
            document.body.classList.remove('theme-light');
            const term = this.getTerm ? this.getTerm() : null;
            if (term) term.options.theme = this.darkThemeColors;
        }
    }

    _bindFontControls() {
        // Font Family
        if (this.selectFont) {
            const savedFont = this.getUiSetting('GCW_UI_TERMINAL_FONT_FAMILY');
            if (savedFont) this.selectFont.value = savedFont;

            this.selectFont.onchange = () => {
                const font = this.selectFont.value;
                this.saveUiSetting('GCW_UI_TERMINAL_FONT_FAMILY', font);
                const term = this.getTerm ? this.getTerm() : null;
                const tm = this.getTerminalManager ? this.getTerminalManager() : null;
                if (term) {
                    term.options.fontFamily = font;
                    if (tm) setTimeout(() => tm.fit(), 50);
                }
            };
        }

        // Font Size
        if (this.btnFontMinus && this.btnFontPlus) {
            this.btnFontMinus.onclick = () => this._changeFontSize(-1);
            this.btnFontPlus.onclick = () => this._changeFontSize(1);
        }
    }

    _changeFontSize(delta) {
        const term = this.getTerm ? this.getTerm() : null;
        const tm = this.getTerminalManager ? this.getTerminalManager() : null;
        if (!term) return;

        let currentSize = term.options.fontSize;
        let newSize = currentSize + delta;
        if (newSize >= 8 && newSize <= 32) {
            term.options.fontSize = newSize;
            this.saveUiSetting('GCW_UI_TERMINAL_FONT_SIZE', newSize.toString());
            if (tm) {
                setTimeout(() => tm.fit(), 50);
            }
        }
    }

    _bindEnvModal() {
        if (!this.btnEnvInfo || !this.envModal || !this.envContent) return;

        // 초기 로드 시 표시 여부 체크
        fetch(this.getApiPath('/api/gcw-env'))
            .then(res => res.json())
            .then(data => {
                if (Object.keys(data).length > 0) {
                    this.btnEnvInfo.style.display = 'inline-block';
                } else {
                    this.btnEnvInfo.style.display = 'none';
                }
            })
            .catch(() => {});

        this.btnEnvInfo.onclick = () => {
            fetch(this.getApiPath('/api/gcw-env'))
                .then(res => res.json())
                .then(data => {
                    let content = '';
                    for (const [key, value] of Object.entries(data)) {
                        content += `${key}=${value}\n`;
                    }
                    this.envContent.textContent = content || 'No environment variables found.';
                    this.envModal.style.display = 'block';
                })
                .catch(() => {
                    this.envContent.textContent = 'Failed to load environment variables.';
                    this.envModal.style.display = 'block';
                });
        };

        if (this.closeEnvModal) {
            this.closeEnvModal.onclick = () => {
                this.envModal.style.display = "none";
            };
        }
    }

    _bindNavDropdown() {
        if (!this.navDropdown) return;
        this.navDropdown.addEventListener('change', (e) => {
            const val = e.target.value;
            console.log('[NavDropdown] value selected:', val);

            if (val === 'sessions') {
                window.location.search = '?select=true';
            } else if (val === 'workspaces') {
                window.location.href = '/';
            } else if (val === 'workspaces-modal') {
                if (this.workspacesModal && this.workspacesIframe) {
                    this.workspacesIframe.src = '/';
                    this.workspacesModal.style.display = 'flex';
                } else {
                    console.error('[NavDropdown] Workspaces modal DOM not found!');
                    window.location.href = '/';
                }
            } else if (val === 'add-project') {
                if (this.workspacesModal && this.workspacesIframe) {
                    this.workspacesIframe.src = '/?action=add';
                    this.workspacesModal.style.display = 'flex';
                } else {
                    console.error('[NavDropdown] Workspaces modal DOM not found!');
                    window.location.href = '/?action=add';
                }
            }
            e.target.value = '';
        });
    }
}