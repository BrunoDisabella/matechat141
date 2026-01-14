import express from 'express';
import { authenticateApiKeyOnly } from '../middlewares/authMiddleware.js';
import * as whatsappController from '../controllers/whatsappController.js';
import * as webhookController from '../controllers/webhookController.js';

const router = express.Router();

router.use(authenticateApiKeyOnly);

// WhatsApp
router.post('/send-message', whatsappController.sendMessage);
router.post('/logout', whatsappController.logout);
router.get('/labels', whatsappController.getLabels);
router.post('/labels/assign', whatsappController.assignLabel);
router.post('/labels/remove', whatsappController.removeLabel);

// Webhooks
router.get('/webhooks', webhookController.getWebhooks);
router.post('/webhooks', webhookController.addWebhook);
router.delete('/webhooks', webhookController.deleteWebhook);
router.get('/webhooks/status', webhookController.getStatus);

export default router;
