import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

class SupabaseService {
    private client: SupabaseClient | null = null;

    constructor() {
        if (config.supabaseUrl && config.supabaseServiceKey) {
            this.client = createClient(config.supabaseUrl, config.supabaseServiceKey);
            console.log('[SUPABASE] Initialized');
        } else {
            console.warn('[SUPABASE] Missing credentials, running in limited mode');
        }
    }

    isConfigured(): boolean {
        return !!this.client;
    }

    async getUser(token: string) {
        if (!this.client) throw new Error('Supabase not configured');
        const { data: { user }, error } = await this.client.auth.getUser(token);
        if (error || !user) throw new Error('Invalid token');
        return user;
    }

    async getWebhooks(userId: string) {
        if (!this.client) return [];
        const { data, error } = await this.client
            .from('webhooks')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            console.error('Error fetching webhooks:', error);
            throw error; // Or return empty if you prefer resilience over visibility
        }
        return data.map((w: any) => ({
            url: w.url,
            onMessageReceived: w.on_message_received,
            onMessageSent: w.on_message_sent
        }));
    }

    async getApiKeyConfig(userId: string) {
        if (!this.client) return null;
        const { data, error } = await this.client
            .from('api_config')
            .select('api_key')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') return null;
        return data ? data.api_key : null;
    }

    // --- Persistence Methods (NEW) ---

    async upsertChat(userId: string, chatData: { id: string, name?: string, isGroup?: boolean }) {
        if (!this.client) return;

        // Prepare payload, only include name if present/valid
        const payload: any = {
            id: chatData.id,
            user_id: userId,
            is_group: chatData.isGroup || false,
            updated_at: new Date().toISOString()
        };
        if (chatData.name) payload.name = chatData.name;

        // Upsert chat to ensure it exists
        const { error } = await this.client
            .from('chats')
            .upsert(payload, { onConflict: 'id,user_id' });

        if (error) console.error('[DB] Error upserting chat:', error.message);
    }

    async saveMessage(userId: string, message: any) {
        if (!this.client) return;

        // Ensure chat exists first (optional, but good for integrity)
        // We can do this async without awaiting if we trust foreign keys or want speed
        // await this.upsertChat(userId, { id: message.chatId });

        const payload = {
            id: message.id, // WA ID
            chat_id: message.chatId,
            user_id: userId,
            body: message.body,
            from_me: message.fromMe,
            type: message.type || 'chat',
            has_media: message.hasMedia || false,
            timestamp: new Date(message.timestamp * 1000).toISOString(), // WA timestamp is seconds
            created_at: new Date().toISOString()
        };

        const { error } = await this.client
            .from('messages')
            .upsert(payload, { onConflict: 'id,user_id' });

        if (error) {
            console.error('[DB] Error saving message:', error.message);
        } else {
            // Update chat last message ref
            await this.client.from('chats').update({
                last_message_body: message.body,
                last_message_timestamp: new Date(message.timestamp * 1000).toISOString()
            }).match({ id: message.chatId, user_id: userId });
        }
    }
}

// --- Queue Methods (Enterprise) ---

subscribeToQueue(callback: (payload: any) => void) {
    if (!this.client) return;
    console.log('[SUPABASE] Subscribing to message_queue...');
    this.client
        .channel('public:message_queue')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_queue' }, callback)
        .subscribe();
}

    async getPendingMessages() {
    if (!this.client) return [];
    const { data, error } = await this.client
        .from('message_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('[DB] Error fetching pending queue:', error.message);
        return [];
    }
    return data;
}

    async updateQueueStatus(id: number, status: string, errorMsg ?: string) {
    if (!this.client) return;
    const update: any = { status, processed_at: new Date().toISOString() };
    if (errorMsg) update.error_message = errorMsg;

    await this.client
        .from('message_queue')
        .update(update)
        .eq('id', id);
}
}

export default new SupabaseService();
