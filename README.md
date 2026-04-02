# Gemini CLI Wrapper (gcw)

Gemini CLI를 브라우저 및 모바일 환경에서 편리하게 사용할 수 있도록 도와주는 **Tmux 기반 웹 인터페이스(WebUI) 래퍼**입니다. 터미널의 강력함과 웹의 편의성을 결합하여 어디서든 중단 없는 개발 환경을 제공합니다.

## ✨ 주요 기능

- **지속성 있는 세션**: Tmux를 기반으로 동작하여 브라우저를 닫거나 네트워크가 끊겨도 작업 중인 컨텍스트가 그대로 유지됩니다.
- **이미지 업로드 & 자동 참조**: 클립보드의 이미지를 웹 UI에 붙여넣기만 하면 자동으로 서버에 업로드되고, 터미널에 `@path/to/image` 형태로 경로가 즉시 삽입됩니다.
- **강력한 파일 뷰어**: 텍스트, 마크다운(분할 뷰 및 동기식 스크롤), 이미지 파일을 실시간으로 확인할 수 있는 전용 뷰어를 제공합니다.
- **모바일 최적화**: 스마트폰에서도 터미널 조작과 파일 탐색이 가능하도록 전용 모바일 레이아웃과 가상 키보드를 지원합니다.
- **AI 에이전트 프랙티스**: `.agent/` 디렉토리를 통해 AI 에이전트와 협업할 때 유용한 규칙(Rules)과 모범 사례를 공유합니다.

<img width="819" height="391" alt="image" src="https://github.com/user-attachments/assets/91d1d38d-d974-4d7d-9000-19655a937885" />



## 🚀 시작하기

### 1. 선행 조건 (Prerequisites)

이 프로젝트를 실행하기 위해 다음 도구들이 설치되어 있어야 합니다.

- [Node.js](https://nodejs.org/) (v18 이상 권장)
- [Tmux](https://github.com/tmux/tmux) (터미널 세션 관리)
- [Gemini CLI](https://ai.google.dev/gemini-api/docs/gemini-cli) (`npm install -g @google/gemini-cli`)

### 2. 설치 (Installation)

```bash
git clone https://github.com/your-username/public-gemini-cli-wrapper.git
cd public-gemini-cli-wrapper
npm install
```

### 3. Tmux 환경 설정 (One-time Setup)

웹 UI와 Tmux 간의 원활한 연동(클립보드, 색상 등)을 위해 다음 스크립트를 실행하여 설정을 최적화합니다. (기존 `~/.tmux.conf`는 백업됩니다.)

```bash
./setup-tmux.sh
```

### 4. 서버 실행 (Run)

```bash
# 기본 5001 포트로 실행
./run.sh
```

이제 브라우저에서 `http://localhost:5001`에 접속하여 Gemini CLI를 웹에서 바로 사용해 보세요!

---

## 📂 프로젝트 구조

- `src/`: 세션 관리 및 API 서버 로직 (Node.js)
- `public/`: 웹 UI 자산 (JS Core, Svelte 컴포넌트, CSS)
- `docs/`: 상세 사용자 가이드 및 도움말
- `.agent/`: AI 에이전트 협업을 위한 핵심 강령 및 프로젝트 규칙

## 🤝 기여하기 (Contributing)

이 프로젝트는 실험적인 기능을 다수 포함하고 있습니다. 버그 제보나 기능 제안은 Issue 또는 Pull Request를 통해 언제든 환영합니다.

## 📄 라이선스 (License)

MIT License
