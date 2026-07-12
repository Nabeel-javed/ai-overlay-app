# Spectro

A powerful desktop overlay application that provides quick access to multiple AI providers (OpenAI, DeepSeek, and Anthropic Claude) with screenshot capabilities and extensive keyboard shortcuts for seamless workflow integration.

## Features

- **Multi-Provider Support**: OpenAI (GPT-5.6 Terra / Sol), DeepSeek (V4 Flash / V4 Pro), and Anthropic Claude (Sonnet 5 / Opus 4.8)
- **Screenshot Integration**: Capture and analyze screenshots with AI
- **Always-on-Top Overlay**: Stays visible during screen sharing and presentations
- **Extensive Keyboard Shortcuts**: Control everything without touching the mouse
- **Screen Sharing Safe**: Provider selection hidden from screen capture
- **Enhanced Math Rendering**: Automatic LaTeX formatting with Unicode-to-LaTeX symbol conversion for OpenAI responses
- **Customizable Opacity**: Adjust window transparency
- **Cross-Platform**: Available for macOS and Windows

## Installation

### Prerequisites
- Node.js 16 or higher
- npm or yarn package manager

### From Source
```bash
git clone https://github.com/Nabeel-Javaid/spectro.git
cd spectro
npm install
npm start
```

### Pre-built Releases
Download the latest release for your platform:
- **macOS**: Download the `.dmg` file
- **Windows**: Download the `.exe` file

## Setup

1. **First Launch**: The app will prompt you to enter your API key
2. **API Keys**: You can set up keys for multiple providers:
   - OpenAI API Key
   - DeepSeek API Key
   - Anthropic Claude API Key
3. **Provider Selection**: Choose your preferred AI provider from the main interface

## Keyboard Shortcuts

### Universal Shortcuts (macOS / Windows)

| Action | macOS | Windows/Linux |
|--------|--------|---------------|
| **Show/Focus App** | `Cmd+Shift+O` | `Ctrl+Shift+O` |
| **Hide/Show Toggle** | `Cmd+Shift+H` | `Ctrl+Shift+H` |
| **Take Screenshot** | `Cmd+Shift+S` | `Ctrl+Shift+S` |
| **Reset Tool** | `Cmd+R` | `Ctrl+R` |

### Provider Management

| Action | macOS | Windows/Linux |
|--------|--------|---------------|
| **Switch to OpenAI** | `Cmd+1` | `Ctrl+1` |
| **Switch to DeepSeek** | `Cmd+2` | `Ctrl+2` |
| **Switch to Claude** | `Cmd+3` | `Ctrl+3` |
| **Cycle Providers** | `Cmd+Shift+P` | `Ctrl+Shift+P` |

### Model & Feature Controls

| Action | macOS | Windows/Linux |
|--------|--------|---------------|
| **Toggle DeepSeek V4 Pro / Claude Opus** | `Cmd+Shift+R` | `Ctrl+Shift+R` |
| **Cycle OpenAI Models (Terra / Sol)** | `Cmd+Shift+M` | `Ctrl+Shift+M` |
| **Toggle Extended Chat (∞)** | `Cmd+E` | `Ctrl+E` |

### Window Controls

| Action | macOS | Windows/Linux |
|--------|--------|---------------|
| **Move Window Up** | `Cmd+Alt+↑` | `Ctrl+Alt+↑` |
| **Move Window Down** | `Cmd+Alt+↓` | `Ctrl+Alt+↓` |
| **Move Window Left** | `Cmd+Alt+←` | `Ctrl+Alt+←` |
| **Move Window Right** | `Cmd+Alt+→` | `Ctrl+Alt+→` |
| **Decrease Opacity** | `Cmd+[` | `Ctrl+[` |
| **Increase Opacity** | `Cmd+]` | `Ctrl+]` |

### Text Input

| Action | macOS | Windows/Linux |
|--------|--------|---------------|
| **Submit Query** | `Cmd+Enter` | `Ctrl+Enter` |

### Response Navigation

| Action | Key Combination |
|--------|----------------|
| **Scroll Up (Large)** | `Page Up` or `Ctrl+↑` |
| **Scroll Down (Large)** | `Page Down` or `Ctrl+↓` |
| **Scroll Up (Small)** | `Alt+↑` |
| **Scroll Down (Small)** | `Alt+↓` |
| **Jump to Top** | `Home` or `Ctrl+Home` |
| **Jump to Bottom** | `End` or `Ctrl+End` |

## AI Providers

### OpenAI
- **Models**: GPT-5.6 Terra (default, balanced), GPT-5.6 Sol (flagship)
- **Features**: Text and image analysis, built-in reasoning
- **Math Rendering**: Enhanced Unicode-to-LaTeX conversion for mathematical expressions
- **Cycling**: Use `Cmd/Ctrl+Shift+M` to switch between Terra and Sol

### DeepSeek
- **Models**: DeepSeek V4 Flash (default), DeepSeek V4 Pro (reasoning)
- **Features**: OpenAI-compatible API, advanced reasoning in V4 Pro mode
- **Temperature**: 0.7
- **V4 Pro Toggle**: Switch with `Cmd/Ctrl+Shift+R`

### Anthropic Claude
- **Models**: Claude Sonnet 5 (default), Claude Opus 4.8 (more intelligent, slower)
- **Features**: Text and image analysis, strong reasoning
- **Opus Toggle**: Switch with `Cmd/Ctrl+Shift+R`

## Usage Tips

1. **Screen Sharing**: Provider buttons are positioned to avoid screen capture detection
2. **Screenshot Analysis**: Take a screenshot first, then add text instructions for context
3. **Custom Instructions**: Use the instructions field for consistent prompting
4. **Keyboard-First**: Most actions can be performed without mouse interaction
5. **Opacity Control**: Adjust transparency to see through the overlay when needed
6. **Math Rendering**: OpenAI responses automatically convert Unicode symbols (∫, π, ², ₀) to proper LaTeX for beautiful mathematical display

## Configuration

### Settings Access
- Click the gear icon in the main interface
- Or right-click anywhere in the app and select "Settings"

### Available Settings
- API keys for all providers
- Default provider selection
- OpenAI model preference (Terra / Sol)
- DeepSeek V4 Pro reasoning toggle
- Claude Opus toggle

## Troubleshooting

### Common Issues

**App won't start**
- Ensure Node.js 16+ is installed
- Try deleting `node_modules` and running `npm install` again

**API errors**
- Verify your API keys are correct
- Check your internet connection
- Ensure your API provider account has sufficient credits

**Screenshot not working**
- Grant screen recording permissions on macOS
- Ensure the app has necessary permissions on Windows

**Shortcuts not working**
- Check if other apps are using the same shortcuts
- Try restarting the application

### Permissions

**macOS**
- Screen Recording: Required for screenshot functionality
- Accessibility: May be required for global shortcuts

**Windows**
- Administrator privileges may be required for global shortcuts

## Development

### Building from Source
```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Build for production
npm run build

# Create distributable packages
npm run dist
```

### Project Structure
```
spectro/
├── main.js              # Main Electron process
├── renderer.js          # Renderer process logic
├── preload.js          # Preload scripts
├── index.html          # Main UI
├── settings.html       # Settings interface
├── style.css           # Application styles
├── package.json        # Dependencies and scripts
└── README.md          # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

### v1.3.0 - Model Refresh
- Updated OpenAI to GPT-5.6 (Terra / Sol), replacing o4-mini and GPT-4.1
- Updated DeepSeek to V4 (Flash / Pro), replacing deepseek-chat and deepseek-reasoner
- Updated Claude to Sonnet 5 and Opus 4.8
- Removed Google Gemini support
- Remapped provider shortcuts to Ctrl+1/2/3 (OpenAI / DeepSeek / Claude)

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

## Support

For support, please open an issue on GitHub or contact the development team.

---

**Note**: This application requires valid API keys from the respective AI providers. Ensure you have appropriate usage limits and billing set up with your chosen providers. 