#!/bin/bash

# 1. 런타임 UID/GID 동기화 (호스트 권한과 일치)
if [ "$(id -u)" = "0" ]; then
    # 마운트된 설정 파일(.gcw.conf)의 소유자를 확인하여 호스트 UID/GID 추출
    # 파일이 없으면 기본값 1000 사용
    TARGET_UID=$(stat -c "%u" .gcw.conf 2>/dev/null || echo 1000)
    TARGET_GID=$(stat -c "%g" .gcw.conf 2>/dev/null || echo 1000)

    echo "[INFO] Syncing gcwuser UID to $TARGET_UID and GID to $TARGET_GID..."

    # gcwuser 및 그룹 ID 변경
    groupmod -g "$TARGET_GID" gcwgroup 2>/dev/null
    usermod -u "$TARGET_UID" -g "$TARGET_GID" gcwuser 2>/dev/null

    # 필수 디렉토리 소유권 변경 (이미지 내부 파일들)
    chown -R gcwuser:gcwgroup /app/home
    chown -R gcwuser:gcwgroup /app/gemini-cli-wrapper

    # gcwuser 권한으로 스크립트 재실행
    exec gosu gcwuser "$0" "$@"
    fi

    # -- 이하 gcwuser 권한으로 실행되는 영역 --

    # 스크립트가 위치한 디렉토리의 절대 경로 확보
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

    # Tmux 초기 환경 구성 (컨테이너 런타임에 gcwuser 권한으로 실행)
    if [ ! -f "$HOME/.tmux.conf" ]; then
    echo "Setting up Tmux environment for user $(whoami)..."
    "$SCRIPT_DIR/setup-tmux.sh"
    fi

    PORT=5001
# --port 인자가 있으면 해당 포트 사용
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# 특정 마스터 포트에 속한 고아(Zombie) 프로세스 일괄 정리
echo "Cleaning up orphaned Node.js servers for master port $PORT..."

# 1. GCW_MASTER_PORT 환경변수가 일치하는 server.js 종료
pgrep -f "node.*src/server.js" | while read pid; do
    if grep -q -z "GCW_MASTER_PORT=${PORT}" /proc/$pid/environ 2>/dev/null; then
        echo "Killing server.js (PID: $pid) attached to master port $PORT"
        kill -9 $pid || true
    fi
done

# 2. 해당 포트를 사용하는 master.js 종료
pkill -f "node src/master.js.*--port $PORT" || true

# 의존성 설치 확인
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Installing dependencies in $SCRIPT_DIR..."
    (cd "$SCRIPT_DIR" && npm install)
fi

echo "Starting Gemini CLI Multi-Project Master on port $PORT..."
cd "$SCRIPT_DIR"
node src/master.js --port "$PORT"
