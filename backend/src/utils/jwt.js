import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'super-secret-long';

export function generateToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '1h' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (err) {
    return null;
  }
}
