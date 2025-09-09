import { verifyToken } from '../utils/jwt.js';

export function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Token manquant' });

  const token = authHeader.split(' ')[1]; 
  const decoded = verifyToken(token);

  if (!decoded) return res.status(401).json({ error: 'Token invalide ou expiré' });

  req.user = decoded;
  next();
}
