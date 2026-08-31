import express from "express";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import { PATHS } from "./config/paths.js";

import dbRoutes from './routes/dbRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import wordRoutes from './routes/wordRoute.js';
import pdfRoutes from './routes/pdfRoutes.js';
import dashboardRoutes from './routes/dashboardRoute.js';
import chatbotSettingsRoutes from './routes/chatbotSettingsRoutes.js';
import anaSectoSettingsRoutes from './routes/anaSectoRoutes.js';
import labRoutes from './routes/labRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: [
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, ".env"),
  ],
});
const app = express();

const APP_MODE = (process.env.APP_MODE || "dev").toLowerCase();
const defaultCorsOrigins =
  APP_MODE === "prod"
    ? ["https://outils-avenia.fr", "https://dev.outils-avenia.fr"]
    : ["http://localhost:4200", "http://127.0.0.1:4200", "http://10.25.10.143:4200"];

const corsOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: corsOrigins.length > 0 ? corsOrigins : defaultCorsOrigins,
  credentials: true
}));
app.use(express.json({ limit: "1000mb" }));
app.use(cookieParser());

app.use('/api/db', dbRoutes);
app.use('/api/lab', labRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/word', wordRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/chatbot-settings', chatbotSettingsRoutes);
app.use("/api/files", express.static(PATHS.documentsRoot));
app.use("/api/ana-secto-settings", anaSectoSettingsRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API disponible sur toutes les interfaces (mode: ${APP_MODE}, port: ${PORT})`);
});
