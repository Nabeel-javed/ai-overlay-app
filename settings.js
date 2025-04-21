// settings.js
document.addEventListener('DOMContentLoaded', async () => {
    // Get DOM elements
    const geminiRadio = document.getElementById('gemini');
    const openaiRadio = document.getElementById('openai');
    const geminiKeyInput = document.getElementById('gemini-key');
    const openaiKeyInput = document.getElementById('openai-key');
    const openaiModelSelect = document.getElementById('openai-model');
    const saveButton = document.getElementById('save-button');
    const cancelButton = document.getElementById('cancel-button');

    // Load current settings
    try {
        const settings = await window.electronAPI.getSettings();

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

    // Save button click handler
    saveButton.addEventListener('click', async () => {
        const selectedProvider = geminiRadio.checked ? 'gemini' : 'openai';
        const geminiKey = geminiKeyInput.value.trim();
        const openaiKey = openaiKeyInput.value.trim();
        const openaiModel = openaiModelSelect.value;

        // Validate that at least the selected provider has a key
        if ((selectedProvider === 'gemini' && !geminiKey) ||
            (selectedProvider === 'openai' && !openaiKey)) {
            alert(`Please enter an API key for ${selectedProvider === 'gemini' ? 'Google Gemini' : 'OpenAI'}.`);
            return;
        }

        try {
            const result = await window.electronAPI.saveSettings({
                provider: selectedProvider,
                geminiKey: geminiKey,
                openaiKey: openaiKey,
                openaiModel: openaiModel
            });

            if (result.success) {
                window.close();
            } else {
                alert(`Error saving settings: ${result.error}`);
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('An error occurred while saving settings.');
        }
    });

    // Cancel button click handler
    cancelButton.addEventListener('click', () => {
        window.close();
    });
}); 