import os
import sys
import time
import uuid
import subprocess

class GeminiSession:
    def __init__(self, cwd=None, existing_pid=None):
        self.workspace_dir = cwd if cwd else os.getcwd()
        # 봇 프로그램 루트 디렉토리 (src의 상위 폴더) - 로그 저장용
        self.bot_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        self.is_interrupted = False
        self.process = None
        
        # [중요] 작업 디렉토리 내에 inbox 구조가 없으면 생성
        inbox_dir = os.path.join(self.workspace_dir, "inbox/files")
        if not os.path.exists(inbox_dir):
            print(f"Creating inbox structure in {self.workspace_dir}...")
            os.makedirs(inbox_dir, exist_ok=True)

        # 파일 경로 설정 (지정된 작업 디렉토리에 생성)
        self.input_file = os.path.abspath(os.path.join(self.workspace_dir, "inbox/request.md"))
        # agent-communicator-ext 표준 응답 파일명 사용
        self.output_file = os.path.abspath(os.path.join(self.workspace_dir, "inbox/response.md"))

        # 시작 전 이전 잔여 시그널 파일들 깔끔하게 정리
        for f in [self.input_file, self.output_file]:
            if os.path.exists(f):
                try: os.remove(f)
                except: pass

        if existing_pid:
            print(f"Attaching to existing Gemini process (PID: {existing_pid}) in {self.workspace_dir}...")
            # subprocess.Popen 객체를 흉내내는 클래스 (최소한의 기능)
            class MockProcess:
                def __init__(self, pid): self.pid = pid
                def poll(self):
                    try: os.kill(self.pid, 0); return None
                    except OSError: return 0
                def terminate(self): 
                    try: os.kill(self.pid, 15)
                    except: pass
                def kill(self):
                    try: os.kill(self.pid, 9)
                    except: pass
                def wait(self, timeout=None): return 0
            self.process = MockProcess(existing_pid)
            
            # 기존 로그 파일 연결 시도
            self.log_path = os.path.join(self.bot_dir, f'gemini-{existing_pid}.log')
            if not os.path.exists(self.log_path):
                # UUID 기반 로그 파일 탐색 (신규 로직 호환)
                log_files = glob.glob(os.path.join(self.bot_dir, "gemini-*.log"))
                if log_files:
                    self.log_path = max(log_files, key=os.path.getmtime)
            
            if os.path.exists(self.log_path):
                self.log_file = open(self.log_path, 'a', encoding='utf-8')
                print(f"Attached to existing log: {self.log_path}")
            else:
                self.log_file = None
        else:
            import shlex
            print(f"Starting new Gemini CLI session in {self.workspace_dir}...")
            
            env = os.environ.copy()
            env['TERM'] = 'xterm'
            env['NO_COLOR'] = '1'
            env['GEMINI_UI_HIDE_FOOTER'] = 'true'
            env['GEMINI_UI_HIDE_BANNER'] = 'true'
            env['GEMINI_UI_SHOW_SPINNER'] = 'false'
            env['PYTHONUNBUFFERED'] = '1'
            
            if os.path.exists(self.output_file):
                os.remove(self.output_file)

            # UUID를 사용하여 고정된 로그 파일명 사용 (rename 피함)
            self.session_id = uuid.uuid4().hex[:8]
            self.log_path = os.path.join(self.bot_dir, f'gemini-{self.session_id}.log')
            self.log_file = open(self.log_path, 'a', encoding='utf-8', buffering=1)

            print(f"Starting Gemini CLI in /agent_wait mode...")
            command = f'npx --yes @google/gemini-cli --screen-reader --yolo -p "/agent_wait" 2>&1'
            
            self.process = subprocess.Popen(
                command,
                shell=True,
                cwd=self.workspace_dir,
                env=env,
                stdout=self.log_file,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                start_new_session=True  # 프로세스 그룹 분리 (killpg 용도)
            )
            
            # 로그 파일명은 유지하고, PID 매핑 파일 등에 필요하면 업데이트
            print(f"New session started. PID: {self.process.pid}, Log: {self.log_path}")
            time.sleep(2)
        
        print("Session ready in worker mode.")

    def ask(self, prompt):
        self.is_interrupted = False
        req_id = str(uuid.uuid4())[:8]
        
        # 1. 이전 결과 파일 정리
        if os.path.exists(self.output_file):
            os.remove(self.output_file)
            
        # 2. 에이전트 준비 상태 체크 (request.md 파일 존재 여부로 판단)
        # 이미 파일이 있다면 이전 요청이 아직 처리되지 않은 것임
        for attempt in range(3):
            if not os.path.exists(self.input_file):
                break
            print(f"[{req_id}] Agent is busy (request.md exists). Retrying in 2s... (Attempt {attempt+1}/3)")
            time.sleep(2)
        else:
            if os.path.exists(self.input_file):
                raise Exception("the agent is not ready")

        # 3. 질문을 request.md에 작성 (agent_wait 스크립트가 이를 감지함)
        abs_input_file = os.path.abspath(self.input_file)
        print(f"[{req_id}] Writing prompt to EXACT PATH: {abs_input_file} ...")
        with open(self.input_file, "w", encoding="utf-8") as f:
            f.write(prompt)
        
        # 4. Polling: 결과 파일 감시
        print(f"[{req_id}] Polling for response in {os.path.basename(self.output_file)}...")
        wait_start = time.time()
        timeout = 300 
        
        last_seen_files = []
        inbox_dir = os.path.dirname(self.output_file)
        running_file = os.path.join(inbox_dir, "agent_wait_running")

        while time.time() - wait_start < timeout:
            if self.is_interrupted:
                print(f"[{req_id}] Interrupted by user.")
                return "🛑 사용자에 의해 중단되었습니다."

            # [DEBUG] 파일 목록에 변화가 있으면 즉시 출력
            try:
                current_files = os.listdir(inbox_dir) if os.path.exists(inbox_dir) else ["DIR_MISSING"]
                if current_files != last_seen_files:
                    print(f"[{req_id}] Inbox changed: {last_seen_files} -> {current_files}")
                    last_seen_files = current_files
            except Exception as e:
                print(f"[{req_id}] Error listing inbox: {e}")

            # 결과 파일 확인
            if os.path.exists(self.output_file):
                print(f"[{req_id}] Response file detected: {self.output_file}")
                time.sleep(0.3) 
                try:
                    with open(self.output_file, "r", encoding="utf-8") as f:
                        response_text = f.read().strip()
                        if response_text:
                            print(f"[{req_id}] Response collected successfully ({len(response_text)} chars).")
                            try: os.remove(self.output_file)
                            except: pass
                            return response_text
                        else:
                            print(f"[{req_id}] Response file is empty, still waiting...")
                except Exception as e:
                    print(f"[{req_id}] Error reading response file: {e}")

            # [자가 치유] 결과 파일은 없는데 에이전트가 다시 대기 모드(running_file 생성)로 돌아갔다면?
            # 단, 요청 후 최소 5초는 지난 후에 판단 (레이스 컨디션 방지)
            if not os.path.exists(self.output_file) and os.path.exists(running_file) and (time.time() - wait_start > 10):
                print(f"[{req_id}] DETECTED: Agent is back to wait mode but NO response.md found! Retrying...")
                # 재시도 프롬프트 작성 (재귀 호출 대신 루프 내에서 처리하거나 단순 메시지 반환)
                retry_prompt = "[SYSTEM] YOUR PREVIOUS RESPONSE WAS MISSING. Please write your answer to 'inbox/response.md' IMMEDIATELY."
                with open(self.input_file, "w", encoding="utf-8") as f:
                    f.write(retry_prompt)
                # 타임아웃 초기화하여 한 번 더 기다림
                wait_start = time.time() 
                print(f"[{req_id}] Retry signal sent to agent.")
                # 에이전트가 신호를 가져갈 때까지 잠시 대기
                time.sleep(2)
            
            time.sleep(0.5)
            
        return "[Error: Timeout waiting for Agent response]"

    def close(self, force=False):
        pid_to_remove = None
        if self.process:
            pid_to_remove = self.process.pid
            # subprocess의 poll()이 None이면 살아있는 것, 아니면 MockProcess 확인용
            if hasattr(self.process, 'poll') and self.process.poll() is None:
                pgid = None
                try:
                    # 프로세스 그룹 ID 획득 시도
                    pgid = os.getpgid(self.process.pid)
                except OSError:
                    pass

                if force:
                    print(f"Force killing Gemini process group for PID {self.process.pid} (kill -9)...")
                    if pgid:
                        try: os.killpg(pgid, 9)
                        except OSError: self.process.kill()
                    else:
                        self.process.kill()
                else:
                    print(f"Terminating Gemini process group for PID {self.process.pid}...")
                    if pgid:
                        try: os.killpg(pgid, 15)
                        except OSError: self.process.terminate()
                    else:
                        self.process.terminate()
                    
                    try:
                        self.process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        print(f"Timeout expired, force killing process group for PID {self.process.pid}...")
                        if pgid:
                            try: os.killpg(pgid, 9)
                            except OSError: self.process.kill()
                        else:
                            self.process.kill()
                            
                        # 고아 Node.js 프로세스 청소
                        try: os.system("pkill -9 -f '@google/gemini-cli.*agent_wait'")
                        except: pass
        
        # 로그 파일 닫기
        if hasattr(self, 'log_file') and self.log_file and not self.log_file.closed:
            try: self.log_file.close()
            except: pass
            
        # 로그 파일 삭제
        log_path_to_remove = getattr(self, 'log_path', None)
        if not log_path_to_remove and pid_to_remove:
            log_path_to_remove = os.path.join(self.bot_dir, f'gemini-{pid_to_remove}.log')
            
        if log_path_to_remove and os.path.exists(log_path_to_remove):
            try:
                os.remove(log_path_to_remove)
                print(f"Removed session log file: {log_path_to_remove}")
            except Exception as e:
                print(f"Failed to remove log file {log_path_to_remove}: {e}")

    def interrupt(self):
        """작업 중단 시그널 (파일 기반에서는 단순 상태 변경으로 처리)"""
        self.is_interrupted = True
        print("Interrupt signal received.")
