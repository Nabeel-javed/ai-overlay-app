# AI Overlay Assistant

A floating overlay application that provides quick access to AI assistance (Google Gemini and OpenAI) through text input and screenshots, always accessible with keyboard shortcuts.

## Features

- **Always Accessible**: Overlay window stays on top of other applications
- **Multiple AI Providers**: Supports both Google Gemini and OpenAI
- **Screenshot Analysis**: Capture screenshots and have AI analyze them
- **Custom Instructions**: Add specific instructions for analyzing screenshots
- **Keyboard Shortcuts**: Control the overlay with hotkeys
- **Context Menu**: Right-click for additional options

## Hotkeys

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+O` (Mac: `Cmd+Shift+O`) | Focus the AI overlay and input field |
| `Ctrl+Shift+H` (Mac: `Cmd+Shift+H`) | Toggle visibility of the overlay |
| `Ctrl+Shift+S` (Mac: `Cmd+Shift+S`) | Capture screenshot for AI analysis |
| `Ctrl+R` (Mac: `Cmd+R`) | Reset the tool (clear all inputs) |
| `Ctrl+Alt+Up/Down/Left/Right` (Mac: `Cmd+Alt+Up/Down/Left/Right`) | Move the overlay window |

## Setup and Installation

### Prerequisites
- Node.js (14.0.0 or higher)
- npm or yarn

### Installation

1. Clone the repository
   ```
   git clone https://github.com/yourusername/ai-overlay-app.git
   cd ai-overlay-app
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Start the application
   ```
   npm start
   ```

### Building for Production

To create distributable packages for your platform:

```
npm run dist
```

For specific platforms:
```
npm run dist:mac
npm run dist:win
```

## API Key Configuration

On first launch, you'll be prompted to enter an API key. You can choose between:

1. **Google Gemini**: Get your API key from [Google AI Studio](https://ai.google.dev/)
2. **OpenAI**: Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)

You can change the API provider or keys later through the settings menu.

## Usage

### Text Input

1. Press `Ctrl+Shift+O` to bring up the overlay
2. Type your question or paste text
3. Click "Submit to AI" or press Enter

### Screenshot Analysis

1. Press `Ctrl+Shift+S` to capture a screenshot
2. Add any custom instructions for analyzing the image
3. Click "Submit to AI"

### Settings

Access settings through:
- Clicking the gear icon (⚙️) in the main window
- Right-clicking in the app and selecting "Settings"

In settings, you can:
- Switch between Gemini and OpenAI
- Update API keys
- Save your preferences

### Resetting

To clear all inputs and start fresh:
- Press `Ctrl+R`
- Right-click in the app and select "Reset"

## Technical Details

### Architecture

This application is built with:
- **Electron**: For cross-platform desktop functionality
- **Node.js**: For backend operations
- **HTML/CSS/JavaScript**: For the user interface
- **Electron Store**: For secure local storage of API keys

### APIs

- **Google Gemini API**: Uses the Generative Language API (particularly gemini-1.5-pro)
- **OpenAI API**: Uses GPT-4o for advanced text and image understanding

## Privacy and Security

- API keys are stored locally in your user folder
- The application does not collect or transmit any user data
- Screenshots are processed locally and only sent directly to the selected AI provider

## License

This project is licensed under the ISC License.

## Troubleshooting

### Common Issues

- **API Key Issues**: If you encounter errors, verify your API key is correct and has appropriate access permissions
- **Window Visibility**: If the window disappears, use Ctrl+Shift+O to bring it back
- **Screenshot Failures**: Make sure your system allows screen recording for this application 