const pty = require('node-pty');
const os = require('os');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * 터미널 및 Tmux 세션 관리 핸들러 클래스
 */
class TerminalHandler {
    constructor(socket, io) {
        this.socket = socket;
        this.io = io;
        this.ptyProcess = null;
        this.currentSessionName = null;
    }

    /**
     * .gcw.conf 파일을 읽어 환경 변수를 파싱합니다. (기존 server.js 로직 이관)
     */
    getGcwEnv() {
        const configPath = path.join(process.cwd(), '.gcw.conf');
        const customEnv = { ...process.env };
        const customVars = {};

        console.log(`[TERM] Checking for .gcw.conf at: ${configPath}`);

        if (fs.existsSync(configPath)) {
            try {
                const content = fs.readFileSync(configPath, 'utf8');
                const lines = content.split('\n');
                let count = 0;
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('PROJECT_') && trimmed.includes('=')) {
                        const [key, ...valueParts] = trimmed.split('=');
                        const value = valueParts.join('=').trim();
                        if (key.trim()) {
                            customEnv[key.trim()] = value;
                            customVars[key.trim()] = value;
                            count++;
                        }
                    }
                });
                console.log(`[TERM] Loaded ${count} environment variables from .gcw.conf`);
            } catch (e) {
                console.error('[TERM] Failed to read .gcw.conf:', e);
            }
        } else {
            console.log(`[TERM] .gcw.conf not found at: ${configPath}`);
        }
        return { env: customEnv, customVars };
    }

    /**
     * 기존 pty 프로세스 정리
     */
    _cleanupPty() {
        if (this.ptyProcess) {
            try {
                // 의도적인 종료 시에는 exit 이벤트를 클라이언트에 보내지 않음
                this.ptyProcess.removeAllListeners('exit');
                this.ptyProcess.kill();
                console.log('[TERM] Terminated existing PTY process intentionally.');
            } catch (e) {
                console.error('[TERM] Error killing previous PTY:', e);
            }
            this.ptyProcess = null;
            this.currentSessionName = null;
        }
    }

    /**
     * 초기 터미널 생성 (spawn) 및 Tmux 세션 연결
     */
    handleCreate(options = {}) {
        this._cleanupPty();

        let sessionName = options.sessionName ? options.sessionName.replace(/[^a-zA-Z0-9_-]/g, '-') : '';
        if (!sessionName) {
            sessionName = `gemini-${Math.floor(Math.random() * 10000)}`;
        }
        
        console.log(`[TERM] Creating/Attaching tmux session: ${sessionName}, keepAlive: ${options.keepAlive}`);

        const { env: customEnv, customVars } = this.getGcwEnv();
        
        // 현재 프로세스의 환경 변수 중 GCW_ 로 시작하는 것들을 찾아 환경 주입 문자열(-e) 생성
        let envArgs = "";
        for (const [k, v] of Object.entries(process.env)) {
            if (k.startsWith('GCW_')) {
                envArgs += `-e "${k}=${v}" `;
            }
        }
        for (const [key, value] of Object.entries(customVars)) {
            if (!envArgs.includes(`"${key}=`)) {
                envArgs += `-e "${key}=${value}" `;
            }
        }

        // 1. Tmux 세션 생성 또는 확인
        const startCmd = options.keepAlive 
            ? `tmux new-session -d ${envArgs}-s ${sessionName} \\; send-keys -t ${sessionName} "gemini" C-m`
            : `tmux new-session -d ${envArgs}-s ${sessionName} "gemini"`;

        const tmuxSetupCmds = [
            startCmd,
            `tmux set-option -t ${sessionName} set-clipboard on`,
            `tmux set-option -t ${sessionName} pane-active-border-style fg=cyan`,
            `tmux set-window-option -t ${sessionName} window-status-current-style fg=black,bg=cyan`,
            `tmux set-option -t ${sessionName} -g word-separators " "`
        ].join('; ');

        // Tmux 세션 사전 구성
        exec(tmuxSetupCmds, { env: customEnv }, (error) => {
            if (error) {
                console.error('[TERM] Tmux setup error:', error.message);
                // 세션이 이미 존재할 경우 무시하고 진행 가능성 확인
            }

            this._connectToTmux(sessionName, customEnv);
            this.socket.emit('created', sessionName);
        });
    }

    /**
     * 기존 Tmux 세션에 직접 Attach
     */
    handleAttach(sessionName) {
        this._cleanupPty();
        
        console.log(`[TERM] Attaching to tmux session: ${sessionName}`);
        const { env: customEnv } = this.getGcwEnv();
        
        this._connectToTmux(sessionName, customEnv);
        // 클라이언트에게 Attach 성공 응답 (UI 갱신 목적)
        this.socket.emit('created', sessionName); 
    }

    /**
     * 공통 PTY 스폰 및 스트리밍 로직
     */
    _connectToTmux(sessionName, customEnv) {
        // 2. node-pty를 통해 해당 Tmux 세션에 접속 (-d 옵션으로 기존 접속자 강제 분리)
        let command = 'tmux';
        let args = ['attach-session', '-d', '-t', sessionName];

        // 터미널 색상 및 다크 테마 감지를 돕기 위한 환경변수
        const ptyEnv = {
            ...customEnv,
            COLORTERM: 'truecolor'
        };

        // macOS 환경(darwin) 우회 코드 복구
        if (os.platform() === 'darwin') {
            const shell = process.env.SHELL || '/bin/sh';
            command = shell;
            args = ['-c', `exec tmux attach -d -t "${sessionName}"`];
        }

        this.ptyProcess = pty.spawn(command, args, {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: process.cwd(),
            env: ptyEnv
        });

        this.currentSessionName = sessionName;
        this.socket.join(`session_${sessionName}`);

        // 터미널 출력 데이터 스로틀링 (25ms 버퍼링)
        let outputBuffer = '';
        let flushTimeout = null;

        const flushBuffer = () => {
            if (outputBuffer.length > 0) {
                this.socket.emit('output', outputBuffer);
                outputBuffer = '';
            }
            flushTimeout = null;
        };

        this.ptyProcess.onData((data) => {
            outputBuffer += data;
            if (!flushTimeout) {
                flushTimeout = setTimeout(flushBuffer, 25);
            }
        });

        this.ptyProcess.onExit(() => {
            if (flushTimeout) clearTimeout(flushTimeout);
            this.socket.emit('exit');
            this.ptyProcess = null;
        });
    }

    /**
     * 사용자 입력 처리
     */
    handleInput(data) {
        if (this.ptyProcess) {
            this.ptyProcess.write(data);
        }
    }

    /**
     * 터미널 크기 조절
     */
    handleResize(size) {
        if (this.ptyProcess) {
            this.ptyProcess.resize(size.cols, size.rows);
        }
    }

    /**
     * Tmux 화면 분할
     */
    handleTmuxSplit(direction) {
        if (!this.currentSessionName) return;

        const flag = direction === 'horizontal' ? '-h' : '-v';
        const { env: customEnv, customVars } = this.getGcwEnv();
        
        let envArgs = "";
        // node-pty를 실행 중인 server.js의 환경 변수 중 GCW_ 를 상속
        for (const [k, v] of Object.entries(process.env)) {
            if (k.startsWith('GCW_')) {
                envArgs += `-e "${k}=${v}" `;
            }
        }
        for (const [key, value] of Object.entries(customVars)) {
            if (!envArgs.includes(`"${key}=`)) {
                envArgs += `-e "${key}=${value}" `;
            }
        }

        console.log(`[TERM] Splitting session ${this.currentSessionName} (${direction})`);
        exec(`tmux split-window -c "#{pane_current_path}" ${envArgs}${flag} -t ${this.currentSessionName}`, { env: customEnv }, (error) => {
            if (error) {
                console.error('[TERM] Split error:', error);
                this.socket.emit('error', 'Failed to split tmux window');
            }
        });
    }

    /**
     * Tmux 테마 변경 연동
     */
    handleThemeChange(theme) {
        if (!this.currentSessionName) return;

        const bgColor = theme === 'light' ? 'colour253' : 'colour236';
        exec(`tmux set-window-option -t ${this.currentSessionName} window-style bg=${bgColor}`, (error) => {
            if (error) {
                console.error('[TERM] Theme change error:', error);
            }
        });
        console.log(`[TERM] Theme synced to ${theme}`);
    }

    /**
     * 세션 이름 변경
     */
    handleRenameSession(payload) {
        if (!this.currentSessionName || this.currentSessionName !== payload.oldName) return;
        
        const newName = payload.newName.replace(/[^a-zA-Z0-9_-]/g, '_');
        exec(`tmux rename-session -t "${this.currentSessionName}" "${newName}"`, (error) => {
            if (error) {
                console.error('[TERM] Rename error:', error);
                this.socket.emit('error', 'Failed to rename session: ' + error.message);
            } else {
                const oldName = this.currentSessionName;
                this.currentSessionName = newName;
                
                this.io.to(`session_${oldName}`).emit('session_renamed', newName);
                this.socket.leave(`session_${oldName}`);
                this.socket.join(`session_${newName}`);
                
                this.socket.emit('session_renamed', newName);
            }
        });
    }

    /**
     * 현재 세션의 Tmux 윈도우 목록 조회
     */
    handleListWindows() {
        if (!this.currentSessionName) return;

        console.log(`[TERM] Listing windows for session: ${this.currentSessionName}`);
        // 포맷: 인덱스:이름:활성여부(1 or 0)
        exec(`tmux list-windows -t "${this.currentSessionName}" -F "#{window_index}:#{window_name}:#{window_active}"`, (error, stdout) => {
            if (error) {
                console.error('[TERM] List windows error:', error);
                return;
            }

            const windows = stdout.trim().split('\n').filter(line => line).map(line => {
                const [index, name, active] = line.split(':');
                return {
                    index: parseInt(index),
                    name: name,
                    active: active === '1'
                };
            });

            this.socket.emit('window_list', windows);
        });
    }

    /**
     * 특정 Tmux 윈도우 선택
     */
    handleSelectWindow(index) {
        if (!this.currentSessionName) return;

        console.log(`[TERM] Selecting window ${index} in session ${this.currentSessionName}`);
        exec(`tmux select-window -t "${this.currentSessionName}:${index}"`, (error) => {
            if (error) {
                console.error('[TERM] Select window error:', error);
            } else {
                // 전환 성공 후 목록 최신화 유도
                this.handleListWindows();
            }
        });
    }

    /**
     * 특정 Tmux 윈도우 종료
     */
    handleKillWindow(index) {
        if (!this.currentSessionName) return;

        console.log(`[TERM] Killing window ${index} in session ${this.currentSessionName}`);
        exec(`tmux kill-window -t "${this.currentSessionName}:${index}"`, (error) => {
            if (error) {
                console.error('[TERM] Kill window error:', error);
                this.socket.emit('error', 'Failed to kill window');
            } else {
                this.handleListWindows();
            }
        });
    }

    /**
     * 현재 윈도우의 패널 목록 상세 조회 (좌표 및 크기 포함)
     */
    handleListPanes() {
        if (!this.currentSessionName) return;

        console.log(`[TERM] Listing detailed panes for session: ${this.currentSessionName}`);
        // 포맷: index:left:top:width:height:active:command:path
        const format = "#{pane_index}:#{pane_left}:#{pane_top}:#{pane_width}:#{pane_height}:#{pane_active}:#{pane_current_command}:#{pane_current_path}";
        exec(`tmux list-panes -t "${this.currentSessionName}" -F "${format}"`, (error, stdout) => {
            if (error) {
                console.error('[TERM] List panes error:', error);
                return;
            }

            const panes = stdout.trim().split('\n').filter(line => line).map(line => {
                const [index, left, top, width, height, active, command, pwd] = line.split(':');
                return {
                    index: parseInt(index),
                    left: parseInt(left),
                    top: parseInt(top),
                    width: parseInt(width),
                    height: parseInt(height),
                    active: active === '1',
                    command: command,
                    pwd: pwd
                };
            });

            this.socket.emit('pane_list', panes);
        });
    }

    /**
     * 특정 Tmux 패널 종료
     */
    handleKillPane(index) {
        if (!this.currentSessionName) return;

        console.log(`[TERM] Killing pane ${index} in session ${this.currentSessionName}`);
        // 세션명과 윈도우 인덱스(현재 활성 윈도우 기준)를 사용하여 패널 종료
        exec(`tmux kill-pane -t "${this.currentSessionName}.${index}"`, (error) => {
            if (error) {
                console.error('[TERM] Kill pane error:', error);
                this.socket.emit('error', 'Failed to kill pane');
            } else {
                this.handleListPanes();
            }
        });
    }

    /**
     * Tmux 세션에 붙은 모든 클라이언트 강제 종료 (Reset)
     */
    handleTmuxResetClients() {
        if (!this.currentSessionName) return;

        console.log(`[TERM] Resetting all clients for session ${this.currentSessionName}`);
        // -s 옵션으로 해당 세션의 모든 클라이언트를 강제로 떼어냄
        exec(`tmux detach-client -s "${this.currentSessionName}"`, (error) => {
            if (error) {
                console.error('[TERM] Reset clients error:', error);
                this.socket.emit('error', 'Failed to reset tmux clients');
            } else {
                console.log(`[TERM] Successfully detached all clients from ${this.currentSessionName}`);
                // 클라이언트는 새로고침하거나 재접속해야 함을 알림
                this.socket.emit('info', 'All tmux clients detached. Please refresh if needed.');
            }
        });
    }

    /**
     * 핸들러 등록 (선언적 라우팅)
     */
    static register(socket, io) {
        const handler = new TerminalHandler(socket, io);
        
        socket.on('create', (opt) => handler.handleCreate(opt));
        socket.on('attach', (name) => handler.handleAttach(name));
        socket.on('input', (data) => handler.handleInput(data));
        socket.on('resize', (size) => handler.handleResize(size));
        socket.on('theme_change', (theme) => handler.handleThemeChange(theme));
        socket.on('tmux_split', (dir) => handler.handleTmuxSplit(dir));
        socket.on('tmux_reset_clients', () => handler.handleTmuxResetClients());
        socket.on('rename_session', (payload) => handler.handleRenameSession(payload));
        socket.on('list_windows', () => handler.handleListWindows());
        socket.on('select_window', (index) => handler.handleSelectWindow(index));
        socket.on('kill_window', (index) => handler.handleKillWindow(index));
        socket.on('list_panes', () => handler.handleListPanes());
        socket.on('kill_pane', (index) => handler.handleKillPane(index));

        // 연결 끊김 시 PTY 정리 로직 추가 (좀비 방지)
        socket.on('disconnect', () => {
            if (handler.currentSessionName) {
                console.log(`[TERM] Socket disconnected, cleaning up PTY for session: ${handler.currentSessionName}`);
            }
            handler._cleanupPty();
        });
        
        return handler;
    }
}

module.exports = { TerminalHandler };
