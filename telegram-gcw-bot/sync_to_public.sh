#!/bin/bash

# 1. 경로 설정
SOURCE_DIR="/opt/jerrydisk/git/personal/202603f-Fitness/telegram-gcw-bot"
DEST_BASE="$HOME/git/202603-gemini-cli-wrapper/public-gemini-cli-wrapper"
DEST_DIR="$DEST_BASE/telegram-gcw-bot"

echo "🚀 공개 저장소용 디렉토리로 소스 복사 시작 (정밀 필터링 적용)..."

# 2. 대상 디렉토리 생성
mkdir -p "$DEST_DIR"

# 3. rsync를 이용한 필터링 복사
rsync -avz --progress \
    --exclude '.git/' \
    --exclude '.env' \
    --exclude '.venv/' \
    --exclude '__pycache__/' \
    --exclude '.python-version' \
    --exclude 'chat_history/' \
    --exclude 'message_history/' \
    --exclude 'screenshots/' \
    --exclude '.superpowers/' \
    --exclude 'inbox/files/*' \
    --exclude 'uv.lock' \
    --exclude 'gemini-cli-pids.txt' \
    --exclude '260426-superpowers-guide.md' \
    --exclude 'docs/' \
    "$SOURCE_DIR/" "$DEST_DIR/"

echo "✅ 복사가 완료되었습니다."
echo "📍 대상 위치: $DEST_DIR"
echo "--------------------------------------------------"
echo "💡 다음 작업 추천:"
echo "1. cd $DEST_DIR"
echo "2. git init"
echo "3. 하드코딩된 비밀정보가 없는지 다시 한번 grep으로 확인"
