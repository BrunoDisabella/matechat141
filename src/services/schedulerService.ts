/**
 * Scheduler Service - Procesa mensajes y estados programados
 * Ejecuta cada 60 segundos para enviar mensajes pendientes
 */

import whatsappService from './whatsappService.js';
import supabaseService from './supabaseService.js';

const SCHEDULER_INTERVAL = 60 * 1000; // 60 segundos

class SchedulerService {
    private intervalId: NodeJS.Timeout | null = null;
    private isProcessing = false;

    constructor() {
        console.log('[SCHEDULER] Initializing Scheduler Service...');
    }

    start() {
        if (this.intervalId) {
            console.log('[SCHEDULER] Already running');
            return;
        }

        console.log('[SCHEDULER] Starting scheduler (interval: 60s)');
        
        // Procesar pendientes al iniciar
        this.checkScheduledMessages();
        
        // Configurar intervalo
        this.intervalId = setInterval(() => {
            this.checkScheduledMessages();
        }, SCHEDULER_INTERVAL);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('[SCHEDULER] Stopped');
        }
    }

    async checkScheduledMessages() {
        if (this.isProcessing) {
            console.log('[SCHEDULER] Already processing, skipping...');
            return;
        }

        this.isProcessing = true;

        try {
            const now = new Date().toISOString();
            const messages = await supabaseService.getScheduledMessages(now);

            if (messages && messages.length > 0) {
                console.log(`[SCHEDULER] Found ${messages.length} messages to send`);

                for (const msg of messages) {
                    await this.processMessage(msg);
                }
            }
        } catch (error: any) {
            console.error('[SCHEDULER] Error checking messages:', error.message);
        } finally {
            this.isProcessing = false;
        }
    }

    private async processMessage(msg: any) {
        const { id, user_id, chat_id, body } = msg;
        console.log(`[SCHEDULER] Processing message ${id} for chat ${chat_id}`);

        try {
            // Verificar que el usuario tiene sesión activa
            const isReady = whatsappService.isClientReady(user_id);
            
            if (!isReady) {
                console.log(`[SCHEDULER] User ${user_id} not connected, skipping message ${id}`);
                // No marcamos como fallido, lo dejamos pendiente para cuando se conecte
                return;
            }

            // Enviar mensaje
            await whatsappService.sendMessage(user_id, {
                to: chat_id,
                text: body
            });

            // Marcar como enviado
            await supabaseService.updateScheduledMessageStatus(id, 'sent');
            console.log(`[SCHEDULER] ✅ Message ${id} sent successfully`);

        } catch (error: any) {
            console.error(`[SCHEDULER] ❌ Failed to send message ${id}:`, error.message);
            await supabaseService.updateScheduledMessageStatus(id, 'failed', error.message);
        }
    }

    // Método para checkear estados programados (futuro)
    async checkScheduledStatuses() {
        // TODO: Implementar cuando agreguemos estados
        console.log('[SCHEDULER] Status scheduling not yet implemented');
    }
}

export default new SchedulerService();
