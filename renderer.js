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

// Variable to store the current screenshot data URL
let currentScreenshot = null;
// Variable to store the current selected model
let currentModel = 'o4-mini'; // Default to o4-mini
// Variable to store the current provider
let currentProvider = 'gemini'; // Default to Gemini

// --- REMOVED: IPC Listener for clipboard text ---
// window.electronAPI.onSetInputText((text) => { ... });

// --- NEW: IPC Listener for focus request ---
// When the main process sends 'focus-input', focus the text area
window.electronAPI.onFocusInput(() => {
    console.log('Renderer received focus request.');
    inputTextArea.focus();
    // Optional: Select existing text?
    // inputTextArea.select();
});

// --- NEW: IPC Listener for checking which element to focus ---
// Checks if a screenshot is present and focuses the appropriate field
window.electronAPI.onCheckFocusTarget(() => {
    console.log('Renderer received check-focus-target request.');
    if (currentScreenshot && !screenshotSection.classList.contains('hidden')) {
        // If a screenshot is present, focus the custom instructions textarea
        console.log('Screenshot present, focusing instructions textarea');
        instructionsTextArea.focus();
    } else {
        // Otherwise, focus the main input textarea
        console.log('No screenshot, focusing main input textarea');
        inputTextArea.focus();
    }
});

// --- IPC Listener for screenshot capture ---
window.electronAPI.onScreenshotCaptured((dataUrl) => {
    console.log('Renderer received screenshot.');
    currentScreenshot = dataUrl;
    displayScreenshot(dataUrl);
});

// --- IPC Listener for clearing screenshot ---
window.electronAPI.onClearScreenshot(() => {
    console.log('Renderer received clear screenshot request.');
    removeScreenshot();
});

// --- IPC Listener for resetting tool ---
window.electronAPI.onResetTool(() => {
    console.log('Renderer received reset tool request.');
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
        // Keep the current OpenAI model
    } else if (providerId === 'deepseek') {
        modelSelector.style.display = 'none';
        deepseekReasoningToggle.style.display = 'flex';
        // Clear model selection for DeepSeek (it uses reasoning toggle instead)
        currentModel = null;
    } else {
        // Gemini - hide both
        modelSelector.style.display = 'none';
        deepseekReasoningToggle.style.display = 'none';
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

    console.log('Tool has been reset to default state');
}

// --- Event Listener: Remove Screenshot Button ---
removeScreenshotButton.addEventListener('click', () => {
    console.log('Remove screenshot button clicked.');
    removeScreenshot();
    window.electronAPI.sendRemoveScreenshot();
});

// --- Event Listener: Settings Button ---
if (settingsButton) {
    settingsButton.addEventListener('click', () => {
        console.log('Settings button clicked.');
        window.electronAPI.openSettings();
    });
}

// --- Event Listener: Provider Buttons ---
providerButtons.forEach(button => {
    button.addEventListener('click', () => {
        const providerId = button.dataset.provider;
        console.log(`Provider button clicked: ${providerId}`);

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
        console.log(`Model button clicked: ${modelId}`);

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
        console.log(`Reasoning checkbox changed to: ${isEnabled}`);
        // We don't update the label text anymore with On/Off
        window.electronAPI.toggleReasoning(isEnabled);
    });
}

// --- Event Listener: DeepSeek Reasoning Checkbox ---
if (deepseekReasoningCheckbox) {
    deepseekReasoningCheckbox.addEventListener('change', (event) => {
        const isEnabled = event.target.checked;
        console.log(`DeepSeek reasoning checkbox changed to: ${isEnabled}`);
        window.electronAPI.toggleDeepSeekReasoning(isEnabled);
    });
}

// --- IPC Listener for provider changes ---
window.electronAPI.onProviderChanged((provider) => {
    console.log('Provider changed to:', provider);
    currentProvider = provider;
    updateProviderUI(provider);
});

// --- IPC Listener for provider notifications ---
window.electronAPI.onProviderNotification((data) => {
    console.log('Provider notification:', data);
    showProviderNotification(data.message);
});

// --- IPC Listener for DeepSeek reasoning changes ---
window.electronAPI.onDeepSeekReasoningChanged((enabled) => {
    console.log('DeepSeek reasoning changed to:', enabled);
    if (deepseekReasoningCheckbox) {
        deepseekReasoningCheckbox.checked = enabled;
    }
});

// --- IPC Listener for OpenAI model changes ---
window.electronAPI.onOpenAIModelChanged((model) => {
    console.log('OpenAI model changed to:', model);
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

// Function to show temporary provider notification
function showProviderNotification(message) {
    // Create or get existing notification element
    let notification = document.getElementById('provider-notification');

    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'provider-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: var(--accent-color);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
            pointer-events: none;
        `;
        document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.style.opacity = '1';

    // Hide after 2 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
    }, 2000);
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

        console.log('Renderer sending data to main process (AI)');
        const result = await window.electronAPI.invokeCallGemini(payload);

        console.log('Renderer received result from main:', result);
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
                        console.log('MathJax rendering triggered');
                    } catch (error) {
                        console.error('MathJax error:', error);
                    }
                } else {
                    console.error('MathJax typeset function not found');
                }
            }, 100);
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
    console.log('Dismiss button clicked, sending request to main process to hide.');
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
    console.log('DOM fully loaded and parsed');
    // Input area is now always enabled by default when window is visible.
    // Focus might be set initially by main process or via hotkey.
    submitButton.disabled = true; // Disable initially until input or screenshot

    // Get current provider and model from settings
    await getCurrentProviderAndModelFromSettings();

    // Get initial reasoning state and set checkbox
    if (reasoningCheckbox && reasoningLabel) {
        try {
            const initialState = await window.electronAPI.getReasoningState();
            console.log('Initial reasoning state received:', initialState);
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
            console.log('Initial DeepSeek reasoning state received:', initialDeepSeekState);
            deepseekReasoningCheckbox.checked = initialDeepSeekState;
        } catch (error) {
            console.error('Error getting initial DeepSeek reasoning state:', error);
        }
    }
});
