// api_key_prompt.js
const apiKeyInput = document.getElementById('apiKey');
const saveButton = document.getElementById('saveButton');
const errorMessage = document.getElementById('errorMessage');
const geminiRadio = document.getElementById('gemini');
const openaiRadio = document.getElementById('openai');

saveButton.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const provider = geminiRadio.checked ? 'gemini' : 'openai';
    errorMessage.style.display = 'none'; // Hide previous error

    if (!key) {
        errorMessage.textContent = 'API Key cannot be empty.';
        errorMessage.style.display = 'block';
        return;
    }

    try {
        // Send key and provider to main process
        const result = await window.apiKeyPromptAPI.saveKey({
            apiKey: key,
            provider: provider
        });

        if (result.success) {
            // Main process will close this window on success
            console.log(`${provider.toUpperCase()} API Key sent to main process successfully.`);
        } else {
            errorMessage.textContent = `Error: ${result.error || 'Could not save key.'}`;
            errorMessage.style.display = 'block';
        }
    } catch (error) {
        errorMessage.textContent = `IPC Error: ${error.message}`;
        errorMessage.style.display = 'block';
        console.error("IPC Error saving key:", error);
    }
});

// Update the form placeholder based on selected provider
function updateProviderHint() {
    if (geminiRadio.checked) {
        apiKeyInput.placeholder = "Enter your Google Gemini API key";
    } else {
        apiKeyInput.placeholder = "Enter your OpenAI API key";
    }
}

// Initial placeholder update
updateProviderHint();

// Update placeholder when provider changes
geminiRadio.addEventListener('change', updateProviderHint);
openaiRadio.addEventListener('change', updateProviderHint);