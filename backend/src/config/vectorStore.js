import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "vector_store.db");
export const db = new Database(dbPath);

db.prepare(`
    CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT,
        file_name TEXT,
        content TEXT,
        vector TEXT
    )   
`).run();


export function logDbStatus() {
    const total = db.prepare(`SELECT COUNT(*) as count FROM embeddings`).get();
    const files = db.prepare(`
        SELECT file_name, COUNT(*) as chunks
        FROM embeddings
        GROUP BY file_name
    `).all();

    console.log("📊 ÉTAT DE LA BASE VECTORIELLE");
    console.log("Chunks total :", total.count);
    console.table(files);
}