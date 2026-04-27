# Telegram GCW (Gemini CLI Wrapper) Bot

![Architecture Concept](https://img.shields.io/badge/Architecture-File%20Based%20Async%20Messaging-blue)
![Security](https://img.shields.io/badge/Security-Private%20Only-red)

Telegram 메신저를 통해 모바일 환경에서 데스크톱의 강력한 **Gemini CLI**를 원격으로 제어하고 상호작용하기 위한 개인용 비공개 봇 시스템입니다.

## 🌟 핵심 특징 및 아키텍처

본 프로젝트의 가장 큰 특징은 복잡한 API나 불안정한 프로세스 제어 대신, **파일 시스템 기반의 비동기 통신(Inbox Strategy)**을 채택했다는 점입니다.

1. **파일 기반 통신 구조**: 봇 데몬과 Gemini CLI는 서로 직접 통신하지 않고, `inbox/request.md`와 `inbox/response.md` 파일을 매개체로 소통합니다.
2. **익스텐션 재사용 (`agent-communicator-ext`)**: 두 AI 에이전트 간의 통신을 위해 개발된 `agent-communicator-ext`의 `agent_wait.sh` 로직을 그대로 텔레그램 봇 통신에 재활용하여 안정성을 극대화했습니다.
3. **Workspace 분리**: Telegram 명령어(`/workspaces`, `/switch`)를 통해 여러 디렉토리(프로젝트)를 넘나들며 컨텍스트를 분리하여 작업할 수 있습니다.
4. **철저한 비공개 보안**: `.env`에 등록된 `ALLOWED_CHAT_ID` 사용자 외에는 봇이 모든 요청을 거부합니다.

> 📚 **상세 아키텍처 문서** (프로젝트 내 마크다운 파일 참조)
> - `260427-01-telegram-gcw-bot.md`: 핵심 아키텍처 및 통신 원리 분석
> - `260427-02-telegram-gcw-bot-diagrams.md`: 시스템 아키텍처 및 시퀀스 다이어그램
> - `260427-03-telegram-gcw-bot-extension-reuse.md`: 익스텐션 재사용성 분석

---

## 🚀 실행 방법

### 1. 사전 준비 (Prerequisites)
- [Gemini CLI](https://github.com/google/gemini-cli) 가 전역으로 설치되어 있어야 합니다. (`npm install -g @google/gemini-cli`)
- `uv` 패키지 매니저가 필요합니다.
- `agent-communicator-ext` 익스텐션이 시스템에 설치되어 있어야 합니다.

### 2. 환경 설정
설정 파일 샘플들을 복사하여 실제 설정 파일을 만듭니다.

```bash
# 1. 텔레그램 API 토큰 및 권한 설정
cp env.sample .env
vi .env
# TELEGRAM_HTTP_API_KEY 와 ALLOWED_CHAT_ID(자신의 텔레그램 ID) 필수 입력

# 2. 작업 공간(Workspaces) 경로 설정
cp telbot.conf.sample telbot.conf
vi telbot.conf
# 봇에서 관리할 디렉토리의 별칭과 절대경로 입력
```

### 3. 패키지 설치
`uv`를 활용하여 의존성을 설치하고 가상환경을 구성합니다.

```bash
uv sync
```

### 4. 봇 실행
```bash
# foreground 실행
uv run src/bot.py

# 백그라운드 서비스로 실행하려면 tmux, screen, 또는 systemd 활용을 권장합니다.
```

---

## 📱 Telegram 명령어

봇과 대화 시 아래 명령어들을 사용할 수 있습니다.

- `/start`: 봇 초기화 및 연결 확인
- `/directory`: `telbot.conf`에 설정된 작업 공간(프로젝트) 목록 확인
- `/files`: 현재 작업 공간의 파일 목록 보기
- `/reset`: 현재 작업 공간의 진행 중인 작업을 강제 취소하고 세션을 초기화
- (일반 텍스트/이미지/음성): 현재 활성화된 작업 공간의 Gemini CLI로 전달되어 처리됨

---
⚠️ **경고**: 이 봇은 강력한 로컬 쉘 실행 권한을 가진 Gemini CLI와 연결되므로, 반드시 `ALLOWED_CHAT_ID`를 본인으로 제한하고 비공개로 운영해야 합니다.
