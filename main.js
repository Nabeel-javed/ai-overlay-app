// main.js
const { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, screen, Menu } = require('electron'); // Added Menu
const path = require('path');
// const Store = require('electron-store'); // <<< REMOVE THIS LINE
// const fetch = require('node-fetch'); // Uncomment if using node-fetch instead of built-in fetch

// Global references to prevent garbage collection
let mainWindow;
let apiKeyWindow;
let settingsWindow; // Add settings window reference
let store; // Declare globally, initialize later
const MOVE_STEP = 20; // Pixels to move the window per hotkey press
const MODEL_CONFIG = {
    "gpt-o3mini-high": {
        modelName: "o3-mini",
        baseUrl: "https://api.openai.com/v1/chat/completions"
    },
    "o4mini-high": {
        modelName: "o4-mini",
        baseUrl: "https://api.openai.com/v1/chat/completions"
    },
    "4.1": {
        modelName: "gpt-4.1",
        baseUrl: "https://api.openai.com/v1/chat/completions"
    }
};

// --- Function to create the API Key Prompt Window ---
function createApiKeyPromptWindow() {
    // Close existing prompt window if any
    if (apiKeyWindow && !apiKeyWindow.isDestroyed()) {
        apiKeyWindow.close();
    }

    apiKeyWindow = new BrowserWindow({
        width: 450,
        height: 280,
        resizable: false,
        frame: true, // Show frame for this utility window
        title: "Enter API Key",
        modal: true, // Make modal relative to mainWindow if it exists
        parent: (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null,
        webPreferences: {
            preload: path.join(__dirname, 'preload_api_key.js'), // Use dedicated preload
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false // Don't show until ready
    });

    apiKeyWindow.loadFile('api_key_prompt.html');

    apiKeyWindow.once('ready-to-show', () => {
        apiKeyWindow.show();
        apiKeyWindow.focus();
    });

    apiKeyWindow.on('closed', () => {
        apiKeyWindow = null; // Clean up reference
        // If main window still doesn't exist (e.g., user closed prompt without saving)
        // and app is still running, maybe quit or show prompt again? For now, do nothing.
        // if (!mainWindow || mainWindow.isDestroyed()) {
        //     // Consider app behavior here - maybe quit if key is mandatory?
        //     // app.quit();
        // }
    });
}

// --- Function to create the Settings Window ---
function createSettingsWindow() {
    // Close existing settings window if any
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.close();
    }

    settingsWindow = new BrowserWindow({
        width: 500,
        height: 400,
        resizable: false,
        frame: true,
        title: "Settings",
        modal: true,
        parent: (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null,
        webPreferences: {
            preload: path.join(__dirname, 'preload_settings.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false
    });

    settingsWindow.loadFile('settings.html');

    settingsWindow.once('ready-to-show', () => {
        settingsWindow.show();
        settingsWindow.focus();
    });

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

// --- Function to create the main application window ---
function createMainWindow() {
    // Close main window if it somehow already exists (shouldn't happen with current logic)
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
    }

    mainWindow = new BrowserWindow({
        width: 480,
        height: 400,
        frame: false,         // No window frame
        transparent: true,    // Allow window transparency
        alwaysOnTop: true,    // Keep window on top
        skipTaskbar: true,    // Don't show in taskbar/dock
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // Main window preload
            contextIsolation: true,
            nodeIntegration: false
        },
        show: false // Don't show immediately
    });

    // Attempt to prevent screen capture
    mainWindow.setContentProtection(true);

    // Ensure window appears on all virtual desktops (Spaces) and over fullscreen apps
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Load the main UI file
    mainWindow.loadFile('index.html');

    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Settings',
            click: () => {
                createSettingsWindow();
            }
        },
        { type: 'separator' },
        {
            label: 'Reset',
            click: () => {
                resetTool();
            }
        }
    ]);

    // Add context menu on right click
    mainWindow.webContents.on('context-menu', (e) => {
        contextMenu.popup();
    });

    // Window is interactive by default when shown (no setIgnoreMouseEvents(true))
    mainWindow.setOpacity(1.0); // Start fully opaque

    // Show gracefully when the UI is ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Cleanup reference on close
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Handle focus loss - become semi-transparent
    mainWindow.on('blur', () => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDevToolsFocused()) {
            try {
                mainWindow.setOpacity(0.85);
            } catch (error) {
                console.log("Error during blur handling:", error.message);
            }
        }
    });

    // Handle focus gain - become fully opaque
    mainWindow.on('focus', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            try {
                mainWindow.setOpacity(1.0);
            } catch (error) {
                console.log("Error during focus handling:", error.message);
            }
        }
    });
}

// --- Function to register all global shortcuts ---
function registerShortcuts() {
    // Unregister first to prevent duplicates during development hot-reloads
    globalShortcut.unregisterAll();

    const shortcuts = {
        // --- Focus Shortcut ---
        'CommandOrControl+Shift+O': () => {
            console.log('Focus shortcut pressed');
            if (!mainWindow || mainWindow.isDestroyed()) {
                console.log("Main window doesn't exist or is destroyed.");
                // If key exists, maybe try creating main window again?
                if (store.get('googleApiKey')) {
                    createMainWindow();
                    setTimeout(() => focusWindowAndInput(), 150);
                }
                return;
            }
            if (!mainWindow.isVisible()) mainWindow.show();
            focusWindowAndInput();
        },
        // --- Toggle Visibility Shortcut ---
        'CommandOrControl+Shift+H': () => {
            console.log('Toggle visibility shortcut pressed');
            if (!mainWindow || mainWindow.isDestroyed()) return;
            if (mainWindow.isVisible()) mainWindow.hide();
            else {
                mainWindow.show();
                mainWindow.setOpacity(1.0);
                mainWindow.focus();
            }
        },
        // --- Movement Shortcuts ---
        'CommandOrControl+Alt+Up': () => moveWindow(0, -MOVE_STEP),
        'CommandOrControl+Alt+Down': () => moveWindow(0, MOVE_STEP),
        'CommandOrControl+Alt+Left': () => moveWindow(-MOVE_STEP, 0),
        'CommandOrControl+Alt+Right': () => moveWindow(MOVE_STEP, 0),
        // --- Screenshot Shortcut ---
        'CommandOrControl+Shift+S': () => captureScreenshot(),
        // --- Reset Tool Shortcut ---
        'CommandOrControl+R': () => resetTool(),
    };

    for (const accelerator in shortcuts) {
        const ret = globalShortcut.register(accelerator, shortcuts[accelerator]);
        if (!ret) console.error('Failed to register global shortcut:', accelerator);
        else console.log(`Registered shortcut: ${accelerator}`);
    }
}

// --- Focus Logic Extracted ---
function focusWindowAndInput() {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
        console.log("Focus skipped: Window not ready or visible.");
        return;
    }
    try {
        console.log("Focusing window and input...");
        mainWindow.setOpacity(1.0);
        mainWindow.focus();
        mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); // Reaffirm
        if (mainWindow.webContents) {
            mainWindow.webContents.send('focus-input'); // Tell renderer to focus input
        }
    } catch (error) {
        console.error("Error during window focus:", error.message);
    }
}

// --- Helper function to move the window ---
function moveWindow(deltaX, deltaY) {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;
    try {
        const [currentX, currentY] = mainWindow.getPosition();
        mainWindow.setPosition(currentX + deltaX, currentY + deltaY, false);
    } catch (error) {
        console.error("Error moving window:", error);
    }
}

// --- Screenshot Capture Function ---
async function captureScreenshot() {
    console.log('Screenshot shortcut pressed');
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;

    try {
        // Hide the main window temporarily to avoid capturing it in the screenshot
        mainWindow.hide();

        // Wait for the window to hide
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get all displays
        const displays = screen.getAllDisplays();
        const primaryDisplay = screen.getPrimaryDisplay();

        // Get all available sources (windows and screens)
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
                width: primaryDisplay.size.width,
                height: primaryDisplay.size.height
            }
        });

        // Get the primary display source
        const primarySource = sources.find(source =>
            source.display_id === primaryDisplay.id.toString() ||
            source.id.includes('screen:0:0')
        ) || sources[0];

        if (primarySource) {
            // Show the window again
            mainWindow.show();
            setTimeout(() => focusWindowAndInput(), 200);

            // Convert the thumbnail to a data URL and send it to the renderer
            const screenshotDataUrl = primarySource.thumbnail.toDataURL();
            mainWindow.webContents.send('screenshot-captured', screenshotDataUrl);

            // Resize the window to accommodate the screenshot
            resizeWindowForScreenshot(true);
        } else {
            console.error('No screen source found');
            mainWindow.show();
        }
    } catch (error) {
        console.error('Error capturing screenshot:', error);
        mainWindow.show();
    }
}

// --- Function to resize window for screenshot ---
function resizeWindowForScreenshot(hasScreenshot) {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    // Default height without screenshot
    const defaultHeight = 400;
    // Increased height with screenshot
    const screenshotHeight = 650;

    const [width, height] = mainWindow.getSize();
    const newHeight = hasScreenshot ? screenshotHeight : defaultHeight;

    mainWindow.setSize(width, newHeight);
}

// --- Function to reset the tool ---
function resetTool() {
    console.log('Reset tool shortcut pressed');
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;

    // Resize window back to original size (in case it was enlarged for screenshot)
    resizeWindowForScreenshot(false);

    // Send reset command to renderer
    mainWindow.webContents.send('reset-tool');

    // Focus the input after reset
    setTimeout(() => focusWindowAndInput(), 100);
}

// --- App Ready Event ---
app.whenReady().then(async () => {
    if (process.platform === 'darwin') {
        app.dock.hide(); // Hide dock icon on macOS
    }

    console.log("App ready. Initializing Store...");
    const Store = (await import('electron-store')).default;
    store = new Store();
    console.log("Store instance:", store);

    // Set default provider if not set
    if (!store.get('apiProvider')) {
        store.set('apiProvider', 'gemini');
    }

    // Check for API Key on startup
    const apiKey = getApiKey();
    if (!apiKey) {
        console.log("API Key not found, prompting user...");
        createApiKeyPromptWindow();
    } else {
        console.log("API Key found in storage.");
        createMainWindow();
        registerShortcuts();
    }

    // Handle macOS activation when dock icon is clicked
    app.on('activate', () => {
        if (getApiKey()) {
            if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
            if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
            if (mainWindow) mainWindow.focus();
        } else {
            if (!apiKeyWindow || apiKeyWindow.isDestroyed()) createApiKeyPromptWindow();
            else { apiKeyWindow.show(); apiKeyWindow.focus(); }
        }
    });
});

// --- App Quitting Event ---
app.on('will-quit', () => {
    globalShortcut.unregisterAll(); // Unregister all shortcuts on quit
    console.log("Unregistered all global shortcuts.");
});

// --- All Windows Closed Event ---
app.on('window-all-closed', () => {
    // Quit app on all platforms except macOS unless Cmd+Q is used
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Listener: Dismiss Overlay (hides main window) ---
ipcMain.on('dismiss-overlay', () => {
    console.log('Received dismiss-overlay request -> Hiding window');
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
    }
});

// --- IPC Listener: Save API Key ---
ipcMain.handle('save-api-key', (event, apiData) => {
    if (!apiData || typeof apiData !== 'object') {
        return { success: false, error: 'Invalid API data received.' };
    }

    const { apiKey, provider } = apiData;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return { success: false, error: 'Invalid API Key received.' };
    }

    if (!store) {
        console.error("Error: Store not initialized when saving API key.");
        return { success: false, error: 'Internal error: Storage not ready.' };
    }

    try {
        console.log(`Received ${provider} API key, saving to store...`);

        // Store the API key in the appropriate field based on the provider
        if (provider === 'openai') {
            store.set('openaiApiKey', apiKey.trim());
        } else {
            store.set('googleApiKey', apiKey.trim());
        }

        // Store the current provider
        store.set('apiProvider', provider);

        console.log("API Key saved successfully.");

        // Close the prompt window
        if (apiKeyWindow && !apiKeyWindow.isDestroyed()) apiKeyWindow.close();

        // Create and show the main window now that the key is saved
        if (!mainWindow || mainWindow.isDestroyed()) {
            createMainWindow();
            registerShortcuts();
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
        return { success: true };
    } catch (error) {
        console.error("Error saving API key:", error);
        return { success: false, error: 'Failed to save API key.' };
    }
});

// --- IPC Handler: Get Settings ---
ipcMain.handle('get-settings', async (event) => {
    if (!store) {
        return { error: 'Store is not initialized' };
    }

    return {
        provider: store.get('apiProvider') || 'gemini',
        geminiKey: store.get('googleApiKey') || '',
        openaiKey: store.get('openaiApiKey') || '',
        openaiModel: store.get('openaiModel') || 'gpt-o3mini-high'
    };
});

// --- IPC Handler: Save Settings ---
ipcMain.handle('save-settings', async (event, settings) => {
    if (!store) {
        return { success: false, error: 'Store is not initialized' };
    }

    try {
        if (settings.provider) {
            store.set('apiProvider', settings.provider);
        }

        if (settings.geminiKey) {
            store.set('googleApiKey', settings.geminiKey.trim());
        }

        if (settings.openaiKey) {
            store.set('openaiApiKey', settings.openaiKey.trim());
        }

        if (settings.openaiModel) {
            store.set('openaiModel', settings.openaiModel);
        }

        // Close settings window
        if (settingsWindow && !settingsWindow.isDestroyed()) {
            settingsWindow.close();
        }

        return { success: true };
    } catch (error) {
        console.error('Error saving settings:', error);
        return { success: false, error: error.message };
    }
});

// --- IPC Handler: Open Settings ---
ipcMain.on('open-settings', () => {
    createSettingsWindow();
});

// --- IPC Handler: Call AI API ---
ipcMain.handle('call-gemini', async (event, payload) => {
    console.log('Main process received request to call AI API');
    if (!store) {
        return { error: 'Store is not initialized' };
    }

    const provider = store.get('apiProvider') || 'gemini';
    const apiKey = provider === 'gemini' ? store.get('googleApiKey') : store.get('openaiApiKey');

    if (!apiKey) {
        return { error: `${provider.toUpperCase()} API key not found. Please set it in settings.` };
    }

    try {
        // Parse the payload if it's a JSON string (coming from screenshot)
        let textInput = payload;
        let hasScreenshot = false;
        let screenshotData = null;
        let customInstructions = '';

        // Check if payload is a JSON string (from screenshot handling)
        if (typeof payload === 'string' && payload.startsWith('{') && payload.endsWith('}')) {
            try {
                const parsedPayload = JSON.parse(payload);
                textInput = parsedPayload.text || '';
                screenshotData = parsedPayload.screenshot || null;
                customInstructions = parsedPayload.instructions || '';
                hasScreenshot = !!screenshotData;
                console.log('Parsed screenshot payload. Has screenshot:', hasScreenshot);
            } catch (parseError) {
                console.error('Error parsing JSON payload:', parseError);
                // Fall back to treating payload as plain text
            }
        }

        // Call the appropriate API based on the provider
        if (provider === 'gemini') {
            return await callGeminiApi(apiKey, textInput, customInstructions, screenshotData, hasScreenshot);
        } else {
            return await callOpenAIApi(apiKey, textInput, customInstructions, screenshotData, hasScreenshot);
        }
    } catch (error) {
        console.error(`Error calling ${provider} API:`, error);
        return { error: `Error: ${error.message}` };
    }
});

// Function to call the Gemini API
async function callGeminiApi(apiKey, textInput, customInstructions, screenshotData, hasScreenshot) {
    // Base URL for the Gemini API
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';

    // Create request headers
    const headers = {
        'Content-Type': 'application/json'
    };

    // Build the request body
    const requestBody = {
        contents: [{
            parts: []
        }],
        generationConfig: {
            temperature: 0.7,
            topK: 32,
            topP: 1,
            maxOutputTokens: 4096,
        }
    };

    // Add text part if provided
    if (textInput) {
        requestBody.contents[0].parts.push({
            text: textInput
        });
    }

    // Add custom instructions if provided
    if (customInstructions) {
        requestBody.contents[0].parts.push({
            text: `Custom Instructions: ${customInstructions}`
        });
    }

    // Add screenshot data if available
    if (hasScreenshot && screenshotData) {
        // Add the screenshot as an image part
        requestBody.contents[0].parts.push({
            inlineData: {
                data: screenshotData.split(',')[1], // Remove the data:image/png;base64, prefix
                mimeType: 'image/png'
            }
        });
    }

    // Call the Gemini API
    const response = await fetch(`${apiUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
    });

    // Parse the response
    const responseData = await response.json();

    // Check for errors in the response
    if (!response.ok) {
        const error = responseData.error || { message: 'Unknown API error' };
        console.error('Gemini API error:', error);
        return { error: `API Error: ${error.message}` };
    }

    // Extract the text from the response
    if (responseData.candidates && responseData.candidates.length > 0 &&
        responseData.candidates[0].content && responseData.candidates[0].content.parts &&
        responseData.candidates[0].content.parts.length > 0) {
        const textResponse = responseData.candidates[0].content.parts[0].text;
        return { success: textResponse };
    } else {
        return { error: 'No valid response from Gemini' };
    }
}

// Function to call the OpenAI API
async function callOpenAIApi(apiKey, textInput, customInstructions, screenshotData, hasScreenshot) {
    // Determine the correct model config based on settings and screenshot status
    const storedModel = store.get('openaiModel') || 'gpt-o3mini-high';
    const selectedModel = hasScreenshot ? '4.1' : storedModel;
    const modelConfig = MODEL_CONFIG[selectedModel];
    const apiUrl = modelConfig.baseUrl;

    console.log(`Using OpenAI model: ${modelConfig.modelName}`);

    // Create request headers
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    // Build the request body
    const messages = [];

    // Create system message
    messages.push({
        role: 'system',
        content: 'You are a helpful assistant analyzing user input. Provide concise, accurate responses.'
    });

    // Prepare user message content
    let userContent = [];

    // Add text if provided
    if (textInput) {
        userContent.push({
            type: 'text',
            text: textInput
        });
    }

    // Add custom instructions if provided
    if (customInstructions) {
        if (textInput) {
            userContent.push({
                type: 'text',
                text: `Custom Instructions: ${customInstructions}`
            });
        } else {
            userContent.push({
                type: 'text',
                text: customInstructions
            });
        }
    }

    // Add screenshot if available
    if (hasScreenshot && screenshotData) {
        userContent.push({
            type: 'image_url',
            image_url: {
                url: screenshotData,
                detail: 'high'
            }
        });
    }

    // Add user message
    messages.push({
        role: 'user',
        content: userContent
    });

    const requestBody = {
        model: modelConfig.modelName,
        messages: messages,
        max_completion_tokens: 4096,
        // temperature: 0.7
    };

    // Call the OpenAI API
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
    });

    // Parse the response
    const responseData = await response.json();

    // Check for errors in the response
    if (!response.ok) {
        const error = responseData.error || { message: 'Unknown API error' };
        console.error('OpenAI API error:', error);
        return { error: `API Error: ${error.message}` };
    }

    // Extract the text from the response
    if (responseData.choices && responseData.choices.length > 0 &&
        responseData.choices[0].message && responseData.choices[0].message.content) {
        const textResponse = responseData.choices[0].message.content;
        return { success: textResponse };
    } else {
        return { error: 'No valid response from OpenAI' };
    }
}

// Helper function to get API key based on current provider
function getApiKey() {
    const provider = store.get('apiProvider') || 'gemini';
    return provider === 'gemini' ? store.get('googleApiKey') : store.get('openaiApiKey');
}

// --- New IPC handler for screenshot removal ---
ipcMain.on('remove-screenshot', () => {
    console.log('Received remove-screenshot request');
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('clear-screenshot');
        // Resize window back to original size
        resizeWindowForScreenshot(false);
    }
});
