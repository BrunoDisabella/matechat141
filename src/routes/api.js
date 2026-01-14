import express from 'express';
import { authenticateApiKeyOnly } from '../middlewares/authMiddleware.js';
import * as whatsappController from '../controllers/whatsappController.js';

const router = express.Router();

router.use(authenticateApiKeyOnly);

router.post('/send-message', whatsappController.sendMessage);
router.post('/logout', whatsappController.logout);

router.get('/labels', whatsappController.getLabels);
router.post('/labels/assign', whatsappController.assignLabel);
router.post('/labels/remove', whatsappController.removeLabel);

export default router;
