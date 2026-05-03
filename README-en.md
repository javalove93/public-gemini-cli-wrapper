# Gemini CLI Wrapper (gcw)

A **Tmux-based Web UI wrapper** designed to make the Gemini CLI easily accessible from web browsers and mobile environments. It combines the power of the terminal with the convenience of the web, providing an uninterrupted development experience anywhere.

## ✨ Key Features

- **Persistent Sessions**: Powered by Tmux, your workspace context remains exactly as you left it, even if you close your browser or lose your network connection.
- **Image Upload & Auto-Reference**: Simply paste an image from your clipboard into the web UI. It automatically uploads to the server and inserts the path as `@path/to/image` directly into your terminal.
- **Powerful File Viewer**: Features a dedicated viewer for real-time inspection of text, Markdown (with split view and synchronous scrolling), and image files.
- **Mobile Support**: Connects with a Telegram bot, allowing simultaneous access to your workspace from your mobile device.
- **AI Agent Practices**: The `.agent/` directory shares useful rules and best practices for collaborating effectively with AI agents.
- **Voice Prompt Input (STT)**: Use the Web Speech API to dictate your prompts directly into the terminal with a single click or keyboard shortcut.

## Demo & Videos
<img width="819" height="391" alt="image" src="https://github.com/user-attachments/assets/91d1d38d-d974-4d7d-9000-19655a937885" />

<img width="1890" height="1009" alt="snap0230" src="https://github.com/user-attachments/assets/c4cc3c53-6a5b-4b72-8273-1ae29933140d" />

### Voice Prompt Input
<video src="https://github.com/user-attachments/assets/3abfbe68-a23a-4280-92c1-5a963ecc3198"
     controls="controls" style="max-width: 100%; height: auto;">
</video>

*  Additional Videos (Korean)
     *  https://youtu.be/OrB4tIcn-Do - Discussing Refactoring Rules
     *  https://youtu.be/z5kELIYIj30 - Discussing Refactoring Tools
     *  https://youtu.be/n-GWdYEBBn8 - Determining Additional Refactoring Targets
     *  https://youtu.be/VO51VLH2MLc - System Monitoring & Code Review via Sub-sessions
     *  https://youtu.be/8tw2Gujq5WE - Adding Harness Rules as Feedback
     *  https://youtu.be/AxD_h1U9Eao - Directing a Sub-session to Write a Task Plan
     *  https://youtu.be/HiByyLv-6-o - Remaining Refactoring Tasks
     *  https://youtu.be/lQstH5bhzes - Reflecting AI Opinion Methods into Harness Engineering Feedback

## 🚀 Getting Started

### 1. Prerequisites

Ensure you have the following tools installed:

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Tmux](https://github.com/tmux/tmux) (Terminal session manager)
- [Gemini CLI](https://ai.google.dev/gemini-api/docs/gemini-cli) (`npm install -g @google/gemini-cli`)

### 2. Installation

Build tools are required during the node module installation process:

```bash
sudo apt-get update && sudo apt-get install -y build-essential
```

Install tmux:

```bash
sudo apt-get install tmux
```

Clone and install dependencies:

```bash
git clone https://github.com/your-username/public-gemini-cli-wrapper.git
cd public-gemini-cli-wrapper
npm install
```

### 3. Tmux Environment Setup (One-time Setup)

Run the following script to optimize settings (clipboard, colors, etc.) for seamless integration between the Web UI and Tmux. (Your existing `~/.tmux.conf` will be backed up.)

```bash
./setup-tmux.sh
```

### 4. Run the Server

```bash
# Runs on the default port 5001
./run.sh
```

### 5. Access via Browser

If port 5001 is open externally or you have a browser locally, you can use that. However, if you are connecting from a remote host without a browser, SSH port forwarding is required.

```bash
ssh -L 35001:127.0.0.1:5001 <hostname>
```

Then, open `http://localhost:35001` in the browser on your SSH client machine. (Adjust the port number according to your client environment).

### 🐳 Docker Support (Alternative)
If it's difficult to set up a Tmux environment natively (e.g., on Windows), you can run it using Docker. For more details, refer to the **[Docker Guide](docs/docker-guide.md)**.

## 📂 Project Structure

- `src/`: Session management and API server logic (Node.js)
- `public/`: Web UI assets (JS Core, Svelte components, CSS)
- `docs/`: Detailed user guides and documentation
- `.agent/`: Core directives and project rules for AI agent collaboration

## 🤝 Contributing

This project includes many experimental features. Bug reports and feature suggestions are always welcome via Issues or Pull Requests.

## 📄 License

MIT License