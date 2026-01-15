import supabaseService from '../services/supabaseService.js';

export const updateApiKey = async (req, res) => {
    try {
        const { apiKey } = req.body;
        if (!apiKey) return res.status(400).json({ success: false, error: 'API Key is required' });

        await supabaseService.updateApiKeyConfig(req.userId, apiKey);
        console.log(`[CONFIG] API Key updated for user ${req.userId}`);

        res.json({ success: true, message: 'API Key updated successfully' });
    } catch (e) {
        console.error('[CONFIG_ERROR]', e);
        res.status(500).json({ success: false, error: e.message });
    }
};

export const getApiKey = async (req, res) => {
    try {
        const apiKey = await supabaseService.getApiKeyConfig(req.userId);
        res.json({
            success: true,
            apiConfig: {
                enabled: !!apiKey,
                apiKey: apiKey || ''
            }
        });
    } catch (e) {
        console.error('[CONFIG_GET_ERROR]', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
