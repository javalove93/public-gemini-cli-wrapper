# 필수 핵심 행동 강령 (CRITICAL CORE DIRECTIVES)

**에이전트는 어떠한 상황에서도 아래 4가지 규칙을 절대 위반해서는 안 됩니다. 이 규칙은 다른 모든 로컬 규칙 및 상황적 판단에 최우선합니다.**

1. **[No Silent Mutations]** 파일 쓰기/수정(`replace`, `write_file`), 쉘 명령어 실행(`run_shell_command`) 등 **시스템 상태를 변경하는 모든 도구 호출 직전에는 반드시 한국어로 목적과 이유를 먼저 설명해야 합니다.**
2. **[No Wait After Explain]** 설명을 마쳤다면 사용자의 대답을 기다리지 말고 **곧바로 도구를 호출**하여 CLI의 보안 팝업(`Apply this change?`)이 뜨도록 유도하십시오.
3. **[No Guessing]** 모호한 요구사항이나 불확실한 에러 원인은 임의로 추측하여 수정하지 말고, **반드시 사용자에게 먼저 질문(#QQ)하여 확인**받으십시오.
4. **[No Runtime Management]** 백엔드 서버 재시작, 프로세스 종료(`kill`) 등 **런타임 제어 명령어는 어떠한 경우에도 에이전트가 직접 실행하지 마십시오.** 변경 사항 적용을 위한 서버 재시작 등은 전적으로 사용자가 수동으로 진행하므로, 에이전트는 "서버 재시작이 필요함"을 텍스트로 안내만 해야 합니다.
5. **[Graph-Based Analysis & Safe Refactoring]** 소스 코드 분석 및 구조 파악 시 반드시 **`mcp_code-review-graph` 도구(Knowledge Graph)를 우선적으로 사용**하십시오. 단순 `grep`이나 `read_file`에 의존하기보다, `query_graph_tool`이나 `semantic_search_nodes_tool` 등을 통해 코드 간의 관계, 호출부, 의존성을 먼저 파악해야 합니다.
   - **[PRE-DELETE CHECK]** 기존 함수, 변수, 모듈을 삭제하거나 다른 곳으로 이동(리팩토링)시킬 때는, **코드를 수정하기 전에 반드시 `get_impact_radius_tool` 또는 `query_graph_tool(callers_of)`을 사용하여 해당 요소에 의존하는 '호출부(Callers)'를 파악해야 합니다.** 이를 통해 끊어지는 연결 고리(Broken References)를 찾아 함께 수정하는 계획을 세운 뒤에만 삭제/이동을 진행하여 런타임 에러를 원천 차단하십시오.
6. **[Atomic Workflow & Self-Verification]** 난이도가 높거나 복잡한 작업(Tmux 제어, 다계층 비동기 통신 등)은 한 번에 수정하지 말고 단계를 쪼개어 **PLAN 또는 IMPL 문서(`chat_history/`)를 먼저 작성**한 뒤 실행하십시오. 특히, 프론트엔드와 백엔드 간의 이벤트 통신(예: `socket.emit` -> `socket.on`)이나 상태 변화 로직을 수정하기 전에는 반드시 **`mcp_code-review-graph` 도구를 사용하여 1:1 맵핑 관계를 명확히 파악**해야 합니다. 코드 수정 시 `replace` 도구로 단편적인 줄 단위 치환을 피하고, **함수나 클래스 메서드 전체 블록을 통째로 교체**하여 구문 오류를 원천 차단하십시오.
   - **[CRITICAL]** 수정 직후에는 반드시 `cd gemini-cli-wrapper && npm run lint` 명령어를 통해 문법 무결성을 자체 검증해야 합니다. 에러(Error)가 발생하면 즉시 수정하고, 수정 전/후의 린트 결과를 **프로젝트 루트의 `lint_history/YYMMDD-HHMM-[TaskTitle].log` 파일로 저장**하여 작업 지능의 성장 기록(Audit Trail)을 투명하게 남겨야 합니다.
7. **[MCP Graph Root Fix]** `mcp_code-review-graph` 도구를 사용할 때는 반드시 **`repo_root` 매개변수를 `gemini-cli-wrapper/`로 설정**하십시오. 루트 디렉토리에는 `prod/`, `public-gemini-cli-wrapper/` 등 유사한 코드가 포함된 다른 폴더들이 있어, 경로를 명시하지 않으면 그래프 분석 시 중복 노드와 노이즈가 발생하여 정확한 분석이 불가능해집니다.
8. **[Source Modification Authority]** 이 프로젝트의 메인 소스 코드는 **`gemini-cli-wrapper/` 디렉토리에 위치**합니다. **모든 코드 분석과 수정은 반드시 이 디렉토리 내부에서만 수행**해야 합니다. `prod/` 및 `public-gemini-cli-wrapper/` 디렉토리는 메인 소스에서 파생된 배포용/공개용 결과물이므로, 특수한 지시가 없는 한 에이전트가 이 디렉토리의 파일을 직접 수정해서는 안 됩니다.
