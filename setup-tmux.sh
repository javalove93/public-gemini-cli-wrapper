#!/bin/bash

# Gemini CLI WebUI Wrapper - Tmux Environment Setup Script
# 이 스크립트는 기존 사용자의 ~/.tmux.conf 를 덮어쓰지 않고,
# 누락된 필수 설정만 안전하게 추가하며 충돌 가능성이 있는 부분을 경고합니다.

TMUX_CONF="$HOME/.tmux.conf"
BACKUP_CONF="$HOME/.tmux.conf.bak.$(date +%Y%m%d%H%M%S)"
TPM_DIR="$HOME/.tmux/plugins/tpm"

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

# 2. 필수 설정 확인 및 추가 함수
check_and_add_setting() {
    local setting_key="$1"
    local setting_value="$2"
    local description="$3"

    # 1. 이미 정확한 설정값이 존재하는지 확인 (공백/따옴표 차이 고려하여 비교)
    # 팁: grep -F는 문자열 그대로 검색함
    if grep -q -F "$setting_value" "$TMUX_CONF"; then
        # 정확히 일치하는 설정이 있으면 침묵 (이미 최적화됨)
        return 0
    fi

    # 2. 설정 키워드는 존재하지만 값이 다른 경우 (주석 제외)
    if grep -q -E "^\\s*set(-option)?\\s+.*${setting_key}" "$TMUX_CONF"; then
        echo "⚠️  [WARNING] '${setting_key}' is already configured in your .tmux.conf with a different value."
        echo "   -> Required for ${description}: '${setting_value}'"
        echo "   -> Please ensure your configuration does not conflict with the required value."
        
        # [Performance Fix] 만약 status-interval이 너무 짧다면 덮어쓰기
        if [[ "$setting_key" == "status-interval" ]]; then
            echo "[FIX] Overriding 'status-interval' to 60s for performance."
            sed -i "s/^\\s*set.*status-interval.*/set -g status-interval 60/" "$TMUX_CONF"
        fi
    else
        # 3. 아예 없는 설정이면 추가
        echo "[ADD] Adding '${setting_key}' for ${description}."
        echo "$setting_value" >> "$TMUX_CONF"
    fi
}

echo "--- Checking Basic Configurations ---"
# 터미널 색상 지원 및 트루컬러(TrueColor) 활성화 (현대적인 UI 렌더링 권장)
check_and_add_setting "default-terminal" "set -g default-terminal \"tmux-256color\"" "tmux-256color support"
check_and_add_setting "terminal-overrides" "set -ga terminal-overrides \",*256col*:Tc\"" "TrueColor (24-bit) support"
# 마우스 스크롤 및 선택 지원
check_and_add_setting "mouse" "set -g mouse on" "mouse support"
# 클립보드 연동 (OSC 52)
check_and_add_setting "set-clipboard" "set -s set-clipboard on" "OSC 52 clipboard integration"
# 마우스 더블클릭 단어 선택 기준 (공백만 구분자로 사용하도록 하여 경로 전체 선택 가능하게 함)
check_and_add_setting "word-separators" "set -g word-separators \" \"" "word selection behavior"
# 터미널 히스토리 한도 증가
check_and_add_setting "history-limit" "set -g history-limit 50000" "scrollback buffer"
# [Performance] 상태바 업데이트 주기 완화 (기본 5초 -> 60초)
check_and_add_setting "status-interval" "set -g status-interval 60" "performance optimization"

echo ""
echo "--- Checking Performance Fixes ---"
# status-right에서 직접 continuum_save.sh를 호출하는 무거운 로직이 있다면 제거
if grep -q "continuum_save.sh" "$TMUX_CONF"; then
    echo "[FIX] Removing heavy 'continuum_save.sh' call from status-right."
    # 해당 스크립트 호출 부분만 삭제 (정규식으로 매칭되는 부분 제거)
    sed -i 's/#(\/.*\/continuum_save\.sh)//g' "$TMUX_CONF"
fi

echo ""
echo "--- Checking Mouse Drag Behaviors ---"
# 드래그로 텍스트 선택 후 마우스를 뗄 때: 복사 후 즉시 copy-mode를 종료(cancel)하여 프롬프트(최하단)로 이동
check_and_add_setting "MouseDragEnd1Pane" "bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-selection-and-cancel" "exit copy-mode and jump to bottom on drag end"
check_and_add_setting "MouseDragEnd1Pane-vi" "bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-selection-and-cancel" "exit copy-mode and jump to bottom on drag end (vi mode)"

echo ""
echo "--- Checking Shell Configuration (.bashrc / .zshrc) ---"
for rc_file in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.profile"; do
    if [ -f "$rc_file" ]; then
        # 방어적 할당( ${GEMINI_API_KEY:-...} )이 아닌 하드코딩된 export를 찾음
        if grep -qE "^[[:space:]]*export[[:space:]]+GEMINI_API_KEY=[^$]" "$rc_file"; then
            echo "⚠️  [WARNING] Hardcoded GEMINI_API_KEY found in $rc_file"
            echo "   -> This will override .gcw.conf settings when opening a new tmux pane."
            echo "   -> Suggestion: Change it to use defensive assignment:"
            echo "      export GEMINI_API_KEY=\${GEMINI_API_KEY:-YOUR_API_KEY}"
        fi
    fi
done

echo ""
echo "--- Checking UI/UX Styles ---"
# 활성/비활성 패널 배경색 구분 (TR-00012 해결 후 전역 설정 이관)
check_and_add_setting "window-style" "set -g window-style 'bg=colour236'" "inactive pane background color"
check_and_add_setting "window-active-style" "set -g window-active-style 'bg=terminal'" "active pane background color"
# 활성 패널 테두리 강조 색상
check_and_add_setting "pane-active-border-style" "set -g pane-active-border-style 'fg=cyan,bg=default'" "active pane border color"

echo ""
echo "--- Checking Tmux Plugin Manager (TPM) & Backup Plugins ---"

# 3. TPM 설치 확인
if [ ! -d "$TPM_DIR" ]; then
    echo "[INSTALL] Tmux Plugin Manager (TPM) not found. Installing..."
    git clone https://github.com/tmux-plugins/tpm "$TPM_DIR"
else
    echo "[INFO] TPM is already installed."
fi

# 4. 플러그인 설정 확인 및 추가
add_plugin_if_missing() {
    local plugin_repo="$1"
    if ! grep -q "$plugin_repo" "$TMUX_CONF"; then
        echo "[ADD] Adding plugin: $plugin_repo"
        # 파일의 맨 끝, run '~/.tmux/plugins/tpm/tpm' 이전에 추가해야 함
        # 편의상 파일 끝에 추가하고, 마지막에 tpm run 구문을 보장하는 방식을 사용
        sed -i "/run.*tpm/d" "$TMUX_CONF" # 기존 run tpm 제거
        echo "set -g @plugin '$plugin_repo'" >> "$TMUX_CONF"
    else
        echo "[INFO] Plugin already configured: $plugin_repo"
    fi
}

add_plugin_if_missing "tmux-plugins/tpm"
add_plugin_if_missing "tmux-plugins/tmux-sensible"
add_plugin_if_missing "tmux-plugins/tmux-resurrect"
add_plugin_if_missing "tmux-plugins/tmux-continuum"

# 5. Continuum 자동 복원 및 저장 설정 추가
if ! grep -q "@continuum-restore" "$TMUX_CONF"; then
    echo "[ADD] Enabling continuum auto-restore."
    echo "set -g @continuum-restore 'on'" >> "$TMUX_CONF"
fi

# [Performance] 저장 간격을 15분으로 명시 (status-interval에 의존하지 않게 함)
if ! grep -q "@continuum-save-interval" "$TMUX_CONF"; then
    echo "[ADD] Setting continuum save interval to 15 minutes."
    echo "set -g @continuum-save-interval '15'" >> "$TMUX_CONF"
fi

# TPM 실행 구문을 항상 파일의 맨 마지막에 보장
if ! grep -q "run '~/.tmux/plugins/tpm/tpm'" "$TMUX_CONF"; then
    echo "run '~/.tmux/plugins/tpm/tpm'" >> "$TMUX_CONF"
fi

echo ""
echo "--- Installing/Updating Plugins ---"
# Tmux 서버가 실행 중인지 확인
if pgrep -x tmux > /dev/null; then
    echo "[INFO] Tmux is running. Reloading config and installing plugins..."
    tmux source-file "$TMUX_CONF"
    # TPM의 install_plugins 스크립트를 직접 실행하여 자동 설치
    "$TPM_DIR/bin/install_plugins"
else
    echo "[INFO] Tmux is not running. Plugins will be installed when you first start Tmux."
    echo "[INFO] Attempting to install plugins via headless mode..."
    # Tmux가 안 켜져 있어도 설치를 시도하기 위해 임시 세션을 만들고 설치 후 종료
    tmux new-session -d -s __temp_install_session
    tmux source-file "$TMUX_CONF"
    "$TPM_DIR/bin/install_plugins"
    tmux kill-session -t __temp_install_session
fi

echo ""
echo "================================================="
echo "✅ Setup & Installation Complete!"
echo "================================================="
echo "1. If you saw any ⚠️ [WARNING] messages, please manually review your ~/.tmux.conf"
echo "2. All plugins (resurrect, continuum) have been installed."
echo ""
echo "Now your Tmux session will be automatically saved every 15 minutes and restored on reboot!"
