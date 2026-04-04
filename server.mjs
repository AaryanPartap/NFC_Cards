import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const port = Number(process.env.PORT || 5173);

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

  const profilePath = path.join(dataDir, `${cardId}.json`);

  if (req.method === "GET") {
    try {
      const raw = await readFile(profilePath, "utf8");
      const parsed = JSON.parse(raw);
      sendJson(res, 200, { ...defaultProfile, ...parsed });
      return;
    } catch {
      sendJson(res, 200, { ...defaultProfile });
      return;
    }
  }

  if (req.method === "PUT") {
    try {
      const body = await readJsonBody(req, 12 * 1024 * 1024);
      const normalized = { ...defaultProfile, ...(body || {}) };
      await writeFile(profilePath, JSON.stringify(normalized, null, 2), "utf8");
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
    lanIps
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
