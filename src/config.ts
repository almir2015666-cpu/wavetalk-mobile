// ─── Server URL ─────────────────────────────────────────────────────────────
// DEV:  your local machine IP while developing
// PROD: Railway URL after deploying the server
//       1. Go to railway.app → New Project → Deploy from GitHub
//       2. Point to the wavetalk server repo
//       3. Copy the generated URL and paste it below
const DEV_SERVER  = 'http://192.168.0.35:3001';
const PROD_SERVER = 'https://wavetalk-server.up.railway.app'; // ← update after deploy

export const SERVER_URL = __DEV__ ? DEV_SERVER : PROD_SERVER;
