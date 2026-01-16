
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

class SupabaseService {
    private client: SupabaseClient | null = null;

    constructor() {
        if (config.supabaseUrl && config.supabaseServiceKey) {
            this.client = createClient(config.supabaseUrl, config.supabaseServiceKey);
            console.log('[SUPABASE] Initialized');
        } else {
            console.error('[SUPABASE] Missing credentials in config');
        }
    }

    isConfigured(): boolean {
        return !!this.client;
    }

    async getUser(token: string) {
        if (!this.client) return null;
        const { data: { user }, error } = await this.client.auth.getUser(token);
        if (error || !user) return null;
        return user;
    }

    async upsertChat(chatData: any) {
        if (!this.client) return;
        const { id, name, isGroup, unreadCount, timestamp, userId, profilePicUrl } = chatData;

        const { error } = await this.client
            .from('chats')
            .upsert({
                id,
                user_id: userId,
                name,
                is_group: isGroup,
                unread_count: unreadCount,
                last_message_timestamp: timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString(),
                profile_pic_url: profilePicUrl
            }, { onConflict: 'id,user_id' });

        if (error) {
            console.error('[DB] Error saving chat:', error.message);
        }
    }

    async saveMessage(message: any, userId: string) {
        if (!this.client) return;

        const payload = {
            id: message.id,
            chat_id: message.chatId,
            user_id: userId,
            body: message.body,
            from_me: message.fromMe,
            type: message.type,
            timestamp: new Date(message.timestamp * 1000).toISOString(),
            has_media: message.hasMedia,
            media_url: message.media ? message.media.url : null
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

    // --- Webhooks & API Config ---

    async getWebhooks(userId: string) {
        if (!this.client) return [];
        const { data, error } = await this.client
            .from('webhooks')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            console.error('Error fetching webhooks:', error);
            return [];
        }
        return data.map((w: any) => ({
            url: w.url,
            onMessageReceived: w.on_message_received,
            onMessageSent: w.on_message_sent
        }));
    }

    async addWebhook(userId: string, webhook: { url: string, onMessageReceived: boolean, onMessageSent: boolean }) {
        if (!this.client) return;
        const { error } = await this.client
            .from('webhooks')
            .insert({
                user_id: userId,
                url: webhook.url,
                on_message_received: webhook.onMessageReceived,
                on_message_sent: webhook.onMessageSent,
                created_at: new Date().toISOString()
            });

        if (error) throw new Error(error.message);
    }

    async deleteWebhook(userId: string, url: string) {
        if (!this.client) return;
        const { error } = await this.client
            .from('webhooks')
            .delete()
            .match({ user_id: userId, url });

        if (error) throw new Error(error.message);
    }

    async getApiKeyConfig(userId: string) {
        if (!this.client) return null;
        const { data, error } = await this.client
            .from('api_config')
            .select('api_key')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) return null;
        return data ? data.api_key : null;
    }

    async getUserByApiKey(apiKey: string): Promise<string | null> {
        if (!this.client) return null;
        const { data, error } = await this.client
            .from('api_config')
            .select('user_id')
            .eq('api_key', apiKey)
            .maybeSingle();

        if (error || !data) {
            return null;
        }
        return data.user_id;
    }

    async updateApiKeyConfig(userId: string, apiKey: string) {
        if (!this.client) return;

        // Check if config exists
        const exists = await this.getApiKeyConfig(userId);

        if (exists !== null) {
            // Update
            await this.client
                .from('api_config')
                .update({ api_key: apiKey, updated_at: new Date().toISOString() })
                .eq('user_id', userId);
        } else {
            // Insert
            await this.client
                .from('api_config')
                .insert({
                    user_id: userId,
                    api_key: apiKey,
                    created_at: new Date().toISOString()
                });
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
            console.error('[SUPABASE] Error fetching pending:', error.message);
            return [];
        }
        return data;
    }

    async updateQueueStatus(id: number, status: string, errorMessage?: string) {
        if (!this.client) return;
        const updatePayload: any = { status, processed_at: new Date() };
        if (errorMessage) updatePayload.error_message = errorMessage;

        await this.client
            .from('message_queue')
            .update(updatePayload)
            .eq('id', id);
    }

    async clearUserData(userId: string) {
        if (!this.client) return;
        try {
            console.log(`[SUPABASE] Clearing data for user ${userId}...`);

            // Delete messages first (foreign key dependency)
            await this.client.from('messages').delete().eq('user_id', userId);

            // Delete chats
            await this.client.from('chats').delete().eq('user_id', userId);

            // Delete scheduled messages if any (assuming table exists, if not, skip)
            const { error: scheduledError } = await this.client.from('scheduled_messages').delete().eq('user_id', userId);
            if (scheduledError) console.log('[SUPABASE] No scheduled_messages table or error:', scheduledError.message);

            console.log(`[SUPABASE] Data cleared for ${userId}`);
        } catch (e: any) {
            console.error('[SUPABASE] Error clearing user data:', e.message);
        }
    }
}

export default new SupabaseService();
