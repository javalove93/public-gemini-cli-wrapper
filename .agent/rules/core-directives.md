# 필수 핵심 행동 강령 (CRITICAL CORE DIRECTIVES)

**에이전트는 어떠한 상황에서도 아래 4가지 규칙을 절대 위반해서는 안 됩니다. 이 규칙은 다른 모든 로컬 규칙 및 상황적 판단에 최우선합니다.**

1. **[No Silent Mutations]** 파일 쓰기/수정(`replace`, `write_file`), 쉘 명령어 실행(`run_shell_command`) 등 **시스템 상태를 변경하는 모든 도구 호출 직전에는 반드시 한국어로 목적과 이유를 먼저 설명해야 합니다.**
2. **[No Wait After Explain]** 설명을 마쳤다면 사용자의 대답을 기다리지 말고 **곧바로 도구를 호출**하여 CLI의 보안 팝업(`Apply this change?`)이 뜨도록 유도하십시오.
3. **[No Guessing]** 모호한 요구사항이나 불확실한 에러 원인은 임의로 추측하여 수정하지 말고, **반드시 사용자에게 먼저 질문(#QQ)하여 확인**받으십시오.
4. **[No Runtime Management]** 백엔드 서버 재시작, 프로세스 종료(`kill`) 등 **런타임 제어 명령어는 어떠한 경우에도 에이전트가 직접 실행하지 마십시오.** 변경 사항 적용을 위한 서버 재시작 등은 전적으로 사용자가 수동으로 진행하므로, 에이전트는 "서버 재시작이 필요함"을 텍스트로 안내만 해야 합니다.
5. **[Graph-Based Analysis & Safe Refactoring]** 소스 코드 분석 및 리팩토링 시 반드시 **`mcp_code-review-graph` 도구**를 사용하고, 세부 사항은 **`.agent/rules/refactoring-rules.md`**를 최우선으로 준수하십시오.
   - **[PRE-DELETE CHECK]** 요소 삭제/이동 전 호출부(Callers) 파악 필수.
6. **[Atomic Workflow & Self-Verification]** 복잡한 작업은 단계를 쪼개어 진행하며, 수정 후 반드시 **`.agent/tools/run_lint.sh` 스크립트로 자가 검증**하십시오. 상세 절차는 **`.agent/rules/refactoring-rules.md`**의 체크포인트 프로토콜을 따릅니다.
   - **[LINT LOGGING]** 모든 수정 후 위 스크립트를 통해 린트 결과를 `lint_history/`에 자동 기록하십시오.
7. **[MCP Graph Root Fix]** `mcp_code-review-graph` 도구 사용 시 `repo_root`는 반드시 `gemini-cli-wrapper/`로 설정하십시오.
8. **[Source Modification Authority]** 메인 소스 코드는 `gemini-cli-wrapper/` 디렉토리에 있으며, 모든 수정은 이 디렉토리 내부에서만 수행해야 합니다.
9. **[Refactoring Rules Priority]** 대규모 코드 변경이나 아키텍처 수정 시에는 **`.agent/rules/refactoring-rules.md`**의 모든 조항이 본 강령과 결합되어 최우선 순위를 가집니다.
10. **[Project Directory & `.gcw.conf` Architecture]**
    이 프로젝트는 4개의 주요 디렉토리로 나뉘며, 각 디렉토리는 목적에 따라 완전히 독립적인 `.gcw.conf` 파일을 가집니다. 절대 덮어쓰거나 하나로 통일하지 마십시오.
    - **Root (`/opt/jerrydisk/git/202603-gemini-cli-wrapper`)**: GCW 마스터 개발/테스트용 (글로벌 라우팅).
    - **Src (`gemini-cli-wrapper/`)**: 실제 개발 런타임. (`GCW_INSTANCE=DEV`, 다양한 작업용 프로젝트 라우팅 포함)
    - **Prod (`prod/`)**: 현재 운영 중인 프로덕션 런타임. (`GCW_INSTANCE=PROD`, 안정적인 운영을 위해 격리된 설정, 포트, 세밀한 단축키 설정 포함)
    - **Public (`public-gemini-cli-wrapper/`)**: GitHub 오픈소스 배포용. (민감 정보 제외, 기본 스켈레톤 설정 유지)
11. **[No Over-engineering & No Jumping Ahead] (절대 오버하지 말 것)**
    사용자가 명시적으로 지시한 작업의 범위를 넘어 **임의로 앞서 나가거나(Jumping ahead) 묻지 않은 과도한 리팩토링(Over-engineering)을 진행하지 마십시오.** 
    버그 수정은 해당 버그만 타겟팅하며, 기능 추가는 요청된 기능만 최소한으로 구현합니다. 부가적인 개선 아이디어가 있다면 코드를 수정하기 전에 **반드시 제안만 하고 사용자의 승인을 대기**해야 합니다.

12. **[Troubleshooting Protocol (#TR)] (트러블슈팅 및 버그 수정 강령)**
    모든 디버깅 및 버그 수정(#TR) 작업 시에는 다음의 상향식(Bottom-up) 원칙을 예외 없이 준수하십시오:
    - **Bottom-up 접근**: 절대로 백엔드 로직이나 거시적 아키텍처(Top-down)부터 의심하지 마십시오. 프론트엔드의 사소한 이벤트(클릭, 변수 누락 등)와 브라우저 네트워크 탭(API 호출 여부 및 URL 확인) 같은 **가장 작은 클라이언트 단위부터 검증**을 시작해야 합니다.
    - **증거 기반(Evidence-First)**: 코드를 수정하기 전, 콘솔 디버그 로그(`[DEBUG]`)나 터미널 OS 명령어(`ls -l /proc/...`, `curl` 등)를 통해 버그의 진원지를 팩트로 먼저 입증해야 합니다.
    - **피드백 문서 숙지**: 본 원칙을 어겨 발생했던 치명적인 디버깅 실패 사례와 단계별 검증 절차는 **`review-process/260501-2120-FEEDBACK-bottom-up-debugging-strategy.md`** 문서에 명시되어 있습니다. #TR 작업을 시작하기 전에 반드시 해당 문서를 먼저 읽고 접근법을 엄격히 따르십시오.
