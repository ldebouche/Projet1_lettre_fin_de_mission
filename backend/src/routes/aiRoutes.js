import express from 'express';
import { generateComment } from '../controllers/iaController.js';
import { chatbotController } from '../controllers/iaController.js';
import { authMiddlewareCollaborateur } from '../middlewares/auth.js';

const router = express.Router();

router.post('/generate-comment', generateComment);

router.post('/chatbot', authMiddlewareCollaborateur, chatbotController);

export default router;
