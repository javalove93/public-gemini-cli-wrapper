import os
import threading
from datetime import datetime, timedelta
from gemini_session import GeminiSession

class GeminiController:
    """
    여러 개의 작업 공간 세션을 동시에 관리하며, 
    각 세션별로 2시간 TTL(Time-To-Live)을 적용합니다.
    실행 중인 PID를 파일에 저장하여 재시작 시 복구합니다.
    """
    def __init__(self, ttl_hours=2):
        self.lock = threading.Lock()
        self.sessions = {}  # {workspace_path: {"session": GeminiSession, "last_activity": datetime}}
        self.ttl_hours = ttl_hours
        self.current_workspace = None
        self.pid_file = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'gemini-cli-pids.txt'))
        
        # 기동 시 기존 PID 복구 시도
        self._recover_sessions()
        
        # TTL 감시 스레드
        self.ttl_thread = threading.Thread(target=self._check_timeout, daemon=True)
        self.ttl_thread.start()

    def _recover_sessions(self):
        """파일에서 기존 PID를 읽어 프로세스가 살아있다면 연결"""
        if not os.path.exists(self.pid_file):
            return
        
        print("Attempting to recover existing Gemini sessions from PID file...")
        try:
            with open(self.pid_file, 'r') as f:
                for line in f:
                    if ',' not in line: continue
                    path, pid_str = line.strip().split(',', 1)
                    pid = int(pid_str)
                    
                    # 프로세스 생존 확인
                    try:
                        os.kill(pid, 0)
                        print(f"Recovered session for {path} (PID: {pid})")
                        self.sessions[path] = {
                            "session": GeminiSession(cwd=path, existing_pid=pid),
                            "last_activity": datetime.now()
                        }
                    except (OSError, ValueError):
                        print(f"Session for {path} (PID: {pid}) no longer exists. Skipping.")
        except Exception as e:
            print(f"Recovery error: {e}")
        self._update_pid_file()

    def _update_pid_file(self):
        """현재 활성 세션 상태를 파일에 기록"""
        try:
            with open(self.pid_file, 'w') as f:
                for path, info in self.sessions.items():
                    pid = info["session"].process.pid if info["session"].process else ""
                    if pid:
                        f.write(f"{path},{pid}\n")
        except Exception as e:
            print(f"PID file update error: {e}")

    def _check_timeout(self):
        while True:
            threading.Event().wait(60) # 1분마다 체크
            with self.lock:
                now = datetime.now()
                expired_paths = []
                for path, info in self.sessions.items():
                    idle_time = now - info["last_activity"]
                    if idle_time > timedelta(hours=self.ttl_hours):
                        print(f"Session timeout for {path} ({idle_time}). Closing...")
                        expired_paths.append(path)
                
                if expired_paths:
                    for path in expired_paths:
                        self._close_session(path)
                    self._update_pid_file()

    def _close_session(self, workspace_path, force_kill=False):
        """내부용: 특정 세션 종료 및 정리"""
        info = self.sessions.pop(workspace_path, None)
        if info:
            try:
                info["session"].close(force=force_kill)
            except Exception as e:
                print(f"Error closing session {workspace_path}: {e}")
            if self.current_workspace == workspace_path:
                self.current_workspace = None

    def change_workspace(self, workspace_path, force_restart=False):
        """작업 공간을 전환하거나 새로 생성합니다. force_restart=True이면 무조건 kill -9 후 재시작합니다."""
        with self.lock:
            self.current_workspace = workspace_path
            
            # 이미 세션이 존재할 경우
            if workspace_path in self.sessions:
                if force_restart:
                    print(f"Force resetting session for {workspace_path}...")
                    self._close_session(workspace_path, force_kill=True)
                else:
                    session = self.sessions[workspace_path]["session"]
                    if session.process.poll() is None:  # 살아있음
                        self.sessions[workspace_path]["last_activity"] = datetime.now()
                        return session.process.pid if session.process else "Unknown"
                    else:
                        print(f"Existing session for {workspace_path} is dead. Cleaning up for restart...")
                        self._close_session(workspace_path)

            # 새 세션 생성 (또는 위에서 죽어서 제거된 경우)
            print(f"Starting new Gemini session in {workspace_path}...")
            session = GeminiSession(cwd=workspace_path)
            self.sessions[workspace_path] = {
                "session": session,
                "last_activity": datetime.now(),
                "upload_queue": [] # 세션별 독립 큐
            }
            self._update_pid_file()
            return session.process.pid if session.process else "Unknown"

    def add_upload_context(self, workspace_path, file_info):
        """특정 작업 공간에 업로드된 파일 정보를 기록합니다."""
        with self.lock:
            if workspace_path in self.sessions:
                # 최근 10개까지 기억
                self.sessions[workspace_path]["upload_queue"].append(file_info)
                self.sessions[workspace_path]["upload_queue"] = self.sessions[workspace_path]["upload_queue"][-10:]

    def get_upload_context(self, workspace_path):
        """특정 작업 공간의 최신 업로드 목록을 가져오고 큐를 비웁니다."""
        with self.lock:
            if workspace_path in self.sessions:
                queue = self.sessions[workspace_path]["upload_queue"]
                self.sessions[workspace_path]["upload_queue"] = [] # 소모 후 초기화
                return queue
            return []


    def ask(self, message):
        """현재 선택된 작업 공간에 질문을 던집니다. 죽어있으면 자동으로 살려냅니다."""
        # 1. 세션 확보 단계에서만 Lock 사용
        with self.lock:
            if not self.current_workspace or self.current_workspace not in self.sessions:
                raise Exception("No active workspace selected. Please use /directory.")
            
            info = self.sessions[self.current_workspace]
            session = info["session"]
            
            # 질문 전 생존 확인 및 재시작
            if hasattr(session.process, 'poll') and session.process.poll() is not None:
                print(f"Process for {self.current_workspace} is dead. Restarting before 'ask'...")
                new_session = GeminiSession(cwd=self.current_workspace)
                self.sessions[self.current_workspace]["session"] = new_session
                session = new_session
                self._update_pid_file()

            info["last_activity"] = datetime.now()
            
        # 2. 실제 대기(session.ask)는 Lock 밖에서 수행 (그래야 리셋 가능)
        return session.ask(message)

    def interrupt(self):
        """현재 활성화된 세션에 중단 시그널을 보냅니다."""
        with self.lock:
            if self.current_workspace in self.sessions:
                self.sessions[self.current_workspace]["session"].interrupt()

    def get_session_info(self):
        """현재 활성화된 세션 정보를 반환합니다."""
        with self.lock:
            if self.current_workspace in self.sessions:
                info = self.sessions[self.current_workspace]
                session = info["session"]
                log_path = None
                
                # session 객체 내에 log_path 속성이 있으면 우선 사용 (신규/기존 동일)
                if hasattr(session, 'log_path') and session.log_path:
                    log_path = session.log_path
                elif hasattr(session, 'log_file') and session.log_file:
                    log_path = session.log_file.name
                    
                return {
                    "workspace": self.current_workspace,
                    "pid": session.process.pid if session.process else "Unknown",
                    "log_path": log_path
                }
            return None

    def close(self):
        """bot.py와의 호환성을 위한 별칭 메서드"""
        self.close_all()

    def close_all(self):
        """모든 관리 중인 Gemini 프로세스를 종료합니다."""
        with self.lock:
            print(f"Closing all {len(self.sessions)} active Gemini sessions...")
            for path in list(self.sessions.keys()):
                self._close_session(path)
            print("All sessions closed.")
