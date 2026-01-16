import axios from 'axios';
import whatsappService from './whatsappService.js'; // Will be .ts soon, but import remains .js for ESM
import supabaseService from './supabaseService.js'; // Refers to the compiled output or runtime resolver

class WebhookDispatcher {
    private cache: Map<string, { webhooks: any[], timestamp: number }>;
    private CACHE_TTL: number;

    constructor() {
        this.cache = new Map();
        this.CACHE_TTL = 60 * 1000;
    }

    initialize() {
        console.log('[WEBHOOK] Dispatcher initialized with caching & retries');
        this._bindEvents();
    }

    private _bindEvents() {
        // whatsappService extends EventEmitter
        whatsappService.on('message', this._handleMessageReceived.bind(this));
        whatsappService.on('message_create', this._handleMessageSent.bind(this));
    }

    private async _getCachedWebhooks(userId: string) {
        const now = Date.now();
        const cached = this.cache.get(userId);

        if (cached && (now - cached.timestamp < this.CACHE_TTL)) {
            return cached.webhooks;
        }

        try {
            // console.log(`[WEBHOOK] Cache miss for ${userId}, fetching from Supabase...`);
            const webhooks = await supabaseService.getWebhooks(userId);
            this.cache.set(userId, { webhooks, timestamp: now });
            return webhooks;
        } catch (e) {
            console.error(`[WEBHOOK] Error fetching config for ${userId}:`, e);
            return cached ? cached.webhooks : [];
        }
    }

    private async _handleMessageReceived({ userId, message }: { userId: string, message: any }) {
        // 1. Persistence Hook
        this._persistMessage(userId, message);

        // 2. Webhook Dispatch
        const webhooks = await this._getCachedWebhooks(userId);
        const activeHooks = webhooks.filter((w: any) => w.onMessageReceived);
        this._dispatch(activeHooks, message, 'received');
    }

    private async _handleMessageSent({ userId, message }: { userId: string, message: any }) {
        // 1. Persistence Hook
        this._persistMessage(userId, message);

        // 2. Webhook Dispatch
        const webhooks = await this._getCachedWebhooks(userId);
        const activeHooks = webhooks.filter((w: any) => w.onMessageSent);
        this._dispatch(activeHooks, message, 'sent');
    }

    private async _persistMessage(userId: string, message: any) {
        try {
            // Upsert Chat first to ensure integrity
            await supabaseService.upsertChat(userId, {
                id: message.chatId,
                name: message.senderName || message.chatId // Fallback name
            });
            // Save Message
            await supabaseService.saveMessage(userId, message);
        } catch (e) {
            console.error('[DB] Failed to auto-archive message:', e);
        }
    }

    private async _dispatch(webhooks: any[], payload: any, type: string) {
        if (webhooks.length === 0) return;
        webhooks.map(hook => this._sendWithRetry(hook, payload, type));
    }

    private async _sendWithRetry(hook: any, payload: any, type: string, attempt = 1) {
        const maxRetries = 3;
        const delay = Math.pow(2, attempt) * 1000;

        try {
            await axios.post(hook.url, {
                event: `message_${type}`,
                data: payload,
                timestamp: new Date().toISOString()
            }, { timeout: 10000 });
            console.log(`[WEBHOOK] Sent event to ${hook.url}`);
        } catch (e: any) {
            const status = e.response ? e.response.status : 'N/A';
            if (e.code !== 'ECONNABORTED') {
                console.warn(`[WEBHOOK] Fail ${hook.url} (${status}): ${e.message}`);
            }

            if (attempt <= maxRetries) {
                setTimeout(() => {
                    this._sendWithRetry(hook, payload, type, attempt + 1);
                }, delay);
            }
        }
    }
}

export default new WebhookDispatcher();
