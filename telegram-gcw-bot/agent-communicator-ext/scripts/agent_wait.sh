#!/bin/bash
# agent_wait.sh: 하트비트 기능이 포함된 시그널 감시 스크립트

TARGET_FILE=$1
COUNT=0
HEARTBEAT_INTERVAL=30 # 2초 * 30회 = 약 1분마다 출력

if [ -z "$TARGET_FILE" ]; then
    echo "오류: 감시할 시그널 파일명이 지정되지 않았습니다."
    exit 1
fi

# 상태 파일 경로 설정 (TARGET_FILE과 같은 디렉토리)
INBOX_DIR=$(dirname "$TARGET_FILE")
RUNNING_FILE="$INBOX_DIR/agent_wait_running"
SHOULD_CREATE_STATUS=true
if [ "$2" == "--no-status" ]; then
    SHOULD_CREATE_STATUS=false
fi

# 종료 시 상태 파일 자동 삭제를 위한 trap 설정
cleanup() {
    if [ "$SHOULD_CREATE_STATUS" = true ]; then
        rm -f "$RUNNING_FILE"
    fi
    # echo "[$(date '+%H:%M:%S')] === 대기 모드 종료 (상태 파일 삭제) ==="
}
trap cleanup EXIT SIGINT SIGTERM

# 실행 중임을 알리는 파일 생성
if [ "$SHOULD_CREATE_STATUS" = true ]; then
    touch "$RUNNING_FILE"
fi

echo "[$(date '+%H:%M:%S')] === $TARGET_FILE 대기 모드 진입 (하트비트 활성) ==="

while [ ! -f "$TARGET_FILE" ]; do
    sleep 2
    COUNT=$((COUNT + 1))
    
    # 주기적으로 하트비트 메시지 출력하여 세션 유지
    if [ $((COUNT % HEARTBEAT_INTERVAL)) -eq 0 ]; then
        MINUTES=$(( (COUNT * 2) / 60 ))
        echo "[$(date '+%H:%M:%S')] 여전히 대기 중... ($MINUTES분 경과)"
    fi
done

echo ""
echo ">>> [시그널 감지] $TARGET_FILE 발견!"
echo "--------------------------------------------------"
cat "$TARGET_FILE"
echo "--------------------------------------------------"

# 하네스 규칙 17조 준수: 파일 즉시 삭제
rm -f "$TARGET_FILE"
echo "시그널을 소모(Consume)했습니다. 제어권을 에이전트에게 반환합니다."
exit 0
