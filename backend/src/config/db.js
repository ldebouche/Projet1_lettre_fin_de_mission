import mssql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  options: {
    encrypt: true,
    trustServerCertificate: true,
    requestTimeout: 60000,
    connexionTimeout: 30000,
    enableArithAbort: true
  }
};

export const poolPromise = new mssql.ConnectionPool(dbConfig)
  .connect()
  .then(pool => {
    console.log('Connexion SQL OK');
    return pool;
  })
  .catch(err => {
    console.error('Erreur SQL:', err);
    throw err;
  });

export const sql = mssql;