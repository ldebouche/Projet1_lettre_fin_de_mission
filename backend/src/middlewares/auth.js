import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/f481119e-e5a6-4e55-ae7e-8f5c878acd8d/discovery/v2.0/keys`
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    callback(null, key.getPublicKey());
  });
}

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Missing Authorization header" });

  const token = auth.split(" ")[1];

  jwt.verify(
    token,
    getKey,
    {
      audience: "171de78f-bfbe-435a-9356-d78a744722f4",
      issuer: `https://login.microsoftonline.com/f481119e-e5a6-4e55-ae7e-8f5c878acd8d/v2.0`,
    },
    (err, decoded) => {
      if (err) return res.status(401).json({ error: "Invalid token" });

      req.user = decoded;
      next();
    }
  );
}
