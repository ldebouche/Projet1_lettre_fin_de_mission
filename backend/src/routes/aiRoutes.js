import express from 'express';
import { generateComment } from '../controllers/iaController.js';
import { ChatbotController } from '../controllers/iaController.js';

const router = express.Router();

router.post('/generate-comment', generateComment);

router.post('/chatbot', ChatbotController);

export default router;
