import axios from 'axios';
import whatsappService from './whatsappService.js';
import supabaseService from './supabaseService.js';

class WebhookDispatcher {
    initialize() {
        console.log('[WEBHOOK] Dispatcher initialized');
        this._bindEvents();
    }

    _bindEvents() {
        whatsappService.on('message', this._handleMessageReceived.bind(this));
        whatsappService.on('message_create', this._handleMessageSent.bind(this));
    }

    async _handleMessageReceived({ userId, message }) {
        try {
            const webhooks = await supabaseService.getWebhooks(userId);
            const activeHooks = webhooks.filter(w => w.onMessageReceived);

            this._dispatch(activeHooks, message, 'received');
        } catch (e) {
            console.error('[WEBHOOK] Error fetching config for receive:', e);
        }
    }

    async _handleMessageSent({ userId, message }) {
        try {
            const webhooks = await supabaseService.getWebhooks(userId);
            const activeHooks = webhooks.filter(w => w.onMessageSent);

            this._dispatch(activeHooks, message, 'sent');
        } catch (e) {
            console.error('[WEBHOOK] Error fetching config for sent:', e);
        }
    }

    async _dispatch(webhooks, payload, type) {
        if (webhooks.length === 0) return;

        console.log(`[WEBHOOK] Dispatching '${type}' event to ${webhooks.length} endpoints`);

        webhooks.forEach(async (hook) => {
            try {
                await axios.post(hook.url, {
                    event: `message_${type}`,
                    data: payload,
                    timestamp: new Date().toISOString()
                }, { timeout: 5000 });
                // console.log(`[WEBHOOK] Sent to ${hook.url}`);
            } catch (e) {
                console.error(`[WEBHOOK] Failed to send to ${hook.url}:`, e.message);
            }
        });
    }
}

export default new WebhookDispatcher();
