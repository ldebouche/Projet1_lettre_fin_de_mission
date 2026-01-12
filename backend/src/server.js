import express from "express";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { authMiddlewareCollaborateur } from "./middlewares/auth.js";

import dbRoutes from './routes/dbRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import wordRoutes from './routes/wordRoute.js';
import pdfRoutes from './routes/pdfRoutes.js';
import dashboardRoutes from './routes/dashboardRoute.js';
import chatbotSettingsRoutes from './routes/chatbotSettingsRoutes.js';


dotenv.config();
const app = express();

app.use(cors({
  origin: [
    "https://outils-avenia.fr",
    "http://localhost:4200",
    "http://10.25.10.143:4200"
  ],
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use('/api/db', dbRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/word', wordRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/chatbot-settings', chatbotSettingsRoutes);
app.use("/api/files", /*authMiddlewareCollaborateur,*/ express.static(path.join(process.cwd(), "documents")));

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("API disponible sur toutes les interfaces");
});
