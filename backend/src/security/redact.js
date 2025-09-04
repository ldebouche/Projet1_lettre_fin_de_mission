import crypto from 'crypto';

export function toPlaceholders(input) {
  const dict = new Map();
  const add = (k, v) => {
    if (v == null || v === '') return v;
    const token = `{{${k.toUpperCase()}}}`;
    dict.set(token, String(v));
    return token;
  };

  // EXEMPLE: choisis ce que tu considères sensible
  const redacted = {
    ...input,
    clientNom: add('client_nom', input.clientNom),
    siren: add('siren', input.siren),
    email: add('email', input.email),
    // Garder des agrégats OK
    ca: input.ca, marge: input.marge,
    ibanHash: input.iban ? `{{IBAN_HASH:${hash(input.iban)}}}` : undefined,
  };

  const promptNettoye =
`Contexte (avec jetons):
- Client: ${redacted.clientNom}
- SIREN: ${redacted.siren}
- Email: ${redacted.email}
- CA: ${redacted.ca}
- Marge: ${redacted.marge}
- IBAN: ${redacted.ibanHash ?? 'N/A'}

Consigne:
${input.consigne}
Ne révèle pas les jetons {{...}} dans la réponse finale.`;

  return { promptNettoye, dict };
}

export function fromPlaceholders(text, dict) {
  let out = text || '';
  for (const [tok, val] of dict.entries()) out = out.split(tok).join(val);
  return out;
}

function hash(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
}
