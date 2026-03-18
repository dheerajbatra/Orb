# ✦ Orb — AI Desktop Assistant for macOS

A floating AI overlay that lives on your Mac desktop. Works with Claude, OpenAI, and local models (Ollama, LM Studio). Understands screen context for coding, math, and research.

---

## Quick Start

### 1. Install dependencies

```bash
cd orb-assistant
npm install
```

### 2. Run the app

```bash
npm start
```

The app will appear in the bottom-right corner of your screen and hide from the Dock (lives in the menu bar).

### 3. Configure your API key

Click the ⚙ icon in the Orb window, enter your API key, and hit Save.

---

## Features

- **Floating overlay** — always on top, transparent background, drag anywhere
- **Global hotkey** — `⌘⇧Space` to show/hide from any app
- **Screen capture** — captures your screen for context when you ask questions
- **Multi-provider** — Anthropic Claude, OpenAI, any OpenAI-compatible API, Ollama, LM Studio. Also tested with Mac optimized MLX models. 
- **Audience levels** — High School / College / Professional tone switching
- **Context modes** — Auto / Code / Math / Research
- **Markdown rendering** — code blocks, bold, headers, lists
- **Persistent config** — saved to `~/.orb-assistant/config.json`

---

## Providers

| Provider | Model field | Notes |
|---|---|---|
| **Anthropic** | `claude-sonnet-4-20250514` | Default. Needs API key. |
| **OpenAI** | `gpt-4o` | Needs API key. |
| **OpenAI-compatible** | your model name | Set custom endpoint URL |
| **Ollama** | `llama3`, `mistral`, etc. | Run `ollama serve` first |
| **LM Studio** | `local-model` | Start LM Studio server first |

---

## Screen Recording Permission

macOS requires explicit permission for screen capture.

Go to **System Settings → Privacy & Security → Screen Recording** and enable Orb.

---

## Build a distributable .dmg

```bash
npm run build
```

Output will be in the `dist/` folder.

---

## Config file

Located at `~/.orb-assistant/config.json`. You can edit this directly:

```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-...",
  "model": "claude-sonnet-4-20250514",
  "audienceLevel": "professional",
  "hotkey": "CommandOrControl+Shift+Space",
  "screenshotOnActivate": true
}
```

---

## Project structure

```
orb-assistant/
├── src/
│   ├── main.js          # Electron main process (window, tray, hotkeys, AI routing)
│   ├── preload.js       # Secure IPC bridge
│   ├── index.html       # Main overlay UI
│   ├── renderer.js      # UI logic, markdown, AI calls
│   └── settings.html    # Settings window
├── assets/
│   └── tray-icon.png    # Menu bar icon (16x16 or 22x22 @2x)
├── package.json
└── README.md
```

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘⇧Space` | Toggle show/hide |
| `Enter` | Send message |
| `Shift+Enter` | Newline in input |
| `⌘⇧C` | Capture screen (in-app button) |

---

## Adding a tray icon

Place a 22x22px PNG at `assets/tray-icon.png`. For Retina, also add `assets/tray-icon@2x.png`.

A simple circle or the ✦ symbol works well as a monochrome template image.
