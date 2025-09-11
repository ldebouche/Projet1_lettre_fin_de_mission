import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import dbRoutes from './routes/dbRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import wordRoutes from './routes/wordRoute.js';


dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/db', dbRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/word', wordRoutes);


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend OK sur http://localhost:${PORT}`);
});


