import axios from 'axios';
import whatsappService from './whatsappService.js';
import supabaseService from './supabaseService.js';

class WebhookDispatcher {
    constructor() {
        this.cache = new Map(); // userId -> { webhooks: [], timestamp: number }
        this.CACHE_TTL = 60 * 1000; // 1 minute cache
    }

    initialize() {
        console.log('[WEBHOOK] Dispatcher initialized with caching & retries');
        this._bindEvents();
    }

    _bindEvents() {
        whatsappService.on('message', this._handleMessageReceived.bind(this));
        whatsappService.on('message_create', this._handleMessageSent.bind(this));
    }

    async _getCachedWebhooks(userId) {
        const now = Date.now();
        const cached = this.cache.get(userId);

        if (cached && (now - cached.timestamp < this.CACHE_TTL)) {
            return cached.webhooks;
        }

        try {
            console.log(`[WEBHOOK] Cache miss for ${userId}, fetching from Supabase...`);
            const webhooks = await supabaseService.getWebhooks(userId);
            this.cache.set(userId, { webhooks, timestamp: now });
            return webhooks;
        } catch (e) {
            console.error(`[WEBHOOK] Error fetching config for ${userId}:`, e);
            // Return stale cache if available, else empty
            return cached ? cached.webhooks : [];
        }
    }

    async _handleMessageReceived({ userId, message }) {
        const webhooks = await this._getCachedWebhooks(userId);
        const activeHooks = webhooks.filter(w => w.onMessageReceived);
        this._dispatch(activeHooks, message, 'received');
    }

    async _handleMessageSent({ userId, message }) {
        const webhooks = await this._getCachedWebhooks(userId);
        const activeHooks = webhooks.filter(w => w.onMessageSent);
        this._dispatch(activeHooks, message, 'sent');
    }

    async _dispatch(webhooks, payload, type) {
        if (webhooks.length === 0) return;

        // Fire and forget (don't await the loop) ensures the WhatsApp socket isn't blocked by slow webhooks
        // unless we want to guarantee order, but for webhooks usually speed is preferred.
        // We use map to execute them in "parallel" but independent.
        webhooks.map(hook => this._sendWithRetry(hook, payload, type));
    }

    async _sendWithRetry(hook, payload, type, attempt = 1) {
        const maxRetries = 3;
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s

        try {
            await axios.post(hook.url, {
                event: `message_${type}`,
                data: payload,
                timestamp: new Date().toISOString()
            }, { timeout: 10000 }); // 10s timeout

            // console.log(`[WEBHOOK] Sent to ${hook.url} (Success)`);
        } catch (e) {
            const status = e.response ? e.response.status : 'Network Error';
            console.warn(`[WEBHOOK] Fail ${hook.url} (Attempt ${attempt}/${maxRetries}): ${status} - ${e.message}`);

            if (attempt <= maxRetries) {
                setTimeout(() => {
                    this._sendWithRetry(hook, payload, type, attempt + 1);
                }, delay);
            } else {
                console.error(`[WEBHOOK] Gave up on ${hook.url} after ${maxRetries} retries.`);
            }
        }
    }
}

export default new WebhookDispatcher();
