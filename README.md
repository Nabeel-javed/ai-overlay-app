# Spectro

A personal macOS overlay for asking questions about text and screenshots using your existing ChatGPT/Codex and Claude subscriptions.

## Models and connections

| Provider | Model | Runtime |
| --- | --- | --- |
| OpenAI | **GPT-6 Astra** (`gpt-6-astra`) | Official Codex app-server, signed in with ChatGPT |
| Anthropic | **Sonnet / Opus**, switchable | Official Claude Agent SDK and your installed Claude Code |

Claude uses the official `sonnet` and `opus` aliases, so new versions follow the installed client's routing. The response header and saved history show the model reported by the provider. OpenAI stays on Astra; the old o4-mini/GPT-4.1 picker is removed. Gemini and DeepSeek are no longer available.

The app uses native clients directly. It has no API-key form, API fallback, subscription proxy, or token-copying workflow. Usage shares your subscription limits. Any extra usage enabled on your provider account still follows that account's billing settings.

## Run on your Mac

Requirements: Apple Silicon macOS, Node.js **22.12+**, Codex **0.163.0+**, and Claude Code **2.1.304+**. These are the minimum client versions validated with this integration.

1. Install the official [Codex CLI](https://learn.chatgpt.com/docs/codex-cli) and [Claude Code](https://code.claude.com/docs/en/setup).
2. Sign into your subscription accounts, either in **Settings** or in Terminal:

   ```sh
   codex login
   claude auth login
   ```

3. From this repository:

   ```sh
   npm ci
   npm start
   ```

Open **Settings → Refresh connections** to check both clients. Select OpenAI for Astra, or Claude and then Sonnet/Opus. Client binaries are resolved directly; shell aliases and environment variables for API keys or alternate gateways are not inherited.

To create a local Apple Silicon app and DMG:

```sh
npm run dist:mac
```

Outputs are under `dist/`. Local builds are unsigned unless you configure your own Apple signing identity. Windows packaging remains available in the repository but this subscription integration has only been validated on macOS.

## Using the overlay

- Type a question, optionally capture a screenshot, and press **Send**. Screen capture requires macOS Screen Recording permission. Captures target the display under the pointer, hide the overlay during capture, and are sent only when you submit.
- Answers stream as text, then render as sanitized Markdown and LaTeX. Press **Stop** or **Esc** to cancel. Only completed answers are saved.
- OpenAI and Claude keep separate conversations, including after an app restart. Switching Sonnet/Opus continues the Claude conversation. **New chat** resets both provider conversations.
- The history arrows browse the last 50 answers. **Continue this chat** forks the saved conversation at that answer, so later turns do not leak into the restored branch. Imported API-era answers can be viewed but have no native session to resume.
- Changing providers while an answer streams affects the next request. A request retains the provider/model it started with.

Content protection is enabled, but it does **not** guarantee that the overlay is invisible to screen-sharing or recording software. Verify your sharing setup yourself.

## Keyboard shortcuts

| Action | macOS shortcut |
| --- | --- |
| Show / focus | Cmd+Shift+O |
| Hide / show | Cmd+Shift+H |
| Capture screen | Cmd+Shift+S |
| Send | Cmd+Enter |
| Stop; otherwise hide | Esc |
| New chat, while overlay focused | Cmd+R |
| Switch provider | Cmd+Shift+P |
| OpenAI / Claude | Cmd+1 / Cmd+4 |
| Switch Sonnet / Opus | Cmd+Shift+R |
| Browse saved responses | Cmd+Up / Cmd+Down |
| Copy answer | Cmd+Shift+C |
| Move overlay | Cmd+Option+Arrow |
| Opacity | Cmd+[ / Cmd+] |
| Scroll answer | Page Up / Page Down, Option+Up / Option+Down |

Shortcuts may be unavailable if another app already registered them. Window position, size, and opacity are preserved.

## Storage and migration

Settings, sessions, and saved answers use a new encrypted `spectro-v2.json` in Electron's Spectro user-data directory. Its random key is protected by Electron's OS-backed `safeStorage`. Screenshot attachments use authenticated AES-256-GCM encryption and are pruned when their saved answers are removed.

On first launch, the app imports the previous settings, window state, and most recent 50 saved responses. It preserves the original `config.json` for rollback and does not import API keys. That old file may still contain your old keys. Clearing history removes Spectro's saved answers and attachments; it does not delete native Codex/Claude transcripts or reset provider conversations. Use **New chat** to reset the active conversations.

Credentials remain managed by the official clients. The renderer receives connection status and answers, not credentials. Both adapters disable agent tools, MCP integrations, and hooks for overlay requests. User-submitted text and screenshots still go to the selected cloud provider; subscription access does not make inference local.

## Code and checks

| File | Responsibility |
| --- | --- |
| `main.js` | App startup, validated IPC, shortcuts |
| `src/models.js` | Model allowlist, settings and request validation |
| `src/providers/` | Native Codex JSON-RPC and Claude SDK adapters |
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
npm run pack -- --mac --arm64
node scripts/packaged-check.cjs # Real requests through the built Mac app
```

Live tests submit only synthetic text and a generated red image, not your desktop. They cover Astra image input, restart/resume, history forking and cancellation, plus Sonnet/Opus image input. A provider quota block is reported as **blocked**, not as successful inference. The packaged check also accepts `--capture` to verify a local desktop preview after all provider requests; that capture is removed without being sent or saved.

Validated on 2026-10-20 with Electron 44.9.1, Codex 0.163.0, Claude Code 2.1.304 and Claude Agent SDK 0.3.304. Astra live checks passed. Claude authentication succeeded, but both Sonnet and Opus returned the account's monthly spend-limit error; successful Claude inference and native Claude conversation resume remain unverified until that quota is available. The app displays the provider error without saving it as an answer.

`npm audit --omit=dev` reported no runtime vulnerabilities. The development dependency tree still has eight moderate advisories through electron-builder's dependency chain; no forced downgrade was applied.

## Troubleshooting

- **Setup needed:** check Settings, update the indicated native client, then sign in using the subscription account.
- **Usage/spend limit:** wait for the provider's reset or review your account's usage settings. The app does not switch accounts, models, or billing routes to bypass limits.
- **Capture failure:** grant Screen Recording permission to Spectro (or Electron during development), then restart it.
- **Secure storage failure:** unlock your login keychain and restart. Existing files are preserved if migration cannot read them.
- **Broken old session:** start a new chat. A cancelled or failed turn clears the active session pointer so partial native context is not silently reused.

## Changelog

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
