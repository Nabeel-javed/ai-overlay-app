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

    // Make sure the UI elements are found
    if (!saveButton || !cancelButton) {
        console.error('Button elements not found!');
    } else {
        console.log('Buttons loaded successfully');
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

    // Define window close function for DMG compatibility
    const closeSettingsWindow = () => {
        console.log('Attempting to close settings window');
        try {
            // Try multiple methods to ensure window closes
            if (window.electronAPI && window.electronAPI.closeSettingsWindow) {
                console.log('Using custom close method');
                window.electronAPI.closeSettingsWindow();
            } else {
                console.log('Using standard window.close');
                window.close();
            }
        } catch (error) {
            console.error('Error closing window:', error);
        }
    };

    // Save button click handler
    saveButton.addEventListener('click', async (e) => {
        console.log('Save button clicked');
        e.preventDefault();

        const selectedProvider = geminiRadio.checked ? 'gemini' : 'openai';
        const geminiKey = geminiKeyInput.value.trim();
        const openaiKey = openaiKeyInput.value.trim();
        const openaiModel = openaiModelSelect.value;

        console.log('Saving provider:', selectedProvider);
        console.log('OpenAI model:', openaiModel);

        // Validate that at least the selected provider has a key
        if ((selectedProvider === 'gemini' && !geminiKey) ||
            (selectedProvider === 'openai' && !openaiKey)) {
            alert(`Please enter an API key for ${selectedProvider === 'gemini' ? 'Google Gemini' : 'OpenAI'}.`);
            return;
        }

        try {
            console.log('Sending data to main process...');
            const result = await window.electronAPI.saveSettings({
                provider: selectedProvider,
                geminiKey: geminiKey,
                openaiKey: openaiKey,
                openaiModel: openaiModel
            });

            console.log('Save result:', result);
            if (result.success) {
                console.log('Settings saved successfully, closing window');
                closeSettingsWindow();
            } else {
                alert(`Error saving settings: ${result.error}`);
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('An error occurred while saving settings.');
        }
    });

    // Cancel button click handler
    cancelButton.addEventListener('click', (e) => {
        console.log('Cancel button clicked');
        e.preventDefault();
        closeSettingsWindow();
    });
}); 