import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from 'axios';
import fs from 'fs';

import { poolPromise, sql } from './db.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.get("/ping", (_req, res) => {
  res.send('pong');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend OK sur http://localhost:${PORT}`);
});

async function callOllama(message) {
  const resp = await axios.post(
    `${process.env.OLLAMA_BASE_URL}/api/chat`,
    {
      model: process.env.OLLAMA_MODEL,
      messages: [
        { role: 'system', content: 'Tu es concis et professionnel.' },
        { role: 'user', content: message }
      ],
      stream: false,
      options: { temperature: 0.7 }
    }
  );
  return resp.data?.message?.content ?? '';
}

async function callMistral(message) {
  const resp = await axios.post(
    `${process.env.MISTRAL_BASE_URL}/chat/completions`,
    {
      model: process.env.MISTRAL_MODEL,
      messages: [
        { role: 'system', content: 'Tu es concis et professionnel.' },
        { role: 'user', content: message }
      ],
      temperature: 0.7
    },
    {
      headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` }
    }
  );
  return resp.data?.choices?.[0]?.message?.content ?? '';
}

const prompts = JSON.parse(fs.readFileSync('./config/prompts.json', 'utf-8'));

function fillTemplate(template, variables) {
  return template.replace(/{{(.*?)}}/g, (_, key) => {
    return variables[key.trim()] ?? `{{${key}}}`;
  });
}

app.post('/api/generate-comment', async (req, res) => {
  const { clientNom, siren, ca, marge } = req.body.contexte;
  const template = prompts.generateComment;

  const prompt = fillTemplate(template, { clientNom, siren, ca, marge });

  const text = await callOllama(prompt);
  res.json({ text });
});



app.post('/api/pipeline/analyse', async (req, res) => {
  try {
    const { secteur, periode, donneesInternes } = req.body;

    // Étape A : Cloud
    const promptCloud = fillTemplate(prompts.pipelineCloud, {
      secteur,
      periode: `${periode.from}-${periode.to}`
    });

    let statsPubliques = {};
    try {
      const rawCloud = await callMistral(promptCloud);
      statsPubliques = JSON.parse(rawCloud.replace(/```json|```/g, '').trim());
    } catch {
      statsPubliques = { note: "Stats publiques indisponibles" };
    }

    // Étape B : Local
    const promptLocal = fillTemplate(prompts.pipelineLocal, {
      secteur,
      periode: `${periode.from}-${periode.to}`,
      ca: donneesInternes.ca,
      marge: donneesInternes.marge,
      revenu_moyen: statsPubliques.revenu_moyen,
      marge_moyenne: statsPubliques.marge_moyenne
    });

    const resultatLocal = await callOllama(promptLocal);

    res.json({ text: resultatLocal });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Pipeline en échec" });
  }
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