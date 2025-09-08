import { poolPromise, sql } from '../config/db.js';

class dbService {
  async GetDossier(code_client, dateFinEx) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('code_client', sql.NVarChar, code_client)
      .input('dateFinEx', sql.Date, dateFinEx)
      .query('SELECT code_client FROM FEC WHERE code_client = @code_client AND datefinex = @dateFinEx');

    return result.recordset[0] || null;
  }
}

export default new dbService();