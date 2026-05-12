import os
import asyncio
import logging
import glob
import re
import html
import signal
import sys
import time
import atexit
from datetime import datetime
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes, CallbackQueryHandler

from gemini_controller import GeminiController

# 로깅 설정
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

load_dotenv()
TOKEN = os.getenv("TELEGRAM_HTTP_API_KEY")
ALLOWED_CHAT_ID = os.getenv("ALLOWED_CHAT_ID")

if not TOKEN or not ALLOWED_CHAT_ID:
    logging.error("CRITICAL: TELEGRAM_HTTP_API_KEY and ALLOWED_CHAT_ID must be set in the .env file. This bot cannot run publicly.")
    sys.exit(1)

# 통합 컨트롤러 인스턴스 (2시간 TTL)
controller = GeminiController(ttl_hours=2)

def cleanup():
    """종료 시 모든 세션 정리"""
    controller.close_all()

# 시그널 핸들러 및 종료 등록
atexit.register(cleanup)
signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
signal.signal(signal.SIGTERM, lambda s, f: sys.exit(0))

def load_workspaces():
    workspaces = {}
    # bot.py가 src 폴더에 있으므로 부모 폴더의 telbot.conf를 찾습니다.
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    conf_path = os.path.join(base_dir, 'telbot.conf')
    
    def parse_file(path):
        path = os.path.expanduser(path)
        if not os.path.isabs(path):
            path = os.path.join(base_dir, path)
            
        if not os.path.exists(path):
            logging.debug(f"Config file not found: {path}")
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
                        
                        # PROJECT_ 접두사 제거 및 tmux 세션 이름 제거 로직
                        if key.startswith('PROJECT_'):
                            key = key[len('PROJECT_'):]
                            # 공백 뒤의 tmux 세션 이름 제거
                            val = val.split(' ', 1)[0]
                        
                        # 값의 ~ 확장
                        val = os.path.expanduser(val)
                        
                        # 절대 경로인 경우에만 워크스페이스로 추가
                        if os.path.isabs(val):
                            workspaces[key] = val
        except Exception as e:
            logging.error(f"Error parsing config file {path}: {e}")

    parse_file(conf_path)
    return workspaces

def strip_ansi(text):
    """터미널 로그에서 ANSI 색상/제어 코드를 제거합니다."""
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)

def markdown_to_html(text):
    # 1. 먼저 HTML 특수 문자를 이스케이프
    text = html.escape(text)
    
    # 2. 코드 블록 (``` ... ```) -> <pre>
    # <pre> 내부의 특수문자는 이미 이스케이프됨. 내부 추가 서식 방지를 위해 임시 치환 고려 가능하나 우선 순서로 조정.
    text = re.sub(r'```(?:[a-zA-Z]*)\n?(.*?)```', r'<pre>\1</pre>', text, flags=re.DOTALL)
    
    # 3. 인라인 코드 (` ... `) -> <code>
    # 태그 내부(<...>)를 가로지르지 않도록 [^<>`\n] 사용
    text = re.sub(r'`([^<>`\n]+)`', r'<code>\1</code>', text)
    
    # 4. 볼드 (** ... **) -> <b>
    # [^<>\*] 를 사용하여 태그나 다른 별표를 가로지르지 않게 함
    text = re.sub(r'\*\*([^<>\*]+)\*\*', r'<b>\1</b>', text)
    
    # 5. 이탤릭 (* ... *) -> <i>
    text = re.sub(r'\*([^<>\*]+)\*', r'<i>\1</i>', text)
    
    return text

def split_html_message(text, max_length=4000):
    """HTML 태그를 고려하여 메시지를 안전하게 분할합니다."""
    if len(text) <= max_length:
        return [text]
    
    chunks = []
    while text:
        if len(text) <= max_length:
            chunks.append(text)
            break
            
        # 분할 지점 찾기
        split_at = text.rfind('\n', 0, max_length)
        if split_at == -1 or split_at < 3000:
            split_at = text.rfind(' ', 0, max_length)
        if split_at == -1 or split_at < 3000:
            split_at = max_length
            
        chunk = text[:split_at]
        
        # 태그 밸런싱 (스택 기반)
        stack = []
        tags = re.findall(r'<(/?)(pre|code|b|i)>', chunk)
        for is_close, tag_name in tags:
            if is_close:
                if stack and stack[-1] == tag_name:
                    stack.pop()
            else:
                stack.append(tag_name)
        
        # 열린 태그 닫기 (역순)
        for tag in reversed(stack):
            chunk += f'</{tag}>'
            
        chunks.append(chunk)
        
        # 다음 청크 시작 시 잘렸던 태그 다시 열기
        next_start = ""
        for tag in stack:
            next_start += f'<{tag}>'
            
        text = next_start + text[split_at:].lstrip()
        
    return chunks

def check_auth(update: Update):
    if not update.effective_chat: return False
    if str(update.effective_chat.id) != str(ALLOWED_CHAT_ID):
        return False
    return True

async def show_files_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_auth(update): return
    keyboard = [
        [InlineKeyboardButton("📥 업로드 파일 (최근 10개)", callback_data="fs:inbox_latest")],
        [InlineKeyboardButton("🕒 워킹 디렉토리 (최신순 10개)", callback_data="fs:latest_10")],
        [InlineKeyboardButton("📅 전체 목록 (최신순)", callback_data="fs:all_new")],
        [InlineKeyboardButton("🔤 전체 목록 (이름순)", callback_data="fs:all_alpha")],
        [InlineKeyboardButton("⏳ 오래된 것 10개", callback_data="fs:old_10")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("원하는 파일 조회 방식을 선택하세요:", reply_markup=reply_markup)

def format_size(num):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if num < 1024.0:
            return f"{num:3.1f}{unit}"
        num /= 1024.0
    return f"{num:.1f}TB"

def get_files_table(workspace_path, mode):
    # 모드에 따라 탐색 디렉토리 결정
    if mode == "inbox_latest":
        target_path = os.path.join(workspace_path, "inbox/files")
        title = "📥 최근 업로드 파일 (inbox)"
    else:
        target_path = workspace_path
        title = "📄 워킹 디렉토리 파일"

    if not os.path.exists(target_path):
        return f"⚠️ 디렉토리를 찾을 수 없습니다: {target_path}", []
    
    files = []
    # os.walk 대신 os.listdir을 사용하여 루트 디렉토리의 파일만 가져옵니다.
    for f in os.listdir(target_path):
        # 숨김 파일(.git, .env 등)은 제외하여 가독성 높임
        if f.startswith('.'):
            continue
            
        p = os.path.join(target_path, f)
        if os.path.isfile(p):
            stat = os.stat(p)
            files.append({
                'name': f,
                'time': stat.st_mtime,
                'size': stat.st_size
            })
            
    if not files:
        return "📂 표시할 파일이 없습니다.", []

    # 정렬 로직
    if mode == "inbox_latest":
        files.sort(key=lambda x: x['time'], reverse=True)
        files = files[:10]
    elif mode == "latest_10":
        files.sort(key=lambda x: x['time'], reverse=True)
        files = files[:10]
        title = "🕒 최근 10개 파일 (Root)"
    elif mode == "all_new":
        files.sort(key=lambda x: x['time'], reverse=True)
        title = "📅 전체 목록 (최신순)"
    elif mode == "all_alpha":
        files.sort(key=lambda x: x['name'])
        title = "🔤 전체 목록 (이름순)"
    elif mode == "old_10":
        files.sort(key=lambda x: x['time'])
        files = files[:10]
        title = "⏳ 오래된 파일 10개"

    # 표 생성
    table = f"<b>{title}</b>\n"
    table += f"<pre>{'파일명':<20} | {'시간':<10} | {'크기':>7}\n"
    table += "-" * 43 + "\n"
    for f in files:
        dt = datetime.fromtimestamp(f['time']).strftime('%m-%d %H:%M')
        sz = format_size(f['size'])
        # 파일명을 자르지 않고 전체 출력 (Jerry님 요청)
        name = f['name']
        table += f"{name:<20} | {dt:<10} | {sz:>7}\n"
    table += "</pre>"
    return table, files

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_auth(update): return
    welcome_text = (
        "👋 안녕하세요! Gemini CLI 통합 텔레그램 봇입니다.\n\n"
        "/directory - 작업 디렉토리 선택\n"
        "/files - 파일 목록 보기 (최신순/이름순)\n"
        "/reset - 현재 세션 강제 초기화\n"
        "취소 - 진행 중인 작업 중단\n"
    )
    await update.message.reply_text(welcome_text)

async def show_directories(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_auth(update): return
    workspaces = load_workspaces()
    keyboard = [[InlineKeyboardButton(f"📁 {name}", callback_data=f"ws:{name}")] for name in workspaces]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("사용할 작업 디렉토리를 선택하세요:", reply_markup=reply_markup)

# 파일 다운로드를 위한 임시 매핑 (파일명이 64바이트를 넘는 경우 대비)
file_download_cache = {}

async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data.startswith("ws:"):
        ws_name = query.data.split(":")[1]
        workspaces = load_workspaces()
        ws_path = workspaces.get(ws_name)
        if ws_path:
            await query.edit_message_text(text=f"🔄 작업 공간 '{ws_name}' 초기화 중...")
            try:
                pid = controller.change_workspace(ws_path)
                await query.edit_message_text(text=f"✅ 작업 공간 변경 완료: '{ws_name}' (PID: {pid})")
            except Exception as e:
                await query.edit_message_text(text=f"❌ 오류: {e}")
                
    elif query.data.startswith("fs:"):
        mode = query.data.split(":")[1]
        info = controller.get_session_info()
        if not info:
            await query.edit_message_text(text="⚠️ 활성화된 세션이 없습니다. /directory 를 먼저 선택해주세요.")
            return
            
        table_text, file_list = get_files_table(info['workspace'], mode)
        
        # 파일 다운로드 버튼 생성 (인덱스 사용으로 64바이트 제한 회피)
        keyboard = []
        # 현재 탐색 중인 경로 결정 (캐시용)
        base_path = os.path.join(info['workspace'], "inbox/files") if mode == "inbox_latest" else info['workspace']
        
        for i, f in enumerate(file_list[:10]):
            cache_key = f"f_{i}"
            # 전체 경로를 캐시에 저장
            file_download_cache[cache_key] = os.path.join(base_path, f['name'])
            keyboard.append([InlineKeyboardButton(f"📥 {f['name']}", callback_data=f"fd:{cache_key}")])
            
        reply_markup = InlineKeyboardMarkup(keyboard) if keyboard else None
        
        # 기존 메뉴 메시지를 결과 표와 다운로드 버튼으로 교체
        await query.edit_message_text(text=table_text, parse_mode="HTML", reply_markup=reply_markup)

    elif query.data.startswith("fd:"):
        cache_key = query.data[3:] # "fd:" 이후의 키 (예: f_0)
        full_path = file_download_cache.get(cache_key)
        
        if not full_path:
            await query.message.reply_text("⚠️ 세션이 만료되었거나 파일을 찾을 수 없습니다. 다시 /files 를 실행해주세요.")
            return

        filename = os.path.basename(full_path)
        if os.path.exists(full_path):
            await query.message.reply_chat_action("upload_document")
            try:
                with open(full_path, 'rb') as f:
                    await query.message.reply_document(document=f, caption=f"📄 {filename}")
            except Exception as e:
                await query.message.reply_text(f"❌ 전송 실패: {e}")
        else:
            await query.message.reply_text("⚠️ 파일을 찾을 수 없습니다.")

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_auth(update): return
    
    info = controller.get_session_info()
    if not info:
        await update.message.reply_text("⚠️ 먼저 /directory 명령으로 작업 공간을 선택해주세요.")
        return
        
    inbox_files_dir = os.path.join(info['workspace'], "inbox/files")
    os.makedirs(inbox_files_dir, exist_ok=True)
    
    existing_files = glob.glob(os.path.join(inbox_files_dir, "*.png"))
    nums = [0]
    for f in existing_files:
        try: nums.append(int(os.path.basename(f).split('.')[0]))
        except: continue
    next_num = max(nums) + 1
    filename = f"{next_num:05d}.png"
    filepath = os.path.join(inbox_files_dir, filename)
    
    try:
        photo_file = await update.message.photo[-1].get_file()
        await photo_file.download_to_drive(filepath)
        
        # 세션별 업로드 큐에 추가
        controller.add_upload_context(info['workspace'], f"photo #{next_num:05d}")
        await update.message.reply_text(f"📸 사진 저장 완료: `inbox/files/{filename}`")
    except Exception as e:
        logging.error(f"Failed to download photo: {e}")
        await update.message.reply_text(f"❌ 사진 저장 실패: {e}")

async def handle_any_file(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """문서, 비디오, 오디오 등 사진(PHOTO) 외의 모든 첨부 파일을 처리합니다."""
    if not check_auth(update): return
    
    info = controller.get_session_info()
    if not info:
        await update.message.reply_text("⚠️ 먼저 /directory 명령으로 작업 공간을 선택해주세요.")
        return
        
    inbox_files_dir = os.path.join(info['workspace'], "inbox/files")
    os.makedirs(inbox_files_dir, exist_ok=True)
    
    # 메시지 타입에 따라 파일 객체 추출
    attachment = None
    if update.message.document:
        attachment = update.message.document
    elif update.message.video:
        attachment = update.message.video
    elif update.message.audio:
        attachment = update.message.audio
    elif update.message.voice:
        attachment = update.message.voice
    elif update.message.video_note:
        attachment = update.message.video_note
        
    if not attachment:
        return # 지원하지 않는 파일 형식
        
    orig_name = getattr(attachment, 'file_name', None)
    if not orig_name:
        # 파일명이 없는 미디어의 경우 확장자 유추
        if update.message.voice: ext = ".ogg"
        elif update.message.video_note: ext = ".mp4"
        elif update.message.video: ext = ".mp4"
        else: ext = ".file"
        orig_name = f"media_{int(time.time())}{ext}"
    
    base, ext = os.path.splitext(orig_name)
    filepath = os.path.join(inbox_files_dir, orig_name)
    counter = 1
    while os.path.exists(filepath):
        filepath = os.path.join(inbox_files_dir, f"{base}_{counter}{ext}")
        counter += 1
    
    final_filename = os.path.basename(filepath)
    
    try:
        file_obj = await attachment.get_file()
        await file_obj.download_to_drive(filepath)
        
        # 세션별 업로드 큐에 추가
        controller.add_upload_context(info['workspace'], f"file '{final_filename}'")
        await update.message.reply_text(f"📄 파일 저장 완료: `inbox/files/{final_filename}`")
    except Exception as e:
        logging.error(f"Failed to download file: {e}")
        await update.message.reply_text(f"❌ 파일 저장 실패: {e}")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_auth(update): return
    user_text = update.message.text
    if not user_text: return

    if user_text.lower() in ["취소", "cancel"]:
        controller.interrupt()
        await update.message.reply_text("🛑 중단 요청(ESC) 전송됨.")
        return 

    info = controller.get_session_info()
    if not info:
        workspaces = load_workspaces()
        if workspaces:
            first_ws = list(workspaces.values())[0]
            await update.message.reply_text("🔄 기본 작업 공간으로 초기화 중...")
            controller.change_workspace(first_ws)
            info = controller.get_session_info()
        else:
            await update.message.reply_text("⚠️ /directory 명령으로 작업 공간을 선택해주세요.")
            return

    # 최근 업로드된 파일 정보 가져오기 (해당 세션 전용)
    upload_list = controller.get_upload_context(info['workspace'])
    upload_context = ""
    if upload_list:
        files_str = ", ".join(upload_list)
        upload_context = f"(Note: The user just uploaded the following files to 'inbox/files/': {files_str}.)\n"
        
    system_context = (
        "[CRITICAL System Instruction]\n"
        "1. Mentioned photo numbers refer to 'inbox/files/' directory.\n"
        "2. 'the photo' or 'recent' refers to highest numbered files in 'inbox/files/'.\n"
        "3. Wrap ALL Markdown tables within a code block (``` ... ```).\n"
        "4. YOU ARE A WORKER AGENT. You MUST write your final reply/output to 'inbox/response.md'. DO NOT create separate summary files unless explicitly asked. Your final act MUST be creating 'inbox/response.md'.\n\n"
    )
    full_prompt = system_context + upload_context + f"User says: " + user_text

    status_msg = await update.message.reply_text(f"🚀 처리 중...")

    try:
        log_path = info.get('log_path')
        start_pos = 0
        if log_path and os.path.exists(log_path):
            start_pos = os.path.getsize(log_path)
            
        ask_task = asyncio.create_task(asyncio.to_thread(controller.ask, full_prompt))
        
        last_text = "🚀 처리 중..."
        
        # 처리하는 동안 실시간으로 로그(thought process)를 텔레그램 메시지에 업데이트
        while not ask_task.done():
            # 3초마다 갱신 (텔레그램 API rate limit 안전권)
            done, pending = await asyncio.wait([ask_task], timeout=3.0)
            if ask_task in done:
                break
                
            if log_path and os.path.exists(log_path):
                try:
                    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                        f.seek(start_pos)
                        new_logs = f.read()
                        
                        if new_logs:
                            clean_logs = strip_ansi(new_logs).strip()
                            if clean_logs:
                                tail_text = clean_logs[-1000:]
                                
                                # 텔레그램으로 전송할 텍스트를 서버 콘솔에도 직접 출력하여 확인
                                logging.info(f"--- [DEBUG] Extracted Log Tail ---\n{tail_text}\n---------------------------------")
                                
                                new_text = f"🚀 처리 중...\n\n<pre>{html.escape(tail_text)}</pre>"
                                if new_text != last_text:
                                    try:
                                        await status_msg.edit_text(new_text, parse_mode="HTML")
                                        last_text = new_text
                                        logging.info(f"Telegram message updated (Log size: {len(new_logs)} bytes)")
                                    except Exception as edit_err:
                                        logging.info(f"Log edit skipped (API Error): {edit_err}")
                        else:
                            logging.info("No new logs written to file yet.")
                except Exception as read_err:
                    logging.info(f"Log read error: {read_err}")

        response_text = ask_task.result()
        
        try: await status_msg.delete()
        except: pass
        
        safe_response = markdown_to_html(response_text)
        chunks = split_html_message(safe_response)
        for chunk in chunks:
            await update.message.reply_text(chunk, parse_mode="HTML")
            
    except Exception as e:
        # 에러 메시지도 텔레그램 제한에 걸릴 수 있으므로 간단히 처리하거나 슬라이싱
        error_msg = str(e)[:1000]
        await status_msg.edit_text(f"⚠️ 오류 발생: {error_msg}")

async def reset(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not check_auth(update): return
    info = controller.get_session_info()
    if not info:
        await update.message.reply_text("⚠️ 활성화된 세션이 없습니다. /directory 를 먼저 선택해주세요.")
        return
        
    status_msg = await update.message.reply_text("🔄 현재 작업 공간의 세션을 강제 초기화(kill -9)합니다...")
    
    try:
        # force_restart=True를 통해 기존 프로세스를 즉시 kill -9 하고 새로 시작
        pid = await asyncio.to_thread(controller.change_workspace, info['workspace'], force_restart=True)
        # 세션 업로드 큐는 change_workspace에서 새 세션을 생성하면서 자동으로 초기화됨
        await status_msg.edit_text(f"✅ 강제 초기화 완료 (새 PID: {pid})")
    except Exception as e:
        error_details = str(e)
        logging.error(f"Reset failed for workspace {info['workspace']}: {error_details}", exc_info=True)
        await status_msg.edit_text(f"❌ 초기화 실패: {error_details}")

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """네트워크 끊김 등 폴링 중 발생하는 에러를 조용히 넘기고 재시도하도록 처리합니다."""
    import httpx
    if isinstance(context.error, (httpx.RequestError, httpx.TimeoutException)):
        logging.warning(f"Network error during polling (ignored): {context.error}")
    else:
        logging.error("Exception while handling an update:", exc_info=context.error)

if __name__ == '__main__':
    if not TOKEN:
        print("Error: TELEGRAM_HTTP_API_KEY not found"); exit(1)
    app = ApplicationBuilder().token(TOKEN).build()
    
    # block=False를 통해 모든 명령과 메시지를 병렬로 처리 (큐잉 방지)
    app.add_handler(CommandHandler("start", start, block=False))
    app.add_handler(CommandHandler("directory", show_directories, block=False))
    app.add_handler(CommandHandler("files", show_files_menu, block=False))
    app.add_handler(CommandHandler("reset", reset, block=False))
    app.add_handler(CallbackQueryHandler(button_callback, block=False))
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo, block=False))
    # 사진이 아닌 모든 미디어/문서 파일 처리
    app.add_handler(MessageHandler(filters.Document.ALL | filters.VIDEO | filters.AUDIO | filters.VOICE | filters.VIDEO_NOTE, handle_any_file, block=False))
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_message, block=False))
    
    # 글로벌 에러 핸들러 등록
    app.add_error_handler(error_handler)
    
    print("Bot is running with integrated Gemini Controller...")
    try:
        # 사내 방화벽 대응: 롱 폴링 타임아웃을 짧게 가져가서 연결 강제 종료 방지
        # v20+ 에서는 'timeout' 인자가 기존의 read_timeout 역할을 수행함
        app.run_polling(
            timeout=15,
            drop_pending_updates=False
        )
    finally:
        controller.close()
