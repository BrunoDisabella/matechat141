import { Server } from 'socket.io';
import whatsappService from './whatsappService.js';

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

        this.io.on('connection', (socket) => {
            console.log(`[SOCKET] New connection: ${socket.id}`);
            const userId = 'default-user'; // Hardcoded for now
            this._handleConnection(socket, userId);
        });

        this._bindWhatsAppEvents();
    }

    _bindWhatsAppEvents() {
        const userId = 'default-user';

        whatsappService.on('qr', ({ userId: uid, qr }) => {
            if (uid === userId) this.io.emit('qr', qr);
        });

        whatsappService.on('ready', ({ userId: uid }) => {
            if (uid === userId) this.io.emit('connected', true);
        });

        whatsappService.on('authenticated', ({ userId: uid }) => {
            if (uid === userId) this.io.emit('connected', true);
        });

        whatsappService.on('auth_failure', ({ userId: uid }) => {
            if (uid === userId) this.io.emit('connected', false);
        });

        whatsappService.on('message', ({ userId: uid, message }) => {
            if (uid === userId) this.io.emit('new-message', { ...message, chatId: message.chatId });
        });

        whatsappService.on('message_create', ({ userId: uid, message }) => {
            if (uid === userId) this.io.emit('new-message', { ...message, chatId: message.chatId });
        });
    }

    _handleConnection(socket, userId) {
        const client = whatsappService.getClient(userId);

        // Initial state
        if (client) {
            client.getState().then(state => {
                if (state === 'CONNECTED') socket.emit('connected', true);
            }).catch(() => { });
        } else {
            // If client is dead/null, it might be in QR mode
            socket.emit('connected', false);
        }

        socket.on('client-ready', async () => {
            try {
                if (whatsappService.getClient(userId)) {
                    const chats = await whatsappService.getChats(userId);
                    socket.emit('chats', chats);

                    const labels = await whatsappService.getLabels(userId);
                    socket.emit('all-labels', labels);
                }
            } catch (e) {
                console.error('Error fetching initial data:', e);
            }
        });

        socket.on('select-chat', async (chatId) => {
            try {
                const messages = await whatsappService.getChatMessages(userId, chatId);
                socket.emit('chat-history', { chatId, messages });

                // Mark as seen
                const client = whatsappService.getClient(userId);
                if (client) {
                    const chat = await client.getChatById(chatId);
                    chat.sendSeen().catch(() => { });
                }
            } catch (e) {
                console.error('Error selecting chat:', e);
            }
        });

        socket.on('send-message', async (payload) => {
            try {
                await whatsappService.sendMessage(userId, payload);
            } catch (e) {
                console.error('Error sending message:', e);
            }
        });

        socket.on('reset-session', async () => {
            console.log('[SOCKET] Reset session requested');
            try {
                await whatsappService.logout(userId);
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
