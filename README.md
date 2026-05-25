# Gemini CLI Wrapper (gcw)

Gemini CLI를 브라우저 및 모바일 환경에서 편리하게 사용할 수 있도록 도와주는 Tmux 기반 웹 래퍼 프로젝트입니다.

## 📦 설치 가이드 (Installation)

이 프로젝트는 Node.js와 Tmux를 기반으로 동작하며, 웹 기반 터미널 구현을 위해 `node-pty` 네이티브 모듈을 사용합니다.

### 1. 시스템 요구사항 (Prerequisites)
- **Node.js**: v18 이상 권장
- **Tmux**: 시스템에 반드시 설치되어 있어야 합니다. (MSYS2: `pacman -S tmux`, Ubuntu: `apt-get install tmux`, macOS: `brew install tmux`)
- **빌드 도구**: `node-pty` 모듈 컴파일을 위해 Python, Make, G++ 등 OS별 네이티브 모듈 빌드 툴체인이 필요합니다.

### 2. 패키지 설치 및 환경 초기화
메인 소스코드가 위치한 `gemini-cli-wrapper/` 디렉토리로 이동하여 NPM 모듈 의존성을 설치하고 Tmux 환경을 초기화합니다.

```bash
cd gemini-cli-wrapper

# 필수 Node.js 의존성 모듈 설치 (node-pty 포함)
npm install

# 최초 1회 Tmux 설정 및 플러그인 초기화
./setup-tmux.sh
```

---

## 🚀 운영 환경 고가용성 구성 (High Availability)

백엔드 코드 수정이나 리팩토링 중에도 세션 중단 없이 안정적으로 서비스를 이용하기 위해, 운영 환경(`prod`)에서 **프록시 전용 포트**와 **작업 전용 포트**를 분리하여 운영하는 것을 권장합니다.

### 1. 세션 분리 전략

- **운영용 프록시 (Port 5002)**:
  - 목적: 안정적인 세션 유지 및 코드 수정 영향 최소화
  - 실행: `./run.sh --port 5002`
  - 특징: 코드가 변경되어도 이 세션은 재시작하지 않으므로 작업 중인 컨텍스트가 보존됩니다.

- **작업/개발용 (Port 5001)**:
  - 목적: 최신 기능 테스트 및 실시간 백엔드 수정 적용
  - 실행: `./run.sh --port 5001`
  - 특징: 코드 수정 시 이 포트로 실행된 프로세스만 재시작하여 변경 사항을 반영합니다.

### 2. 백엔드 업데이트 워크플로우

1. 코드 수정 후, 5001 포트로 실행 중인 인스턴스만 재시작합니다.
2. 5001 세션에서 기능 및 안정성을 검증합니다.
3. 검증이 완료되면 필요한 경우에만 5002(운영용) 세션을 순차적으로 업데이트합니다.

---

## 🛠️ 주요 명령어

### 서버 실행
```bash
# 기본 실행 (Port 5001)
./run.sh

# 특정 포트로 실행 (운영용 권장)
./run.sh --port 5002
```

### Tmux 환경 초기화
```bash
# Tmux 세션 및 윈도우 스타일 초기화
./refresh-tmux.sh
```

---

## 📂 프로젝트 구조

- `src/`: 백엔드 소스 코드 (master.js, server.js 및 핸들러)
- `public/`: 프론트엔드 자산 (JS Core, CSS, HTML)
- `prod/`: 운영 환경 배포용 디렉토리
- `chat_history/`: 에이전트 작업 기록 및 설계 문서
