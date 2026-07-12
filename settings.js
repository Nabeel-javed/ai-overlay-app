// settings.js
document.addEventListener('DOMContentLoaded', async () => {

    // Get DOM elements
    const providerSelect = document.getElementById('provider-select');
    const openaiKey = document.getElementById('openai-key');
    const deepseekKey = document.getElementById('deepseek-key');
    const claudeKey = document.getElementById('claude-key');
    const openaiModel = document.getElementById('openai-model'); // May be null if commented out
    const saveButton = document.getElementById('save-button');
    const cancelButton = document.getElementById('cancel-button');
    const enableReasoning = document.getElementById('enable-reasoning'); // May be null if commented out
    const deepseekReasoning = document.getElementById('deepseek-reasoning');
    const claudeOpus = document.getElementById('claude-opus');
    const openaiSettings = document.getElementById('openai-settings');
    const deepseekSettings = document.getElementById('deepseek-settings');
    const claudeSettings = document.getElementById('claude-settings');
    const openaiProviderBtn = document.getElementById('openai-provider');
    const deepseekProviderBtn = document.getElementById('deepseek-provider');
    const claudeProviderBtn = document.getElementById('claude-provider');

    // Initially load current settings
    try {
        const settings = await window.settingsAPI.getSettings();

        // Set values based on retrieved settings
        providerSelect.value = settings.provider || 'openai';
        openaiKey.value = settings.openaiKey || '';
        deepseekKey.value = settings.deepseekKey || '';
        claudeKey.value = settings.claudeKey || '';

        // Only set values if elements exist
        if (openaiModel) {
            openaiModel.value = settings.openaiModel || 'terra';
        }

        if (enableReasoning) {
            enableReasoning.checked = settings.enableReasoning || false;
        }

        if (deepseekReasoning) {
            deepseekReasoning.checked = settings.deepseekUseReasoning || false;
        }

        if (claudeOpus) {
            claudeOpus.checked = settings.claudeUseOpus || false;
        }

        // Update button UI based on saved provider
        updateProviderButtons(providerSelect.value);

        // Update visibility of provider-specific sections
        updateSettingsVisibility();
    } catch (error) {
        console.error('Error loading settings:', error);
    }

    // Toggle visibility of provider-specific settings
    function updateSettingsVisibility() {
        const provider = providerSelect.value;
        openaiSettings.style.display = provider === 'openai' ? 'block' : 'none';
        deepseekSettings.style.display = provider === 'deepseek' ? 'block' : 'none';
        claudeSettings.style.display = provider === 'claude' ? 'block' : 'none';
    }

    // Update provider buttons active state
    function updateProviderButtons(provider) {
        openaiProviderBtn.classList.remove('active');
        deepseekProviderBtn.classList.remove('active');
        claudeProviderBtn.classList.remove('active');

        if (provider === 'openai') {
            openaiProviderBtn.classList.add('active');
        } else if (provider === 'deepseek') {
            deepseekProviderBtn.classList.add('active');
        } else if (provider === 'claude') {
            claudeProviderBtn.classList.add('active');
        }
    }

    // Event listener for OpenAI provider button
    openaiProviderBtn.addEventListener('click', () => {
        providerSelect.value = 'openai';
        updateProviderButtons('openai');
        updateSettingsVisibility();
    });

    // Event listener for DeepSeek provider button
    deepseekProviderBtn.addEventListener('click', () => {
        providerSelect.value = 'deepseek';
        updateProviderButtons('deepseek');
        updateSettingsVisibility();
    });

    // Event listener for Claude provider button
    claudeProviderBtn.addEventListener('click', () => {
        providerSelect.value = 'claude';
        updateProviderButtons('claude');
        updateSettingsVisibility();
    });

    // Event listener for save button
    saveButton.addEventListener('click', async () => {
        // Get current settings to maintain values for commented out elements
        let currentSettings = {};
        try {
            currentSettings = await window.settingsAPI.getSettings();
        } catch (error) {
            console.error('Error getting current settings:', error);
            currentSettings = {};
        }

        // Gather settings
        const settings = {
            provider: providerSelect.value,
            openaiKey: openaiKey.value,
            deepseekKey: deepseekKey.value,
            claudeKey: claudeKey.value,
            openaiModel: openaiModel ? openaiModel.value : (currentSettings.openaiModel || 'terra'),
            enableReasoning: enableReasoning ? enableReasoning.checked : (currentSettings.enableReasoning || false),
            deepseekUseReasoning: deepseekReasoning ? deepseekReasoning.checked : (currentSettings.deepseekUseReasoning || false),
            claudeUseOpus: claudeOpus ? claudeOpus.checked : (currentSettings.claudeUseOpus || false)
        };

        try {
            // Save settings via IPC
            await window.settingsAPI.saveSettings(settings);
            // Closing is handled by main process
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('Failed to save settings: ' + error.message);
        }
    });

    // Event listener for cancel button
    cancelButton.addEventListener('click', () => {
        window.settingsAPI.closeWindow();
    });
}); 