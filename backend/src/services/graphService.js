import axios from "axios";
import { getMsHttpsAgent } from "../utils/msHttpsAgent.js";

const TENANT_ID = process.env.TENANT_ID;
const CLIENT_ID = process.env.BACKEND_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

let cachedToken = null;
let tokenExpiresAt = 0;

/** Cache groupes Azure par OID (évite un appel Graph à chaque requête LAB). */
const GROUPS_TTL_MS = 5 * 60 * 1000;
const groupsCache = new Map();

function msAxiosConfig() {
    const agent = getMsHttpsAgent();
    return agent ? { httpsAgent: agent, proxy: false } : {};
}

async function getGraphAppToken() {
    const now = Date.now();
    if (cachedToken && now < tokenExpiresAt) {
        return cachedToken;
    }

    const res = await axios.post(
        `https://login.microsoftonline.com/${TENANT_ID}/oauth2/token`,
        new URLSearchParams({
            grant_type: "client_credentials",
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            resource: "https://graph.microsoft.com"
        }),
        msAxiosConfig()
    );

    cachedToken = res.data.access_token;
    tokenExpiresAt = now + (res.data.expires_in - 60) * 1000;

    return cachedToken;
}

export async function getUserGroupsByOid(userOid) {
    const oid = userOid != null ? String(userOid).trim() : '';
    if (!oid) return [];

    const now = Date.now();
    const cached = groupsCache.get(oid);
    if (cached && cached.expiresAt > now) {
        return cached.groups;
    }

    const token = await getGraphAppToken();

    const res = await axios.get(
        `https://graph.microsoft.com/v1.0/users/${oid}/memberOf`,
        {
            headers: {
                Authorization: `Bearer ${token}`
            },
            timeout: 5_000,
            ...msAxiosConfig()
        }
    );

    const groups = res.data.value
        .filter(g => g["@odata.type"] === "#microsoft.graph.group")
        .map(g => g.displayName)
        .filter(
            name =>
                typeof name === "string" &&
                name.toLowerCase().startsWith("gr-users-chatbot")
        )
        .map(name => name.replace("GR-Users-ChatBot-", "").toLowerCase());

    groupsCache.set(oid, { expiresAt: now + GROUPS_TTL_MS, groups });
    return groups;
}
