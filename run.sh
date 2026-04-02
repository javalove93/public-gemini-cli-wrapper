#!/bin/bash

# 스크립트가 위치한 디렉토리의 절대 경로 확보
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

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
