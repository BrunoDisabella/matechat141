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
            .eq('user_id', userId);

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

        const { error } = await this.client
            .from('webhooks')
            .insert({
                user_id: userId,
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
            .eq('url', url)
            .eq('user_id', userId);

        if (error) throw error;
    }

    // --- API Config Methods ---

    async getApiKeyConfig(userId) {
        if (!this.client) return null;
        const { data, error } = await this.client
            .from('api_config')
            .select('api_key')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') return null; // PGRST116 = not found
        return data ? data.api_key : null;
    }

    async updateApiKeyConfig(userId, apiKey) {
        if (!this.client) throw new Error('Supabase not configured');

        const { error } = await this.client
            .from('api_config')
            .upsert({
                user_id: userId,
                api_key: apiKey,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

        if (error) throw error;
    }

    async getUserByApiKey(apiKey) {
        if (!this.client) return null;
        const { data, error } = await this.client
            .from('api_config')
            .select('user_id')
            .eq('api_key', apiKey)
            .single();

        if (error || !data) return null;
        return data.user_id;
    }

    // Sync methods for Chats/Messages could go here
}

export default new SupabaseService();
