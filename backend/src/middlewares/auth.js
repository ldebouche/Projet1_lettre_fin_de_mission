import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { verifyToken } from '../utils/jwt.js';

const client = jwksClient({
  jwksUri: "https://login.microsoftonline.com/f7f506f7-c551-4a8a-8c5a-b7d339828e4b/discovery/v2.0/keys"
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    callback(null, key.getPublicKey());
  });
}

export function authMiddlewareCollaborateur(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Missing Authorization header" });

  const token = auth.split(" ")[1];

  jwt.verify(
    token,
    getKey,
    {
      audience: "api://67336009-376f-424b-882b-8662f86e5eed",
      issuer: `https://sts.windows.net/f7f506f7-c551-4a8a-8c5a-b7d339828e4b/`,
    },
    (err, decoded) => {
      if (err) return res.status(401).json({ error: "Invalid token" });

      req.user = decoded;
      next();
    }
  );
}


export function authMiddlewareDossier(req, res, next) {
  const token = req.cookies.jwt_dossier;

  if (!token) {
    return res.status(401).json({ error: "Non authentifié" });
  }

  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: "Token invalide" });
  }
  
  req.user = payload;
  next();
}
