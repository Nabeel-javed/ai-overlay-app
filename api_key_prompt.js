// api_key_prompt.js
document.addEventListener('DOMContentLoaded', () => {
    // Get elements
    const saveButton = document.getElementById('save-button');
    const apiKeyInput = document.getElementById('api-key');
    const errorMessage = document.getElementById('error-message');
    const geminiRadio = document.getElementById('gemini');
    const openaiRadio = document.getElementById('openai');
    const deepseekRadio = document.getElementById('deepseek');
    const claudeRadio = document.getElementById('claude');
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
    deepseekRadio.addEventListener('change', updateHelpText);
    claudeRadio.addEventListener('change', updateHelpText);

    function updateHelpText() {
        if (geminiRadio.checked) {
            selectedProvider = 'gemini';
        } else if (openaiRadio.checked) {
            selectedProvider = 'openai';
        } else if (deepseekRadio.checked) {
            selectedProvider = 'deepseek';
        } else if (claudeRadio.checked) {
            selectedProvider = 'claude';
        }

        if (selectedProvider === 'gemini') {
            providerHelp.innerHTML = 'Google Gemini API keys can be obtained from <a href="#" id="gemini-link">Google AI Studio</a>.';
            const newGeminiLink = document.getElementById('gemini-link');
            newGeminiLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.electronAPI.openExternalLink('https://aistudio.google.com/');
            });
        } else if (selectedProvider === 'openai') {
            providerHelp.innerHTML = 'OpenAI API keys can be obtained from your <a href="#" id="openai-link">OpenAI account</a>.';
            const openaiLink = document.getElementById('openai-link');
            openaiLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.electronAPI.openExternalLink('https://platform.openai.com/account/api-keys');
            });
        } else if (selectedProvider === 'deepseek') {
            providerHelp.innerHTML = 'DeepSeek API keys can be obtained from <a href="#" id="deepseek-link">DeepSeek Platform</a>.';
            const deepseekLink = document.getElementById('deepseek-link');
            deepseekLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.electronAPI.openExternalLink('https://platform.deepseek.com/api_keys');
            });
        } else if (selectedProvider === 'claude') {
            providerHelp.innerHTML = 'Claude API keys can be obtained from <a href="#" id="claude-link">Anthropic Console</a>.';
            const claudeLink = document.getElementById('claude-link');
            claudeLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.electronAPI.openExternalLink('https://console.anthropic.com/settings/keys');
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

        if (geminiRadio.checked) {
            selectedProvider = 'gemini';
        } else if (openaiRadio.checked) {
            selectedProvider = 'openai';
        } else if (deepseekRadio.checked) {
            selectedProvider = 'deepseek';
        } else if (claudeRadio.checked) {
            selectedProvider = 'claude';
        }

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