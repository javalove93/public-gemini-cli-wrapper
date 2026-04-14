FROM node:22-bookworm

# 1. 시스템 패키지 설치 및 로케일 설정
RUN apt-get update && apt-get install -y \
    tmux \
    git \
    bash \
    curl \
    build-essential \
    python3 \
    gosu \
    vim \
    net-tools \
    locales \
    fonts-nanum-coding \
    && rm -rf /var/lib/apt/lists/*

# 로케일 생성 및 설정
RUN sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && \
    locale-gen
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# 2. 작업 디렉토리 및 사용자 설정
RUN groupadd -r gcwgroup && useradd -r -g gcwgroup -m -d /app/home gcwuser
WORKDIR /app/gemini-cli-wrapper

# 3. 패키지 복사 및 의존성 설치 (캐시 최적화)
COPY package*.json ./
RUN npm install

# 4. 소스 코드 복사
COPY . .

# 5. Tmux 환경 세팅
RUN chmod +x setup-tmux.sh run.sh

# 6. 환경 변수 및 포트 설정
ENV PORT=5001
ENV TERM=tmux-256color
ENV HOME=/app/home
ENV SHELL=/bin/bash
ENV PATH="/usr/local/bin:$PATH"
EXPOSE 5001

# 7. 전역 실행 스크립트(g, gemini) 설정
RUN echo '#!/bin/bash\nnpx -y @google/gemini-cli@latest "$@"' > /usr/local/bin/g && \
    echo '#!/bin/bash\nnpx -y @google/gemini-cli@latest "$@"' > /usr/local/bin/gemini && \
    chmod +x /usr/local/bin/g /usr/local/bin/gemini

# 8. 실행 엔트리포인트 (root로 시작하여 run.sh 내부에서 유저 전환)
CMD ["./run.sh", "--port", "5001"]
