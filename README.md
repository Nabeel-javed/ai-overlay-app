# Spectro

A powerful desktop overlay application that provides quick access to multiple AI providers (OpenAI, Google Gemini, and DeepSeek) with screenshot capabilities and extensive keyboard shortcuts for seamless workflow integration.

## Features

- **Multi-Provider Support**: OpenAI (o4-mini, GPT-4.1), Google Gemini, and DeepSeek (with R1 reasoning)
- **Screenshot Integration**: Capture and analyze screenshots with AI
- **Always-on-Top Overlay**: Stays visible during screen sharing and presentations
- **Extensive Keyboard Shortcuts**: Control everything without touching the mouse
- **Screen Sharing Safe**: Provider selection hidden from screen capture
- **Enhanced Math Rendering**: Automatic LaTeX formatting with improved o4-mini Unicode symbol conversion
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
   - Google Gemini API Key  
   - DeepSeek API Key
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
| **Switch to Gemini** | `Cmd+2` | `Ctrl+2` |
| **Switch to DeepSeek** | `Cmd+3` | `Ctrl+3` |
| **Cycle Providers** | `Cmd+Shift+P` | `Ctrl+Shift+P` |

### Model & Feature Controls

| Action | macOS | Windows/Linux |
|--------|--------|---------------|
| **Toggle DeepSeek R1 Reasoning** | `Cmd+Shift+R` | `Ctrl+Shift+R` |
| **Cycle OpenAI Models** | `Cmd+Shift+M` | `Ctrl+Shift+M` |

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
- **Models**: o4-mini, GPT-4.1
- **Features**: Text and image analysis, reasoning capabilities
- **Temperature**: Automatically set to 1.0 for o4-mini, 0.7 for GPT-4.1
- **Math Rendering**: Enhanced Unicode-to-LaTeX conversion for o4-mini mathematical expressions
- **Cycling**: Use `Cmd/Ctrl+Shift+M` to switch between models

### Google Gemini
- **Model**: Gemini 1.5 Pro
- **Features**: Text and image analysis, multimodal capabilities
- **Temperature**: 0.7

### DeepSeek
- **Models**: deepseek-chat, deepseek-reasoner (R1)
- **Features**: Advanced reasoning with R1 mode
- **Temperature**: 0.7
- **R1 Reasoning**: Toggle with `Cmd/Ctrl+Shift+R`

## Usage Tips

1. **Screen Sharing**: Provider buttons are positioned to avoid screen capture detection
2. **Screenshot Analysis**: Take a screenshot first, then add text instructions for context
3. **Custom Instructions**: Use the instructions field for consistent prompting
4. **Keyboard-First**: Most actions can be performed without mouse interaction
5. **Opacity Control**: Adjust transparency to see through the overlay when needed
6. **Math Rendering**: o4-mini automatically converts Unicode symbols (∫, π, ², ₀) to proper LaTeX for beautiful mathematical display

## Configuration

### Settings Access
- Click the gear icon in the main interface
- Or right-click anywhere in the app and select "Settings"

### Available Settings
- API keys for all providers
- Default provider selection
- OpenAI model preference
- DeepSeek R1 reasoning toggle
- Enable reasoning for OpenAI models

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