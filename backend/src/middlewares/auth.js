import { verifyToken } from '../utils/jwt.js';

export function authMiddleware(req, res, next) {
  const token = req.cookies.jwt;

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
