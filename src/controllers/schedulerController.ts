/**
 * Scheduler Controller - Endpoints para programar mensajes
 */

import supabaseService from '../services/supabaseService.js';

// POST /api/schedule-message - Crear mensaje programado
export const createScheduledMessage = async (req: any, res: any) => {
    try {
        const userId = req.userId;
        const { chatId, body, scheduledTime, text } = req.body;

        // Validación
        const messageBody = body || text;
        if (!chatId) {
            return res.status(400).json({ success: false, error: 'chatId is required' });
        }
        if (!messageBody) {
            return res.status(400).json({ success: false, error: 'body or text is required' });
        }
        if (!scheduledTime) {
            return res.status(400).json({ success: false, error: 'scheduledTime is required' });
        }

        // Parsear scheduledTime a ISO string
        let scheduledTimeISO: string;
        if (typeof scheduledTime === 'number') {
            // Unix timestamp en segundos
            scheduledTimeISO = new Date(scheduledTime * 1000).toISOString();
        } else {
            scheduledTimeISO = new Date(scheduledTime).toISOString();
        }

        // Validar que sea en el futuro
        if (new Date(scheduledTimeISO) <= new Date()) {
            return res.status(400).json({ success: false, error: 'scheduledTime must be in the future' });
        }

        const result = await supabaseService.createScheduledMessage({
            userId,
            chatId,
            body: messageBody,
            scheduledTime: scheduledTimeISO
        });

        res.json({
            success: true,
            message: 'Message scheduled successfully',
            data: result
        });

    } catch (error: any) {
        console.error('[SCHEDULER CTRL] Error creating scheduled message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/scheduled-messages - Listar mensajes programados
export const getScheduledMessages = async (req: any, res: any) => {
    try {
        const userId = req.userId;
        const chatId = req.query.chatId;

        const messages = await supabaseService.getScheduledMessagesForUser(userId, chatId);

        res.json({
            success: true,
            data: messages.map((msg: any) => ({
                id: msg.id,
                chatId: msg.chat_id,
                body: msg.body,
                scheduledTime: msg.scheduled_time,
                status: msg.status,
                isActive: msg.is_active,
                createdAt: msg.created_at
            }))
        });

    } catch (error: any) {
        console.error('[SCHEDULER CTRL] Error fetching scheduled messages:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// DELETE /api/scheduled-messages/:id - Cancelar mensaje programado
export const deleteScheduledMessage = async (req: any, res: any) => {
    try {
        const userId = req.userId;
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ success: false, error: 'Message id is required' });
        }

        await supabaseService.deleteScheduledMessage(id, userId);

        res.json({ success: true, message: 'Scheduled message deleted' });

    } catch (error: any) {
        console.error('[SCHEDULER CTRL] Error deleting scheduled message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// PATCH /api/scheduled-messages/:id/toggle - Activar/desactivar mensaje
export const toggleScheduledMessage = async (req: any, res: any) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { isActive } = req.body;

        if (!id) {
            return res.status(400).json({ success: false, error: 'Message id is required' });
        }

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ success: false, error: 'isActive must be a boolean' });
        }

        await supabaseService.toggleScheduledMessage(id, userId, isActive);

        res.json({ success: true, message: `Scheduled message ${isActive ? 'activated' : 'deactivated'}` });

    } catch (error: any) {
        console.error('[SCHEDULER CTRL] Error toggling scheduled message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
