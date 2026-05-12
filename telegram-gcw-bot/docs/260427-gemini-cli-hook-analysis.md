# Gemini CLI Hooking 및 원격 승인 연동 분석 보고서

**날짜:** 2026년 4월 27일  
**작성자:** Gemini CLI Worker Agent

---

## 1. 개요 (Overview)
본 보고서는 Gemini CLI의 **후킹 시스템(Hooking System)**을 활용하여 사용자가 터미널 앞에 없더라도 메신저(예: 텔레그램)를 통해 도구 실행 승인 요청을 수신하고 제어할 수 있는 기술적 타당성과 구현 전략을 상세히 분석합니다.

---

## 2. Gemini CLI 후크 시스템 (Hook System)
Gemini CLI는 특정 이벤트가 발생할 때 사용자 정의 스크립트를 실행할 수 있는 강력한 후킹 메커니즘을 제공합니다.

### 2.1 핵심 이벤트: `BeforeTool`
*   **역할:** 도구가 실행되기 직전에 호출되는 동기식(Synchronous) 후크입니다.
*   **작동 방식:**
    1.  AI가 도구(예: `run_shell_command`) 실행을 결정합니다.
    2.  CLI가 등록된 `BeforeTool` 후크 스크립트를 실행합니다.
    3.  스크립트는 `stdin`으로 도구의 인자(JSON 형식)를 전달받습니다.
    4.  스크립트의 `stdout` 출력 결과에 따라 도구 실행 여부가 결정됩니다.
*   **결정값 (Decision):**
    *   `allow`: 도구 실행을 즉시 승인합니다.
    *   `deny`: 도구 실행을 거부하고 AI에게 거부 사유를 전달합니다.
    *   (기본값): 후크가 아무것도 반환하지 않으면 정책(Policy) 엔진의 결정에 따릅니다.

---

## 3. 설정 범위 및 우선순위 (Scope and Priority)
후크는 설정 파일의 위치에 따라 적용 범위가 달라지며, 호스트 전체 또는 특정 프로젝트로 한정할 수 있습니다.

| 계층 | 범위 | 설정 파일 경로 | 비고 |
| :--- | :--- | :--- | :--- |
| **프로젝트** | 특정 디렉토리 | `./.gemini/settings.json` | 해당 폴더 내 인스턴스에만 영향 |
| **사용자** | 사용자 전역 | `~/.gemini/settings.json` | 해당 사용자의 모든 세션에 영향 |
| **시스템** | 호스트 전역 | `/etc/gemini-cli/settings.json` | 모든 사용자 및 인스턴스에 영향 |

> **Jerry를 위한 팁:** `telegram-gcw-bot` 전용 승인 로직은 프로젝트 레벨(`.gemini/settings.json`)에 구성하는 것이 가장 안전하며 다른 환경에 간섭을 주지 않습니다.

---

## 4. 텔레그램 원격 승인 연동 시나리오
현재의 봇 아키텍처와 통합하여 다음과 같은 흐름으로 구현할 수 있습니다.

### 4.1 워크플로우 (Workflow)
1.  **AI 요청:** AI가 `rm -rf`와 같은 위험한 명령어를 실행하려 함.
2.  **후크 가로채기:** `BeforeTool` 후크가 실행되어 명령어를 `inbox/approval_request.json`에 기록.
3.  **텔레그램 알림:** 텔레그램 봇(`main.py`)이 파일을 감지하여 Jerry에게 **[승인] / [거부]** 버튼이 포함된 메시지 발송.
4.  **사용자 응답:** Jerry가 텔레그램에서 [승인] 버튼을 클릭.
5.  **결정 수렴:** 봇이 `inbox/approval_response.json`에 `allow` 기록.
6.  **실행 재개:** 대기 중이던 후크 스크립트가 결과를 읽어 CLI에 `{"decision": "allow"}` 반환 -> 명령어 실행됨.

---

## 5. 코드 구현 예시 (Prototype)

### 5.1 `.gemini/settings.json` 설정
```json
{
  "hooks": [
    {
      "name": "telegram-approval",
      "event": "BeforeTool",
      "tools": ["run_shell_command"],
      "command": "python3 src/approval_hook.py"
    }
  ]
}
```

### 5.2 `src/approval_hook.py` (개념 코드)
```python
import sys
import json
import time
import os

def main():
    # 1. 도구 실행 정보 읽기 (stdin)
    tool_input = json.load(sys.stdin)
    command = tool_input.get("arguments", {}).get("command", "Unknown")
    
    # 2. 승인 요청 파일 작성 (inbox/)
    request_file = "inbox/approval_request.json"
    with open(request_file, "w") as f:
        json.dump({"command": command, "timestamp": time.time()}, f)
    
    # 3. 사용자 응답 대기 (Polling)
    response_file = "inbox/approval_response.json"
    timeout = 300 # 5분 대기
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        if os.path.exists(response_file):
            with open(response_file, "r") as f:
                res = json.load(f)
                decision = res.get("decision", "deny")
            os.remove(response_file)
            os.remove(request_file)
            
            # 4. 결과 반환 (stdout)
            print(json.dumps({"decision": decision}))
            return
        time.sleep(1)
    
    # 타임아웃 시 기본 거부
    print(json.dumps({"decision": "deny", "reason": "Approval timeout"}))

if __name__ == "__main__":
    main()
```

---

## 6. 결론 및 제언
Gemini CLI의 후킹 시스템은 프로젝트의 자율성을 해치지 않으면서도 강력한 원격 제어 기능을 제공합니다. 특히 **프로젝트 레벨의 설정**을 통해 호스트 전체에 영향을 주지 않고 안전하게 텔레그램 연동을 실험할 수 있습니다. 

다음 단계로, 실제 `settings.json`을 활성화하고 텔레그램 봇이 `inbox/`의 승인 요청 파일을 처리할 수 있도록 봇의 핸들러 코드를 확장하는 것을 추천합니다.
