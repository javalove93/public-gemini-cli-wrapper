# Gemini CLI WebUI Wrapper - User Guide

The Gemini CLI WebUI Wrapper is a powerful, lightweight interface that allows you to conveniently use the **Gemini CLI**—running via Tmux over SSH—directly from your web browser.

This guide details everything from initial setup and execution to leveraging its latest features, including the file viewer and automatic synchronization.

---

## 1. Prerequisites

To use this wrapper, the following environment must be prepared on the remote server (or local machine):
* **Node.js**: Required to run the backend server (Express, Socket.io).
* **Tmux**: A core utility for maintaining sessions and splitting the terminal.
* **Gemini CLI**: The original CLI tool acting as the AI assistant.

---

## 2. Setup & Run

### Step 1: Install Dependencies & Optimize Tmux Environment
For a seamless terminal experience in your browser (mouse support, clipboard integration, 256 colors, and viewer command integration), installing Node.js dependencies and configuring Tmux is essential. Use the automated setup script included in the project:

```bash
cd gemini-cli-wrapper

# 1. Install required Node.js modules (including node-pty)
npm install

# 2. Initialize Tmux settings and plugins (Run once)
./setup-tmux.sh
```
* **Features**: It adds missing essential options without overwriting your existing `~/.tmux.conf`. It also injects the terminal-based viewer trigger (`view <file>`) into your shell environment and automatically installs `tmux-resurrect` and `tmux-continuum` to back up and restore your sessions every 15 minutes.
* **Application**: After running the script, it is highly recommended to completely restart the Tmux server by running `tmux kill-server`.

### Step 2: Start the Backend Server
Run the included `run.sh` script to start the backend server.

```bash
./run.sh
```
* By default, the server listens only on `127.0.0.1:5001` (localhost). External access is blocked to enhance security.

---

## 3. Connecting via Web Browser

For security reasons, use SSH Local Port Forwarding to securely connect to the WebUI on the remote server from your local PC.

1. **On your local PC terminal**, create an SSH tunnel with the following command:
   ```bash
   ssh -L 5001:localhost:5001 <username>@<server_address>
   ```
2. **Open your web browser** and go to:
   👉 `http://localhost:5001`

---

## 4. Key Features & Usage

### 4.1. Session & Window Management
On the initial screen, you can view the list of all active Tmux sessions running on the server.
* **Connect & Create**: Click an existing session to connect, or click the `[New Gemini Session]` button to create a new background Tmux session and immediately launch the Gemini CLI.
* **Custom Session Names**: Click the ✏️ icon at the top of the terminal to rename the current session. The updated name automatically syncs with your **browser tab title**.
* **Keep Alive Setting**: In the Settings (⚙️) panel, enable the `Keep Tmux session alive after Gemini exits` option. If enabled, exiting the Gemini CLI (`/exit`) will drop you back into the default shell rather than closing the session.
* **Split Panes**: Use the ◫ (horizontal split) and ⬒ (vertical split) buttons in the top-right corner to divide your screen easily.
* **Focus Highlighting**: The active working window is displayed brightly, while inactive panes are dimmed, making it exceptionally clear which pane is currently in focus.

### 4.2. File Viewer & Markdown Sync
The wrapper supports a standalone viewer to read code or render documents directly within the Web UI.
* **Opening the Viewer**: 
    1. Right-click a file in the File Explorer and select `View (Split)`.
    2. Alternatively, type `view <filename>` in the terminal prompt to instantly pop up the viewer in the browser.
* **Live Reload**: Any file opened in the viewer will automatically refresh if a change is detected on the server.
* **Sync Scroll**: When rendering Markdown (`.md`) files, scrolling either the raw text pane or the rendered view will bidirectionally synchronize the scroll position of the other.
* **Open File Modal**: Clicking the `[Open]` button inside the Viewer allows you to navigate, sort, and quickly switch to a different file on the server.

### 4.3. File Explorer
Click the 📁 button on the left to open the sidebar and navigate the server's working directory.
* **Terminal Auto-Type**: **Double-click** any file or folder to automatically type its absolute path (`@/absolute/path/file.txt `) into the terminal prompt.
* **Drag and Drop**: Drag files from your local PC onto the sidebar to upload them instantly to the currently viewed directory.
* **Context Menu**: Right-click items to Download, Rename, Delete, or Open in Viewer.
* **Smart Auto-Sync**: When you change directories via `cd` in the terminal, or **when you switch between Tmux panes**, the explorer automatically tracks and refreshes to reflect the current working directory (PWD) of the active pane. You can also manually sync by clicking the 📍 pin icon next to the path bar.

### 4.4. Image & Clipboard
* **Paste Screenshots**: Press `Ctrl+V` to paste an image from your local PC directly into the terminal. The image is instantly saved to a `screenshots/` folder inside your current PWD, and its path is automatically typed into the terminal.
* **Thumbnail Bar**: The top center of the terminal displays up to 5 thumbnails of recently uploaded images.
    * Click: Opens a popup modal to view the enlarged original image.
    * Check & Insert: Select multiple checkboxes and click `[Insert Selected]` to append multiple image paths into the prompt at once.
* **Clipboard History**: Dragging your mouse to select text in the terminal automatically copies it to your browser clipboard and adds it to the `Clipboard History` list at the bottom of the sidebar (up to 5 items). Clicking an item re-copies it for quick use.

### 4.5. Additional Settings (UI & Key Mapping)
* **Custom Key Mapping**: In the Settings (⚙️) panel, you can record specific browser keyboard combinations (e.g., `Cmd+Y`, `Home`) and map them to send custom keystroke sequences to the remote server.
* **Theme & Font**: Choose between Dark and Light themes. Your selected coding font (e.g., D2Coding) and font size adjustments are automatically saved in the browser's `localStorage` and persist across reloads.

---

🎉 **Experience the most advanced and convenient SSH terminal AI environment with the Gemini CLI WebUI Wrapper today!**