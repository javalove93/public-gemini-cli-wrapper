# 필수 핵심 행동 강령 (CRITICAL CORE DIRECTIVES)

**에이전트는 어떠한 상황에서도 아래 4가지 규칙을 절대 위반해서는 안 됩니다. 이 규칙은 다른 모든 로컬 규칙 및 상황적 판단에 최우선합니다.**

1. **[No Silent Mutations]** 파일 쓰기/수정(`replace`, `write_file`), 쉘 명령어 실행(`run_shell_command`) 등 **시스템 상태를 변경하는 모든 도구 호출 직전에는 반드시 한국어로 목적과 이유를 먼저 설명해야 합니다.**
2. **[No Wait After Explain]** 설명을 마쳤다면 사용자의 대답을 기다리지 말고 **곧바로 도구를 호출**하여 CLI의 보안 팝업(`Apply this change?`)이 뜨도록 유도하십시오.
3. **[No Guessing]** 모호한 요구사항이나 불확실한 에러 원인은 임의로 추측하여 수정하지 말고, **반드시 사용자에게 먼저 질문(#QQ)하여 확인**받으십시오.
4. **[No Runtime Management]** 백엔드 서버 재시작, 프로세스 종료(`kill`) 등 **런타임 제어 명령어는 어떠한 경우에도 에이전트가 직접 실행하지 마십시오.** 변경 사항 적용을 위한 서버 재시작 등은 전적으로 사용자가 수동으로 진행하므로, 에이전트는 "서버 재시작이 필요함"을 텍스트로 안내만 해야 합니다.
5. **[Graph-Based Analysis & Safe Refactoring]** 소스 코드 분석 및 리팩토링 시 반드시 **`mcp_code-review-graph` 도구**를 사용하고, 세부 사항은 **`.agent/rules/refactoring-rules.md`**를 최우선으로 준수하십시오.
   - **[PRE-DELETE CHECK]** 요소 삭제/이동 전 호출부(Callers) 파악 필수.
6. **[Atomic Workflow & Self-Verification]** 복잡한 작업은 단계를 쪼개어 진행하며, 수정 후 반드시 **`npm run lint`로 자가 검증**하십시오. 상세 절차는 **`.agent/rules/refactoring-rules.md`**의 체크포인트 프로토콜을 따릅니다.
   - **[LINT LOGGING]** 모든 수정 후 린트 결과를 `lint_history/`에 기록하십시오.
7. **[MCP Graph Root Fix]** `mcp_code-review-graph` 도구 사용 시 `repo_root`는 반드시 `gemini-cli-wrapper/`로 설정하십시오.
8. **[Source Modification Authority]** 메인 소스 코드는 `gemini-cli-wrapper/` 디렉토리에 있으며, 모든 수정은 이 디렉토리 내부에서만 수행해야 합니다.
9. **[Refactoring Rules Priority]** 대규모 코드 변경이나 아키텍처 수정 시에는 **`.agent/rules/refactoring-rules.md`**의 모든 조항이 본 강령과 결합되어 최우선 순위를 가집니다.
