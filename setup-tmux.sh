#!/bin/bash

# Gemini CLI WebUI Wrapper - Tmux Environment Setup Script
# 이 스크립트는 기존 사용자의 ~/.tmux.conf 를 안전하게 보존하면서,
# Gemini CLI에 필요한 필수 설정들을 'Managed Block' 형태로 관리합니다.

TMUX_CONF="$HOME/.tmux.conf"
BACKUP_CONF="$HOME/.tmux.conf.bak.$(date +%Y%m%d%H%M%S)"
TPM_DIR="$HOME/.tmux/plugins/tpm"
MARKER_START="# === GEMINI CLI WRAPPER MANAGED BLOCK START ==="
MARKER_END="# === GEMINI CLI WRAPPER MANAGED BLOCK END ==="
CUSTOM_MARKER_START="# === GEMINI CLI CUSTOM OPTIONAL BINDINGS START ==="
CUSTOM_MARKER_END="# === GEMINI CLI CUSTOM OPTIONAL BINDINGS END ==="

echo "================================================="
echo "  Gemini CLI WebUI - Tmux Environment Setup"
echo "================================================="

# 1. 백업 생성
if [ -f "$TMUX_CONF" ]; then
    echo "[INFO] Existing ~/.tmux.conf found. Creating backup at $BACKUP_CONF"
    cp "$TMUX_CONF" "$BACKUP_CONF"
else
    echo "[INFO] No ~/.tmux.conf found. A new one will be created."
    touch "$TMUX_CONF"
fi

echo ""

# 2. 선택적 커스텀 설정 묻기 (터미널 환경에서만 질문)
if [ -t 0 ]; then
    echo "--- Optional Custom Key Bindings ---"
    echo "Would you like to install intuitive custom convenience bindings?"
    echo " (Includes: intuitive splits (|/-), current path inheritance, config reload shortcuts)"
    read -r -p "Apply custom bindings? [y/N]: " apply_custom

    if [[ "$apply_custom" =~ ^[Yy]$ ]]; then
        do_inject_custom=true
        # 이미 커스텀 블록이 있는지 확인
        if grep -q "$CUSTOM_MARKER_START" "$TMUX_CONF"; then
            read -r -p "Custom bindings block already exists. Overwrite? [Y/n]: " overwrite_custom
            if [[ "$overwrite_custom" =~ ^[Nn]$ ]]; then
                do_inject_custom=false
                echo "[SKIP] Keeping existing custom bindings."
            else
                # 덮어쓰기를 위해 기존 커스텀 블록 삭제
                sed -i "/$CUSTOM_MARKER_START/,/$CUSTOM_MARKER_END/d" "$TMUX_CONF"
                echo "[INFO] Overwriting existing custom bindings."
            fi
        fi

        if [ "$do_inject_custom" = true ]; then
            cat << CUSTOM_EOF >> "$TMUX_CONF"
$CUSTOM_MARKER_START
# bind-key -T prefix n command-prompt -p "New Session Name:" "new-session -s '%%'"
# "New Session Name:" 뒤에 기본값 "default"가 미리 써져 있음
bind-key -T prefix n command-prompt -I "default" -p "New Session Name:" "new-session -s '%%' -c '#{pane_current_path}'"

# 현재 패널의 경로(pane_current_path)를 상속받아 새 윈도우 생성
bind c new-window -c "#{pane_current_path}"

# 가로 분할 시 경로 유지
bind | split-window -h -c "#{pane_current_path}"

# 세로 분할 시 경로 유지
bind - split-window -v -c "#{pane_current_path}"

# Reload tmux config 단축키
bind-key -T prefix r source-file ~/.tmux.conf \; display "Reloaded!"

# Reload .bashrc
bind R send-keys "source ~/.bashrc" Enter

# X-Window DISPLAY 환경 변수 자동 업데이트
set-option -g update-environment "DISPLAY SSH_CLIENT SSH_TTY SSH_CONNECTION"
$CUSTOM_MARKER_END
CUSTOM_EOF
            echo "[ADD] Custom bindings block successfully injected."
        fi
    else
        echo "[SKIP] Custom bindings not applied."
    fi
    echo ""
fi

# 3. 기존 Managed Block이 있다면 통째로 삭제 (중복 증식 원천 차단)
if grep -q "$MARKER_START" "$TMUX_CONF"; then
    echo "[INFO] Removing old Gemini CLI Managed Block to prevent duplicates."
    # 마커 시작부터 끝까지 삭제
    sed -i "/$MARKER_START/,/$MARKER_END/d" "$TMUX_CONF"
fi

echo "--- Appending New Configuration Block ---"
# 4. 새로운 Managed Block 작성
cat << BLOCK_EOF >> "$TMUX_CONF"
$MARKER_START
# WARNING: This block is auto-generated and managed by setup-tmux.sh.
# Do not manually edit inside this block as it will be overwritten.

# --- [Basic Configurations & TrueColor] ---
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",*256col*:Tc"
set -g extended-keys on
set -as terminal-features 'xterm*:extkeys'

# --- [UI/UX Styles] ---
set -g window-style 'bg=colour236'
set -g window-active-style 'bg=terminal'
set -g pane-active-border-style 'fg=cyan,bg=default'

# --- [Performance Fixes] ---
set -g history-limit 50000
set -g status-interval 60

# --- [Mouse & Clipboard Configurations] ---
set -g mouse on
set -s set-clipboard on
set -g word-separators " "

# [1] 패널 선택 및 이벤트 전달 (더블클릭 방해 방지)
bind-key -n MouseDown1Pane select-pane -t= \; send-keys -M

# [2] 드래그 종료 시: 최하단(0)이면 즉시 복사 모드 종료, 아니면 스크롤 유지를 위해 모드만 유지
bind-key -T copy-mode MouseDragEnd1Pane if-shell -F "#{scroll_position}" "send-keys -X copy-selection" "send-keys -X copy-selection-and-cancel"
bind-key -T copy-mode-vi MouseDragEnd1Pane if-shell -F "#{scroll_position}" "send-keys -X copy-selection" "send-keys -X copy-selection-and-cancel"

# [3] 마우스 버튼 뗄 때: 스크롤이 맨 바닥(0)이면 무조건 복사 모드 종료 (Jerry님의 Painpoint 해결)
bind-key -T copy-mode MouseUp1Pane if-shell -F "#{scroll_position}" "send-keys -M" "send-keys -X cancel"
bind-key -T copy-mode-vi MouseUp1Pane if-shell -F "#{scroll_position}" "send-keys -M" "send-keys -X cancel"

# [4] 더블클릭 단어 선택, 복사, 0.2초 반짝임 후 하이라이트 해제 (스크롤 유지)
bind-key -T copy-mode DoubleClick1Pane select-pane -t= \; send-keys -X select-word \; send-keys -X copy-selection-no-clear \; run-shell "sleep 0.2" \; send-keys -X clear-selection
bind-key -T copy-mode-vi DoubleClick1Pane select-pane -t= \; send-keys -X select-word \; send-keys -X copy-selection-no-clear \; run-shell "sleep 0.2" \; send-keys -X clear-selection

# --- [TPM & Plugins] ---
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @plugin 'tmux-plugins/tmux-continuum'

set -g @continuum-restore 'on'
set -g @continuum-save-interval '15'

# Initialize TMUX plugin manager (keep this line at the very bottom of tmux.conf)
run '~/.tmux/plugins/tpm/tpm'
$MARKER_END
BLOCK_EOF

echo "[ADD] Successfully injected the Gemini CLI Managed Block."

echo ""
echo "--- Checking Shell Configuration (.bashrc / .zshrc) ---"
for rc_file in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.profile"; do
    if [ -f "$rc_file" ]; then
        if grep -qE "^[[:space:]]*export[[:space:]]+GEMINI_API_KEY=[^$]" "$rc_file"; then
            echo "⚠️  [WARNING] Hardcoded GEMINI_API_KEY found in $rc_file"
            echo "   -> This will override .gcw.conf settings when opening a new tmux pane."
            echo "   -> Suggestion: Change it to use defensive assignment:"
            echo "      export GEMINI_API_KEY=\${GEMINI_API_KEY:-YOUR_API_KEY}"
        fi
    fi
done

echo ""
echo "--- Checking Tmux Plugin Manager (TPM) & Installing Plugins ---"

# TPM 설치 확인
if [ ! -d "$TPM_DIR" ]; then
    echo "[INSTALL] Tmux Plugin Manager (TPM) not found. Installing..."
    git clone https://github.com/tmux-plugins/tpm "$TPM_DIR"
else
    echo "[INFO] TPM is already installed."
fi

# Tmux 서버가 실행 중인지 확인
if pgrep -x tmux > /dev/null; then
    echo "[INFO] Tmux is running. Reloading config and installing plugins..."
    tmux source-file "$TMUX_CONF"
    "$TPM_DIR/bin/install_plugins"
else
    echo "[INFO] Tmux is not running. Plugins will be installed when you first start Tmux."
    echo "[INFO] Attempting to install plugins via headless mode..."
    tmux new-session -d -s __temp_install_session
    tmux source-file "$TMUX_CONF"
    "$TPM_DIR/bin/install_plugins"
    tmux kill-session -t __temp_install_session
fi

echo ""
echo "================================================="
echo "✅ Setup & Installation Complete!"
echo "================================================="
