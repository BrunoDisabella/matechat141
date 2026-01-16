import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import whatsappService from './whatsappService.js';
import supabaseService from './supabaseService.js';

class SocketService {
    private io: Server | null = null;

    initialize(server: HttpServer) {
        this.io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Middleware
        this.io.use(async (socket: any, next) => {
            try {
                const token = socket.handshake.auth.token;
                if (!token) return next(new Error('Authentication error: Token required'));

                const user = await supabaseService.getUser(token);
                if (!user) return next(new Error('Authentication error: Invalid Token'));

                socket.userId = user.id;
                next();
            } catch (err: any) {
                console.error('[SOCKET_AUTH] Error verifying token:', err.message);
                next(new Error('Authentication error'));
            }
        });

        this.io.on('connection', async (socket: any) => {
            const userId = socket.userId;
            console.log(`[SOCKET] New connection: ${socket.id} (User: ${userId})`);

            socket.join(userId);

            // Auto-init WA for this user if not running
            try {
                whatsappService.initializeClient(userId);
            } catch (e) {
                console.error(`[SOCKET] Error initializing WA for ${userId}`, e);
            }

            this._handleConnection(socket, userId);
        });

        this._bindWhatsAppEvents();
    }

    private _bindWhatsAppEvents() {
        if (!this.io) return;

        whatsappService.on('qr', ({ userId, qr }: any) => {
            this.io?.to(userId).emit('qr', qr);
        });

        whatsappService.on('ready', ({ userId }: any) => {
            this.io?.to(userId).emit('connected', true);
        });

        whatsappService.on('authenticated', ({ userId }: any) => {
            this.io?.to(userId).emit('connected', true);
        });

        whatsappService.on('auth_failure', ({ userId }: any) => {
            this.io?.to(userId).emit('connected', false);
        });

        whatsappService.on('disconnected', async ({ userId }: any) => {
            console.log(`[SOCKET] User ${userId} disconnected (remote). Clearing DB...`);
            await supabaseService.clearUserData(userId);
            this.io?.to(userId).emit('connected', false);
            this.io?.to(userId).emit('qr', null); // Trigger new QR generation on client if needed, or just let client handle 'connected: false'
            // Ideally we should ask WA service to re-init to get a new QR immediately
            try {
                whatsappService.initializeClient(userId);
            } catch (e) { console.error('Error re-init after disconnect', e); }
        });

        // Add 'messageId' to acknowledge sent messages or new received
        whatsappService.on('message', ({ userId, message }: any) => {
            this.io?.to(userId).emit('new-message', { ...message, chatId: message.chatId });
        });

        whatsappService.on('message_create', ({ userId, message }: any) => {
            this.io?.to(userId).emit('new-message', { ...message, chatId: message.chatId });
        });
    }

    private _handleConnection(socket: Socket, userId: string) {
        if (whatsappService.isClientReady(userId)) {
            socket.emit('connected', true);
        } else {
            // Maybe it exists but pending
            const client = whatsappService.getClient(userId);
            if (!client) socket.emit('connected', false);
        }

        socket.on('client-ready', async () => {
            // Client frontend is ready to receive data
            if (whatsappService.getClient(userId)) {
                try {
                    const chats = await whatsappService.getChats(userId);
                    socket.emit('chats', chats);

                    const labels = await whatsappService.getLabels(userId);
                    socket.emit('all-labels', labels);
                } catch (e: any) {
                    console.error('[SOCKET] Error fetching init data:', e.message);
                }
            }
        });

        socket.on('select-chat', async (chatId: string) => {
            try {
                const messages = await whatsappService.getChatMessages(userId, chatId);
                socket.emit('chat-history', { chatId, messages });
            } catch (e) {
                console.error(`[SOCKET] Error selecting chat for ${userId}:`, e);
            }
        });

        socket.on('send-message', async (payload: any) => {
            try {
                await whatsappService.sendMessage(userId, payload);
            } catch (e) {
                console.error(`[SOCKET] Error sending message for ${userId}:`, e);
            }
        });

        socket.on('reset-session', async () => {
            try {
                await whatsappService.logout(userId);
                // Clear DB to prevent ghost chats on next login
                await supabaseService.clearUserData(userId);

                socket.emit('qr', null);
                socket.emit('connected', false);
            } catch (e) {
                console.error('Logout error:', e);
            }
        });

        // Label handlers can be typed better, but keeping basic for now
    }
}

export default new SocketService();
