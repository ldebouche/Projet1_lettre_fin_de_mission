import axios from "axios";

const TENANT_ID = process.env.TENANT_ID;
const CLIENT_ID = process.env.BACKEND_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

let cachedToken = null;
let tokenExpiresAt = 0;

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
        })
    );

    cachedToken = res.data.access_token;
    tokenExpiresAt = now + (res.data.expires_in - 60) * 1000;

    return cachedToken;
}

export async function getUserGroupsByOid(userOid) {
    const token = await getGraphAppToken();

    const res = await axios.get(
        `https://graph.microsoft.com/v1.0/users/${userOid}/memberOf`,
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    return res.data.value
        .filter(g => g["@odata.type"] === "#microsoft.graph.group")
        .map(g => g.displayName);
}
