# ONCE Window Guide for macOS

A native menu bar helper. Press one button, and ONCE looks at the window in
front of you and answers questions like:

- Where is the Export button?
- How do I find this file?
- How do I open this in another app?
- What is this control for?

It is a menu bar app rather than a browser extension because the goal is to
help with any Mac window, not only a web page. It does not record the screen in
the background. It captures one window only when you press **Look at this
window**, sends that image to your ONCE backend, and deletes the temporary file
immediately. The backend processes the image in memory and does not persist or
log the screenshot.

## Requirements

- macOS 14 or newer
- Swift 6 command line tools
- The ONCE backend running on `http://localhost:8000` by default; set
  `ONCE_API_URL` and `ONCE_WEB_URL` to point at a deployed stack.
- A live vision model. The active setup uses OpenRouter's hosted
  `google/gemini-3.8-flash`; the local Ollama fallback uses `qwen2.5vl:3b`.
  Window guidance returns an honest error if vision is unavailable.

## Build and run

```bash
./scripts/build-macos.sh --open
```

Click the eye icon in the menu bar. macOS asks for permissions when they are
first needed:

- **Screen Recording** for the one-window capture.
- **Microphone** for voice questions.
- **Speech Recognition** for the transcript.

Enable **ONCE Window Guide** in System Settings, Privacy & Security under each
of those three panes, then reopen the app. The menu bar app is intentionally
not in the Dock.

Voice audio is processed on this Mac by Apple's Speech framework
(`requiresOnDeviceRecognition`). If the on-device model is unavailable, the
helper reports that instead of silently uploading the microphone. ONCE receives
the transcript as text, not the audio.

## Save the answer as a skill

1. Ask about the window.
2. Press **Save as skill**. This writes a real `desktop_workflow` record to the
   same ONCE store used by the web app.
3. Press **Save SKILL.md for AI agents**. The helper writes a portable agent
   skill folder to:

```text
~/Library/Application Support/ONCE/agent-skills/<skill-name>/SKILL.md
```

It also writes `once-window-source.json` with provenance. Copy the folder into
your agent's skills directory, for example `~/.claude/skills/`, and the agent
can load the method later. The export contains the answer you approved, not the
screenshot, demo identity, or access grants.

## What is not claimed

- This is not an Alexa+ device or SDK integration.
- The helper does not run OCR locally. It sends the one screenshot to the
  configured ONCE vision provider and labels the engine, including
  `fallback from ...` when a configured fallback ran.
- It does not automate clicks or read the screen continuously. It answers and
  saves a reusable skill.
