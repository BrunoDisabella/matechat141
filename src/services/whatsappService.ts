import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import QRCode from 'qrcode';
import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { convertToOgg } from '../utils/audioConverter.js'; // Will remain JS for now, or TS later
// import { convertToOgg } from '../utils/audioConverter'; // If we convert utils

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Root is two levels up from src/services -> src/ -> root. 
// Actually src/services is level 2. So ../../ is root.
const PROJECT_ROOT = path.resolve(__dirname, '../../');

class WhatsAppService extends EventEmitter {
    private clients: Map<string, any>; // Using 'any' for Client temporarily to avoid deep typing friction
    private readyUserIds: Set<string>;

    constructor() {
        super();
        this.clients = new Map();
        this.readyUserIds = new Set();
    }

    isClientReady(userId: string): boolean {
        return this.readyUserIds.has(userId);
    }

    initializeClient(userId: string) {
        if (this.clients.has(userId)) {
            const client = this.clients.get(userId);
            // If client exists but was destroyed/disconnected, we might need to check state.
            // But usually we delete from map on destroy.
            return client;
        }

        console.log(`[WA-SERVICE] Initializing client for ${userId}...`);
        this.readyUserIds.delete(userId);

        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: userId,
                dataPath: PROJECT_ROOT
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ]
            }
        });

        this._attachEvents(client, userId);

        try {
            client.initialize().catch((err: any) => {
                console.error(`[WA-${userId}] Init Error:`, err.message);
                this.emit('auth_failure', { userId });
            });
        } catch (e: any) {
            console.error(`[WA-${userId}] Sync Init Error:`, e.message);
        }

        this.clients.set(userId, client);
        return client;
    }

    private _attachEvents(client: any, userId: string) {
        client.on('qr', (qr: string) => {
            console.log(`[WA-${userId}] QR Generated`);
            QRCode.toDataURL(qr, (err: any, url: string) => {
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
            this.emit('authenticated', { userId });
        });

        client.on('auth_failure', (msg: string) => {
            console.error(`[WA-${userId}] Auth Failure:`, msg);
            this.readyUserIds.delete(userId);
            this.emit('auth_failure', { userId });
        });

        client.on('message', async (msg: any) => {
            try {
                const chat = await msg.getChat();
                const contact = await msg.getContact();

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

        client.on('message_create', async (msg: any) => {
            if (msg.fromMe) {
                // For outgoing messages, we also want to emit so we can archive them
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

        client.on('disconnected', (reason: string) => {
            console.log(`[WA-${userId}] Disconnected:`, reason);
            this.readyUserIds.delete(userId);
            this.emit('disconnected', { userId });
            this.clients.delete(userId);

            // Auto-reconnect not aggressive here, rely on PM2/Process or explicit retry via UI?
            // "Professional" app should try to reconnect unless explicitly logged out.
            // But wwebjs usually fails hard on disconnect. 
        });
    }

    getClient(userId: string) {
        return this.clients.get(userId);
    }

    async getChats(userId: string, retries = 3): Promise<any[]> {
        const client = this.clients.get(userId);
        if (!client) throw new Error('Client not initialized');

        // Safety check
        if (!client.pupPage) throw new Error('Client page not ready');

        // Wait for Store
        try {
            await client.pupPage.waitForFunction(() => {
                // @ts-ignore
                return window.Store && window.Store.Chat && window.Store.Msg;
            }, { timeout: 5000 });
        } catch (e) {
            console.warn('[WA-SERVICE] Store injection wait timed out...');
        }

        try {
            const chats = await client.getChats();
            return chats.map((c: any) => ({
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
            if (retries > 0) {
                console.warn(`[WA-SERVICE] getChats failed, retrying... (${retries})`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.getChats(userId, retries - 1);
            }
            console.error('Safe getChats failed:', error);
            return [];
        }
    }

    async getChatMessages(userId: string, chatId: string, limit = 50) {
        const client = this.clients.get(userId);
        if (!client) throw new Error('Client not initialized');

        const chat = await client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit });

        return messages.map((m: any) => ({
            id: m.id.id,
            body: m.body,
            fromMe: m.fromMe,
            timestamp: m.timestamp,
            type: m.type,
            hasMedia: m.hasMedia
        }));
    }

    async getLabels(userId: string) {
        const client = this.clients.get(userId);
        if (!client) throw new Error('Client not initialized');
        return await client.getLabels();
    }

    async sendMessage(userId: string, { to, text, media, isVoiceMessage }: any) {
        const client = this.clients.get(userId);
        if (!client) throw new Error('Client not connected');

        if (!to) throw new Error('Destination (to) is required');
        if (!to.includes('@')) to = `${to}@c.us`;

        // Wait for Store injection if needed
        try {
            await client.pupPage.waitForFunction(() => {
                // @ts-ignore
                return window.Store && window.Store.Chat;
            }, { timeout: 2000 });
        } catch (e) { }

        const chat = await client.getChatById(to);

        if (media && media.base64) {
            let base64Data = media.base64 || media.data;
            if (base64Data.startsWith('data:')) {
                base64Data = base64Data.split(',')[1];
            }
            base64Data = base64Data.replace(/\s/g, '');

            let filename = media.filename || media.fileName || media.name;
            let mimetype = (media.mimetype || media.mimeType || media.mime || 'application/octet-stream').toLowerCase();

            if (!filename) {
                const ext = mimetype.split('/')[1] || 'bin';
                filename = `file_${Date.now()}.${ext}`;
            }

            if (isVoiceMessage) {
                try {
                    const converted = await convertToOgg(base64Data, mimetype);
                    base64Data = converted.base64;
                    mimetype = converted.mimetype;
                    filename = converted.filename;
                } catch (convErr) {
                    console.error('[WA-SERVICE] Audio conversion failed:', convErr);
                }
            }

            const msgMedia = new MessageMedia(mimetype, base64Data, filename);
            const options: any = { sendSeen: false };
            if (isVoiceMessage) options.sendAudioAsVoice = true;
            if (text) options.caption = text;

            return await chat.sendMessage(msgMedia, options);
        } else if (text) {
            return await chat.sendMessage(text, { sendSeen: false });
        }
    }

    async logout(userId: string) {
        const client = this.clients.get(userId);
        if (client) {
            await client.destroy();
            this.clients.delete(userId);
        }

        const sessionDir = path.join(PROJECT_ROOT, '.wwebjs_auth', `session-${userId}`);
        try {
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
        } catch (e) {
            console.error('Error removing session files:', e);
        }

        this.initializeClient(userId);
    }

    restoreSessions() {
        const authPath = path.join(PROJECT_ROOT, '.wwebjs_auth');
        if (!fs.existsSync(authPath)) {
            console.log('[WA-SERVICE] No auth folder found. Skipping restore.');
            return;
        }

        console.log('[WA-SERVICE] Scanning for existing sessions...');
        try {
            const files = fs.readdirSync(authPath);
            files.forEach(file => {
                if (file.startsWith('session-')) {
                    const userId = file.replace('session-', '');
                    console.log(`[WA-SERVICE] Found session for ${userId}, restoring...`);
                    this.initializeClient(userId);
                }
            });
        } catch (e) {
            console.error('[WA-SERVICE] Error restoring sessions:', e);
        }
    }
}

export default new WhatsAppService();
