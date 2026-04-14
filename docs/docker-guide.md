# Gemini CLI Wrapper - Docker 사용 가이드

이 문서는 Gemini CLI Wrapper를 Docker 컨테이너 환경에서 실행하는 방법에 대해 설명합니다.

## 1. 개요 및 사용 목적
Gemini CLI Wrapper는 기본적으로 호스트 환경의 **Tmux**에 의존합니다. 하지만 **Windows** 환경처럼 Tmux 설치 및 운영이 까다로운 운영체제에서도 일관된 사용자 경험을 제공하기 위해 Docker 환경을 지원합니다.

> ⚠️ **주의**: 본 Docker 구성은 Windows 등 Tmux 환경을 직접 구축하기 어려운 사용자를 위한 대안으로 제공됩니다. 리눅스 환경이라면 호스트에서 직접 실행하는 것이 더 빠를 수 있습니다.

## 2. 사전 준비 사항
*   Docker가 설치되어 있어야 합니다.
*   호스트 쉘에 `GEMINI_API_KEY` 환경 변수가 설정되어 있어야 합니다.

## 3. 설정 및 실행 방법

### A. 설정 파일 준비 (`.gcw.conf.docker`)
프로젝트 루트에 도커 전용 설정 파일인 `.gcw.conf.docker`를 생성합니다. 
*   **경로 설정**: 컨테이너 내부는 호스트의 작업 디렉토리를 `/host`에 마운트합니다. 따라서 프로젝트 경로는 `/host/...`로 작성해야 합니다.
*   **예시**:
    ```bash
    PROJECT_MY_APP=/host/git/my-project my-session
    ```

### B. 빌드 (Image Build)
소스 코드를 반영하여 이미지를 빌드합니다.
```bash
cd gemini-cli-wrapper
./build-docker.sh
```

### C. 실행 (Run)
다양한 옵션과 함께 컨테이너를 구동합니다.
```bash
# 기본 실행 (데몬 모드, 5001 포트)
./run-docker.sh

# 워크스페이스 경로 및 포트 지정 실행
# HOST_DIR: 호스트의 실제 프로젝트들이 위치한 최상위 경로
HOST_DIR=/home/jerryj/git PORT=8080 ./run-docker.sh

# 디버그 모드 (실시간 로그 확인 및 종료 시 자동 삭제)
./run-docker.sh --debug
```

## 4. 상세 메커니즘

### 환경 변수 전달
호스트의 다음 환경 변수들이 컨테이너 내부로 주입됩니다.
*   `GEMINI_API_KEY`: API 호출 인증용
*   `PORT`: 호스트에서 접속할 포트 번호 (기본값 5001)
*   `HOST_DIR`: 컨테이너 내부 `/host`와 매핑될 호스트의 프로젝트 루트 디렉토리입니다. 사용자의 환경에 맞춰 반드시 지정해 주어야 합니다.

### 볼륨 마운트 및 영속화
*   **설정 파일**: 호스트의 `.gcw.conf.docker` -> 컨테이너의 `/app/gemini-cli-wrapper/.gcw.conf`
*   **데이터 영속화**: `HOST_GEMINI` 변수로 지정된 경로(기본 `/tmp`)에 `.gemini` 및 `.npm` 캐시가 저장됩니다.
*   **워크스페이스**: `HOST_DIR` 환경 변수로 지정된 호스트의 디렉토리가 컨테이너 내부의 `/host` 경로로 마운트됩니다.

### 사용자 및 권한
*   컨테이너는 내부적으로 `gcwuser` 계정으로 실행됩니다.
*   실행 시점에 호스트의 파일 소유자 ID를 감지하여 런타임에 `gcwuser`의 UID/GID를 자동으로 동기화하므로, 파일 권한 문제가 발생하지 않습니다.

## 5. 전역 도구 사용
컨테이너 터미널 내에서 다음 단축 명령어를 즉시 사용할 수 있습니다.
*   `g`: 최신 버전의 Gemini CLI 실행
*   `gemini`: 최신 버전의 Gemini CLI 실행 (전체 명령어)

이 도구들은 시스템 전역 바이너리로 설치되어 있어 어떤 쉘에서도 즉시 호출 가능합니다.
