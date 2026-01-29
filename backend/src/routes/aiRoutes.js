import express from 'express';
import { generateComment } from '../controllers/iaController.js';
import { chatbotController } from '../controllers/iaController.js';
import { authDemo } from '../middlewares/authDemo.js';

const router = express.Router();

router.post('/generate-comment', generateComment);

router.post('/chatbot', authDemo, chatbotController);

export default router;
