import fs from "fs";
import https from "https";

/**
 * Agent HTTPS pour les appels sortants vers Microsoft (login.microsoftonline.com, graph.microsoft.com)
 * lorsqu’un proxy d’entreprise réinjecte une AC interne et provoque
 * « unable to verify the first certificate » côté Node.
 *
 * Variables d’environnement supportées :
 *  - `JWKS_CA_CERT_PATH`            : chemin vers le PEM de l’AC racine d’entreprise (recommandé).
 *  - `JWKS_TLS_REJECT_UNAUTHORIZED=0` : désactive la vérif TLS — DEV UNIQUEMENT.
 *
 * Construit en lazy pour que les variables chargées par dotenv dans `server.js`
 * soient bien disponibles au premier appel.
 */
let cachedAgent;
let cachedFlag = "__unset__";

export function getMsHttpsAgent() {
  const caPath = process.env.JWKS_CA_CERT_PATH || "";
  const insecure = process.env.JWKS_TLS_REJECT_UNAUTHORIZED === "0";
  const flag = `${caPath}|${insecure ? "1" : "0"}`;
  if (flag === cachedFlag) return cachedAgent;
  cachedFlag = flag;

  if (caPath) {
    try {
      if (fs.existsSync(caPath)) {
        cachedAgent = new https.Agent({ ca: fs.readFileSync(caPath) });
        return cachedAgent;
      }
      console.error("[msHttpsAgent] JWKS_CA_CERT_PATH introuvable:", caPath);
    } catch (e) {
      console.error("[msHttpsAgent] JWKS_CA_CERT_PATH illisible:", e.message);
    }
  }

  if (insecure) {
    console.warn(
      "[msHttpsAgent] TLS verify désactivé (JWKS_TLS_REJECT_UNAUTHORIZED=0) — réservé au développement local"
    );
    cachedAgent = new https.Agent({ rejectUnauthorized: false });
    return cachedAgent;
  }

  cachedAgent = undefined;
  return cachedAgent;
}
