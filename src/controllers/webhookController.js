import supabaseService from '../services/supabaseService.js';

export const getWebhooks = async (req, res) => {
    try {
        const webhooks = await supabaseService.getWebhooks(req.userId);
        res.json({ success: true, webhooks });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

export const addWebhook = async (req, res) => {
    try {
        const { url, onMessageReceived, onMessageSent } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'URL required' });

        await supabaseService.addWebhook(req.userId, { url, onMessageReceived, onMessageSent });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

export const deleteWebhook = async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'URL required' });

        await supabaseService.deleteWebhook(req.userId, url);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

export const getStatus = async (req, res) => {
    res.json({
        success: true,
        configured: supabaseService.isConfigured()
    });
};
