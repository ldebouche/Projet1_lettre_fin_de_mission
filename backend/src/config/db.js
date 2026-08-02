import mssql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env'),
  ],
});

const connectionTimeoutMs = Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 60000;
const requestTimeoutMs = Number(process.env.DB_REQUEST_TIMEOUT_MS) || 60000;
const maxConnectAttempts = Number(process.env.DB_CONNECT_RETRIES) || 3;

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME,
  connectionTimeout: connectionTimeoutMs,
  requestTimeout: requestTimeoutMs,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  options: {
    encrypt: true,
    trustServerCertificate: true,
    connectTimeout: connectionTimeoutMs,
    requestTimeout: requestTimeoutMs,
    enableArithAbort: true,
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectPoolWithRetry(config, attempts = maxConnectAttempts) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const pool = await new mssql.ConnectionPool(config).connect();
      console.log('Connexion SQL OK');
      return pool;
    } catch (err) {
      lastError = err;
      const message = err?.message || String(err);
      console.error(`Erreur SQL (tentative ${attempt}/${attempts}) : ${message}`);
      if (attempt < attempts) {
        await sleep(2000 * attempt);
      }
    }
  }

  throw lastError;
}

export const poolPromise = connectPoolWithRetry(dbConfig);

export const sql = mssql;
