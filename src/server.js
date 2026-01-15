import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import apiRoutes from './routes/api.js';
import whatsappService from './services/whatsappService.js';
import socketService from './services/socketService.js';
import webhookDispatcher from './services/webhookDispatcher.js';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Debug logging for API requests
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        console.log(`[API_REQ] ${req.method} ${req.path}`);
    }
    next();
});

// API Routes
app.use('/api', apiRoutes);

// Frontend Static Files
app.use(express.static(path.join(PROJECT_ROOT, 'dist')));
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'dist', 'index.html'));
});

// Initialize Services
socketService.initialize(server);
// whatsappService.initializeClient('default-user'); // Removed: Multi-tenancy enabled, initialized via socket
webhookDispatcher.initialize();

// Start Server
server.listen(config.port, () => {
    console.log(`🚀 Professional Server running on port ${config.port}`);
});

// Anti-crash (optional, but requested for resilience)
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    // Don't exit process if possible, but depends on severity
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});
