// main.js
const { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, screen, Menu, dialog, shell, nativeImage } = require('electron'); // Added dialog explicitly
const path = require('path');
const { machineIdSync } = require('node-machine-id');
const fetch = require('node-fetch');
const crypto = require('crypto');
const os = require('os');


// Set app name
app.name = 'Spectro';

// Global references to prevent garbage collection
let mainWindow;
let apiKeyWindow;
let settingsWindow; // Add settings window reference
let store; // Declare globally, initialize later
const MOVE_STEP = 20; // Pixels to move the window per hotkey press

// --- Debounce utility for window state saving ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- Window state persistence ---
function getWindowState() {
    if (!store) return null;
    return store.get('windowState') || null;
}

function saveWindowState() {
    if (!store || !mainWindow || mainWindow.isDestroyed()) return;
    try {
        const [x, y] = mainWindow.getPosition();
        const [width, height] = mainWindow.getSize();
        const opacity = mainWindow.getOpacity();
        store.set('windowState', { x, y, width, height, opacity });
    } catch (error) {
        console.error('Error saving window state:', error);
    }
}

// Debounced version to avoid excessive writes during dragging
const debouncedSaveWindowState = debounce(saveWindowState, 300);

// Configuration for different models
const MODEL_CONFIG = {
    "4.1": {
        modelName: "gpt-4.1",
        baseUrl: "https://api.openai.com/v1/responses"
    },
    "o4-mini": {
        modelName: "o4-mini-2025-04-16",
        baseUrl: "https://api.openai.com/v1/chat/completions"
    },
    "deepseek-chat": {
        modelName: "deepseek-chat",
        baseUrl: "https://api.deepseek.com/v1/chat/completions"
    },
    "deepseek-reasoner": {
        modelName: "deepseek-reasoner",
        baseUrl: "https://api.deepseek.com/v1/chat/completions"
    }
};

// Provider configurations
const PROVIDER_CONFIG = {
    openai: {
        name: "OpenAI",
        models: {
            "4.1": {
                modelName: "gpt-4.1",
                baseUrl: "https://api.openai.com/v1/chat/completions"
            },
            "o4-mini": {
                modelName: "o4-mini-2025-04-16",
                baseUrl: "https://api.openai.com/v1/chat/completions"
            }
        }
    },
    gemini: {
        name: "Google Gemini",
        models: {
            "gemini-2.5-flash": {
                modelName: "gemini-2.5-flash",
                baseUrl: "https://generativelanguage.googleapis.com/v1beta/models"
            }
        }
    },
    deepseek: {
        name: "DeepSeek",
        models: {
            "deepseek-chat": {
                modelName: "deepseek-chat",
                baseUrl: "https://api.deepseek.com/v1/chat/completions"
            },
            "deepseek-reasoner": {
                modelName: "deepseek-reasoner",
                baseUrl: "https://api.deepseek.com/v1/chat/completions"
            }
        }
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
        transparent: false, // Change to false for DMG compatibility
        backgroundColor: '#2d2d2d', // Solid background color
        parent: (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null,
        webPreferences: {
            preload: path.join(__dirname, 'preload_settings.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false
    });

    // Prevent screen capture
    settingsWindow.setContentProtection(true);

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

    // Windows-specific configuration
    const isWindows = process.platform === 'win32';

    // Restore saved window state or use defaults
    const savedState = getWindowState();
    const defaultWidth = 480;
    const defaultHeight = 400;
    const defaultX = 100;
    const defaultY = 100;
    const defaultOpacity = isWindows ? 0.95 : 1.0;

    mainWindow = new BrowserWindow({
        width: savedState?.width || defaultWidth,
        height: savedState?.height || defaultHeight,
        frame: false,         // No window frame
        transparent: !isWindows,    // Disable transparency on Windows for better visibility
        alwaysOnTop: true,    // Keep window on top
        skipTaskbar: true,    // Don't show in taskbar/dock
        resizable: false,
        backgroundColor: isWindows ? '#2d2d2d' : undefined, // Solid background for Windows
        opacity: defaultOpacity, // Will be set after window is ready
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // Main window preload
            contextIsolation: true,
            nodeIntegration: false
        },
        show: false, // Don't show immediately
        x: savedState?.x ?? defaultX,
        y: savedState?.y ?? defaultY
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
        // Restore saved opacity if available
        if (savedState?.opacity !== undefined) {
            mainWindow.setOpacity(savedState.opacity);
        }

        mainWindow.show();

        // Only center if no saved position
        if (!savedState?.x && !savedState?.y) {
            mainWindow.center();
        }

        // Windows-specific fixes
        if (process.platform === 'win32') {
            mainWindow.setAlwaysOnTop(false);
            mainWindow.setAlwaysOnTop(true);
            mainWindow.moveTop();
        }
    });

    // Save window state when moved or resized
    mainWindow.on('move', debouncedSaveWindowState);
    mainWindow.on('resize', debouncedSaveWindowState);

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
                if (getApiKey()) {
                    createMainWindow();
                    setTimeout(() => focusWindowAndInput(), 150);
                }
                return;
            }
            if (!mainWindow.isVisible()) {
                mainWindow.show();
                mainWindow.center(); // Center the window
                // Windows-specific visibility fix
                if (process.platform === 'win32') {
                    mainWindow.setAlwaysOnTop(false);
                    mainWindow.setAlwaysOnTop(true);
                    mainWindow.setOpacity(0.95);
                }
            }
            focusWindowAndInput();
        },
        // --- Toggle Visibility Shortcut ---
        'CommandOrControl+Shift+H': () => {
            console.log('Toggle visibility shortcut pressed');
            if (!mainWindow || mainWindow.isDestroyed()) return;
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
                mainWindow.center(); // Center the window on screen
                if (process.platform === 'win32') {
                    mainWindow.setOpacity(0.95);
                } else {
                    mainWindow.setOpacity(1.0);
                }
                // Force bring to front on Windows
                if (process.platform === 'win32') {
                    mainWindow.setAlwaysOnTop(false);
                    mainWindow.setAlwaysOnTop(true);
                }
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
        // --- Provider Cycling Shortcut ---
        'CommandOrControl+Shift+P': () => cycleProvider(),
        // --- Direct Provider Shortcuts ---
        'CommandOrControl+1': () => switchToProvider('openai'),
        'CommandOrControl+2': () => switchToProvider('gemini'),
        'CommandOrControl+3': () => switchToProvider('deepseek'),
        'CommandOrControl+4': () => switchToProvider('claude'),
        // --- Toggle DeepSeek Reasoning ---
        'CommandOrControl+Shift+R': () => toggleDeepSeekReasoning(),
        // --- Cycle OpenAI Models ---
        'CommandOrControl+Shift+M': () => cycleOpenAIModel(),
        // --- Opacity Control Shortcuts ---
        'CommandOrControl+[': () => adjustOpacity(-0.05),
        'CommandOrControl+]': () => adjustOpacity(0.05),
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

        // Platform-specific opacity handling
        if (process.platform === 'win32') {
            mainWindow.setOpacity(0.95);
        } else {
            mainWindow.setOpacity(1.0);
        }

        mainWindow.focus();
        mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); // Reaffirm

        // Windows-specific focus fix
        if (process.platform === 'win32') {
            mainWindow.setAlwaysOnTop(false);
            mainWindow.setAlwaysOnTop(true);
            mainWindow.moveTop();
        }

        if (mainWindow.webContents) {
            // Instead of always focusing the main input, check if there's a screenshot
            // and focus the custom instructions textarea if so
            mainWindow.webContents.send('check-focus-target');
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

// --- Helper function to adjust window opacity ---
function adjustOpacity(delta) {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;
    const currentOpacity = mainWindow.getOpacity();
    // Calculate new opacity and ensure it's within valid range (0.2 to 1.0)
    const newOpacity = Math.max(0.2, Math.min(1.0, currentOpacity + delta));
    mainWindow.setOpacity(newOpacity);
    console.log(`Adjusted opacity: ${newOpacity.toFixed(2)}`);
    // Save the new opacity
    debouncedSaveWindowState();
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
            setTimeout(() => {
                // Use the new check-focus-target message to focus the appropriate field
                mainWindow.webContents.send('check-focus-target');
            }, 200);

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

// --- Function to cycle through providers ---
function cycleProvider() {
    console.log('Provider cycle shortcut pressed');
    if (!store) {
        console.error('Store not initialized, cannot cycle provider');
        return;
    }

    const currentProvider = store.get('apiProvider') || 'gemini';
    const providers = ['openai', 'gemini', 'deepseek', 'claude'];
    const currentIndex = providers.indexOf(currentProvider);
    const nextIndex = (currentIndex + 1) % providers.length;
    const nextProvider = providers[nextIndex];

    console.log(`Cycling from ${currentProvider} to ${nextProvider}`);
    store.set('apiProvider', nextProvider);

    // Send update to renderer to refresh UI
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('provider-changed', nextProvider);

        // Also send a notification message to show which provider is now active
        mainWindow.webContents.send('provider-notification', {
            provider: nextProvider,
            message: `Switched to ${nextProvider.charAt(0).toUpperCase() + nextProvider.slice(1)}`
        });
    }
}

// --- Function to switch to specific provider ---
function switchToProvider(provider) {
    console.log(`Direct provider switch to: ${provider}`);
    if (!store) {
        console.error('Store not initialized, cannot switch provider');
        return;
    }

    if (!['openai', 'gemini', 'deepseek'].includes(provider)) {
        console.error('Invalid provider:', provider);
        return;
    }

    const currentProvider = store.get('apiProvider') || 'gemini';
    if (currentProvider === provider) {
        console.log(`Already using ${provider}, no change needed`);
        return;
    }

    console.log(`Switching from ${currentProvider} to ${provider}`);
    store.set('apiProvider', provider);

    // Send update to renderer to refresh UI
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('provider-changed', provider);

        // Also send a notification message to show which provider is now active
        mainWindow.webContents.send('provider-notification', {
            provider: provider,
            message: `Switched to ${provider.charAt(0).toUpperCase() + provider.slice(1)}`
        });
    }
}

// --- Function to toggle DeepSeek reasoning mode ---
function toggleDeepSeekReasoning() {
    console.log('DeepSeek reasoning toggle shortcut pressed');
    if (!store) {
        console.error('Store not initialized, cannot toggle DeepSeek reasoning');
        return;
    }

    const currentProvider = store.get('apiProvider') || 'gemini';
    if (currentProvider !== 'deepseek') {
        // If not using DeepSeek, show notification and optionally switch
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('provider-notification', {
                provider: 'deepseek',
                message: 'Switch to DeepSeek first to toggle R1 reasoning'
            });
        }
        return;
    }

    const currentState = store.get('deepseekUseReasoning') || false;
    const newState = !currentState;

    console.log(`Toggling DeepSeek reasoning from ${currentState} to ${newState}`);
    store.set('deepseekUseReasoning', newState);

    // Send update to renderer to refresh UI
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('deepseek-reasoning-changed', newState);

        // Also send a notification message
        mainWindow.webContents.send('provider-notification', {
            provider: 'deepseek',
            message: `DeepSeek R1 Mode ${newState ? 'Enabled' : 'Disabled'}`
        });
    }
}

// --- Function to cycle between OpenAI models ---
function cycleOpenAIModel() {
    console.log('OpenAI model cycling shortcut pressed');
    if (!store) {
        console.error('Store not initialized, cannot cycle OpenAI model');
        return;
    }

    const currentProvider = store.get('apiProvider') || 'gemini';
    if (currentProvider !== 'openai') {
        // If not using OpenAI, show notification and optionally switch
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('provider-notification', {
                provider: 'openai',
                message: 'Switch to OpenAI first to cycle models'
            });
        }
        return;
    }

    // Available OpenAI models
    const openaiModels = ['o4-mini', '4.1'];
    const currentModel = store.get('openaiModel') || 'o4-mini';

    // Find current model index and get next model
    const currentIndex = openaiModels.indexOf(currentModel);
    const nextIndex = (currentIndex + 1) % openaiModels.length;
    const nextModel = openaiModels[nextIndex];

    console.log(`Cycling OpenAI model from ${currentModel} to ${nextModel}`);
    store.set('openaiModel', nextModel);

    // Send update to renderer to refresh UI
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('openai-model-changed', nextModel);

        // Also send a notification message
        const modelDisplayName = nextModel === 'o4-mini' ? 'o4-mini' : 'GPT-4.1';
        mainWindow.webContents.send('provider-notification', {
            provider: 'openai',
            message: `OpenAI Model: ${modelDisplayName}`
        });
    }
}

// --- Single Instance Lock ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    console.log('Another instance is already running. Quitting...');
    app.quit();
} else {
    // Handle second instance attempt - focus existing window
    app.on('second-instance', () => {
        if (mainWindow) {
            if (!mainWindow.isVisible()) mainWindow.show();
            mainWindow.focus();
        }
    });
}

// --- App Ready Event ---
app.whenReady().then(async () => {
    if (process.platform === 'darwin') {
        app.dock.hide(); // Hide dock icon on macOS
    }

    console.log("App ready. Initializing Store...");
    try {
        const Store = (await import('electron-store')).default;
        store = new Store({
            encryptionKey: process.platform === 'darwin' ? 'spectro-encryption-key' : machineIdSync()
        });
        console.log("Store instance:", store);
    } catch (error) {
        console.error("Error initializing store:", error);
        // If store initialization fails, try without encryption
        try {
            const Store = (await import('electron-store')).default;
            store = new Store();
            console.log("Store initialized without encryption as fallback");
        } catch (fallbackError) {
            console.error("Failed to initialize store even without encryption:", fallbackError);
        }
    }

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
    // Save window state one final time before quitting
    saveWindowState();
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
        } else if (provider === 'deepseek') {
            store.set('deepseekApiKey', apiKey.trim());
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
        deepseekKey: store.get('deepseekApiKey') || '',
        claudeKey: store.get('claudeApiKey') || '',
        openaiModel: store.get('openaiModel') || 'o4-mini',
        enableReasoning: store.get('enableReasoning') || false,
        deepseekUseReasoning: store.get('deepseekUseReasoning') || false,
        claudeUseOpus: store.get('claudeUseOpus') || false
    };
});

// --- IPC Handler: Save Settings ---
ipcMain.handle('save-settings', async (event, settings) => {
    if (!store) {
        return { success: false, error: 'Store is not initialized' };
    }

    try {
        console.log('Saving settings:', settings);

        if (settings.provider) {
            store.set('apiProvider', settings.provider);
        }

        if (settings.geminiKey) {
            store.set('googleApiKey', settings.geminiKey.trim());
        }

        if (settings.openaiKey) {
            store.set('openaiApiKey', settings.openaiKey.trim());
        }

        if (settings.deepseekKey) {
            store.set('deepseekApiKey', settings.deepseekKey.trim());
        }

        if (settings.claudeKey) {
            store.set('claudeApiKey', settings.claudeKey.trim());
        }

        if (settings.openaiModel) {
            store.set('openaiModel', settings.openaiModel);
        }

        // Save reasoning toggle
        store.set('enableReasoning', !!settings.enableReasoning);
        console.log('Reasoning enabled:', !!settings.enableReasoning);

        // Save DeepSeek reasoning toggle
        store.set('deepseekUseReasoning', !!settings.deepseekUseReasoning);
        console.log('DeepSeek reasoning enabled:', !!settings.deepseekUseReasoning);

        // Save Claude Opus toggle
        store.set('claudeUseOpus', !!settings.claudeUseOpus);
        console.log('Claude Opus enabled:', !!settings.claudeUseOpus);

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

// --- IPC Handler: Get History ---
const MAX_HISTORY_ENTRIES = 50;

ipcMain.handle('get-history', async () => {
    if (!store) {
        return [];
    }
    return store.get('responseHistory') || [];
});

// --- IPC Handler: Save History Entry ---
ipcMain.handle('save-history-entry', async (event, entry) => {
    if (!store) {
        return { success: false, error: 'Store not initialized' };
    }
    try {
        const history = store.get('responseHistory') || [];
        // Add new entry with timestamp
        const newEntry = {
            ...entry,
            id: Date.now(),
            timestamp: new Date().toISOString()
        };
        history.push(newEntry);
        // Keep only the last MAX_HISTORY_ENTRIES
        if (history.length > MAX_HISTORY_ENTRIES) {
            history.splice(0, history.length - MAX_HISTORY_ENTRIES);
        }
        store.set('responseHistory', history);
        return { success: true, id: newEntry.id };
    } catch (error) {
        console.error('Error saving history entry:', error);
        return { success: false, error: error.message };
    }
});

// --- IPC Handler: Clear History ---
ipcMain.handle('clear-history', async () => {
    if (!store) {
        return { success: false, error: 'Store not initialized' };
    }
    try {
        store.set('responseHistory', []);
        return { success: true };
    } catch (error) {
        console.error('Error clearing history:', error);
        return { success: false, error: error.message };
    }
});

// --- IPC Handler: Open Settings ---
ipcMain.on('open-settings', () => {
    createSettingsWindow();
});

// --- IPC Handler: Close Settings Window ---
ipcMain.on('close-settings-window', () => {
    console.log('Received close-settings-window request');
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.close();
    }
});

// --- IPC Handler: Combined Save and Close ---
ipcMain.on('save-and-close', (event, settings) => {
    console.log('Received save-and-close request');

    try {
        // Save settings directly
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

        // Save reasoning toggle
        store.set('enableReasoning', !!settings.enableReasoning);
        console.log('Reasoning enabled:', !!settings.enableReasoning);

        console.log('Settings saved via direct method');

        // Force close the window with timeout as fallback
        if (settingsWindow && !settingsWindow.isDestroyed()) {
            try {
                settingsWindow.close();
                console.log('Settings window closed');
            } catch (closeError) {
                console.error('Error closing window:', closeError);
            }

            // Force destroy as fallback if close fails
            setTimeout(() => {
                if (settingsWindow && !settingsWindow.isDestroyed()) {
                    console.log('Forcing window destruction as fallback');
                    settingsWindow.destroy();
                }
            }, 100);
        }
    } catch (error) {
        console.error('Error in save-and-close handler:', error);
    }
});

// --- IPC Handler: Get Reasoning State ---
ipcMain.handle('get-reasoning-state', async (event) => {
    if (!store) {
        console.error('Store not initialized when getting reasoning state');
        return false; // Default to false if store not ready
    }
    const state = store.get('enableReasoning') || false;
    console.log('Reporting reasoning state:', state);
    return state;
});

// --- IPC Listener: Toggle Reasoning State ---
ipcMain.on('toggle-reasoning', (event, newState) => {
    if (!store) {
        console.error('Store not initialized, cannot toggle reasoning');
        return;
    }
    console.log('Toggling reasoning state to:', newState);
    store.set('enableReasoning', !!newState);
});

// --- IPC Listener: Save Model Selection ---
ipcMain.on('save-model-selection', (event, modelId) => {
    if (!store) {
        console.error('Store not initialized, cannot save model selection');
        return;
    }
    if (modelId && (modelId === '4.1')) {
        console.log('Saving model selection:', modelId);
        store.set('openaiModel', modelId);
    } else {
        console.error('Invalid model ID:', modelId);
    }
});

// --- IPC Listener: Provider Selection ---
ipcMain.on('select-provider', (event, provider) => {
    if (!store) {
        console.error('Store not initialized, cannot select provider');
        return;
    }
    if (provider && ['openai', 'gemini', 'deepseek'].includes(provider)) {
        console.log('Selecting provider:', provider);
        store.set('apiProvider', provider);

        // Send update to renderer to refresh UI
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('provider-changed', provider);
        }
    } else {
        console.error('Invalid provider:', provider);
    }
});

// --- IPC Handler: Get Current Provider ---
ipcMain.handle('get-current-provider', async (event) => {
    if (!store) {
        return 'gemini'; // Default
    }
    return store.get('apiProvider') || 'gemini';
});

// --- IPC Listener: Toggle DeepSeek Reasoning ---
ipcMain.on('toggle-deepseek-reasoning', (event, enabled) => {
    if (!store) {
        console.error('Store not initialized, cannot toggle DeepSeek reasoning');
        return;
    }
    console.log('Toggling DeepSeek reasoning to:', enabled);
    store.set('deepseekUseReasoning', !!enabled);
});

// --- IPC Handler: Get DeepSeek Reasoning State ---
ipcMain.handle('get-deepseek-reasoning-state', async (event) => {
    if (!store) {
        return false;
    }
    return store.get('deepseekUseReasoning') || false;
});

// --- IPC Listener: Toggle Claude Opus ---
ipcMain.on('toggle-claude-opus', (event, enabled) => {
    if (!store) {
        console.error('Store not initialized, cannot toggle Claude Opus');
        return;
    }
    console.log('Toggling Claude Opus to:', enabled);
    store.set('claudeUseOpus', !!enabled);
});

// --- IPC Handler: Get Claude Opus State ---
ipcMain.handle('get-claude-opus-state', async (event) => {
    if (!store) {
        return false;
    }
    return store.get('claudeUseOpus') || false;
});

// --- IPC Handler: Call AI API ---
ipcMain.handle('call-gemini', async (event, payload) => {
    console.log('Main process received request to call AI API');
    if (!store) {
        return { error: 'Store is not initialized' };
    }

    const provider = store.get('apiProvider') || 'gemini';
    let apiKey;

    if (provider === 'gemini') {
        apiKey = store.get('googleApiKey');
    } else if (provider === 'deepseek') {
        apiKey = store.get('deepseekApiKey');
    } else if (provider === 'claude') {
        apiKey = store.get('claudeApiKey');
    } else {
        apiKey = store.get('openaiApiKey');
    }

    if (!apiKey) {
        return { error: `${provider.toUpperCase()} API key not found. Please set it in settings.` };
    }

    try {
        // Parse the payload if it's a JSON string (coming from screenshot)
        let textInput = payload;
        let hasScreenshot = false;
        let screenshotData = null;
        let customInstructions = '';
        let requestedModel = null;

        // Check if payload is a JSON string (from screenshot handling)
        if (typeof payload === 'string' && payload.startsWith('{') && payload.endsWith('}')) {
            try {
                const parsedPayload = JSON.parse(payload);
                textInput = parsedPayload.text || '';
                screenshotData = parsedPayload.screenshot || null;
                customInstructions = parsedPayload.instructions || '';
                requestedModel = parsedPayload.model || null;
                hasScreenshot = !!screenshotData;
                console.log('Parsed payload. Has screenshot:', hasScreenshot);
                if (requestedModel) {
                    console.log('Requested model:', requestedModel);
                }
                console.log('Screenshot data type:', typeof screenshotData);
                console.log('Screenshot data starts with:', screenshotData ? screenshotData.substring(0, 50) + '...' : 'null');
            } catch (parseError) {
                console.error('Error parsing JSON payload:', parseError);
                // Fall back to treating payload as plain text
            }
        }

        // Call the appropriate API based on the provider
        if (provider === 'gemini') {
            return await callGeminiApi(apiKey, textInput, customInstructions, screenshotData, hasScreenshot);
        } else if (provider === 'deepseek') {
            return await callDeepSeekApi(apiKey, textInput, customInstructions, screenshotData, hasScreenshot, requestedModel);
        } else if (provider === 'claude') {
            return await callClaudeApi(apiKey, textInput, customInstructions, screenshotData, hasScreenshot);
        } else {
            return await callOpenAIApi(apiKey, textInput, customInstructions, screenshotData, hasScreenshot, requestedModel);
        }
    } catch (error) {
        console.error(`Error calling ${provider} API:`, error);
        return { error: `Error: ${error.message}` };
    }
});

// Function to call the Gemini API
async function callGeminiApi(apiKey, textInput, customInstructions, screenshotData, hasScreenshot) {
    // Base URL for the Gemini API
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
        // Send raw response with LaTeX intact for proper rendering
        return { success: textResponse };
    } else {
        return { error: 'No valid response from Gemini' };
    }
}

// Function to call the OpenAI API
async function callOpenAIApi(apiKey, textInput, customInstructions, screenshotData, hasScreenshot, requestedModel) {
    // Determine the correct model config based on settings and screenshot status
    // Use the requested model if provided, otherwise fall back to stored model
    const storedModel = store.get('openaiModel') || 'o4-mini';
    const selectedModel = requestedModel || storedModel;
    const modelConfig = MODEL_CONFIG[selectedModel];
    const apiUrl = modelConfig.baseUrl;

    console.log(`Using OpenAI model: ${modelConfig.modelName}`);

    // Check if reasoning is enabled - only applicable for o4-mini model
    const enableReasoning = (selectedModel === 'o4-mini') && (store.get('enableReasoning') || false);
    console.log(`Reasoning enabled: ${enableReasoning}`);

    // Create request headers
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        // 'OpenAI-Beta': 'responses-2024-07-23'  // Required header for responses API
    };

    // Define the system instructions
    const systemInstructions = "You are a helpful assistant analyzing user input. Provide concise, accurate responses.";

    // Build the content for the user message
    const userMessageContent = [];

    // Add text if provided
    if (textInput) {
        userMessageContent.push({
            type: "input_text",
            text: textInput
        });
    }

    // Add custom instructions if provided
    if (customInstructions) {
        userMessageContent.push({
            type: "input_text",
            text: `Custom Instructions: ${customInstructions}`
        });
    }

    // Add screenshot if available
    if (hasScreenshot && screenshotData) {
        // Format image according to OpenAI API requirements
        // The screenshotData should already be a data URL like: data:image/png;base64,ABC123...
        userMessageContent.push({
            type: "input_image",
            image_url: screenshotData  // Pass the data URL directly as a string, not as an object
        });

        console.log('Image URL format being sent: String (data URL)');
        console.log('Image URL starts with:', screenshotData.substring(0, 30) + '...');
    }

    // Create the input message array
    const inputMessages = [
        {
            role: "user",
            content: userMessageContent
        }
    ];

    // Build request body - use different format based on model
    let requestBody;

    if (selectedModel === '4.1') {
        // Use Responses API format for GPT-4.1
        requestBody = {
            model: modelConfig.modelName,
            instructions: systemInstructions,
            input: inputMessages
        };
    } else {
        // Use standard Chat Completions format for o4-mini and other models
        const messages = [
            {
                role: "system",
                content: systemInstructions
            }
        ];

        // Convert input messages to standard format
        for (const inputMsg of inputMessages) {
            if (inputMsg.role === "user") {
                const userMessage = {
                    role: "user",
                    content: []
                };

                for (const contentItem of inputMsg.content) {
                    if (contentItem.type === "input_text") {
                        userMessage.content.push({
                            type: "text",
                            text: contentItem.text
                        });
                    } else if (contentItem.type === "input_image") {
                        userMessage.content.push({
                            type: "image_url",
                            image_url: {
                                url: contentItem.image_url
                            }
                        });
                    }
                }

                messages.push(userMessage);
            }
        }

        // Set temperature based on model - o4-mini only supports temperature 1
        const temperature = (selectedModel === 'o4-mini') ? 1 : 0.7;

        requestBody = {
            model: modelConfig.modelName,
            messages: messages,
            temperature: temperature
        };
    }

    // Add reasoning only for o4-mini model if enabled
    if (selectedModel === 'o4-mini' && enableReasoning) {
        console.log('Adding reasoning to request for o4-mini');
        if (selectedModel === '4.1') {
            requestBody.reasoning = {
                effort: "high"
            };
        } else {
            // For standard chat completions, reasoning might be handled differently
            // This depends on OpenAI's implementation for the o4-mini model
            requestBody.reasoning = true;
        }
    }

    console.log('Sending API request to OpenAI:', modelConfig.modelName);

    // Call the OpenAI API
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
    });

    // Parse the response
    const responseData = await response.json();

    // Log the response for debugging
    console.log('API response status:', response.status);
    console.log('API response data:', JSON.stringify(responseData, null, 2));

    // Check for errors in the response
    if (!response.ok) {
        const error = responseData.error || { message: 'Unknown API error' };
        console.error('OpenAI API error:', error);
        return { error: `API Error: ${error.message}` };
    }

    // Extract the text from response - handle different formats
    if (selectedModel === '4.1' && responseData.output) {
        // Handle Responses API format for GPT-4.1
        if (responseData.output.length > 0) {
            for (const item of responseData.output) {
                if (item.type === 'message' &&
                    item.content &&
                    item.content.length > 0) {
                    for (const contentItem of item.content) {
                        if (contentItem.type === 'output_text') {
                            const textContent = contentItem.text;
                            return { success: textContent.trim() };
                        }
                    }
                }
            }
            return { error: 'Could not find text in the response' };
        } else {
            return { error: 'No valid response from OpenAI' };
        }
    } else if (responseData.choices && responseData.choices.length > 0) {
        // Handle standard Chat Completions format for o4-mini and other models
        const choice = responseData.choices[0];
        if (choice.message && choice.message.content) {
            const textContent = choice.message.content;
            return { success: textContent.trim() };
        } else {
            return { error: 'No content in the response message' };
        }
    } else {
        return { error: 'No valid response from OpenAI' };
    }
}

// Function to call the DeepSeek API (using OpenAI-compatible format)
async function callDeepSeekApi(apiKey, textInput, customInstructions, screenshotData, hasScreenshot, requestedModel) {
    // Check if reasoning (R1) is enabled for DeepSeek
    const useReasoning = store.get('deepseekUseReasoning') || false;

    // Select model based on reasoning setting
    const model = useReasoning ? 'deepseek-reasoner' : 'deepseek-chat';
    console.log(`Using DeepSeek model: ${model}, Reasoning: ${useReasoning}`);

    // Create request headers
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    // Build the user message content
    let userContent = '';

    // Add text if provided
    if (textInput) {
        userContent += textInput;
    }

    // Add custom instructions if provided
    if (customInstructions) {
        userContent += (userContent ? '\n\n' : '') + `Custom Instructions: ${customInstructions}`;
    }

    // For screenshots, we need to handle them differently - DeepSeek might not support vision yet
    if (hasScreenshot && screenshotData) {
        userContent += (userContent ? '\n\n' : '') + 'I have attached a screenshot for analysis.';
        console.log('Note: DeepSeek may not support image analysis. Sending text-only request.');
    }

    // If no content, use a default
    if (!userContent.trim()) {
        userContent = 'Hello, please respond.';
    }

    // Create messages array (simplified for DeepSeek compatibility)
    const messages = [
        {
            role: "system",
            content: "You are a helpful assistant. Provide concise, accurate responses."
        },
        {
            role: "user",
            content: userContent
        }
    ];

    // Build request body
    const requestBody = {
        model: model,
        messages: messages,
        temperature: 0.7
    };

    console.log('Sending API request to DeepSeek:', model);

    try {
        // Call the DeepSeek API
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        // Log the response for debugging
        console.log('DeepSeek API response status:', response.status);
        console.log('DeepSeek API response headers:', response.headers.get('content-type'));

        // Check for errors in the response first
        if (!response.ok) {
            // Try to get error text
            const errorText = await response.text();
            console.error('DeepSeek API error response:', errorText);
            return { error: `API Error (${response.status}): ${errorText}` };
        }

        // Parse the response
        const responseText = await response.text();
        console.log('DeepSeek API raw response:', responseText.substring(0, 200) + '...');

        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Failed to parse DeepSeek response as JSON:', parseError);
            console.error('Raw response:', responseText);
            return { error: `Invalid response format from DeepSeek API` };
        }

        console.log('DeepSeek API response data:', JSON.stringify(responseData, null, 2));

        // Extract the text from the response
        if (responseData.choices && responseData.choices.length > 0) {
            const choice = responseData.choices[0];
            if (choice.message && choice.message.content) {
                const textContent = choice.message.content;
                return { success: textContent.trim() };
            }
        }

        return { error: 'No valid response from DeepSeek' };
    } catch (error) {
        console.error('Error calling DeepSeek API:', error);
        return { error: `Error: ${error.message}` };
    }
}

// Function to call the Claude API (Anthropic)
async function callClaudeApi(apiKey, textInput, customInstructions, screenshotData, hasScreenshot) {
    console.log('Calling Claude API...');

    // Check if Opus is enabled
    const useOpus = store.get('claudeUseOpus') || false;
    const model = useOpus ? 'claude-opus-4-5-20251101' : 'claude-sonnet-4-5-20250929';
    console.log(`Using Claude model: ${model}, Opus: ${useOpus}`);

    // Create request headers
    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
    };

    // Build the user message content
    const contentParts = [];

    // Add image if present (Claude supports vision)
    if (hasScreenshot && screenshotData) {
        // Extract base64 data and media type from data URL
        const matches = screenshotData.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
            const mediaType = matches[1];
            const base64Data = matches[2];
            contentParts.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: base64Data
                }
            });
        }
    }

    // Add text content
    let textContent = '';
    if (textInput) {
        textContent += textInput;
    }
    if (customInstructions) {
        textContent += (textContent ? '\n\n' : '') + `Custom Instructions: ${customInstructions}`;
    }
    if (!textContent.trim()) {
        textContent = 'Hello, please respond.';
    }

    contentParts.push({
        type: 'text',
        text: textContent
    });

    // Build request body
    const requestBody = {
        model: model,
        max_tokens: 4096,
        messages: [
            {
                role: 'user',
                content: contentParts
            }
        ]
    };

    console.log('Sending API request to Claude');

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        console.log('Claude API response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Claude API error response:', errorText);
            return { error: `API Error (${response.status}): ${errorText}` };
        }

        const responseData = await response.json();
        console.log('Claude API response data:', JSON.stringify(responseData, null, 2));

        // Extract the text from the response
        if (responseData.content && responseData.content.length > 0) {
            const textBlock = responseData.content.find(block => block.type === 'text');
            if (textBlock && textBlock.text) {
                return { success: textBlock.text.trim() };
            }
        }

        return { error: 'No valid response from Claude' };
    } catch (error) {
        console.error('Error calling Claude API:', error);
        return { error: `Error: ${error.message}` };
    }
}

// Helper function to get API key based on current provider
function getApiKey() {
    const provider = store.get('apiProvider') || 'gemini';
    if (provider === 'gemini') {
        return store.get('googleApiKey');
    } else if (provider === 'deepseek') {
        return store.get('deepseekApiKey');
    } else if (provider === 'claude') {
        return store.get('claudeApiKey');
    } else {
        return store.get('openaiApiKey');
    }
}

// Function to process math notation into HTML-friendly format for display
function processMathForDisplay(text) {
    // Return raw text with LaTeX intact for proper rendering
    return text;
}

// Legacy function to make mathematical expressions more readable for humans
function makeReadableMath(text) {
    // This is a more comprehensive makeover of the text that creates a more readable output

    // First, remove all escaped backslashes (common in JS strings with LaTeX)
    text = text.replace(/\\\\/g, '\\');

    // Format text headers and structure
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');

    // Replace LaTeX math delimiters
    text = text.replace(/\\\(|\\\)/g, '');
    text = text.replace(/\\\[|\\\]/g, '');
    text = text.replace(/\$\$/g, '');
    text = text.replace(/\$/g, '');

    // Handle different integral formats
    text = text.replace(/\\int_\{([^}]*)\}\^\{([^}]*)\}/g, 'integral from $1 to $2 of');
    text = text.replace(/\\int_(\S+)\^(\S+)/g, 'integral from $1 to $2 of');
    text = text.replace(/\\int/g, 'integral');

    // Handle limits and evaluations
    text = text.replace(/\\left\.(.*?)\\right\|_(\S+)\^(\S+)/g, 'evaluated at $2 to $3');
    text = text.replace(/\\left\.(.*?)\\right\|_\{([^}]*)\}\^\{([^}]*)\}/g, 'evaluated at $2 to $3');
    text = text.replace(/\\big\|_(\S+)\^(\S+)/g, 'evaluated at $1 to $2');

    // Handle absolute value
    text = text.replace(/\|([^|]+)\|/g, 'absolute value of $1');

    // Replace LaTeX fractions
    text = text.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)');
    text = text.replace(/\\frac(\S)(\S)/g, '$1/$2');

    // Replace LaTeX exponents
    text = text.replace(/\^\{([^}]*)\}/g, ' to the power of $1');
    text = text.replace(/e\^\{-([^}]*)\}/g, 'e to the power of -$1');
    text = text.replace(/e\^\{([^}]*)\}/g, 'e to the power of $1');
    text = text.replace(/e\^(-?[\d.]+)/g, 'e to the power of $1');
    text = text.replace(/\^(\S)/g, ' to the power of $1');

    // Replace LaTeX subscripts
    text = text.replace(/_\{([^}]*)\}/g, ' subscript $1');
    text = text.replace(/_(\S)/g, ' subscript $1');

    // Replace LaTeX square roots
    text = text.replace(/\\sqrt\{([^}]*)\}/g, 'square root of $1');
    text = text.replace(/\\sqrt(\S)/g, 'square root of $1');

    // Replace common LaTeX symbols
    text = text.replace(/\\Rightarrow/g, 'therefore');
    text = text.replace(/\\rightarrow/g, 'leads to');
    text = text.replace(/\\to/g, 'approaches');
    text = text.replace(/\\infty/g, 'infinity');
    text = text.replace(/\\pi/g, 'pi');
    text = text.replace(/\\theta/g, 'theta');
    text = text.replace(/\\alpha/g, 'alpha');
    text = text.replace(/\\beta/g, 'beta');
    text = text.replace(/\\gamma/g, 'gamma');
    text = text.replace(/\\delta/g, 'delta');
    text = text.replace(/\\lambda/g, 'lambda');
    text = text.replace(/\\mu/g, 'mu');
    text = text.replace(/\\sigma/g, 'sigma');
    text = text.replace(/\\sum_\{([^}]*)\}\^\{([^}]*)\}/g, 'sum from $1 to $2 of');
    text = text.replace(/\\sum/g, 'sum');
    text = text.replace(/\\prod_\{([^}]*)\}\^\{([^}]*)\}/g, 'product from $1 to $2 of');
    text = text.replace(/\\prod/g, 'product');
    text = text.replace(/\\partial/g, 'partial derivative');
    text = text.replace(/\\cdot/g, 'times');
    text = text.replace(/\\times/g, 'times');
    text = text.replace(/\\div/g, 'divided by');
    text = text.replace(/\\ge/g, 'greater than or equal to');
    text = text.replace(/\\geq/g, 'greater than or equal to');
    text = text.replace(/\\le/g, 'less than or equal to');
    text = text.replace(/\\leq/g, 'less than or equal to');
    text = text.replace(/\\neq/g, 'not equal to');
    text = text.replace(/\\approx/g, 'approximately');
    text = text.replace(/\\equiv/g, 'equivalent to');
    text = text.replace(/\\in/g, 'in');
    text = text.replace(/\\subset/g, 'is a subset of');
    text = text.replace(/\\cup/g, 'union');
    text = text.replace(/\\cap/g, 'intersection');

    // Replace LaTeX brackets and braces
    text = text.replace(/\\left\(/g, '(');
    text = text.replace(/\\right\)/g, ')');
    text = text.replace(/\\left\[/g, '[');
    text = text.replace(/\\right\]/g, ']');
    text = text.replace(/\\left\\{/g, '{');
    text = text.replace(/\\right\\}/g, '}');
    text = text.replace(/\\{/g, '{');
    text = text.replace(/\\}/g, '}');

    // Replace LaTeX equation environments
    text = text.replace(/\\begin\{equation\}(.*?)\\end\{equation\}/gs, '$1');
    text = text.replace(/\\begin\{align\}(.*?)\\end\{align\}/gs, '$1');
    text = text.replace(/\\begin\{aligned\}(.*?)\\end\{aligned\}/gs, '$1');
    text = text.replace(/\\begin\{\S+\}|\\end\{\S+\}/g, '');

    // Handle boxed answer and result notation
    text = text.replace(/\\boxed\{([^}]*)\}/g, 'Final Answer: $1');

    // Clean up remaining LaTeX commands
    text = text.replace(/\\[a-zA-Z]+/g, '');

    // Add appropriate spacing to math expressions for readability
    text = text.replace(/([+\-*/=()\[\]])/g, ' $1 ');
    text = text.replace(/\s+/g, ' ').trim();

    // Remove unnecessary double whitespace
    text = text.replace(/\s{2,}/g, ' ');

    // Add better formatting for steps in mathematical solutions
    text = text.replace(/Let's solve it step by step:/g, "I'll solve this step by step:");
    text = text.replace(/Using integration by parts:/g, "Here's how we use integration by parts:");
    text = text.replace(/Let \\\( u = ([^)]+)\\\)/g, "First, I'll substitute u = $1.");
    text = text.replace(/Final answer:/g, "Here's our final answer:");
    text = text.replace(/For the first part|First term|Second term|Second part/g, "\n$&:");

    return text;
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

async function getSystemInfo() {
    try {
        // Get detailed OS information
        const osInfoData = {
            platform: os.platform(),
            release: os.release(),
            arch: os.arch(),
            cpus: os.cpus().length,
            // Include first three characters of hostname for identification but privacy
            hostnamePrefix: os.hostname().substring(0, 3)
        };

        // Call your license server with enhanced security
        const response = await fetch('https://license-verification-server.onrender.com/api/check-license', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-App-Version': app.getVersion(),
                'X-Request-Timestamp': timestamp.toString(),
                'User-Agent': `Spectro/${app.getVersion()} (${os.platform()}; ${os.release()})`
            },
            body: JSON.stringify({
                deviceId,
                secondaryId,
                timestamp,
                osInfo: osInfoData
            }),
            // Set a reasonable timeout
            timeout: 10000
        });

        if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}`);
        }

        const data = await response.json();

        // Check if server returned an error code
        if (data.code && ['BLACKLISTED', 'BLACKLISTED_NETWORK', 'DEVICE_MISMATCH'].includes(data.code)) {
            console.error(`License server reported issue: ${data.code}`);
            // Record the blacklisting locally
            store.set('licenseBlacklisted', true);
            store.set('licenseBlacklistReason', data.message || data.code);
        }

        // Verify server response hasn't been tampered with
        if (data.signature) {
            // Rebuild the expected data that was signed
            const expectedData = {
                valid: data.valid,
                hoursRemaining: data.hoursRemaining,
                deviceId
            };

            // If this is a new activation, include that in the verification data
            if (data.activated) {
                expectedData.activated = true;
            }

            // Create a verification function that we would use if we had the server's secret key
            // (In a real implementation, we'd need to use asymmetric crypto or a pre-shared key)
            // For now, we'll just check if the signature exists which is better than nothing

            if (!data.signature) {
                console.error('License response missing signature');
                throw new Error('Invalid server response - missing signature');
            }
        }

        // Log remaining time
        if (data.valid && data.hoursRemaining) {
            console.log(`License valid. ${data.hoursRemaining} hours remaining.`);
        } else if (!data.valid) {
            console.log(`License invalid: ${data.message}`);
        }

        return {
            valid: data.valid,
            hoursRemaining: data.hoursRemaining || 0,
            message: data.message,
            code: data.code
        };
    } catch (error) {
        console.error('License check failed:', error);
        throw error;
    }
}

// Fallback offline license verification
function checkOfflineLicense() {
    try {
        // First check if we're blacklisted locally
        if (store.get('licenseBlacklisted') === true) {
            return {
                valid: false,
                message: store.get('licenseBlacklistReason') || 'License has been revoked'
            };
        }

        // Get the stored last check time
        const storedCheck = store.get('licenseLastCheck');
        if (!storedCheck) {
            return { valid: false, message: 'No previous license verification found' };
        }

        // Decrypt and verify the stored timestamp
        const lastCheckTime = parseInt(decryptData(storedCheck.time));
        const expectedHash = crypto.createHash('sha256')
            .update(`${lastCheckTime}-${getHardwareIdentifier()}`)
            .digest('hex');

        // If hash doesn't match, someone may have tampered with the data
        if (storedCheck.hash !== expectedHash) {
            return { valid: false, message: 'License data integrity check failed' };
        }

        // Get stored hours remaining
        const hoursRemaining = parseInt(decryptData(store.get('licenseHoursRemaining') || '0'));

        // Calculate how much time has passed since last successful check
        const hoursSinceLastCheck = (Date.now() - lastCheckTime) / (1000 * 60 * 60);
        const currentHoursRemaining = Math.max(0, hoursRemaining - hoursSinceLastCheck);

        // If more than 24 hours since last successful check, require online verification
        if (Date.now() - lastCheckTime > 24 * 60 * 60 * 1000) {
            return { valid: false, message: 'Online verification required' };
        }

        return {
            valid: currentHoursRemaining > 0,
            hoursRemaining: currentHoursRemaining,
            message: currentHoursRemaining > 0 ?
                `Offline verification: ${Math.floor(currentHoursRemaining)} hours remaining` :
                'License expired'
        };
    } catch (error) {
        console.error('Offline license check failed:', error);
        return { valid: false, message: 'Offline verification failed' };
    }
}

// Handle license errors consistently
async function handleLicenseError(message) {
    await dialog.showMessageBox({
        type: 'error',
        title: 'License Verification Error',
        message: message,
        detail: 'Please try again later or contact support for assistance.',
        buttons: ['Quit']
    });
    app.quit();
}

// Get additional hardware identifier that's harder to spoof
function getHardwareIdentifier() {
    try {
        // Create a more robust hardware identifier using multiple system properties
        const cpus = os.cpus();
        const networkInterfaces = os.networkInterfaces();

        // Extract CPU information (model, speed)
        const cpuInfo = cpus.length > 0 ?
            `${cpus[0].model.substring(0, 20)}-${cpus.length}` :
            `unknown-${os.cpus().length}`;

        // Extract MAC addresses from physical interfaces (ignoring virtual ones)
        const macAddresses = [];
        Object.keys(networkInterfaces).forEach(ifName => {
            const interfaces = networkInterfaces[ifName];
            if (!interfaces) return;

            interfaces.forEach(iface => {
                // Only use physical interfaces (ignoring loopback and virtual)
                if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
                    macAddresses.push(iface.mac);
                }
            });
        });

        // Use disk serial/uuid when available (platform specific)
        let diskIdentifier = '';
        try {
            if (os.platform() === 'darwin') {
                // On macOS, we could use the disk UUID but we'll need additional tools
                // For now, using the system UUID from system_profiler would require 
                // a child process, so we'll use a combination of existing info
                diskIdentifier = crypto.createHash('sha256')
                    .update(os.homedir() + os.userInfo().username)
                    .digest('hex').substring(0, 8);
            } else if (os.platform() === 'win32') {
                // On Windows, the volume serial number would be ideal
                // For a simple implementation, we'll use similar fallback
                diskIdentifier = crypto.createHash('sha256')
                    .update(os.homedir() + os.userInfo().username)
                    .digest('hex').substring(0, 8);
            } else {
                // Linux and others
                diskIdentifier = crypto.createHash('sha256')
                    .update(`${os.homedir()}-${os.platform()}`)
                    .digest('hex').substring(0, 8);
            }
        } catch (diskError) {
            console.error('Error getting disk identifier:', diskError);
            diskIdentifier = 'unknown';
        }

        // Create a combined hardware fingerprint
        const fingerprint = `${cpuInfo}|${macAddresses.join(',')}|${os.totalmem()}|${diskIdentifier}`;

        // Create a hash of this fingerprint
        return crypto.createHash('sha256').update(fingerprint).digest('hex');
    } catch (error) {
        console.error('Error generating hardware identifier:', error);
        // Fallback to a basic identifier if there's an error
        return crypto.createHash('sha256')
            .update(`${os.hostname()}-${os.platform()}-${os.cpus().length}`)
            .digest('hex');
    }
}

// Simple encryption/decryption functions using a fixed key
// function encryptData(text) {
//     try {
//         if (!text) return '';

//         const algorithm = 'aes-256-cbc';
//         // Create a deterministic but device-specific key using hardware info
//         const keyBase = `${machineIdSync()}-${os.platform()}-${os.totalmem()}`;
//         const key = crypto.createHash('sha256').update(keyBase).digest().slice(0, 32);

//         const iv = crypto.randomBytes(16);
//         const cipher = crypto.createCipheriv(algorithm, key, iv);
//         let encrypted = cipher.update(text, 'utf8', 'hex');
//         encrypted += cipher.final('hex');
//         return `${iv.toString('hex')}:${encrypted}`;
//     } catch (error) {
//         console.error('Encryption error:', error);
//         return '';
//     }
// }

function decryptData(text) {
    try {
        if (!text || !text.includes(':')) return '';

        const algorithm = 'aes-256-cbc';
        // Create the same deterministic key used for encryption
        const keyBase = `${machineIdSync()}-${os.platform()}-${os.totalmem()}`;
        const key = crypto.createHash('sha256').update(keyBase).digest().slice(0, 32);

        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        return '';
    }
}

// // Add a function to check for tampering with the app itself
// async function verifyAppIntegrity() {
//     try {
//         // In a production app, we would validate:
//         // 1. That the app's code signature is valid
//         // 2. That critical files haven't been modified
//         // 3. That we're not running in a debugging environment

//         // For now, we'll do some basic checks
//         const isDevToolsOpen = mainWindow &&
//             mainWindow.webContents &&
//             mainWindow.webContents.isDevToolsOpened();

//         if (isDevToolsOpen) {
//             console.warn('DevTools are open - potential tampering attempt');
//             // In a real app, we might want to report this to the server
//             return false;
//         }

//         // Check if we're running in development mode
//         const isDev = process.env.NODE_ENV === 'development' ||
//             process.defaultApp ||
//             /[\\/]electron-prebuilt[\\/]/.test(process.execPath) ||
//             /[\\/]electron[\\/]/.test(process.execPath);

//         if (isDev) {
//             console.warn('Running in development mode');
//             // Allow in dev mode, but a real app might limit functionality
//         }

//         return true;
//     } catch (error) {
//         console.error('App integrity check failed:', error);
//         return false;
//     }
// }
