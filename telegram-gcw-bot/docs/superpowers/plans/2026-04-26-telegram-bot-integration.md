# Telegram Bot Integration (File-based) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing Telegram bot to use a robust file-based communication channel (`inbox/in.md` & `inbox/out.md`) via Gemini CLI's `/agent_wait` command, including a 2-hour session TTL.

**Architecture:** 
1. `GeminiSession` initializes Gemini CLI and immediately enters `/agent_wait` mode.
2. `GeminiSession.ask()` writes prompts to `inbox/in.md` and polls for results in `inbox/out.md`.
3. `web_simulator.py` manages session lifecycle and terminates the CLI after 2 hours of inactivity.

**Tech Stack:** Python (Flask, Telebot), Bash (agent_wait), Markdown

---

### Task 1: Setup Unified Inbox Structure

**Files:**
- Create: `telegrapm-gcw-bot/inbox/in.md`
- Create: `telegrapm-gcw-bot/inbox/out.md`
- Create: `telegrapm-gcw-bot/inbox/files/.gitkeep`

- [ ] **Step 1: Create directories and initial files**

```bash
mkdir -p telegrapm-gcw-bot/inbox/files
touch telegrapm-gcw-bot/inbox/in.md
touch telegrapm-gcw-bot/inbox/out.md
touch telegrapm-gcw-bot/inbox/files/.gitkeep
```

- [ ] **Step 2: Commit structure**

```bash
git add telegrapm-gcw-bot/inbox/
git commit -m "feat: setup unified inbox directory structure"
```

---

### Task 2: Refactor GeminiSession to use File-based Communication

**Files:**
- Modify: `telegrapm-gcw-bot/src/gemini_session.py`

- [ ] **Step 1: Update `__init__` to enter `/agent_wait` mode**

Modify `__init__` to:
1. Set `self.input_file` to `inbox/in.md`.
2. Set `self.output_file` to `inbox/in.res.md` (matching `agent_wait` behavior).
3. Send `/agent_wait inbox/in.md` command immediately after loading.

- [ ] **Step 2: Update `ask()` to use file I/O instead of Pexpect parsing**

Modify `ask(prompt)` to:
1. Write `prompt` to `inbox/in.md`.
2. Poll for the existence of `inbox/in.res.md`.
3. Read the result, return it, and clean up `.res.md`.

- [ ] **Step 3: Commit refactor**

```bash
git add telegrapm-gcw-bot/src/gemini_session.py
git commit -m "refactor: switch GeminiSession to file-based communication via /agent_wait"
```

---

### Task 3: Implement 2-hour Session TTL in Web Simulator

**Files:**
- Modify: `telegrapm-gcw-bot/src/web_simulator.py`

- [ ] **Step 1: Add activity tracking and TTL logic**

1. Add `last_activity_time` (datetime.now()) to `web_simulator.py`.
2. Update `last_activity_time` in `/chat` and `/reset` routes.
3. Implement a background thread `check_session_timeout()` that:
   - Checks every minute if `datetime.now() - last_activity_time > 2 hours`.
   - If timed out, calls `gemini.close()` and sets `gemini = None`.

- [ ] **Step 2: Commit TTL implementation**

```bash
git add telegrapm-gcw-bot/src/web_simulator.py
git commit -m "feat: implement 2-hour inactivity timeout for gemini session"
```

---

### Task 4: Update Bot Logic for File Handling

**Files:**
- Modify: `telegrapm-gcw-bot/src/bot.py`

- [ ] **Step 1: Update photo and file save paths**

1. Change `handle_photo` to save to `inbox/files/` instead of `screenshots/`.
2. Update `handle_message` to correctly reference paths in `inbox/files/`.

- [ ] **Step 2: Commit bot updates**

```bash
git add telegrapm-gcw-bot/src/bot.py
git commit -m "feat: update bot to use inbox/files/ directory for attachments"
```
