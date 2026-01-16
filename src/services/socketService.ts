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

            socket.join(userId); // Join personal room (for private notifs if any)
            socket.join('company_main'); // Join global company room

            // Auto-init WA (Global) check
            try {
                // This will just return the existing global client if running
                whatsappService.initializeClient(userId);
            } catch (e) {
                console.error(`[SOCKET] Error initializing WA`, e);
            }

            this._handleConnection(socket, userId);
        });

        this._bindWhatsAppEvents();
    }

    private _bindWhatsAppEvents() {
        if (!this.io) return;

        // Broadcast events to EVERYONE (Shared Inbox)

        whatsappService.on('qr', ({ qr }: any) => {
            this.io?.emit('qr', qr);
        });

        whatsappService.on('ready', () => {
            this.io?.emit('connected', true);
        });

        whatsappService.on('authenticated', () => {
            this.io?.emit('connected', true);
        });

        whatsappService.on('auth_failure', () => {
            this.io?.emit('connected', false);
        });

        whatsappService.on('disconnected', () => {
            this.io?.emit('connected', false);
        });

        whatsappService.on('message', ({ message }: any) => {
            this.io?.emit('new-message', { ...message, chatId: message.chatId });
        });

        whatsappService.on('message_create', ({ message }: any) => {
            this.io?.emit('new-message', { ...message, chatId: message.chatId });
        });
    }

    private _handleConnection(socket: Socket, userId: string) {
        // userId is irrelevant for checking WA status in Shared Mode
        if (whatsappService.isClientReady('any')) {
            socket.emit('connected', true);
        } else {
            const client = whatsappService.getClient('any');
            if (!client) socket.emit('connected', false);
        }

        socket.on('client-ready', async () => {
            if (whatsappService.getClient('any')) {
                try {
                    // Fetch using generic ID
                    const chats = await whatsappService.getChats('any');
                    socket.emit('chats', chats);

                    const labels = await whatsappService.getLabels('any');
                    socket.emit('all-labels', labels);
                } catch (e: any) {
                    console.error('[SOCKET] Error fetching init data:', e.message);
                }
            }
        });

        socket.on('select-chat', async (chatId: string) => {
            try {
                const messages = await whatsappService.getChatMessages('any', chatId);
                socket.emit('chat-history', { chatId, messages });
            } catch (e) {
                console.error(`[SOCKET] Error selecting chat:`, e);
            }
        });

        socket.on('send-message', async (payload: any) => {
            try {
                await whatsappService.sendMessage('any', payload);
            } catch (e) {
                console.error(`[SOCKET] Error sending message:`, e);
            }
        });

        socket.on('reset-session', async () => {
            try {
                // Logout global session
                await whatsappService.logout('any');
                this.io?.emit('qr', null);
                this.io?.emit('connected', false);
            } catch (e) {
                console.error('Logout error:', e);
            }
        });
    }
}

export default new SocketService();
