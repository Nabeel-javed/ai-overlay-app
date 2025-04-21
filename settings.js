// settings.js
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Settings page loaded');

    // Get DOM elements
    const geminiRadio = document.getElementById('gemini');
    const openaiRadio = document.getElementById('openai');
    const geminiKeyInput = document.getElementById('gemini-key');
    const openaiKeyInput = document.getElementById('openai-key');
    const openaiModelSelect = document.getElementById('openai-model');
    const saveButton = document.getElementById('save-button');
    const cancelButton = document.getElementById('cancel-button');

    // Force button setup with direct click handlers
    function setupButtons() {
        // Remove any existing listeners to be safe
        const newSaveButton = saveButton.cloneNode(true);
        const newCancelButton = cancelButton.cloneNode(true);

        saveButton.parentNode.replaceChild(newSaveButton, saveButton);
        cancelButton.parentNode.replaceChild(newCancelButton, cancelButton);

        // Re-attach references
        const saveBtn = document.getElementById('save-button');
        const cancelBtn = document.getElementById('cancel-button');

        // Direct onclick property assignment (more reliable in packaged apps)
        saveBtn.onclick = function () {
            handleSave();
            return false;
        };

        cancelBtn.onclick = function () {
            console.log('Cancel clicked - direct handler');
            window.electronAPI.closeSettingsWindow();
            return false;
        };
    }

    // Load current settings
    try {
        console.log('Loading settings...');
        const settings = await window.electronAPI.getSettings();
        console.log('Current settings:', settings);

        // Set the selected provider
        if (settings.provider === 'openai') {
            openaiRadio.checked = true;
        } else {
            geminiRadio.checked = true;
        }

        // Set API keys
        geminiKeyInput.value = settings.geminiKey || '';
        openaiKeyInput.value = settings.openaiKey || '';
        openaiModelSelect.value = settings.openaiModel || "gpt-o3mini-high";
    } catch (error) {
        console.error('Error loading settings:', error);
    }

    // Save handler function
    async function handleSave() {
        console.log('Save function called');

        // Get current values
        const selectedProvider = document.getElementById('gemini').checked ? 'gemini' : 'openai';
        const geminiKey = document.getElementById('gemini-key').value.trim();
        const openaiKey = document.getElementById('openai-key').value.trim();
        const openaiModel = document.getElementById('openai-model').value;

        console.log('Saving provider:', selectedProvider);

        // Validate inputs
        if ((selectedProvider === 'gemini' && !geminiKey) ||
            (selectedProvider === 'openai' && !openaiKey)) {
            alert(`Please enter an API key for ${selectedProvider === 'gemini' ? 'Google Gemini' : 'OpenAI'}.`);
            return;
        }

        try {
            console.log('Sending data to main process...');

            // Use direct method call to save settings
            window.electronAPI.saveAndClose({
                provider: selectedProvider,
                geminiKey: geminiKey,
                openaiKey: openaiKey,
                openaiModel: openaiModel
            });

        } catch (error) {
            console.error('Error in save handler:', error);
            alert('An error occurred while saving settings.');
        }
    }

    // Set up buttons with direct handlers
    setupButtons();
}); 