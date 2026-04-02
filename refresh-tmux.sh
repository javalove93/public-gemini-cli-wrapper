#!/bin/bash

echo "================================================="
echo "  Gemini CLI WebUI - Tmux Session Deep Refresh Tool"
echo "================================================="

# Check if tmux is running
if ! tmux ls > /dev/null 2>&1; then
    echo "[INFO] No active Tmux sessions found. Nothing to refresh."
    exit 0
fi

echo "[INFO] Reloading global tmux configuration (~/.tmux.conf)..."
tmux source-file ~/.tmux.conf 2>/dev/null

echo "[INFO] Unsetting styles and applying global word-separators for all active sessions..."
for session in $(tmux ls -F '#{session_name}' 2>/dev/null); do
    echo "  -> Deep refreshing session: $session"
    
    # Apply global word-separators to ensure consistent double-click selection
    tmux set-option -g -t "$session" word-separators " " 2>/dev/null

    # 1. Unset Session-level window styles
    tmux set-window-option -u -t "$session" window-style 2>/dev/null
    tmux set-window-option -u -t "$session" window-active-style 2>/dev/null

    # 2. Unset Window-level styles (some old scripts might have attached styles directly to windows)
    tmux list-windows -t "$session" -F '#{window_id}' 2>/dev/null | while read window_id; do
        tmux set-window-option -u -t "$window_id" window-style 2>/dev/null
        tmux set-window-option -u -t "$window_id" window-active-style 2>/dev/null
    done

    # 3. Unset Pane-level specific styles (some old scripts used select-pane -P)
    tmux list-panes -s -t "$session" -F '#{pane_id}' 2>/dev/null | while read pane_id; do
        # Note: Pane-specific colors cannot be strictly 'unset' (-u), 
        # so we force them to 'default,default' to inherit from the window level.
        tmux select-pane -t "$pane_id" -P 'bg=default,fg=default' 2>/dev/null
        tmux set-option -u -p -t "$pane_id" window-style 2>/dev/null
        tmux set-option -u -p -t "$pane_id" window-active-style 2>/dev/null
    done
done

echo "================================================="
echo "✅ All existing Tmux sessions have been DEEPLY refreshed!"
echo "   They will now inherit the global styles from ~/.tmux.conf."
echo "================================================="
