#!/bin/bash
# Ubuntu용 Docker 이미지 빌드 스크립트

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

echo "================================================="
echo "  Gemini CLI Wrapper - Docker Image Build"
echo "================================================="

cd "$PROJECT_ROOT" || exit 1

# 1. 기존 컨테이너가 있다면 중지 및 삭제 (선택적)
if docker ps -a --format '{{.Names}}' | grep -Eq "^gcw-app\$"; then
    echo "Stopping and removing existing 'gcw-app' container..."
    docker stop gcw-app >/dev/null 2>&1
    docker rm gcw-app >/dev/null 2>&1
fi

echo "Building Docker image..."
# .dockerignore가 현재 위치에 있으므로 그대로 빌드 가능
docker build -t gemini-cli-wrapper:latest .

echo "================================================="
echo "  Build completed."
echo "  Run './run-docker.sh' to start."
echo "================================================="
