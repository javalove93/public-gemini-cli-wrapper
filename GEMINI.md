# Gemini CLI Project Global Rules

**[CRITICAL MANDATE]**
이 프로젝트에서 에이전트는 사용자의 **모든 새로운 요청(Request)을 처리하기 위한 가장 첫 번째 행동으로 반드시 `.agent/rules/core-directives.md` 파일을 `read_file` 도구로 읽어야 합니다.**

이 파일을 먼저 읽지 않고서는 어떠한 분석, 파일 탐색, 코드 수정도 시작할 수 없습니다. 파일을 읽은 후에는 해당 핵심 규칙을 이번 세션 내내 최우선으로 적용하십시오. 그 외 세부 프로젝트 규칙은 `.agent/rules/rules.md`를 참고하십시오.
