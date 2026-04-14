#!/bin/bash
# Ubuntu용 Docker 실행 스크립트

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
HOST_DIR=${HOST_DIR:-"/opt/jerrydisk/git"}

# 포트 및 호스트 데이터 경로 설정
APP_PORT=${PORT:-5001}
# HOST_DATA_DIR: .gemini와 .npm 데이터가 영구 저장될 호스트 경로
HOST_DATA_DIR=${HOST_DATA_DIR:-"/tmp/gcw-docker"}

# 마운트할 디렉토리 준비
mkdir -p "$HOST_DATA_DIR/.gemini" "$HOST_DATA_DIR/.npm"


DEBUG_MODE=false
if [[ "$1" == "--debug" ]]; then
    DEBUG_MODE=true
    echo "================================================="
    echo "  Gemini CLI Wrapper - Docker Run (DEBUG MODE)"
    echo "================================================="
else
    echo "================================================="
    echo "  Gemini CLI Wrapper - Docker Run"
    echo "================================================="
fi

cd "$PROJECT_ROOT" || exit 1

if [ "$DEBUG_MODE" = true ]; then
    # 디버그 모드: 기존 컨테이너가 있으면 삭제 후 새로 블로킹 모드로 실행
    if docker ps -a --format '{{.Names}}' | grep -Eq "^gcw-app\$"; then
        echo "Removing existing 'gcw-app' container for debug run..."
        docker stop gcw-app >/dev/null 2>&1
        docker rm gcw-app >/dev/null 2>&1
    fi

    echo "Running Docker container in foreground mode..."
    echo "Master Port: ${APP_PORT}"
    echo "Press Ctrl+C to stop the container."
    echo "-------------------------------------------------"

    # 상위 git 루트를 포함할 수 있도록 프로젝트 루트의 상위(../../)까지 마운트 시도
    # (사용자 환경에 맞춰 최적화된 마운트)
    docker run -it --rm \
      -p ${APP_PORT}:5001 \
      -e PORT=5001 \
      -e GEMINI_API_KEY="$GEMINI_API_KEY" \
      -v "$PROJECT_ROOT/.gcw.conf.docker:/app/gemini-cli-wrapper/.gcw.conf" \
      -v "${HOST_DIR:-$(dirname "$PROJECT_ROOT")}:/host" \
      -v "$HOST_DATA_DIR/.gemini:/app/home/.gemini" \
      -v "$HOST_DATA_DIR/.npm:/app/home/.npm" \
      --name gcw-app \
      gemini-cli-wrapper:latest
    else
    # 일반 모드: 기존 컨테이너가 있다면 시작하거나 재시작
    if docker ps -a --format '{{.Names}}' | grep -Eq "^gcw-app\$"; then
        echo "Container 'gcw-app' already exists."
        echo "Starting existing container in background..."
        docker start gcw-app >/dev/null 2>&1
    else
        echo "Running new Docker container in background..."
        echo "Master Port: ${APP_PORT}"

        docker run -d \
          -p ${APP_PORT}:5001 \
          -e PORT=5001 \
          -e GEMINI_API_KEY="$GEMINI_API_KEY" \
          -v "$PROJECT_ROOT/.gcw.conf.docker:/app/gemini-cli-wrapper/.gcw.conf" \
          -v "${HOST_DIR:-$(dirname "$PROJECT_ROOT")}:/host" \
          -v "$HOST_DATA_DIR/.gemini:/app/home/.gemini" \
          -v "$HOST_DATA_DIR/.npm:/app/home/.npm" \
          --name gcw-app \
          --restart unless-stopped \
          gemini-cli-wrapper:latest >/dev/null 2>&1
    fi


    echo ""
    echo "================================================="
    echo "  Container 'gcw-app' is now running!"
    echo "  Access URL: http://localhost:${APP_PORT}"
    echo "================================================="
fi
