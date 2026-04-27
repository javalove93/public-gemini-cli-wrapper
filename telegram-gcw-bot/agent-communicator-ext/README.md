# Agent Communicator Extension

오케스트레이터 에이전트와 백그라운드 워커 에이전트 간의 효율적인 통신(명령 전달, 시그널 대기, 결과 수집)을 지원하는 Gemini CLI 익스텐션입니다.

## 🛠 설치 방법

Gemini CLI의 익스텐션 설치는 기본적으로 전역(Global)으로 수행됩니다.

1. **익스텐션 설치**
   ```bash
   gemini extensions install ./agent-communicator-ext
   ```

2. **워크스페이스 활성화 (선택 사항)**
   특정 프로젝트에서만 사용하도록 설정하려면 다음 명령을 실행합니다.
   ```bash
   gemini extensions enable agent-communicator-ext --scope workspace
   ```

3. **CLI 재시작**
   설치 또는 활성화 상태 변경 후에는 반드시 CLI 세션을 재시작해야 반영됩니다.

## 🚀 주요 명령어 및 문법

### 1. `/agent_request <대상 에이전트 경로>` (오케스트레이터 역할)
워커 에이전트에게 명령을 전달하고 결과물을 수집합니다.
- **문법**: `/agent_request <경로>`
  - `<경로>`: 워커 에이전트가 실행 중인 디렉토리 경로 (예: `gMac3/`, `./ubuntu`)
- **주요 기능**:
  - 지정된 경로의 `inbox/request.md` 파일에 명령 작성 (이미 파일이 존재하면 실패 처리)
  - `inbox/response.md` 응답 파일이 생성될 때까지 `agent_wait.sh`를 통해 대기
  - 워커가 생성/수정한 파일들을 자동으로 읽어와 최종 보고

### 2. `/agent_wait` (워커 역할)
백그라운드에서 대기하며 오케스트레이터의 지시를 처리합니다.
- **문법**: `/agent_wait`
- **주요 기능**:
  - `agent_wait.sh` 루프를 실행하여 `inbox/request.md` 파일 감시
  - 지시사항 수행 후 `inbox/response.md` 파일 작성
  - 작업 완료 후 즉시 다시 대기 모드로 진입

## 📂 주요 구성 요소

- **`extension.toml`**: 익스텐션 메타데이터 정보
- **`commands/`**: 커스텀 명령어 정의 파일 (`.toml`)
- **`scripts/agent_wait.sh`**: 하트비트 기능이 포함된 시그널 감시 스크립트.

## 📝 참고 사항
- 모든 통신은 대상 디렉토리의 `inbox/` 폴더 내에서 이루어집니다.
- 요청 시그널: `inbox/request.md`
- 응답 시그널: `inbox/response.md`
- 보안을 위해 시그널 소모 후 해당 파일은 즉시 삭제됩니다.
