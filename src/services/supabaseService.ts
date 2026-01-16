
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../src/config/env.js') });

// Use environment variables or defaults
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key in env');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

class SupabaseService {
    private client: SupabaseClient | null = null;

    constructor() {
        if (supabaseUrl && supabaseKey) {
            this.client = supabase;
        }
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

        // Upsert Chat
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

        // Prepare payload
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
}

export default new SupabaseService();
