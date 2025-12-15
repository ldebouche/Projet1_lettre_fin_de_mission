import express from 'express';
import { generateComment } from '../controllers/iaController.js';
import { chatbotController } from '../controllers/iaController.js';

const router = express.Router();

router.post('/generate-comment', generateComment);

router.post('/chatbot', chatbotController);

export default router;
