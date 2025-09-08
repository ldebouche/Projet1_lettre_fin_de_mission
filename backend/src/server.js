import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import dbRoutes from './routes/dbRoutes.js';
import aiRoutes from './routes/aiRoutes.js';

import { poolPromise, sql } from './config/db.js';

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/db', dbRoutes);
app.use('/api/ai', aiRoutes);


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend OK sur http://localhost:${PORT}`);
});


app.post('/api/testDb', async (req, res) => {
  const { nom } = req.body.contexte;

  const template = prompts.testDbAvecNom;
  const prompt = fillTemplate(template, { nom });

  const text = await callOllama(prompt);
  res.json({ text });
});


app.get('/api/testDb/:code_client', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('code_client', sql.NVarChar, req.params.code_client)
      .query('SELECT raison_sociale FROM clients WHERE code_client = @code_client');

    if (!result.recordset.length) {
      return res.status(404).json({ error: 'Client introuvable' });
    }

    res.json(result.recordset[0].raison_sociale);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur SQL' });
  }
});

