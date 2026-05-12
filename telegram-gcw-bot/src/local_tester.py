import os
import sys
import atexit
from gemini_controller import GeminiController

def load_workspaces():
    workspaces = {}
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    conf_path = os.path.join(base_dir, 'telbot.conf')
    
    def parse_file(path):
        path = os.path.expanduser(path)
        if not os.path.isabs(path):
            path = os.path.join(base_dir, path)
            
        if not os.path.exists(path):
            return

        try:
            with open(path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    
                    if line.startswith('INCLUDE '):
                        include_target = line[len('INCLUDE '):].strip()
                        parse_file(include_target)
                        continue
                    
                    if '=' in line:
                        key, val = line.split('=', 1)
                        key = key.strip()
                        val = val.strip()
                        
                        if key.startswith('PROJECT_'):
                            key = key[len('PROJECT_'):]
                            val = val.split(' ', 1)[0]
                        
                        val = os.path.expanduser(val)
                        if os.path.isabs(val):
                            workspaces[key] = val
        except Exception as e:
            print(f"Error parsing config file {path}: {e}")

    parse_file(conf_path)
    return workspaces

def show_help():
    print("\n[사용 가능한 명령어]")
    print("/start     - 환영 인사 및 도움말")
    print("/directory - 작업 디렉토리 목록 보기 및 전환")
    print("/reset     - 현재 세션 초기화 (재시작)")
    print("exit, quit - 프로그램 종료")

def main():
    print("==================================================")
    print("🤖 Local Gemini Controller Tester (PRO)")
    print("텔레그램 명령어(/start, /directory, /reset)를 지원합니다.")
    print("==================================================\n")
    
    controller = GeminiController(ttl_hours=2)
    atexit.register(controller.close_all)
    
    # 초기 로딩 시 첫 번째 워크스페이스 자동 활성화 시도
    workspaces = load_workspaces()
    if workspaces:
        first_name = list(workspaces.keys())[0]
        workspace_path = workspaces[first_name]
        print(f"🔄 기본 작업 공간 초기화: {first_name} ({workspace_path})")
        controller.change_workspace(workspace_path)
    
    show_help()

    while True:
        try:
            user_msg = input("\n👤 You: ").strip()
            
            if not user_msg:
                continue
                
            if user_msg.lower() in ['exit', 'quit']:
                print("테스트를 종료합니다.")
                break

            # 명령어 처리
            if user_msg.startswith('/'):
                cmd = user_msg.split()[0].lower()
                
                if cmd == '/start':
                    print("✨ 안녕하세요! 로컬 컨트롤러 테스터입니다.")
                    show_help()
                    continue
                
                elif cmd == '/reset':
                    info = controller.get_session_info()
                    if info:
                        print(f"🔄 {info['workspace']} 세션을 초기화합니다...")
                        pid = controller.change_workspace(info['workspace'])
                        print(f"✅ 초기화 완료 (새 PID: {pid})")
                    else:
                        print("⚠️ 활성화된 세션이 없습니다. /directory 를 먼저 실행하세요.")
                    continue

                elif cmd == '/directory':
                    ws_list = load_workspaces()
                    if not ws_list:
                        print("⚠️ telbot.conf에 등록된 디렉토리가 없습니다.")
                        continue
                    
                    print("\n[작업 디렉토리 목록]")
                    for i, name in enumerate(ws_list.keys(), 1):
                        print(f"{i}. {name} ({ws_list[name]})")
                    
                    choice = input("\n전환할 번호를 선택하세요 (취소: Enter): ").strip()
                    if choice.isdigit() and 0 < int(choice) <= len(ws_list):
                        selected_name = list(ws_list.keys())[int(choice)-1]
                        selected_path = ws_list[selected_name]
                        print(f"🔄 '{selected_name}'(으)로 전환 중...")
                        pid = controller.change_workspace(selected_path)
                        print(f"✅ 전환 완료 (PID: {pid})")
                    continue
                
                else:
                    print(f"❓ 알 수 없는 명령어입니다: {cmd}")
                    continue

            # 일반 메시지 처리
            info = controller.get_session_info()
            if not info:
                print("⚠️ 먼저 /directory 명령으로 작업 공간을 선택해주세요.")
                continue

            print(f"⏳ Gemini 응답 대기 중 (Workspace: {os.path.basename(info['workspace'])})")
            response = controller.ask(user_msg)
            print(f"\n✨ Gemini:\n{response}")
            
        except KeyboardInterrupt:
            print("\n종료합니다.")
            break
        except Exception as e:
            print(f"\n⚠️ 오류 발생: {e}")

if __name__ == "__main__":
    main()