import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import QRCode from 'qrcode';
import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
// Adjust to go up one level from src/services to root if needed, or keep local. 
// Standard wwebjs_auth is usually at root.
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

class WhatsAppService extends EventEmitter {
    constructor() {
        super();
        this.clients = new Map();
        this.readyUserIds = new Set();
    }

    isClientReady(userId) {
        return this.readyUserIds.has(userId);
    }

    initializeClient(userId) {
        if (this.clients.has(userId)) {
            return this.clients.get(userId);
        }

        console.log(`[WA-SERVICE] Initializing client for ${userId}...`);
        this.readyUserIds.delete(userId);

        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: userId,
                dataPath: PROJECT_ROOT // Store auth in root/.wwebjs_auth
            }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        // Attach Event Listeners
        this._attachEvents(client, userId);

        client.initialize();
        this.clients.set(userId, client);
        return client;
    }

    _attachEvents(client, userId) {
        client.on('qr', (qr) => {
            console.log(`[WA-${userId}] QR Generated`);
            QRCode.toDataURL(qr, (err, url) => {
                if (err) {
                    console.error('QR Generation Error:', err);
                    return;
                }
                this.emit('qr', { userId, qr: url });
            });
        });

        client.on('ready', () => {
            console.log(`[WA-${userId}] Ready`);
            this.readyUserIds.add(userId);
            this.emit('ready', { userId });
        });

        client.on('authenticated', () => {
            console.log(`[WA-${userId}] Authenticated`);
            // Usually 'ready' comes after, but 'authenticated' means we are logged in.
            // We can treat this as partially ready or wait for full ready.
            // For UI unblocking, 'ready' is safer for data, but 'authenticated' means QR is gone.
            this.emit('authenticated', { userId });
        });

        client.on('auth_failure', (msg) => {
            console.error(`[WA-${userId}] Auth Failure:`, msg);
            this.readyUserIds.delete(userId);
            this.emit('auth_failure', { userId });
        });

        client.on('message', async (msg) => {
            try {
                const chat = await msg.getChat();
                const contact = await msg.getContact();

                // Procesar mensaje para formato frontend
                const formatted = {
                    id: msg.id.id,
                    body: msg.body,
                    fromMe: msg.fromMe,
                    timestamp: msg.timestamp,
                    type: msg.type,
                    hasMedia: msg.hasMedia,
                    chatId: chat.id._serialized,
                    senderName: contact.pushname || contact.name || contact.number
                };

                this.emit('message', { userId, message: formatted });
            } catch (e) {
                console.error('Error processing incoming message:', e);
            }
        });

        client.on('message_create', async (msg) => {
            if (msg.fromMe) {
                this.emit('message_create', {
                    userId,
                    message: {
                        id: msg.id.id,
                        body: msg.body,
                        fromMe: true,
                        timestamp: msg.timestamp,
                        type: msg.type,
                        hasMedia: msg.hasMedia,
                        chatId: msg.to
                    }
                });
            }
        });

        // Disconnect event?
        client.on('disconnected', (reason) => {
            console.log(`[WA-${userId}] Disconnected:`, reason);
            this.readyUserIds.delete(userId);
            this.emit('disconnected', { userId });
            this.clients.delete(userId);
        });
    }

    getClient(userId) {
        return this.clients.get(userId);
    }

    async getChats(userId) {
        const client = this.clients.get(userId);
        if (!client) throw new Error('Client not initialized');

        // Safety check: sometimes client exists but pupPage is not ready
        if (!client.pupPage) throw new Error('Client page not ready');

        try {
            const chats = await client.getChats();
            return chats.map(c => ({
                id: c.id._serialized,
                name: c.name || c.id.user,
                isGroup: c.isGroup,
                unreadCount: c.unreadCount,
                lastMessage: c.lastMessage ? {
                    body: c.lastMessage.body,
                    timestamp: c.lastMessage.timestamp,
                    fromMe: c.lastMessage.fromMe,
                    hasMedia: c.lastMessage.hasMedia
                } : null
            }));
        } catch (error) {
            console.error('Safe getChats failed:', error);
            return [];
        }
    }

    async getChatMessages(userId, chatId, limit = 50) {
        const client = this.clients.get(userId);
        if (!client) throw new Error('Client not initialized');

        const chat = await client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit });

        return messages.map(m => ({
            id: m.id.id,
            body: m.body,
            fromMe: m.fromMe,
            timestamp: m.timestamp,
            type: m.type,
            hasMedia: m.hasMedia
        }));
    }

    async getLabels(userId) {
        const client = this.clients.get(userId);
        if (!client) throw new Error('Client not initialized');
        return await client.getLabels();
    }

    async getChat(userId, chatId) {
        const client = this.clients.get(userId);
        if (!client) throw new Error('Client not initialized');
        return await client.getChatById(chatId);
    }

    async sendMessage(userId, { to, text, media, isVoiceMessage }) {
        const client = this.clients.get(userId);
        if (!client) throw new Error('Client not connected');

        // Validation logic
        // Validation logic
        if (!to) throw new Error('Destination (to) is required');

        // Ensure ID formatting
        if (!to.includes('@')) {
            // Basic assumption: if no @, it's a number, so append @c.us
            to = `${to}@c.us`;
        }
        // If it has @, we trust it (could be @c.us or @g.us)


        const chat = await client.getChatById(to);

        // SendSeen Safe
        // try { await chat.sendSeen(); } catch (e) { console.warn('Ignore sendSeen', e.message); }

        // Media Handling
        if (media && media.base64) {
            const mime = media.mimetype || media.mime || 'application/octet-stream';
            const msgMedia = new MessageMedia(mime, media.base64, media.filename);
            const options = {};
            if (isVoiceMessage) options.sendAudioAsVoice = true;
            if (text) options.caption = text;

            return await chat.sendMessage(msgMedia, options);
        } else if (text) {
            return await chat.sendMessage(text);
        }
    }

    async logout(userId) {
        const client = this.clients.get(userId);
        if (client) {
            await client.destroy();
            this.clients.delete(userId);
        }

        // Clean up session files
        // Uses PROJECT_ROOT/.wwebjs_auth/session-{clientId} usually if clientId is set
        // Or .wwebjs_auth if default.
        // Since we used LocalAuth with clientId, it creates .wwebjs_auth/session-{userId}

        const sessionDir = path.join(PROJECT_ROOT, '.wwebjs_auth', `session-${userId}`);
        const legacySessionDir = path.join(PROJECT_ROOT, '.wwebjs_auth'); // For backward compatibility if clean root needed

        console.log(`[LOGOUT] Removing session at ${sessionDir}`);

        try {
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
            // Also check root auth if it was created without clientId specific folder previously
            // But we should be careful not to delete other sessions if we move to multi-tenant.
            // For now, assume single user 'default-user'.
            if (userId === 'default-user' && fs.existsSync(legacySessionDir)) {
                // Check if it has session- folder inside.
                // Actually LocalAuth creates .wwebjs_auth/session-default-user
            }
        } catch (e) {
            console.error('Error removing session files:', e);
        }

        // Re-init
        this.initializeClient(userId);
    }
}

export default new WhatsAppService();
