import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
// import qrcode from 'qrcode-terminal'; // No se usa en producción normalmente, pero si se necesita: import qrcode from 'qrcode-terminal';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuración para __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Configuración básica
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Límite aumentado para imágenes/videos grandes

// Mapa de Clientes (Multi-sesión simplificado para este demo)
const clients = new Map();

// --- Middleware de Autenticación (API Key) ---
const authenticateApiKeyOnly = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    // Validación flexible para desarrollo o producción
    if (!apiKey || (apiKey !== 'matechat.com' && apiKey !== process.env.API_KEY)) {
        console.warn(`[AUTH] Intento de acceso denegado. Key recibida: ${apiKey}`);
        // En un entorno estricto, aquí devolveríamos 401.
    }
    req.userId = 'default-user';
    next();
};

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// --- Inicialización del Cliente WhatsApp ---
const initializeClient = (userId, socket = null) => {
    if (clients.has(userId)) {
        const existing = clients.get(userId);
        if (socket) setupSocketEvents(socket, existing);
        return existing;
    }

    console.log(`[INIT] Inicializando cliente para ${userId}...`);

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: userId }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    client.userId = userId;

    client.on('qr', (qr) => {
        console.log('[QR] Nuevo código QR generado');
        io.emit('qr', qr);
    });

    client.on('ready', () => {
        console.log('[READY] Cliente WhatsApp listo!');
        io.emit('connected', true);
    });

    client.on('authenticated', () => {
        console.log('[AUTH] Autenticado correctamente');
        io.emit('connected', true);
    });

    client.on('auth_failure', () => {
        console.error('[AUTH] Fallo de autenticación');
        io.emit('connected', false);
    });

    client.on('message', async (msg) => {
        try {
            const chat = await msg.getChat();
            const contact = await msg.getContact();

            io.emit('new-message', {
                id: msg.id.id,
                body: msg.body,
                fromMe: msg.fromMe,
                timestamp: msg.timestamp,
                type: msg.type,
                hasMedia: msg.hasMedia,
                chatId: chat.id._serialized,
                senderName: contact.pushname || contact.name || contact.number
            });
        } catch (e) {
            console.error('[MSG_IN] Error procesando mensaje entrante:', e);
        }
    });

    client.on('message_create', async (msg) => {
        if (msg.fromMe) {
            io.emit('new-message', {
                id: msg.id.id,
                body: msg.body,
                fromMe: true,
                timestamp: msg.timestamp,
                type: msg.type,
                hasMedia: msg.hasMedia,
                chatId: msg.to
            });
        }
    });

    client.initialize();
    clients.set(userId, client);
    return client;
};

// Iniciar cliente por defecto
initializeClient('default-user');

// --- Socket IO Setup ---
io.on('connection', (socket) => {
    console.log('[SOCKET] Frontend conectado');
    const client = clients.get('default-user');

    if (client) {
        client.getState().then(state => {
            if (state === 'CONNECTED') socket.emit('connected', true);
        }).catch(() => { });
    }

    socket.on('client-ready', () => {
        if (client) {
            client.getChats().then(chats => {
                const formatted = chats.map(c => ({
                    id: c.id._serialized,
                    name: c.name || c.id.user,
                    isGroup: c.isGroup,
                    unreadCount: c.unreadCount,
                    lastMessage: c.lastMessage ? {
                        body: c.lastMessage.body,
                        timestamp: c.lastMessage.timestamp
                    } : null
                }));
                socket.emit('chats', formatted);
            }).catch(console.error);
        }
    });

    socket.on('select-chat', async (chatId) => {
        if (!client) return;
        try {
            const chat = await client.getChatById(chatId);
            const messages = await chat.fetchMessages({ limit: 50 });

            const formattedMsgs = messages.map(m => ({
                id: m.id.id,
                body: m.body,
                fromMe: m.fromMe,
                timestamp: m.timestamp,
                type: m.type,
                hasMedia: m.hasMedia,
                media: null
            }));

            socket.emit('chat-history', { chatId, messages: formattedMsgs });

            // INTENTO SEGURO DE MARCAR COMO VISTO
            try {
                await chat.sendSeen();
            } catch (e) {
                // Error ignorado intencionalmente para evitar crash
            }

        } catch (e) {
            console.error('[CHAT_HISTORY] Error:', e);
        }
    });

    socket.on('send-message', async (payload) => {
        try {
            await handleSendMessageLogic(client, payload);
        } catch (e) {
            console.error('[SOCKET_SEND] Error:', e);
        }
    });
});

// --- Lógica Centralizada de Envío (ROBUSTA) ---
async function handleSendMessageLogic(client, { to, text, audioBase64, audioMime, isVoiceMessage, media }) {
    if (!client) throw new Error('Cliente no inicializado');

    // Validar el ID del chat
    if (!to || (!to.endsWith('@c.us') && !to.endsWith('@g.us'))) {
        console.warn(`[SEND] ChatID sospechoso: ${to}. Intentando corregir...`);
        if (!to.includes('@')) to = `${to}@c.us`;
    }

    const chat = await client.getChatById(to);

    // --- FIX CRÍTICO: sendSeen protegido ---
    // Esto evita que el servidor falle si la librería tiene problemas con "markedUnread"
    try {
        await chat.sendSeen();
    } catch (e) {
        console.warn('[FIX] No se pudo marcar como visto (Error ignorado, el mensaje se enviará igual):', e.message);
    }
    // ---------------------------------------

    // 1. Envío de Multimedia (Soporte extendido para n8n)
    if (audioBase64 || (media && media.base64)) {
        const base64Data = audioBase64 || media.base64;

        // n8n a veces envía 'mimeType', 'mimetype' o 'mime'. Soportamos todos.
        const mime = audioMime || media.mimetype || media.mimeType || media.mime || 'application/octet-stream';
        const filename = media ? media.filename : undefined;

        console.log(`[SEND] Enviando media: ${mime} (${filename || 'sin nombre'})`);

        const msgMedia = new MessageMedia(mime, base64Data, filename);

        const options = {};
        if (isVoiceMessage) options.sendAudioAsVoice = true;
        if (text) options.caption = text;

        return await chat.sendMessage(msgMedia, options);
    }
    // 2. Envío de Texto Puro
    else if (text) {
        console.log(`[SEND] Enviando texto a ${to}`);
        return await chat.sendMessage(text);
    }
}

// ==========================================
// API ENDPOINTS
// ==========================================

// --- API: List Labels ---
app.get('/api/labels', authenticateApiKeyOnly, async (req, res) => {
    try {
        const client = clients.get(req.userId);
        if (!client) return res.status(503).json({ success: false, error: 'No conectado' });

        const labels = await client.getLabels();
        res.json({
            success: true,
            labels: labels.map(l => ({ id: l.id, name: l.name, color: l.color }))
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- API: Assign Label (Smart) ---
app.post('/api/labels/assign', authenticateApiKeyOnly, async (req, res) => {
    try {
        const { chatId, label } = req.body;
        if (!chatId || !label) return res.status(400).json({ error: 'Faltan datos' });

        const client = clients.get(req.userId);
        const allLabels = await client.getLabels();

        // Buscar etiqueta por ID (exacto) o por Nombre (insensible a mayúsculas)
        let target = allLabels.find(l => l.id === label || l.name.toLowerCase().trim() === label.toString().toLowerCase().trim());

        // Si no se encuentra por nombre y es un número, asumir que es un ID directo
        if (!target && !isNaN(label)) target = { id: label };

        if (!target) return res.status(404).json({ error: `Etiqueta '${label}' no encontrada.` });

        const chat = await client.getChatById(chatId);
        await chat.addLabels([target.id]);

        console.log(`[LABEL] Etiqueta '${target.name || label}' asignada a ${chatId}`);
        res.json({ success: true, message: 'Etiqueta asignada' });
    } catch (e) {
        console.error('[LABEL_ERROR]', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- API: Remove Label (Smart) ---
app.post('/api/labels/remove', authenticateApiKeyOnly, async (req, res) => {
    try {
        const { chatId, label } = req.body;
        const client = clients.get(req.userId);
        const allLabels = await client.getLabels();

        let target = allLabels.find(l => l.id === label || l.name.toLowerCase().trim() === label.toString().toLowerCase().trim());
        if (!target && !isNaN(label)) target = { id: label };

        if (!target) return res.status(404).json({ error: 'Etiqueta no encontrada' });

        const chat = await client.getChatById(chatId);
        await chat.removeLabels([target.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- API: Send Message / Media (Para n8n) ---
app.post('/api/send-message', authenticateApiKeyOnly, async (req, res) => {
    try {
        const { chatId, text, media, isVoiceMessage } = req.body;

        if (!chatId) return res.status(400).json({ success: false, error: 'Falta chatId' });

        const client = clients.get(req.userId);
        if (!client) return res.status(503).json({ success: false, error: 'WhatsApp no conectado' });

        // Ejecutar lógica de envío (con protecciones incluidas)
        const responseMsg = await handleSendMessageLogic(client, {
            to: chatId,
            text,
            media,
            isVoiceMessage
        });

        res.json({ success: true, messageId: responseMsg.id._serialized });

    } catch (e) {
        console.error('[API_SEND_ERROR]', e);
        // Devolvemos el error en formato JSON para que n8n lo muestre claro
        res.status(500).json({ success: false, error: e.message });
    }
});

// Servir frontend
app.use(express.static(path.join(__dirname, 'dist')));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));