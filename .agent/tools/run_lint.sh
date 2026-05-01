#!/bin/bash
# 린트 검증 후 결과를 파일로 자동 저장하는 스크립트

TIMESTAMP=$(date +"%y%m%d-%H%M")
LOG_FILE="../lint_history/${TIMESTAMP}-lint-check.log"

cd gemini-cli-wrapper || exit 1
npm run lint > "${LOG_FILE}" 2>&1 || true

echo "Lint completed. Log saved to: ${LOG_FILE}"
