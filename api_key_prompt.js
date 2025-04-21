// api_key_prompt.js
document.addEventListener('DOMContentLoaded', () => {
    // Get elements
    const saveButton = document.getElementById('save-button');
    const apiKeyInput = document.getElementById('api-key');
    const errorMessage = document.getElementById('error-message');
    const geminiRadio = document.getElementById('gemini');
    const openaiRadio = document.getElementById('openai');
    const providerHelp = document.getElementById('provider-help');
    const geminiLink = document.getElementById('gemini-link');

    // Add link handling
    geminiLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.electronAPI.openExternalLink('https://aistudio.google.com/');
    });

    // Initialize provider selection
    let selectedProvider = 'gemini';

    // Update provider help text when selection changes
    geminiRadio.addEventListener('change', updateHelpText);
    openaiRadio.addEventListener('change', updateHelpText);

    function updateHelpText() {
        selectedProvider = geminiRadio.checked ? 'gemini' : 'openai';

        if (selectedProvider === 'gemini') {
            providerHelp.innerHTML = 'Google Gemini API keys can be obtained from <a href="#" id="gemini-link">Google AI Studio</a>.';
            const newGeminiLink = document.getElementById('gemini-link');
            newGeminiLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.electronAPI.openExternalLink('https://aistudio.google.com/');
            });
        } else {
            providerHelp.innerHTML = 'OpenAI API keys can be obtained from your <a href="#" id="openai-link">OpenAI account</a>.';
            const openaiLink = document.getElementById('openai-link');
            openaiLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.electronAPI.openExternalLink('https://platform.openai.com/account/api-keys');
            });
        }
    }

    // Handle save button click
    saveButton.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            showError('Please enter a valid API key');
            return;
        }

        selectedProvider = geminiRadio.checked ? 'gemini' : 'openai';

        try {
            // Save API key through the preload bridge
            const result = await window.electronAPI.saveApiKey({
                apiKey,
                provider: selectedProvider
            });

            if (!result.success) {
                showError(result.error || 'Failed to save API key');
            }
            // Success is handled by the main process (window closes)
        } catch (error) {
            showError(`Error: ${error.message}`);
        }
    });

    // Show error message
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }

    // Add keyboard event listener for Enter key
    apiKeyInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            saveButton.click();
        }
    });
});