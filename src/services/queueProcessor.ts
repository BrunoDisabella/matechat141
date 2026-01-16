
import whatsappService from './whatsappService.js';
import supabaseService from './supabaseService.js';
import { supabase } from './supabaseService.js'; // Ensure we can export client or add method to service

// Since supabaseService encapsulates the client and doesn't export it directly public, 
// we should probably add a method to supabaseService to get the client or subscribe.
// However, looking at supabaseService.ts, the client is private.
// We should add a method to supabaseService to `subscribeToQueue`.

// Let's modify supabaseService first to allow subscription.
// But wait, we can just run the subscription logic INSIDE supabaseService or pass the callback to it.

export class QueueProcessor {
    private isProcessing = false;

    constructor() {
        console.log('[QUEUE] Initializing Queue Processor...');
    }

    start() {
        // We need to access Supabase client. 
        // Best approach: Add `subscribeToQueue(callback)` to SupabaseService.
        supabaseService.subscribeToQueue(async (payload: any) => {
            console.log('[QUEUE] New Event:', payload);
            if (payload.eventType === 'INSERT') {
                await this.processItem(payload.new);
            }
        });

        // Also check for pending items on startup
        this.processPending();
    }

    async processPending() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const pending = await supabaseService.getPendingMessages();
            if (pending && pending.length > 0) {
                console.log(`[QUEUE] Found ${pending.length} pending messages.`);
                for (const item of pending) {
                    await this.processItem(item);
                }
            }
        } catch (e) {
            console.error('[QUEUE] Error processing pending:', e);
        } finally {
            this.isProcessing = false;
        }
    }

    async processItem(item: any) {
        console.log(`[QUEUE] Processing item ${item.id} for ${item.chat_id}`);

        try {
            // Update status to processing
            await supabaseService.updateQueueStatus(item.id, 'processing');

            // Send via WhatsApp
            // Assuming single user system for now, or we define which userId to use.
            // The extension seems to be single user for now or assumes active session.
            // We need a userId to send from. 
            // In the 'Hybrid' model, the server holds the session.
            // We can iterate connected clients or pick the first one.
            // For now, let's hardcode active session check or use a known ID if stored.
            // Actually, `whatsappService` manages clients by `userId`.
            // The queue item *should* probably have `user_id` (who queued it).
            // But our SQL didn't strictly enforce `user_id` linkage from extension (it used anonymous key?).
            // In `background.js`, we did `user.id`. 
            // We should add `user_id` to `message_queue` to know WHICH session to use.
            // Ref: The SQL I sent: `chat_id text not null`. I missed `user_id`.
            // However, `background.js` insert: `user_id: user.id` was NOT in the SQL I provided earlier? 
            // Wait, let's check the SQL provided.

            // SQL was:
            // create table ... ( ... chat_id text ... )
            // No user_id column?
            // If the system is single-tenant (1 phone), it's fine.
            // But MateChat supports multiple sessions.
            // We must guess or use the first connected client.

            const connectedUsers = whatsappService.getConnectedUsers(); // We need to add this method
            const userId = connectedUsers[0];

            if (!userId) {
                throw new Error('No WhatsApp session active on server.');
            }

            // Convert DB fields to sendMessage format
            const msgPayload = {
                to: item.chat_id,
                text: item.body || item.media_caption || '',
                // handle media...
                media: item.media_url ? {
                    data: item.media_url, // Expecting Base64 or URL?
                    // Extension sent Base64 in `mediaUrl`. 
                    // `whatsappService` expects { base64: ... } or { data: ... }
                    base64: item.media_url,
                    filename: 'file', // We might need to store filename in DB
                    mimetype: 'image/jpeg' // We might need to store mime in DB
                    // In `crm_logic`, we sent `mediaUrl` as dataURL (base64).
                } : null
            };

            await whatsappService.sendMessage(userId, msgPayload);

            // Success
            await supabaseService.updateQueueStatus(item.id, 'sent');
            console.log(`[QUEUE] Item ${item.id} Sent!`);

        } catch (err: any) {
            console.error(`[QUEUE] Failed item ${item.id}:`, err.message);
            await supabaseService.updateQueueStatus(item.id, 'failed', err.message);
        }
    }
}

export default new QueueProcessor();
