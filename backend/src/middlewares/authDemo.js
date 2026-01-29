export function authDemo(req, res, next) {
    // Active uniquement si DEMO_AUTH=true
    if (process.env.DEMO_AUTH !== "true") {
        return res.status(401).json({ error: "Demo auth disabled" });
    }

    const auth = req.headers.authorization || "";
    const [type, profile] = auth.split(" ");

    if (type !== "Demo") {
        return res.status(401).json({ error: "Use Authorization: Demo admin|user" });
    }

    if (profile === "admin") {
        req.user = { oid: "demo-admin", unique_name: "mlavier@aveniagroupe.fr", roles: ["admin", "comptable"] };
        return next();
    }

    if (profile === "user") {
        req.user = { oid: "demo-user", unique_name: "vmeylan@aveniagroupe.fr", roles: ["utilisateur", "comptable"] };
        return next();
    }

    return res.status(401).json({ error: "Unknown demo profile" });
}
