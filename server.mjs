import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import admin from "firebase-admin";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const port = Number(process.env.PORT || 5173);
const authRequired = String(process.env.FIREBASE_AUTH_REQUIRED || "true") === "true";
const allowedEmails = (process.env.ALLOWED_EDITOR_EMAILS || "")
  .split(",")
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);
const allowedDomains = (process.env.ALLOWED_EDITOR_DOMAINS || "")
  .split(",")
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);

const defaultProfile = {
  name: "",
  company: "",
  jobTitle: "",
  bio: "",
  tags: "",
  email: "",
  phone: "",
  website: "",
  address: "",
  linkedin: "",
  twitter: "",
  instagram: "",
  youtube: "",
  profilePhoto: "",
  projects: []
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

await mkdir(dataDir, { recursive: true });

const firebase = initializeFirebase();

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/profile/")) {
    await handleProfileApi(req, res, url.pathname);
    return;
  }

  if (url.pathname === "/api/runtime") {
    handleRuntimeApi(req, res);
    return;
  }

  if (/^\/nfc[a-z0-9_-]*\/?$/i.test(url.pathname)) {
    await serveIndex(res);
    return;
  }

  await serveStaticFile(res, url.pathname);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`NFC profile server running on http://0.0.0.0:${port}`);
});

async function handleProfileApi(req, res, pathname) {
  const cardId = sanitizeCardId(pathname.replace("/api/profile/", ""));
  if (!cardId) {
    sendJson(res, 400, { error: "Invalid card id" });
    return;
  }

  if (req.method === "GET") {
    try {
      sendJson(res, 200, await readProfile(cardId));
      return;
    } catch {
      sendJson(res, 200, { ...defaultProfile });
      return;
    }
  }

  if (req.method === "PUT") {
    const check = await validateEditor(req);
    if (!check.ok) {
      sendJson(res, check.status, { error: check.message });
      return;
    }

    try {
      const body = await readJsonBody(req, 12 * 1024 * 1024);
      await writeProfile(cardId, body);
      sendJson(res, 200, { ok: true });
      return;
    } catch {
      sendJson(res, 400, { error: "Invalid request body" });
      return;
    }
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

function handleRuntimeApi(req, res) {
  const hostHeader = req.headers.host || "";
  const portPart = hostHeader.includes(":") ? hostHeader.split(":").pop() : String(port);
  const lanIps = getLanIpv4Addresses();
  const lanBaseUrl = lanIps.length > 0 ? `http://${lanIps[0]}:${portPart}` : "";

  sendJson(res, 200, {
    lanBaseUrl,
    lanIps,
    authRequired,
    firebaseClientConfig: {
      apiKey: process.env.FIREBASE_WEB_API_KEY || "",
      authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN || "",
      projectId: process.env.FIREBASE_WEB_PROJECT_ID || "",
      appId: process.env.FIREBASE_WEB_APP_ID || ""
    }
  });
}

function getLanIpv4Addresses() {
  const nets = os.networkInterfaces();
  const ips = [];

  for (const group of Object.values(nets)) {
    for (const net of group || []) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
      }
    }
  }

  return ips;
}

async function serveStaticFile(res, pathname) {
  let safePath = path.normalize(decodeURIComponent(pathname));
  safePath = safePath.replace(/^\/+/, "");

  let fullPath = path.join(rootDir, safePath || "index.html");

  try {
    const fileStat = await stat(fullPath);
    if (fileStat.isDirectory()) {
      fullPath = path.join(fullPath, "index.html");
    }
  } catch {
    // Fall back to root index for unknown routes.
    fullPath = path.join(rootDir, "index.html");
  }

  if (!fullPath.startsWith(rootDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const ext = path.extname(fullPath).toLowerCase();
    const content = await readFile(fullPath);
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
    res.end(content);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function serveIndex(res) {
  try {
    const content = await readFile(path.join(rootDir, "index.html"));
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(content);
  } catch {
    sendText(res, 500, "Unable to load app");
  }
}

function initializeFirebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID || "";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY || "";

  if (!projectId || !clientEmail || !privateKeyRaw) {
    return { ready: false, db: null, auth: null };
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey
      })
    });
  }

  return {
    ready: true,
    db: admin.firestore(),
    auth: admin.auth()
  };
}

async function readProfile(cardId) {
  if (firebase.ready) {
    const ref = firebase.db.collection("profiles").doc(cardId);
    const snap = await ref.get();
    if (!snap.exists) {
      return { ...defaultProfile };
    }
    return { ...defaultProfile, ...(snap.data() || {}) };
  }

  const profilePath = path.join(dataDir, `${cardId}.json`);
  try {
    const raw = await readFile(profilePath, "utf8");
    return { ...defaultProfile, ...(JSON.parse(raw) || {}) };
  } catch {
    return { ...defaultProfile };
  }
}

async function writeProfile(cardId, body) {
  const normalized = { ...defaultProfile, ...(body || {}) };

  if (firebase.ready) {
    await firebase.db.collection("profiles").doc(cardId).set(normalized, { merge: true });
    return;
  }

  const profilePath = path.join(dataDir, `${cardId}.json`);
  await writeFile(profilePath, JSON.stringify(normalized, null, 2), "utf8");
}

async function validateEditor(req) {
  if (!authRequired) {
    return { ok: true };
  }

  if (!firebase.ready) {
    return { ok: false, status: 503, message: "Firebase auth is required but not configured" };
  }

  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Missing bearer token" };
  }

  try {
    const token = header.slice(7).trim();
    const decoded = await firebase.auth.verifyIdToken(token);
    const email = String(decoded.email || "").toLowerCase();

    if (allowedEmails.length === 0 && allowedDomains.length === 0) {
      return { ok: true };
    }

    if (allowedEmails.includes(email)) {
      return { ok: true };
    }

    const domain = email.includes("@") ? email.split("@").pop() : "";
    if (domain && allowedDomains.includes(domain)) {
      return { ok: true };
    }

    return { ok: false, status: 403, message: "Editor account not allowed" };
  } catch {
    return { ok: false, status: 401, message: "Invalid auth token" };
  }
}

function sanitizeCardId(raw) {
  return String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 60);
}

function readJsonBody(req, maxSize) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > maxSize) {
        reject(new Error("Request too large"));
      }
    });

    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Bad JSON"));
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(text);
}
