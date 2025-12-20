// renderer.js

// Get references to all the UI elements
const inputTextArea = document.getElementById('input-textarea');
const responseTextArea = document.getElementById('response-textarea');
const submitButton = document.getElementById('submit-button');
const dismissButton = document.getElementById('dismiss-button');
const loadingIndicator = document.getElementById('loading-indicator');

// New screenshot-related elements
const screenshotSection = document.getElementById('screenshot-section');
const screenshotImg = document.getElementById('screenshot-img');
const removeScreenshotButton = document.getElementById('remove-screenshot-button');
const instructionsTextArea = document.getElementById('instructions-textarea');

// Add settings button reference if it exists in the HTML
const settingsButton = document.getElementById('settings-button');

// Copy response button reference
const copyResponseButton = document.getElementById('copy-response');

// Add reasoning checkbox and label references
const reasoningCheckbox = document.getElementById('enable-reasoning-main');
const reasoningLabel = document.getElementById('reasoning-label');

// Add model selector buttons references
const modelButtons = document.querySelectorAll('.model-btn');

// Add provider selector buttons references
const providerButtons = document.querySelectorAll('.provider-btn');
const modelSelector = document.getElementById('openai-model-selector');
const deepseekReasoningToggle = document.getElementById('deepseek-reasoning-toggle');
const deepseekReasoningCheckbox = document.getElementById('enable-reasoning-deepseek');
const claudeModelToggle = document.getElementById('claude-model-toggle');
const claudeOpusCheckbox = document.getElementById('enable-opus-claude');

// Variable to store the current screenshot data URL
let currentScreenshot = null;
// Variable to store the current selected model
let currentModel = 'o4-mini'; // Default to o4-mini
// Variable to store the current provider
let currentProvider = 'gemini'; // Default to Gemini

// History state
let history = [];
let historyIndex = -1; // -1 means we're at the current (new) entry
const historyIndicator = document.getElementById('history-indicator');

// --- REMOVED: IPC Listener for clipboard text ---
// window.electronAPI.onSetInputText((text) => { ... });

// --- NEW: IPC Listener for focus request ---
// When the main process sends 'focus-input', focus the text area
window.electronAPI.onFocusInput(() => {
    inputTextArea.focus();
    // Optional: Select existing text?
    // inputTextArea.select();
});

// --- NEW: IPC Listener for checking which element to focus ---
// Checks if a screenshot is present and focuses the appropriate field
window.electronAPI.onCheckFocusTarget(() => {
    if (currentScreenshot && !screenshotSection.classList.contains('hidden')) {
        instructionsTextArea.focus();
    } else {
        inputTextArea.focus();
    }
});

// --- IPC Listener for screenshot capture ---
window.electronAPI.onScreenshotCaptured((dataUrl) => {
    currentScreenshot = dataUrl;
    displayScreenshot(dataUrl);
});

// --- IPC Listener for clearing screenshot ---
window.electronAPI.onClearScreenshot(() => {
    removeScreenshot();
});

// --- IPC Listener for resetting tool ---
window.electronAPI.onResetTool(() => {
    resetTool();
});


// Get current model and provider from settings
async function getCurrentProviderAndModelFromSettings() {
    try {
        const settings = await window.electronAPI.getSettings();
        if (settings) {
            if (settings.provider) {
                currentProvider = settings.provider;
                updateProviderUI(currentProvider);
            }
            if (settings.openaiModel) {
                currentModel = settings.openaiModel;
                updateModelUI(currentModel);
            }
        }
    } catch (error) {
        console.error('Error getting current settings:', error);
    }
}

// Update the provider UI to reflect the current selected provider
function updateProviderUI(providerId) {
    providerButtons.forEach(button => {
        if (button.dataset.provider === providerId) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });

    // Show/hide model selector and reasoning toggle based on provider
    if (providerId === 'openai') {
        modelSelector.style.display = 'flex';
        deepseekReasoningToggle.style.display = 'none';
        claudeModelToggle.style.display = 'none';
        // Keep the current OpenAI model
    } else if (providerId === 'deepseek') {
        modelSelector.style.display = 'none';
        deepseekReasoningToggle.style.display = 'flex';
        claudeModelToggle.style.display = 'none';
        // Clear model selection for DeepSeek (it uses reasoning toggle instead)
        currentModel = null;
    } else if (providerId === 'claude') {
        modelSelector.style.display = 'none';
        deepseekReasoningToggle.style.display = 'none';
        claudeModelToggle.style.display = 'flex';
        // Clear model selection for Claude (it uses opus toggle instead)
        currentModel = null;
    } else {
        // Gemini - hide all
        modelSelector.style.display = 'none';
        deepseekReasoningToggle.style.display = 'none';
        claudeModelToggle.style.display = 'none';
        // Clear model selection for Gemini
        currentModel = null;
    }
}

// Update the model UI to reflect the current selected model
function updateModelUI(modelId) {
    modelButtons.forEach(button => {
        if (button.dataset.model === modelId) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });

    // If the new model is GPT-4.1, disable reasoning checkbox (it only works with o4-mini)
    if (modelId === '4.1' && reasoningCheckbox) {
        reasoningCheckbox.checked = false;
        reasoningCheckbox.disabled = true;
        reasoningLabel.classList.add('disabled');
        window.electronAPI.toggleReasoning(false);
    } else if (reasoningCheckbox) {
        reasoningCheckbox.disabled = false;
        reasoningLabel.classList.remove('disabled');
    }
}

// Function to display the screenshot
function displayScreenshot(dataUrl) {
    screenshotImg.src = dataUrl;
    screenshotSection.classList.remove('hidden');
    // Auto-focus the instructions textarea when a screenshot is captured
    instructionsTextArea.focus();

    // Ensure submit button is properly enabled
    updateSubmitButton();

    // Scroll to ensure the custom instructions are visible
    setTimeout(() => {
        instructionsTextArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}

// Function to remove the screenshot
function removeScreenshot() {
    currentScreenshot = null;
    screenshotImg.src = '';
    screenshotSection.classList.add('hidden');
    instructionsTextArea.value = '';
    // Focus back on the main input
    inputTextArea.focus();

    // Update the submit button state
    updateSubmitButton();
}

// Function to reset the tool to default state
function resetTool() {
    // Clear input and response text areas
    inputTextArea.value = '';
    responseTextArea.innerHTML = '';

    // Remove any screenshot
    if (currentScreenshot) {
        removeScreenshot();
    }

    // Clear any custom instructions
    instructionsTextArea.value = '';

    // Disable the submit button
    submitButton.disabled = true;

    // Hide loading indicator if visible
    loadingIndicator.classList.add('hidden');

    // Focus the input field
    inputTextArea.focus();

}

// --- Event Listener: Remove Screenshot Button ---
removeScreenshotButton.addEventListener('click', () => {
    removeScreenshot();
    window.electronAPI.sendRemoveScreenshot();
});

// --- Event Listener: Settings Button ---
if (settingsButton) {
    settingsButton.addEventListener('click', () => {
        window.electronAPI.openSettings();
    });
}

// --- Event Listener: Copy Response Button ---
if (copyResponseButton) {
    copyResponseButton.addEventListener('click', async () => {
        const responseText = responseTextArea.innerText.trim();
        if (!responseText) {
            showNotification('Nothing to copy', 'info');
            return;
        }
        try {
            await navigator.clipboard.writeText(responseText);
            // Visual feedback
            copyResponseButton.classList.add('copied');
            copyResponseButton.textContent = 'Copied!';
            showNotification('Copied to clipboard', 'success');
            // Reset button after 2 seconds
            setTimeout(() => {
                copyResponseButton.classList.remove('copied');
                copyResponseButton.textContent = 'Copy';
            }, 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
            showNotification('Failed to copy', 'error');
        }
    });
}

// --- Event Listener: Provider Buttons ---
providerButtons.forEach(button => {
    button.addEventListener('click', () => {
        const providerId = button.dataset.provider;

        // Update UI first
        updateProviderUI(providerId);

        // Update the currentProvider variable
        currentProvider = providerId;

        // Save provider selection
        window.electronAPI.selectProvider(providerId);
    });
});

// --- Event Listener: Model Buttons ---
modelButtons.forEach(button => {
    button.addEventListener('click', () => {
        const modelId = button.dataset.model;

        // Update UI first
        updateModelUI(modelId);

        // Update the currentModel variable
        currentModel = modelId;

        // Save model selection to settings
        window.electronAPI.saveModelSelection(modelId);
    });
});

// --- Event Listener: Reasoning Checkbox ---
if (reasoningCheckbox && reasoningLabel) {
    reasoningCheckbox.addEventListener('change', (event) => {
        const isEnabled = event.target.checked;
        // We don't update the label text anymore with On/Off
        window.electronAPI.toggleReasoning(isEnabled);
    });
}

// --- Event Listener: DeepSeek Reasoning Checkbox ---
if (deepseekReasoningCheckbox) {
    deepseekReasoningCheckbox.addEventListener('change', (event) => {
        const isEnabled = event.target.checked;
        window.electronAPI.toggleDeepSeekReasoning(isEnabled);
    });
}

// --- Event Listener: Claude Opus Checkbox ---
if (claudeOpusCheckbox) {
    claudeOpusCheckbox.addEventListener('change', (event) => {
        const isEnabled = event.target.checked;
        window.electronAPI.toggleClaudeOpus(isEnabled);
    });
}

// --- IPC Listener for provider changes ---
window.electronAPI.onProviderChanged((provider) => {
    currentProvider = provider;
    updateProviderUI(provider);
});

// --- IPC Listener for provider notifications ---
window.electronAPI.onProviderNotification((data) => {
    showProviderNotification(data.message);
});

// --- IPC Listener for DeepSeek reasoning changes ---
window.electronAPI.onDeepSeekReasoningChanged((enabled) => {
    if (deepseekReasoningCheckbox) {
        deepseekReasoningCheckbox.checked = enabled;
    }
});

// --- IPC Listener for OpenAI model changes ---
window.electronAPI.onOpenAIModelChanged((model) => {
    currentModel = model;
    updateModelUI(model);
});

// Function to enhance mathematical notation for better LaTeX rendering
function enhanceMathNotation(text) {
    // Convert common Unicode math symbols to LaTeX equivalents
    let enhanced = text;

    // Greek letters
    enhanced = enhanced.replace(/π/g, '$\\pi$');
    enhanced = enhanced.replace(/α/g, '$\\alpha$');
    enhanced = enhanced.replace(/β/g, '$\\beta$');
    enhanced = enhanced.replace(/γ/g, '$\\gamma$');
    enhanced = enhanced.replace(/δ/g, '$\\delta$');
    enhanced = enhanced.replace(/ε/g, '$\\epsilon$');
    enhanced = enhanced.replace(/θ/g, '$\\theta$');
    enhanced = enhanced.replace(/λ/g, '$\\lambda$');
    enhanced = enhanced.replace(/μ/g, '$\\mu$');
    enhanced = enhanced.replace(/σ/g, '$\\sigma$');
    enhanced = enhanced.replace(/φ/g, '$\\phi$');
    enhanced = enhanced.replace(/ψ/g, '$\\psi$');
    enhanced = enhanced.replace(/ω/g, '$\\omega$');

    // Integral symbols
    enhanced = enhanced.replace(/∫/g, '$\\int$');
    enhanced = enhanced.replace(/∮/g, '$\\oint$');

    // Summation and product symbols
    enhanced = enhanced.replace(/∑/g, '$\\sum$');
    enhanced = enhanced.replace(/∏/g, '$\\prod$');

    // Other mathematical symbols
    enhanced = enhanced.replace(/∞/g, '$\\infty$');
    enhanced = enhanced.replace(/√/g, '$\\sqrt{}$');
    enhanced = enhanced.replace(/≤/g, '$\\leq$');
    enhanced = enhanced.replace(/≥/g, '$\\geq$');
    enhanced = enhanced.replace(/≠/g, '$\\neq$');
    enhanced = enhanced.replace(/≈/g, '$\\approx$');
    enhanced = enhanced.replace(/±/g, '$\\pm$');
    enhanced = enhanced.replace(/∂/g, '$\\partial$');
    enhanced = enhanced.replace(/→/g, '$\\rightarrow$');
    enhanced = enhanced.replace(/⇒/g, '$\\Rightarrow$');

    // Fix subscripts and superscripts patterns
    // Handle patterns like x₀, x₁, etc.
    enhanced = enhanced.replace(/([a-zA-Z])₀/g, '$1_0$');
    enhanced = enhanced.replace(/([a-zA-Z])₁/g, '$1_1$');
    enhanced = enhanced.replace(/([a-zA-Z])₂/g, '$1_2$');
    enhanced = enhanced.replace(/([a-zA-Z])₃/g, '$1_3$');
    enhanced = enhanced.replace(/([a-zA-Z])₄/g, '$1_4$');
    enhanced = enhanced.replace(/([a-zA-Z])₅/g, '$1_5$');
    enhanced = enhanced.replace(/([a-zA-Z])₆/g, '$1_6$');
    enhanced = enhanced.replace(/([a-zA-Z])₇/g, '$1_7$');
    enhanced = enhanced.replace(/([a-zA-Z])₈/g, '$1_8$');
    enhanced = enhanced.replace(/([a-zA-Z])₉/g, '$1_9$');

    // Handle superscripts like x², x³, etc.
    enhanced = enhanced.replace(/([a-zA-Z0-9)])²/g, '$1^2$');
    enhanced = enhanced.replace(/([a-zA-Z0-9)])³/g, '$1^3$');
    enhanced = enhanced.replace(/([a-zA-Z0-9)])⁴/g, '$1^4$');
    enhanced = enhanced.replace(/([a-zA-Z0-9)])⁵/g, '$1^5$');
    enhanced = enhanced.replace(/([a-zA-Z0-9)])⁶/g, '$1^6$');
    enhanced = enhanced.replace(/([a-zA-Z0-9)])⁷/g, '$1^7$');
    enhanced = enhanced.replace(/([a-zA-Z0-9)])⁸/g, '$1^8$');
    enhanced = enhanced.replace(/([a-zA-Z0-9)])⁹/g, '$1^9$');
    enhanced = enhanced.replace(/([a-zA-Z0-9)])⁻¹/g, '$1^{-1}$');

    // Handle fraction-like patterns (simple cases)
    enhanced = enhanced.replace(/(\d+)\/(\d+)/g, '$\\frac{$1}{$2}$');

    // Clean up any double dollar signs that might have been created
    enhanced = enhanced.replace(/\$\$+/g, '$');

    // Handle cases where LaTeX delimiters might be adjacent
    enhanced = enhanced.replace(/\$\s*\$/g, '');

    return enhanced;
}

// Notification ID counter for stacking
let notificationCounter = 0;

// Function to show temporary notification with type support
// Types: 'success' (default), 'info', 'warning', 'error'
function showNotification(message, type = 'success', duration = 2000) {
    const id = ++notificationCounter;

    // Create notification element
    const notification = document.createElement('div');
    notification.id = `notification-${id}`;
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Calculate vertical position based on existing notifications
    const existingNotifications = document.querySelectorAll('.notification.show');
    let topOffset = 20;
    existingNotifications.forEach(n => {
        topOffset += n.offsetHeight + 10;
    });
    notification.style.top = `${topOffset}px`;

    document.body.appendChild(notification);

    // Trigger show animation
    requestAnimationFrame(() => {
        notification.classList.add('show');
    });

    // Hide and remove after duration
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, duration);
}

// Wrapper for backwards compatibility
function showProviderNotification(message) {
    showNotification(message, 'success', 2000);
}

// --- History Management Functions ---

// Load history from storage on startup
async function loadHistory() {
    try {
        history = await window.electronAPI.getHistory();
        historyIndex = -1; // Start at current (new) entry
        updateHistoryIndicator();
    } catch (error) {
        console.error('Failed to load history:', error);
        history = [];
    }
}

// Save a new history entry
async function saveHistoryEntry(input, response, screenshot = null, instructions = '') {
    const entry = {
        input,
        response,
        screenshot,
        instructions,
        provider: currentProvider,
        model: currentModel
    };
    try {
        const result = await window.electronAPI.saveHistoryEntry(entry);
        if (result.success) {
            // Add to local history array
            history.push({
                ...entry,
                id: result.id,
                timestamp: new Date().toISOString()
            });
            historyIndex = -1; // Reset to current
            updateHistoryIndicator();
        }
    } catch (error) {
        console.error('Failed to save history entry:', error);
    }
}

// Navigate to a specific history entry
function navigateToHistoryEntry(index) {
    if (history.length === 0) {
        showNotification('No history available', 'info');
        return;
    }

    // Clamp index to valid range
    const newIndex = Math.max(-1, Math.min(history.length - 1, index));

    if (newIndex === historyIndex) {
        // Already at this position
        if (newIndex === -1) {
            showNotification('At current entry', 'info');
        } else if (newIndex === 0) {
            showNotification('At oldest entry', 'info');
        }
        return;
    }

    historyIndex = newIndex;

    if (historyIndex === -1) {
        // Show current/empty state
        inputTextArea.value = '';
        responseTextArea.innerHTML = '';
        removeScreenshot();
        showNotification('Current entry', 'info');
    } else {
        // Show historical entry
        const entry = history[historyIndex];
        inputTextArea.value = entry.input || '';
        responseTextArea.innerHTML = entry.response || '';

        // Handle screenshot if present
        if (entry.screenshot) {
            currentScreenshot = entry.screenshot;
            displayScreenshot(entry.screenshot);
            if (entry.instructions) {
                instructionsTextArea.value = entry.instructions;
            }
        } else {
            removeScreenshot();
        }

        // Trigger MathJax typesetting
        if (typeof window.typeset === 'function') {
            setTimeout(() => window.typeset(), 100);
        }
    }

    updateHistoryIndicator();
    updateSubmitButton();
}

// Navigate to previous (older) history entry
function navigateToPreviousEntry() {
    if (history.length === 0) {
        showNotification('No history available', 'info');
        return;
    }

    if (historyIndex === history.length - 1) {
        showNotification('At oldest entry', 'info');
        return;
    }

    // Move towards older entries (higher index)
    navigateToHistoryEntry(historyIndex + 1);
}

// Navigate to next (newer) history entry
function navigateToNextEntry() {
    if (historyIndex === -1) {
        showNotification('At current entry', 'info');
        return;
    }

    // Move towards newer entries (lower index, -1 is current)
    navigateToHistoryEntry(historyIndex - 1);
}

// Update the history indicator UI
function updateHistoryIndicator() {
    if (!historyIndicator) return;

    if (history.length === 0) {
        historyIndicator.classList.add('hidden');
        return;
    }

    historyIndicator.classList.remove('hidden');

    if (historyIndex === -1) {
        historyIndicator.textContent = `${history.length} saved`;
        historyIndicator.classList.remove('active');
    } else {
        // Show position as "X of Y" (1-indexed for user friendliness)
        const position = history.length - historyIndex;
        historyIndicator.textContent = `${position}/${history.length}`;
        historyIndicator.classList.add('active');
    }
}

// Function to handle AI submission
async function submitToAI() {
    const inputText = inputTextArea.value.trim();
    const customInstructions = instructionsTextArea.value.trim();

    // Check if we have either text input or a screenshot
    if (!inputText && !currentScreenshot) {
        responseTextArea.innerHTML = "Please enter text or capture a screenshot.";
        return;
    }

    loadingIndicator.classList.remove('hidden');
    submitButton.disabled = true;
    responseTextArea.innerHTML = 'Sending request to AI...';

    try {
        // Prepare the payload - combine text, instructions, and screenshot if available
        let payload;

        // If we have a screenshot, add information about it
        if (currentScreenshot) {
            // Create a more structured payload with the screenshot data
            const screenshotPayload = {
                text: inputText,
                screenshot: currentScreenshot,
                instructions: customInstructions,
                // Only pass model for OpenAI, other providers don't need it
                ...(currentProvider === 'openai' && currentModel ? { model: currentModel } : {})
            };

            // Convert to JSON string
            payload = JSON.stringify(screenshotPayload);
        } else {
            // If it's just text, still pass the model selection for OpenAI only
            const textPayload = {
                text: inputText,
                // Only pass model for OpenAI, other providers don't need it
                ...(currentProvider === 'openai' && currentModel ? { model: currentModel } : {})
            };
            payload = JSON.stringify(textPayload);
        }

        const result = await window.electronAPI.invokeCallGemini(payload);

        if (result.success) {
            // Process math content based on the provider and model
            let processedContent = result.success;

            // If using o4-mini, enhance mathematical notation for better rendering
            if (currentProvider === 'openai' && currentModel === 'o4-mini') {
                processedContent = enhanceMathNotation(processedContent);
            }

            // Use innerHTML instead of value since we're working with a div now
            responseTextArea.innerHTML = processedContent;

            // Render LaTeX using MathJax
            setTimeout(() => {
                if (typeof window.typeset === 'function') {
                    try {
                        window.typeset();
                    } catch (error) {
                        console.error('MathJax error:', error);
                    }
                } else {
                    console.error('MathJax typeset function not found');
                }
            }, 100);

            // Save to history
            saveHistoryEntry(
                inputText,
                processedContent,
                currentScreenshot,
                customInstructions
            );
        } else {
            responseTextArea.innerHTML = `Error: ${result.error || 'An unknown error occurred.'}`;
        }
    } catch (error) {
        console.error('Error sending request:', error);
        responseTextArea.innerHTML = `Error: ${error.message || 'Failed to get response from AI.'}`;
    } finally {
        loadingIndicator.classList.add('hidden');
        submitButton.disabled = false;
        updateSubmitButton();
    }
}

// --- Event Listener: Submit Button ---
submitButton.addEventListener('click', submitToAI);

// --- Event Listener: Input Textarea (Cmd+Enter) ---
inputTextArea.addEventListener('keydown', (event) => {
    // Check for Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault(); // Prevent default behavior (newline)
        submitToAI();
    }
});

// --- Event Listener: Instructions Textarea (Cmd+Enter) ---
instructionsTextArea.addEventListener('keydown', (event) => {
    // Check for Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault(); // Prevent default behavior (newline)
        submitToAI();
    }
});

// --- Event Listener: Dismiss Button ---
// Sends 'dismiss-overlay', which now hides the window in main.js
dismissButton.addEventListener('click', () => {
    window.electronAPI.sendDismissOverlay();
});

// --- Event Listener: Enable Submit based on Input or Screenshot ---
inputTextArea.addEventListener('input', updateSubmitButton);
instructionsTextArea.addEventListener('input', updateSubmitButton);

function updateSubmitButton() {
    submitButton.disabled = !inputTextArea.value.trim() && !currentScreenshot;
}

// --- Global keyboard shortcuts for scrolling response area ---
document.addEventListener('keydown', (event) => {
    // Only handle these shortcuts when not typing in input fields
    const activeElement = document.activeElement;
    const isTyping = activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT';

    // Copy response shortcut (Ctrl+Shift+C) - works even when typing
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        if (copyResponseButton) {
            copyResponseButton.click();
        }
        return;
    }

    // History navigation shortcuts (Ctrl+Up/Down) - works even when typing
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            navigateToPreviousEntry();
            return;
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            navigateToNextEntry();
            return;
        }
    }

    // Scroll response area shortcuts (Page Up/Down, Arrow keys with modifiers)
    if (!isTyping) {
        let scrollAmount = 0;
        let shouldScroll = false;

        // Page Up/Down for large scrolls
        if (event.key === 'PageUp' || (event.ctrlKey && event.key === 'ArrowUp')) {
            scrollAmount = -responseTextArea.clientHeight * 0.8; // Scroll up by 80% of viewport
            shouldScroll = true;
        } else if (event.key === 'PageDown' || (event.ctrlKey && event.key === 'ArrowDown')) {
            scrollAmount = responseTextArea.clientHeight * 0.8; // Scroll down by 80% of viewport
            shouldScroll = true;
        }
        // Arrow keys for smaller scrolls
        else if (event.altKey && event.key === 'ArrowUp') {
            scrollAmount = -40; // Small scroll up
            shouldScroll = true;
        } else if (event.altKey && event.key === 'ArrowDown') {
            scrollAmount = 40; // Small scroll down
            shouldScroll = true;
        }
        // Home/End for jumping to top/bottom
        else if (event.key === 'Home' || (event.ctrlKey && event.key === 'Home')) {
            responseTextArea.scrollTop = 0;
            event.preventDefault();
            return;
        } else if (event.key === 'End' || (event.ctrlKey && event.key === 'End')) {
            responseTextArea.scrollTop = responseTextArea.scrollHeight;
            event.preventDefault();
            return;
        }

        if (shouldScroll) {
            event.preventDefault();
            responseTextArea.scrollTop += scrollAmount;
        }
    }
});

// --- Initial State ---
document.addEventListener('DOMContentLoaded', async () => {
    // Input area is now always enabled by default when window is visible.
    // Focus might be set initially by main process or via hotkey.
    submitButton.disabled = true; // Disable initially until input or screenshot

    // Get current provider and model from settings
    await getCurrentProviderAndModelFromSettings();

    // Load history from storage
    await loadHistory();

    // Get initial reasoning state and set checkbox
    if (reasoningCheckbox && reasoningLabel) {
        try {
            const initialState = await window.electronAPI.getReasoningState();
            reasoningCheckbox.checked = initialState;
            // We don't update the label text now with On/Off

            // If the current model is 4.1, disable reasoning (it only works with o4-mini)
            if (currentModel === '4.1') {
                reasoningCheckbox.disabled = true;
                reasoningLabel.classList.add('disabled');
            }
        } catch (error) {
            console.error('Error getting initial reasoning state:', error);
        }
    }

    // Get initial DeepSeek reasoning state and set checkbox
    if (deepseekReasoningCheckbox) {
        try {
            const initialDeepSeekState = await window.electronAPI.getDeepSeekReasoningState();
            deepseekReasoningCheckbox.checked = initialDeepSeekState;
        } catch (error) {
            console.error('Error getting initial DeepSeek reasoning state:', error);
        }
    }

    // Get initial Claude Opus state and set checkbox
    if (claudeOpusCheckbox) {
        try {
            const initialClaudeOpusState = await window.electronAPI.getClaudeOpusState();
            claudeOpusCheckbox.checked = initialClaudeOpusState;
        } catch (error) {
            console.error('Error getting initial Claude Opus state:', error);
        }
    }
});
