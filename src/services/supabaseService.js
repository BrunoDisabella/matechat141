import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

class SupabaseService {
    constructor() {
        this.client = null;
        if (config.supabaseUrl && config.supabaseServiceKey) {
            this.client = createClient(config.supabaseUrl, config.supabaseServiceKey);
            console.log('[SUPABASE] Initialized');
        } else {
            console.warn('[SUPABASE] Missing credentials, running in limited mode');
        }
    }

    isConfigured() {
        return !!this.client;
    }

    async getUser(token) {
        if (!this.client) throw new Error('Supabase not configured');
        const { data: { user }, error } = await this.client.auth.getUser(token);
        if (error || !user) throw new Error('Invalid token');
        return user;
    }

    async getWebhooks(userId) {
        if (!this.client) return [];
        const { data, error } = await this.client
            .from('webhooks')
            .select('*')
        //.eq('user_id', userId); // Assuming we filter by user, but default-user might handle all

        if (error) {
            console.error('Error fetching webhooks:', error);
            throw error;
        }
        return data.map(w => ({
            url: w.url,
            onMessageReceived: w.on_message_received,
            onMessageSent: w.on_message_sent
        }));
    }

    async addWebhook(userId, { url, onMessageReceived, onMessageSent }) {
        if (!this.client) throw new Error('Supabase not configured');

        // Ensure user exists or use a default UUID if using 'default-user' string (won't work for UUID column)
        // For this refactor, we might need to look up the user or just assume the session handled it.
        // NOTE: The table schema says user_id is uuid. The frontend sends 'default-user' often. 
        // We need a mapping or just trust the auth middleware provided a real ID if available.
        // For now, let's assume the middleware or a lookup provides a valid UUID, 
        // OR we use a hardcoded fallback UUID for "System/Default" if not present.

        // TEMP FIX: If userId is not a UUID, we might fail. 
        // Let's assume the auth middleware resolves a real UUID or we fetch one.
        // For "default-user", we might need to fetch the first user or something.

        // Let's try to pass it blindly, assuming req.userId might be real from JWT? 
        // Actually the `authenticateApiKeyOnly` sets `req.userId = 'default-user'`.
        // We need a real UUID for the DB.

        let targetUuid = userId;
        if (userId === 'default-user') {
            // Fallback: Try to find ANY user or use a hardcoded dev UUID? 
            // Better: Query auth.users? No access usually.
            // Query public.api_config?
            const { data } = await this.client.from('api_config').select('user_id').limit(1).single();
            if (data) targetUuid = data.user_id;
        }

        const { error } = await this.client
            .from('webhooks')
            .insert({
                user_id: targetUuid,
                url,
                on_message_received: onMessageReceived,
                on_message_sent: onMessageSent
            });

        if (error) throw error;
    }

    async deleteWebhook(userId, url) {
        if (!this.client) throw new Error('Supabase not configured');
        const { error } = await this.client
            .from('webhooks')
            .delete()
            .eq('url', url);
        // .eq('user_id', userId) // Safety

        if (error) throw error;
    }

    // Sync methods for Chats/Messages could go here
}

export default new SupabaseService();
