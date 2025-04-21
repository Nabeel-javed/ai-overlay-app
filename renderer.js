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

// Variable to store the current screenshot data URL
let currentScreenshot = null;

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

// --- IPC Listener for license update ---
window.electronAPI.onLicenseUpdate((data) => {
    console.log(`License time remaining: ${data.hoursRemaining} hours`);
    // Update your UI as needed
});

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
    responseTextArea.value = '';

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

// --- Event Listener: Reasoning Checkbox ---
if (reasoningCheckbox && reasoningLabel) {
    reasoningCheckbox.addEventListener('change', (event) => {
        const isEnabled = event.target.checked;
        console.log(`Reasoning checkbox changed to: ${isEnabled}`);
        // Update label text
        reasoningLabel.textContent = isEnabled ? 'Reasoning On' : 'Reasoning Off';
        window.electronAPI.toggleReasoning(isEnabled);
    });
}

// --- Event Listener: Submit Button ---
submitButton.addEventListener('click', async () => {
    const inputText = inputTextArea.value.trim();
    const customInstructions = instructionsTextArea.value.trim();

    // Check if we have either text input or a screenshot
    if (!inputText && !currentScreenshot) {
        responseTextArea.value = "Please enter text or capture a screenshot.";
        return;
    }

    loadingIndicator.classList.remove('hidden');
    submitButton.disabled = true;
    responseTextArea.value = 'Sending request to AI...';

    try {
        // Prepare the payload - combine text, instructions, and screenshot if available
        let payload = inputText;

        // If we have a screenshot, add information about it
        if (currentScreenshot) {
            // Create a more structured payload with the screenshot data
            const screenshotPayload = {
                text: inputText,
                screenshot: currentScreenshot,
                instructions: customInstructions
            };

            // Convert to JSON string
            payload = JSON.stringify(screenshotPayload);
        }

        console.log('Renderer sending data to main process (AI)');
        const result = await window.electronAPI.invokeCallGemini(payload);

        console.log('Renderer received result from main:', result);
        if (result.success) {
            responseTextArea.value = result.success;
        } else {
            responseTextArea.value = `Error: ${result.error || 'An unknown error occurred.'}`;
        }
    } catch (error) {
        responseTextArea.value = `IPC Error: ${error.message}`;
    } finally {
        loadingIndicator.classList.add('hidden');
        submitButton.disabled = !inputTextArea.value.trim() && !currentScreenshot;
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

// --- Initial State ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded and parsed');
    // Input area is now always enabled by default when window is visible.
    // Focus might be set initially by main process or via hotkey.
    submitButton.disabled = true; // Disable initially until input or screenshot

    // Get initial reasoning state and set checkbox and label
    if (reasoningCheckbox && reasoningLabel) {
        try {
            const initialState = await window.electronAPI.getReasoningState();
            console.log('Initial reasoning state received:', initialState);
            reasoningCheckbox.checked = initialState;
            // Set initial label text
            reasoningLabel.textContent = initialState ? 'Reasoning On' : 'Reasoning Off';
        } catch (error) {
            console.error('Error getting initial reasoning state:', error);
        }
    }
});
