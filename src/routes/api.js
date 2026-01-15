import express from 'express';
import { authenticateApiKeyOnly, authenticateSession } from '../middlewares/authMiddleware.js';
import * as whatsappController from '../controllers/whatsappController.js';
import * as webhookController from '../controllers/webhookController.js';
import * as configController from '../controllers/configController.js';

const router = express.Router();

// --- Rutas de Gestión (Requieren Sesión de Supabase / Frontend) ---

// Config API Key
router.post('/api-key', authenticateSession, configController.updateApiKey);
router.get('/api-key', authenticateSession, configController.getApiKey);

// Webhooks Config
router.get('/webhooks', authenticateSession, webhookController.getWebhooks);
router.post('/webhooks', authenticateSession, webhookController.addWebhook);
router.delete('/webhooks', authenticateSession, webhookController.deleteWebhook);
router.get('/webhooks/status', authenticateSession, webhookController.getStatus);


// --- Rutas Operativas (Requieren API Key / External Systems) ---
// Estas rutas detectan el usuario basado en la API Key enviada en el header

router.use(authenticateApiKeyOnly);

// WhatsApp
router.post('/send-message', whatsappController.sendMessage);
router.get('/labels', whatsappController.getLabels); // Podría requerirse en ambos lados, pero n8n suele usar esto
router.post('/labels/assign', whatsappController.assignLabel);
router.post('/labels/remove', whatsappController.removeLabel);
router.post('/logout', whatsappController.logout); // Logout via API Key? Maybe dangerous, usually via Socket/Frontend

export default router;
