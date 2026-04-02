# Gemini CLI & iTerm2: 멀티라인 입력 및 안전한 붙여넣기 가이드

Gemini CLI 사용 중 여러 줄의 텍스트를 입력하거나 붙여넣을 때, 명령어가 즉시 실행되지 않도록 설정하는 방법입니다.

## 1. iTerm2에서 Shift+Enter로 줄바꿈하기
iTerm2는 기본적으로 `Shift+Enter`를 일반 `Enter`와 동일하게 취급합니다. 이를 줄바꿈(Line Feed)으로 인식시키기 위해 다음 설정을 수행합니다.

1.  iTerm2 **Settings** (`Cmd + ,`) > **Profiles** 선택.
2.  사용 중인 프로필의 **Keys** 탭 클릭.
3.  하단의 **[+]** 버튼 클릭.
4.  **Keyboard Shortcut**: `Shift + Enter` 입력.
5.  **Action**: `Send Hex Code` 선택.
6.  **입력값**: `0x0a` (Line Feed의 헥사 코드) 입력 후 저장.

## 2. 붙여넣기 시 즉시 실행 방지 (Bracketed Paste)
여러 줄을 복사해서 붙여넣을 때 엔터가 연타로 입력되어 명령어가 즉시 실행되는 현상을 방지합니다.

1.  iTerm2 **Settings** > **Profiles** > **Terminal** 탭 클릭.
2.  **Emulation features** 섹션에서 **`Terminal may enable paste bracketing`** 체크.

## 3. Gemini CLI 전용 붙여넣기 기능 활용
Gemini CLI는 자체적으로 안전한 붙여넣기(Safe Paste) 기능을 내장하고 있습니다.

- **복사/붙여넣기 (`Cmd + V` 또는 `Alt + V`)**: 이 단축키를 사용하면 텍스트가 즉시 실행되지 않고 `[Pasted Text: N lines]` 블록으로 삽입됩니다.
- **내용 펼치기/접기 (`Ctrl + O`)**: 삽입된 `[Pasted Text]` 블록 위에 커서를 두고 누르면 내용을 확인하거나 수정할 수 있습니다.
- **외부 에디터 활용 (`Ctrl + X`)**: 아주 긴 코드는 이 단축키를 눌러 Vim/Nano 등 외부 에디터를 열어 편집한 뒤 저장하여 가져올 수 있습니다.

---
*작성일: 2026-03-22*
