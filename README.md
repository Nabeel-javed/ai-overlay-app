# Spectro

A personal macOS overlay for asking questions about text and screenshots using your existing ChatGPT/Codex, Claude and Grok subscriptions. The default view sends the same text and image to all three concurrently.

## Models and connections

| Provider | Model | Runtime |
| --- | --- | --- |
| OpenAI | **GPT-6 Astra** (`gpt-6-astra`) | Official Codex app-server, signed in with ChatGPT |
| Anthropic | **Sonnet / Opus**, switchable | Official Claude Agent SDK and your installed Claude Code |
| xAI | **Grok 4.7** (`grok-4.7`) | Official Grok CLI, signed in with Grok |

Claude uses the official `sonnet` and `opus` aliases, so new versions follow the installed client's routing. The response header and saved history show the model reported by the provider. OpenAI stays on Astra; the old o4-mini/GPT-4.1 picker is removed. Gemini and DeepSeek are no longer available.

Grok 4.7 is the latest flagship model listed in the [official xAI catalogue](https://docs.x.ai/developers/models) checked on 2026-10-20. Its [official CLI](https://docs.x.ai/build/cli/reference) supports subscription OAuth, image prompts and streaming output.

The app uses native clients directly. It has no API-key form, API fallback, subscription proxy, or token-copying workflow. Usage shares your subscription limits. Any extra usage enabled on your provider account still follows that account's billing settings.

## Run on your Mac

Requirements: Apple Silicon macOS, Node.js **22.12+**, Codex **0.163.0+**, Claude Code **2.1.304+**, and Grok CLI **1.0.62+**. These are the minimum client versions validated with this integration.

1. Install the official [Codex CLI](https://learn.chatgpt.com/docs/codex-cli), [Claude Code](https://code.claude.com/docs/en/setup), and [Grok CLI](https://docs.x.ai/build/cli).
2. Sign into your subscription accounts, either in **Settings** or in Terminal:

   ```sh
   codex login
   claude auth login
   grok login --oauth
   ```

3. From this repository:

   ```sh
   npm ci
   npm start
   ```

Open **Settings → Refresh connections** to check all three clients. **All three** is the default; select OpenAI, Claude or Grok for a single-provider conversation. Sonnet/Opus selection also applies to comparison rounds. Client binaries are resolved directly; shell aliases and environment variables for API keys or alternate gateways are not inherited.

To create a local Apple Silicon app and DMG:

```sh
npm run dist:mac
```

Outputs are under `dist/`. Local builds are unsigned unless you configure your own Apple signing identity. Windows packaging remains available in the repository but this subscription integration has only been validated on macOS.

## Using the overlay

- Type a question, capture a screenshot, attach a PNG/JPEG, or paste an image, then press **Send**. Screen capture requires macOS Screen Recording permission. Captures target the display under the pointer, hide the app during capture, and are sent only when you submit.
- **All three:** dispatches identical text, instructions and image concurrently. Each model starts with fresh conversation context, streams independently, and has its own Copy/Stop controls. A failure or timeout leaves the other models running. **Stop** or **Esc** cancels all remaining answers.
- Finished answers render as sanitized Markdown and LaTeX. Identical complete text is labelled as agreement, never as verified correctness. Different wording is left for you to compare; there is no extra judge-model request or semantic scoring.
- **Single provider:** OpenAI, Claude and Grok keep separate conversations across restarts. Switching Sonnet/Opus continues the Claude conversation. **New chat** resets all three. Comparison rounds neither read nor modify those conversations.
- History keeps the latest 50 single answers or comparison rounds. A round is saved if at least one model completes; failed cards retain their error, not partial output. **Continue this chat** forks saved Astra/Claude answers at that exact turn. Saved Grok answers and comparison rounds are review-only; current Grok conversations still support normal follow-ups and restart/resume.
- Changing the selected provider/model during a request affects the next send. In-flight requests retain their starting settings. Higher reasoning effort can improve difficult answers but adds latency; Low is the default for Astra and Grok.

## Screen-sharing privacy

Content protection is applied to both the overlay and Settings, and both are hidden from Mission Control on macOS. **Cmd+Shift+Escape** always hides all app windows. Hiding during a pending screenshot or window load prevents it from unexpectedly reopening the app.

There is no universal invisibility guarantee. [Electron explicitly warns](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows) that ScreenCaptureKit-based capture can bypass content protection. [OBS uses ScreenCaptureKit](https://obsproject.com/kb/macos-screen-capture-source), and meeting clients have different capture paths and updates. A local passing check does not certify Zoom, Meet, Teams or OBS, remote participant output, every macOS version, or every capture mode.

Run `npm run test:privacy` (or append `-- --packaged` for the built app). It compiles a small native ScreenCaptureKit probe and captures the full display from an independent process with no exclusions. Each window is tested with protection off, on, then off again. Synthetic marker pixel counts establish calibration; no desktop image is stored or transmitted. Missing recording permission or calibration is reported as blocked/inconclusive, never as a pass. Requires macOS 14+ and Xcode command-line tools. Results are written under `.artifacts/`. On this Mac (macOS 15.8.1), both overlay and Settings passed: their markers were visible in both controls and absent with protection enabled.

## Keyboard shortcuts

| Action | macOS shortcut |
| --- | --- |
| Show / focus | Cmd+Shift+O |
| Hide / show all app windows | Cmd+Shift+H |
| Always hide all app windows | Cmd+Shift+Escape |
| Capture screen | Cmd+Shift+S |
| Send | Cmd+Enter |
| Stop; otherwise hide | Esc |
| New chat, while overlay focused | Cmd+R |
| Switch provider | Cmd+Shift+P |
| All three | Cmd+0 |
| OpenAI / Claude / Grok | Cmd+1 / Cmd+4 / Cmd+5 |
| Switch Sonnet / Opus | Cmd+Shift+R |
| Browse saved responses | Cmd+Up / Cmd+Down |
| Copy answer | Cmd+Shift+C |
| Move overlay | Cmd+Option+Arrow |
| Opacity | Cmd+[ / Cmd+] |
| Scroll answer | Page Up / Page Down, Option+Up / Option+Down |

Shortcuts may be unavailable if another app already registered them. Window position, size, and opacity are preserved.

## Storage and migration

Settings, sessions, and saved answers use a new encrypted `spectro-v2.json` in Electron's Spectro user-data directory. Its random key is protected by Electron's OS-backed `safeStorage`. Screenshot attachments use authenticated AES-256-GCM encryption and are pruned when their saved answers are removed.

On first launch, the app imports the previous settings, window state, and most recent 50 saved responses. It preserves the original `config.json` for rollback and does not import API keys. That old file may still contain your old keys. Clearing history removes Spectro's saved answers and attachments; it does not delete native Codex/Claude/Grok transcripts or reset provider conversations. Use **New chat** to reset the active conversations.

Credentials remain managed by the official clients. The renderer receives connection status and answers, not credentials. The adapters restrict agent tools, MCP integrations and personal hooks for overlay requests. Grok uses an isolated client configuration, disables discovered plugins and skills, and gives its native client the supported `GROK_AUTH_PATH` pointing to its existing credentials; Spectro does not read or copy those credentials. Its temporary image/prompt input file is owner-only and removed after the request. Native clients still retain their own transcripts. User-submitted text and screenshots still go to the selected cloud provider (all three in comparison mode); subscription access does not make inference local.

## Code and checks

| File | Responsibility |
| --- | --- |
| `main.js` | App startup, validated IPC, shortcuts |
| `src/models.js` | Model allowlist, settings and request validation |
| `src/providers/` | Native Codex JSON-RPC, Claude SDK and Grok streaming CLI adapters |
| `src/contracts.d.ts` | Shared adapter/request/result contracts |
| `src/requests.js` | Request snapshot, stream, cancel, timeout, resume |
| `src/storage.js` | Migration, encrypted history and attachments |
| `src/windows.js` | Overlay/settings windows and screenshot capture |
| `renderer.js`, `render-content.js` | UI state, sanitized Markdown and math |
| `test/` | Core regressions and native Electron UI tests |

```sh
npm test                 # Offline core regression tests
npm run test:ui          # Native Electron UI tests, isolated app data
npm run test:live        # Real subscription requests; consumes quota
node scripts/live-check.cjs --grok-only # Grok image, restart/resume and cancel
npm run test:privacy     # Local capture test; no cloud requests
npm run pack -- --mac --arm64
node scripts/packaged-check.cjs # Real requests through the built Mac app
```

Live tests submit only synthetic text and a generated red image, not your desktop. They cover Astra image input, restart/resume, history forking and cancellation, plus Sonnet/Opus image input and Grok image, restart/resume and cancellation. The packaged check sends one image round to all three and checks Opus separately. A provider quota block is reported as **blocked**, not as successful inference. The packaged check also accepts `--capture` to verify a local desktop preview after all provider requests; that capture is removed without being sent or saved.

Validated on 2026-10-20 with Electron 44.9.1, Codex 0.163.0, Claude Code 2.1.304, Claude Agent SDK 0.3.304 and Grok CLI 1.0.62. A live parallel screenshot round returned the correct test colour from GPT-6 Astra, Claude Sonnet 5.5 and Grok 4.7. All three adapters started within the same millisecond; that tiny test completed in approximately 2.5–5 seconds, which is not a general latency guarantee. Claude's earlier monthly quota block did not recur in this check. Grok image input, restart/resume and cancellation also passed live checks.

`npm audit --omit=dev` reported no runtime vulnerabilities. The development dependency tree still has eight moderate advisories through electron-builder's dependency chain; no forced downgrade was applied.

## Troubleshooting

- **Setup needed:** check Settings, update the indicated native client, then sign in using the subscription account.
- **Usage/spend limit:** wait for the provider's reset or review your account's usage settings. The app does not switch accounts, models, or billing routes to bypass limits.
- **Capture failure:** grant Screen Recording permission to Spectro (or Electron during development), then restart it.
- **Secure storage failure:** unlock your login keychain and restart. Existing files are preserved if migration cannot read them.
- **Broken old session:** start a new chat. A cancelled or failed turn clears the active session pointer so partial native context is not silently reused.

## Changelog

### Current update — Parallel comparison and capture privacy

- Added Grok 4.7 through the official subscription-authenticated native CLI.
- Added a default three-model comparison, separate streaming/cancellation, image attachment/paste and grouped history.
- Hardened hide behavior for Settings and capture races, and added a calibrated native ScreenCaptureKit probe.

### v2.0.0 — Personal subscription integration

- Replaced API calls with official subscription-authenticated native clients.
- Fixed OpenAI on GPT-6 Astra; added Sonnet/Opus selection.
- Added streaming, cancellation, persistent sessions and explicit history branching.
- Split the main process into provider, request, storage and window modules.
- Added encrypted storage migration, renderer isolation, sanitization and regression checks.
- Removed Gemini, DeepSeek, API-key setup and unused license/network code.

The entries below describe historical releases, including features removed in v2.

### v1.2.0 - Spectro Rebranding
- Rebranded to "Spectro" for better market positioning
- Added DeepSeek R1 reasoning support
- Implemented OpenAI model cycling with Ctrl+Shift+M
- Added comprehensive keyboard shortcuts for Mac/Windows
- Improved provider switching interface
- Enhanced screenshot analysis capabilities
- Automatic temperature adjustment for o4-mini (1.0)
- Enhanced mathematical notation rendering for o4-mini (Unicode to LaTeX conversion)

### v1.1.0
- Added multi-provider support (OpenAI, Gemini, DeepSeek)
- Implemented provider-specific keyboard shortcuts
- Added screen sharing safe interface

### v1.0.0
- Initial release as AI Overlay App
- Basic AI overlay functionality
- Screenshot integration
- Google Gemini support
