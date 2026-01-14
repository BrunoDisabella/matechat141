import whatsappService from '../services/whatsappService.js';

export const sendMessage = async (req, res) => {
    try {
        const { chatId, text, media, isVoiceMessage } = req.body;

        if (!chatId) return res.status(400).json({ success: false, error: 'Missing chatId' });

        // Logic handled in service
        const responseMsg = await whatsappService.sendMessage(req.userId, {
            to: chatId,
            text,
            media,
            isVoiceMessage
        });

        res.json({ success: true, messageId: responseMsg.id._serialized });
    } catch (e) {
        console.error('[API_SEND_ERROR]', e);
        res.status(500).json({ success: false, error: e.message });
    }
};

export const logout = async (req, res) => {
    try {
        await whatsappService.logout(req.userId);
        res.json({ success: true, message: 'Session closed and reset.' });
    } catch (e) {
        console.error('[LOGOUT_ERROR]', e);
        res.status(500).json({ success: false, error: e.message });
    }
};

export const getLabels = async (req, res) => {
    try {
        const labels = await whatsappService.getLabels(req.userId);
        res.json({
            success: true,
            labels: labels.map(l => ({ id: l.id, name: l.name, color: l.color }))
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

export const assignLabel = async (req, res) => {
    try {
        const { chatId, label } = req.body;
        if (!chatId || !label) return res.status(400).json({ error: 'Missing data' });

        const client = whatsappService.getClient(req.userId);
        // Logic specific to labels might be moved to service later, but okay here for now
        const allLabels = await client.getLabels();

        // Find label by ID or Name
        let target = allLabels.find(l => l.id === label || l.name.toLowerCase().trim() === label.toString().toLowerCase().trim());
        if (!target && !isNaN(label)) target = { id: label };

        if (!target) return res.status(404).json({ error: `Label '${label}' not found.` });

        const chat = await client.getChatById(chatId);
        await chat.addLabels([target.id]);

        res.json({ success: true, message: 'Label assigned' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

export const removeLabel = async (req, res) => {
    try {
        const { chatId, label } = req.body;
        const client = whatsappService.getClient(req.userId);
        const allLabels = await client.getLabels();

        let target = allLabels.find(l => l.id === label || l.name.toLowerCase().trim() === label.toString().toLowerCase().trim());
        if (!target && !isNaN(label)) target = { id: label };

        if (!target) return res.status(404).json({ error: 'Label not found' });

        const chat = await client.getChatById(chatId);
        await chat.removeLabels([target.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};
