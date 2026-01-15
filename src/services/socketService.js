import { Server } from 'socket.io';
import whatsappService from './whatsappService.js';
import supabaseService from './supabaseService.js';

class SocketService {
    constructor() {
        this.io = null;
    }

    initialize(server) {
        this.io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Middleware de Autenticación
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token;
                if (!token) return next(new Error('Authentication error: Token required'));

                const user = await supabaseService.getUser(token);
                if (!user) return next(new Error('Authentication error: Invalid Token'));

                socket.userId = user.id;
                next();
            } catch (err) {
                console.error('[SOCKET_AUTH] Error verifying token:', err.message);
                next(new Error('Authentication error'));
            }
        });

        this.io.on('connection', async (socket) => {
            const userId = socket.userId;
            console.log(`[SOCKET] New connection: ${socket.id} (User: ${userId})`);

            // Unirse a su sala privada
            socket.join(userId);

            // Inicializar o recuperar cliente de WhatsApp para este usuario
            // Esto asegura que si el servidor se reinició, se intente levantar la sesión de este usuario
            try {
                whatsappService.initializeClient(userId);
            } catch (e) {
                console.error(`[SOCKET] Error initializing WA for ${userId}`, e);
            }

            this._handleConnection(socket, userId);

            socket.on('disconnect', () => {
                // No destruimos el cliente WA al desconectar el socket, 
                // para que siga recibiendo mensajes en background.
                // El logout explícito sí lo destruye.
            });
        });

        this._bindWhatsAppEvents();
    }

    _bindWhatsAppEvents() {
        // Escuchar eventos globales del servicio y enrutar a la sala correcta

        whatsappService.on('qr', ({ userId, qr }) => {
            this.io.to(userId).emit('qr', qr);
        });

        whatsappService.on('ready', ({ userId }) => {
            this.io.to(userId).emit('connected', true);
        });

        whatsappService.on('authenticated', ({ userId }) => {
            this.io.to(userId).emit('connected', true);
        });

        whatsappService.on('auth_failure', ({ userId }) => {
            this.io.to(userId).emit('connected', false);
        });

        whatsappService.on('disconnected', ({ userId }) => {
            this.io.to(userId).emit('connected', false);
        });

        whatsappService.on('message', ({ userId, message }) => {
            this.io.to(userId).emit('new-message', { ...message, chatId: message.chatId });
        });

        whatsappService.on('message_create', ({ userId, message }) => {
            this.io.to(userId).emit('new-message', { ...message, chatId: message.chatId });
        });
    }

    _handleConnection(socket, userId) {
        // Chequeo inmediato de estado
        if (whatsappService.isClientReady(userId)) {
            socket.emit('connected', true);
        } else {
            const client = whatsappService.getClient(userId);
            if (!client) {
                socket.emit('connected', false);
            }
            // Si existe pero no está ready, los eventos se encargarán
        }

        socket.on('client-ready', async () => {
            try {
                if (whatsappService.getClient(userId)) {
                    try {
                        const chats = await whatsappService.getChats(userId);
                        socket.emit('chats', chats);

                        const labels = await whatsappService.getLabels(userId);
                        socket.emit('all-labels', labels);
                    } catch (innerError) {
                        console.error(`[SOCKET] Error fetching initial data for ${userId}:`, innerError.message);
                    }
                }
            } catch (e) {
                console.error(`[SOCKET] Error in client-ready for ${userId}:`, e);
            }
        });

        socket.on('select-chat', async (chatId) => {
            try {
                const messages = await whatsappService.getChatMessages(userId, chatId);
                socket.emit('chat-history', { chatId, messages });

                // Mark as seen - DISABLED due to wwebjs bug (markedUnread)
                /* 
                const client = whatsappService.getClient(userId);
                if (client) {
                    const chat = await client.getChatById(chatId);
                    chat.sendSeen().catch(() => { }); 
                }
                */
            } catch (e) {
                console.error(`[SOCKET] Error selecting chat for ${userId}:`, e);
            }
        });

        socket.on('send-message', async (payload) => {
            try {
                await whatsappService.sendMessage(userId, payload);
            } catch (e) {
                console.error(`[SOCKET] Error sending message for ${userId}:`, e);
            }
        });

        socket.on('reset-session', async () => {
            console.log(`[SOCKET] Reset session requested for ${userId}`);
            try {
                await whatsappService.logout(userId);
                socket.emit('qr', null); // Limpiar QR en frontend
                socket.emit('connected', false);
            } catch (e) {
                console.error('Logout error:', e);
            }
        });

        // Label management
        socket.on('assign-label', async ({ chatId, labelId }) => {
            try {
                const client = whatsappService.getClient(userId);
                const chat = await client.getChatById(chatId);
                await chat.addLabels([labelId]);
            } catch (e) { console.error('Label assign error', e); }
        });

        socket.on('unassign-label', async ({ chatId, labelId }) => {
            try {
                const client = whatsappService.getClient(userId);
                const chat = await client.getChatById(chatId);
                await chat.removeLabels([labelId]);
            } catch (e) { console.error('Label remove error', e); }
        });

        socket.on('get-all-labels', async () => {
            try {
                const labels = await whatsappService.getLabels(userId);
                socket.emit('all-labels', labels);
            } catch (e) { }
        });
    }
}

export default new SocketService();
