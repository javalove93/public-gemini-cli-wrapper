#!/bin/bash

# Gemini CLI 좀비 프로세스 청소 스크립트 (안전 모드)
# 작성일: 2026-04-26

echo "🔍 Gemini 봇 관련 프로세스 탐색 중..."

# 대상 프로세스 탐색: gemini, yolo, agent_wait 키워드가 모두 포함된 것만 타겟 (AND 조건)
PROCESS_LIST=$(ps -ef | grep "gemini" | grep "yolo" | grep "agent_wait" | grep -v "grep" | grep -v "cleanup_gemini.sh")

if [ -z "$PROCESS_LIST" ]; then
    echo "✅ 정리할 Gemini 세션이 없습니다."
else
    echo "📋 [주의] 다음 프로세스들이 종료 대상으로 발견되었습니다:"
    echo "--------------------------------------------------------------------------------"
    echo "$PROCESS_LIST"
    echo "--------------------------------------------------------------------------------"
    
    # 사용자 확인 절차 추가
    read -p "⚠️ 위 프로세스들을 모두 종료하시겠습니까? (y/N): " CONFIRM
    
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        # PID만 추출
        PIDS=$(echo "$PROCESS_LIST" | awk '{print $2}')
        
        echo "🛑 프로세스 종료 중 (SIGTERM)..."
        echo "$PIDS" | xargs -r kill 2>/dev/null
        
        sleep 1
        
        # 잔여 프로세스 확인
        STILL_ALIVE=$(echo "$PIDS" | xargs -n1 ps -p 2>/dev/null | grep -v "PID" | awk '{print $1}')
        if [ -n "$STILL_ALIVE" ]; then
            echo "⚠️  응답하지 않는 프로세스 강제 종료(SIGKILL) 중..."
            echo "$STILL_ALIVE" | xargs -r kill -9 2>/dev/null
        fi
        echo "✅ 프로세스 정리가 완료되었습니다."
    else
        echo "🚫 작업을 취소했습니다. 프로세스를 종료하지 않습니다."
    fi
fi

# 파일 정리 부분은 프로세스 종료 여부와 상관없이 안전하므로 진행 (혹은 원하시면 이 부분도 confirm 뒤로 옮길 수 있음)
echo ""
read -p "🧹 임시 로그 및 PID 파일을 삭제할까요? (y/N): " FILE_CONFIRM
if [[ "$FILE_CONFIRM" =~ ^[Yy]$ ]]; then
    rm -f gemini-*.log gemini_temp_*.log
    [ -f "gemini-cli-pids.txt" ] && rm "gemini-cli-pids.txt"
    echo "✅ 파일 정리가 완료되었습니다."
fi

echo "🚀 모든 절차가 종료되었습니다."
