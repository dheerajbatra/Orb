# ✦ Orb — AI Desktop Assistant for macOS

A floating AI overlay that lives on your Mac desktop. Works with Claude, OpenAI, OpenRouter (100+ models), and local models (Ollama, LM Studio). Understands screen context for coding, math, and research.

---

<img width="1440" height="827" alt="Orb - Step by Step Guide" src="https://github.com/user-attachments/assets/59db21d4-79a7-410c-9917-89d6561ecaf5" />
<video src="https://github.com/user-attachments/assets/0963df75-a369-42f7-8e66-5c1d2153279c" type="video/mp4"></video>
<img width="507" height="811" alt="Orb - Maths Assistant" src="https://github.com/user-attachments/assets/f20294f6-63fc-44e9-af11-e1a1e093e5f2" />

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

The app appears in the bottom-right corner of your screen and hides from the Dock (lives in the menu bar).

### 3. Configure your AI provider

Click the ⚙ icon in the Orb window, choose a provider, enter your API key, and hit **Save & Close**.

---

## Features

- **Floating overlay** — always on top, transparent background, drag anywhere, position remembered across restarts
- **Global hotkey** — `⌘⇧Space` to show/hide from any app (customizable)
- **Screen capture** — capture the active window or draw a custom region for visual context
- **Multi-provider** — Anthropic, OpenAI, OpenRouter, any OpenAI-compatible API, Ollama, LM Studio. Also tested with Mac compatible MLX models. 
- **Chat history** — sessions auto-saved to disk, browseable in the sidebar, individually deletable
- **Dark & Light mode** — toggle in Settings, applied instantly
- **Response modes** — get a direct answer, a step-by-step walkthrough, or just a hint
- **Audience levels** — High School / College / Professional tone switching
- **Context modes** — Auto / Code / Math / Research
- **Markdown rendering** — code blocks, bold, headers, bullet lists, links
- **Math rendering** — KaTeX for inline `$...$` and display `$$...$$` / `\[...\]` equations
- **Persistent config** — saved to `~/.orb-assistant/config.json`

---

## Providers & Models

### Anthropic
Requires an API key from [console.anthropic.com](https://console.anthropic.com). Supports vision (images attached automatically).

| Preset | Model ID |
|---|---|
| claude-sonnet-4 | `claude-sonnet-4-20250514` |
| claude-opus-4 | `claude-opus-4-20250514` |
| claude-haiku-3.5 | `claude-haiku-3-5-20241022` |

### OpenAI
Requires an API key from [platform.openai.com](https://platform.openai.com). Supports vision.

| Preset | Model ID |
|---|---|
| gpt-4o | `gpt-4o` |
| gpt-4o-mini | `gpt-4o-mini` |
| o3-mini | `o3-mini` |

### OpenRouter
Access 100+ models with a single API key. Get a free key at [openrouter.ai](https://openrouter.ai). Supports vision on capable models.

| Preset | Model ID |
|---|---|
| nemotron-70b | `nvidia/llama-3.1-nemotron-70b-instruct` |
| deepseek-r1 | `deepseek/deepseek-r1` |
| gemini-flash-2.0 | `google/gemini-flash-2.0` |
| mistral-large | `mistralai/mistral-large` |
| qwen-2.5-72b | `qwen/qwen-2.5-72b-instruct` |

You can type **any model ID** from the OpenRouter catalogue directly into the Model field — the presets above are just shortcuts.

### Ollama (local)
Run `ollama serve` in Terminal first. No API key needed.

| Preset | Notes |
|---|---|
| `llama3.2` | Meta Llama 3.2 |
| `llama3.1` | Meta Llama 3.1 |
| `mistral` | Mistral 7B |
| `codellama` | Code-optimized Llama |
| `qwen2.5-coder` | Qwen 2.5 Coder |
| `phi4` | Microsoft Phi-4 |
| `deepseek-r1` | DeepSeek R1 (local) |
| `gemma3` | Google Gemma 3 |

Install any model with `ollama pull <model>`. Default endpoint: `http://localhost:11434/api/chat`.

### LM Studio (local)
Start LM Studio → Local Server → Start Server. No API key needed. Default endpoint: `http://localhost:1234/v1/chat/completions`. Use the model identifier shown in LM Studio.

### OpenAI-compatible (custom)
Works with any API that follows the OpenAI `/v1/chat/completions` format. Set the full endpoint URL in Settings. API key is optional.

---

## Chat History & Sessions

Orb automatically saves every conversation to disk as a named session.

- **Sidebar** — click the history icon (top bar) to browse past sessions, sorted newest-first
- **Auto-save** — sessions are saved after every AI response
- **Resume** — click any session to reload the full conversation
- **Delete** — click ✕ on a session to remove it permanently
- **New session** — click `+` to start fresh (current session is saved automatically)

History is stored at `~/.orb-assistant/history.json`.

---

## Response Modes

Switch how Orb responds using the three buttons in the toolbar:

| Mode | What it does |
|---|---|
| **Answer** | Gives you a direct, complete response (default) |
| **Step by step** 🪜 | Walks through the solution one numbered step at a time, explaining the reasoning at each stage — great for learning |
| **Hint only** 💡 | Gives a single nudge in the right direction without revealing the answer — ideal for working through problems yourself |

---

## Context Modes

| Mode | Best for |
|---|---|
| **Auto** | General use — Orb detects context automatically |
| **Code** | Code review, debugging, refactoring, test writing |
| **Math** | Step-by-step solutions with LaTeX equations |
| **Research** | Summaries, key claims, methodology breakdowns |

---

## Audience Levels

| Level | Tone |
|---|---|
| **High School** | Simple language, relatable analogies, no jargon |
| **College** | Accurate terminology, clear reasoning, academic depth |
| **Professional** | Direct, precise, technically accurate (default) |

---

## Dark & Light Mode

Toggle between **Dark** 🌙 and **Light** ☀️ in ⚙ Settings → Appearance. The theme applies instantly to both the Orb window and the Settings panel.

---

## Screen Recording Permission

macOS requires explicit permission for screen capture.

Go to **System Settings → Privacy & Security → Screen Recording** and enable Orb.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘⇧Space` | Toggle show/hide (customizable in Settings) |
| `Enter` | Send message |
| `Shift+Enter` | Newline in input |
| `⌘⇧C` | Capture active window |

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
  "theme": "dark",
  "hotkey": "CommandOrControl+Shift+Space",
  "screenshotOnActivate": false,
  "customEndpoint": "",
  "position": { "x": null, "y": null }
}
```

---

## Project structure

```
orb-assistant/
├── src/
│   ├── main.js          # Electron main process (window, tray, hotkeys, AI routing, history)
│   ├── preload.js       # Secure IPC bridge
│   ├── index.html       # Main overlay UI
│   ├── renderer.js      # UI logic, markdown, KaTeX, sessions, response modes
│   ├── settings.html    # Settings window (provider, model, theme, hotkey)
│   └── crop.html        # Region-select overlay for screen capture
├── assets/
│   └── tray-icon.png    # Menu bar icon (16x16 or 22x22 @2x)
├── package.json
└── README.md
```

---

## Tray icon

Place a 22x22px PNG at `assets/tray-icon.png`. For Retina, also add `assets/tray-icon@2x.png`. A simple circle or the ✦ symbol works well as a monochrome template image — macOS handles dark/light menu bar automatically.
