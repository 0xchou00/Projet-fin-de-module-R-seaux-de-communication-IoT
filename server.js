"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const tls = require("tls");
const { URL } = require("url");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const TELEMETRY_FILE = path.join(DATA_DIR, "telemetry.json");
const THRESHOLDS_FILE = path.join(DATA_DIR, "thresholds.json");

loadDotEnv(path.join(ROOT, ".env"));
fs.mkdirSync(DATA_DIR, { recursive: true });

const config = {
  port: numberEnv("APP_PORT", numberEnv("PORT", 3000)),
  host: env("APP_HOST", "0.0.0.0"),
  sessionSecret: env("APP_SESSION_SECRET", crypto.randomBytes(32).toString("hex")),
  adminUsername: env("APP_ADMIN_USERNAME", "admin"),
  adminPassword: env("APP_ADMIN_PASSWORD", "Admin@12345!"),
  mqtt: {
    host: env("MQTT_HOST", "na7a271a.ala.eu-central-1.emqxsl.com"),
    port: numberEnv("MQTT_PORT", 8883),
    username: env("MQTT_USERNAME", "dht22"),
    password: env("MQTT_PASSWORD", "dht22test"),
    telemetryTopic: env("MQTT_TELEMETRY_TOPIC", "smart-home/dht22/telemetry"),
    statusTopic: env("MQTT_STATUS_TOPIC", "smart-home/dht22/status"),
    controlTopic: env("MQTT_CONTROL_TOPIC", "smart-home/dht22/control"),
    rejectUnauthorized: env("MQTT_REJECT_UNAUTHORIZED", "true") !== "false"
  }
};

const sessions = new Map();
const loginAttempts = new Map();
const sseClients = new Set();

let users = readJson(USERS_FILE, null) || bootstrapUsers();
let telemetry = readJson(TELEMETRY_FILE, []);
let thresholds = readJson(THRESHOLDS_FILE, {
  temperatureLow: 18,
  temperatureHigh: 30,
  humidityLow: 30,
  humidityHigh: 70
});
let mqttState = {
  connected: false,
  lastError: null,
  lastStatus: null,
  host: config.mqtt.host,
  port: config.mqtt.port,
  telemetryTopic: config.mqtt.telemetryTopic,
  statusTopic: config.mqtt.statusTopic,
  controlTopic: config.mqtt.controlTopic,
  security: "MQTT_TLS"
};
let mqttClient = null;

ensureAdminUser();

async function handleApi(req, res, url) {
  const session = getSession(req, res);

  if (req.method === "GET" && url.pathname === "/api/csrf") {
    json(res, 200, { csrfToken: session.csrfToken });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    json(res, 200, {
      ok: true,
      app: "Smart Home DHT22 Secure Dashboard",
      mqtt: {
        connected: mqttState.connected,
        host: mqttState.host,
        port: mqttState.port,
        telemetryTopic: mqttState.telemetryTopic,
        security: mqttState.security,
        lastError: mqttState.lastError
      },
      telemetry: {
        totalMessages: telemetry.length,
        lastReceivedAt: telemetry.at(-1)?.receivedAt || null
      }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    requireCsrf(req, session);
    const attemptKey = req.socket.remoteAddress || "local";
    if (isRateLimited(attemptKey)) {
      json(res, 429, { error: "Trop de tentatives. Reessayez dans quelques minutes." });
      return;
    }

    const body = await readBody(req);
    const user = users[body.username];
    if (!user || !verifyPassword(body.password || "", user.password)) {
      registerFailedAttempt(attemptKey);
      json(res, 401, { error: "Identifiants invalides" });
      return;
    }

    clearAttempts(attemptKey);
    session.pendingUser = user.username;
    session.authenticated = false;
    session.mfaVerified = false;
    session.createdAt = Date.now();

    if (!user.mfaEnabled) {
      json(res, 200, {
        mfaSetupRequired: true,
        username: user.username,
        secret: user.totpSecret,
        otpauth: buildOtpAuthUrl(user)
      });
      return;
    }

    json(res, 200, { mfaRequired: true, username: user.username });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mfa/verify") {
    requireCsrf(req, session);
    const body = await readBody(req);
    const user = users[session.pendingUser];

    if (!user || !verifyTotp(user.totpSecret, String(body.code || ""))) {
      json(res, 401, { error: "Code MFA invalide" });
      return;
    }

    user.mfaEnabled = true;
    writeJson(USERS_FILE, users);
    session.authenticated = true;
    session.mfaVerified = true;
    session.username = user.username;
    session.pendingUser = null;
    json(res, 200, { ok: true, user: publicUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    requireCsrf(req, session);
    sessions.delete(session.id);
    clearCookie(res);
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    if (!isAuthenticated(session)) {
      json(res, 401, { authenticated: false });
      return;
    }
    json(res, 200, { authenticated: true, user: publicUser(users[session.username]) });
    return;
  }

  if (!isAuthenticated(session)) {
    json(res, 401, { error: "Authentification requise" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    json(res, 200, {
      summary: buildSummary(),
      telemetry: telemetry.slice(-120).reverse(),
      mqtt: mqttState,
      thresholds
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.write(`event: init\ndata: ${JSON.stringify({
      summary: buildSummary(),
      mqtt: mqttState,
      thresholds
    })}\n\n`);
    const client = { res };
    sseClients.add(client);
    req.on("close", () => sseClients.delete(client));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/control") {
    requireCsrf(req, session);
    const body = await readBody(req);
    thresholds = sanitizeThresholds(body);
    writeJson(THRESHOLDS_FILE, thresholds);
    const command = {
      type: "threshold_update",
      thresholds,
      issuedBy: session.username,
      issuedAt: new Date().toISOString()
    };
    mqttClient.publish(config.mqtt.controlTopic, JSON.stringify(command));
    broadcast("thresholds", thresholds);
    json(res, 200, { ok: true, thresholds });
    return;
  }

  json(res, 404, { error: "Route introuvable" });
}

function serveStatic(req, res, url) {
  let filePath = path.normalize(url.pathname === "/" ? "/index.html" : url.pathname);
  filePath = path.join(PUBLIC_DIR, filePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    text(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) text(res, 404, "Not found");
        else send(res, 200, fallback, "text/html; charset=utf-8");
      });
      return;
    }

    send(res, 200, data, mime(filePath));
  });
}

function buildSummary() {
  const last = telemetry.at(-1) || null;
  const alerts = telemetry.slice(-50).filter(isAlertTelemetry).length;
  const normal = telemetry.slice(-50).filter((item) => {
    return item.temperature_status === "NORMAL" && item.humidity_status === "NORMAL";
  }).length;

  return {
    last,
    totalMessages: telemetry.length,
    recentAlerts: alerts,
    recentNormal: normal,
    lastReceivedAt: last ? last.receivedAt : null
  };
}

function isAlertTelemetry(item) {
  return Boolean(
    item.high_temperature ||
    item.high_humidity ||
    (item.temperature_status && item.temperature_status !== "NORMAL") ||
    (item.humidity_status && item.humidity_status !== "NORMAL")
  );
}

function sanitizeThresholds(body) {
  const next = {
    temperatureLow: toNumber(body.temperatureLow, thresholds.temperatureLow),
    temperatureHigh: toNumber(body.temperatureHigh, thresholds.temperatureHigh),
    humidityLow: toNumber(body.humidityLow, thresholds.humidityLow),
    humidityHigh: toNumber(body.humidityHigh, thresholds.humidityHigh)
  };

  if (next.temperatureLow >= next.temperatureHigh) {
    next.temperatureLow = 18;
    next.temperatureHigh = 30;
  }
  if (next.humidityLow >= next.humidityHigh) {
    next.humidityLow = 30;
    next.humidityHigh = 70;
  }
  return next;
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.res.write(payload);
  }
}

function isAuthenticated(session) {
  return Boolean(session && session.authenticated && session.mfaVerified && session.username);
}

function publicUser(user) {
  return {
    username: user.username,
    mfaEnabled: user.mfaEnabled,
    role: user.role
  };
}

function getSession(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  const signed = cookies.sid;
  const id = signed && verifySignedValue(signed);
  let session = id ? sessions.get(id) : null;

  if (!session) {
    session = {
      id: crypto.randomUUID(),
      csrfToken: crypto.randomBytes(24).toString("hex"),
      createdAt: Date.now()
    };
    sessions.set(session.id, session);
  }

  setSessionCookie(res, session.id);
  return session;
}

function setSessionCookie(res, id) {
  const signed = signValue(id);
  const maxAge = 60 * 60 * 8;
  res.setHeader("Set-Cookie", `sid=${signed}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`);
}

function clearCookie(res) {
  res.setHeader("Set-Cookie", "sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
}

function signValue(value) {
  const sig = crypto.createHmac("sha256", config.sessionSecret).update(value).digest("base64url");
  return `${value}.${sig}`;
}

function verifySignedValue(signed) {
  const split = signed.lastIndexOf(".");
  if (split < 0) return null;
  const value = signed.slice(0, split);
  const sig = signed.slice(split + 1);
  const expected = crypto.createHmac("sha256", config.sessionSecret).update(value).digest("base64url");
  if (!timingSafeEqual(sig, expected)) return null;
  return value;
}

function requireCsrf(req, session) {
  const token = req.headers["x-csrf-token"];
  if (!token || !timingSafeEqual(String(token), session.csrfToken)) {
    const error = new Error("CSRF token invalide");
    error.statusCode = 403;
    throw error;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("Payload trop grand"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("JSON invalide"));
      }
    });
    req.on("error", reject);
  });
}

function isRateLimited(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (entry.lockedUntil && entry.lockedUntil > now) return true;
  if (entry.lockedUntil && entry.lockedUntil <= now) loginAttempts.delete(key);
  return false;
}

function registerFailedAttempt(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, firstAt: now };
  entry.count += 1;
  if (entry.count >= 5) {
    entry.lockedUntil = now + 5 * 60 * 1000;
  }
  loginAttempts.set(key, entry);
}

function clearAttempts(key) {
  loginAttempts.delete(key);
}

function bootstrapUsers() {
  const admin = {
    username: config.adminUsername,
    password: hashPassword(config.adminPassword),
    role: "admin",
    mfaEnabled: false,
    totpSecret: randomBase32(20),
    createdAt: new Date().toISOString()
  };
  const next = { [admin.username]: admin };
  writeJson(USERS_FILE, next);
  return next;
}

function ensureAdminUser() {
  if (!users[config.adminUsername]) {
    users[config.adminUsername] = {
      username: config.adminUsername,
      password: hashPassword(config.adminPassword),
      role: "admin",
      mfaEnabled: false,
      totpSecret: randomBase32(20),
      createdAt: new Date().toISOString()
    };
    writeJson(USERS_FILE, users);
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, encoded) {
  const [algorithm, salt, stored] = String(encoded).split("$");
  if (algorithm !== "scrypt" || !salt || !stored) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(hash, stored);
}

function verifyTotp(secret, code) {
  const clean = String(code).replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let offset = -1; offset <= 1; offset += 1) {
    if (generateTotp(secret, step + offset) === clean) return true;
  }
  return false;
}

function generateTotp(secret, counter) {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, "0");
}

function buildOtpAuthUrl(user) {
  const issuer = "SmartHomeDHT22";
  const label = `${issuer}:${user.username}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${user.totpSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function randomBase32(size) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = crypto.randomBytes(size);
  let output = "";
  for (const byte of bytes) output += alphabet[byte % alphabet.length];
  return output;
}

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const value = alphabet.indexOf(char);
    if (value >= 0) bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'self'; form-action 'self'");
}

function json(res, status, value) {
  send(res, status, Buffer.from(JSON.stringify(value)), "application/json; charset=utf-8");
}

function text(res, status, value) {
  send(res, status, Buffer.from(value), "text/plain; charset=utf-8");
}

function send(res, status, data, contentType) {
  if (!res.headersSent) {
    res.writeHead(status, { "Content-Type": contentType });
  }
  res.end(data);
}

function mime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function parseMaybeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const cookies = {};
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index > -1) {
      cookies[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
    }
  }
  return cookies;
}

function env(name, fallback) {
  return process.env[name] || fallback;
}

function numberEnv(name, fallback) {
  const number = Number(process.env[name]);
  return Number.isFinite(number) ? number : fallback;
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

class MinimalMqttTlsClient {
  constructor(options) {
    this.options = options;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.packetId = 1;
    this.connected = false;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.onMessage = () => {};
    this.onState = () => {};
  }

  connect() {
    clearTimeout(this.reconnectTimer);
    this.onState({ connected: false, lastError: null });
    const clientId = `dashboard_${crypto.randomBytes(6).toString("hex")}`;

    this.socket = tls.connect({
      host: this.options.host,
      port: this.options.port,
      servername: this.options.host,
      rejectUnauthorized: this.options.rejectUnauthorized
    });

    this.socket.on("secureConnect", () => {
      this.write(this.connectPacket(clientId));
    });

    this.socket.on("data", (chunk) => this.handleData(chunk));
    this.socket.on("error", (error) => {
      this.onState({ connected: false, lastError: error.message });
    });
    this.socket.on("close", () => {
      this.connected = false;
      clearInterval(this.pingTimer);
      this.onState({ connected: false });
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    });
  }

  publish(topic, payload) {
    if (!this.connected) return false;
    const topicBuffer = Buffer.from(topic);
    const payloadBuffer = Buffer.from(payload);
    const variable = Buffer.concat([encodeString(topicBuffer), payloadBuffer]);
    this.write(Buffer.concat([Buffer.from([0x30]), encodeRemainingLength(variable.length), variable]));
    return true;
  }

  subscribe(topic) {
    const topicBuffer = Buffer.from(topic);
    const variable = Buffer.alloc(2);
    variable.writeUInt16BE(this.packetId++, 0);
    const payload = Buffer.concat([encodeString(topicBuffer), Buffer.from([0x00])]);
    this.write(Buffer.concat([Buffer.from([0x82]), encodeRemainingLength(variable.length + payload.length), variable, payload]));
  }

  connectPacket(clientId) {
    const flags = 0x80 | 0x40 | 0x02;
    const variable = Buffer.concat([
      encodeString(Buffer.from("MQTT")),
      Buffer.from([0x04, flags, 0x00, 0x3c])
    ]);
    const payload = Buffer.concat([
      encodeString(Buffer.from(clientId)),
      encodeString(Buffer.from(this.options.username)),
      encodeString(Buffer.from(this.options.password))
    ]);
    return Buffer.concat([Buffer.from([0x10]), encodeRemainingLength(variable.length + payload.length), variable, payload]);
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const decoded = decodeRemainingLength(this.buffer, 1);
      if (!decoded) return;
      const headerLength = 1 + decoded.bytes;
      const totalLength = headerLength + decoded.value;
      if (this.buffer.length < totalLength) return;
      const packet = this.buffer.slice(0, totalLength);
      this.buffer = this.buffer.slice(totalLength);
      this.handlePacket(packet, headerLength);
    }
  }

  handlePacket(packet, headerLength) {
    const type = packet[0] >> 4;
    const payload = packet.slice(headerLength);

    if (type === 2) {
      const returnCode = payload[1];
      if (returnCode === 0) {
        this.connected = true;
        this.onState({ connected: true, lastError: null });
        this.subscribe(this.options.telemetryTopic);
        this.subscribe(this.options.statusTopic);
        this.pingTimer = setInterval(() => this.write(Buffer.from([0xc0, 0x00])), 30000);
      } else {
        this.onState({ connected: false, lastError: `CONNACK ${returnCode}` });
        this.socket.end();
      }
      return;
    }

    if (type === 3) {
      const topicLength = payload.readUInt16BE(0);
      const topic = payload.slice(2, 2 + topicLength).toString("utf8");
      const message = payload.slice(2 + topicLength);
      this.onMessage(topic, message);
    }
  }

  write(packet) {
    if (this.socket && !this.socket.destroyed) this.socket.write(packet);
  }
}

function encodeString(buffer) {
  const length = Buffer.alloc(2);
  length.writeUInt16BE(buffer.length, 0);
  return Buffer.concat([length, buffer]);
}

function encodeRemainingLength(length) {
  const encoded = [];
  do {
    let digit = length % 128;
    length = Math.floor(length / 128);
    if (length > 0) digit = digit | 0x80;
    encoded.push(digit);
  } while (length > 0);
  return Buffer.from(encoded);
}

function decodeRemainingLength(buffer, start) {
  let multiplier = 1;
  let value = 0;
  let bytes = 0;
  let encodedByte = 0;
  do {
    if (start + bytes >= buffer.length) return null;
    encodedByte = buffer[start + bytes];
    value += (encodedByte & 127) * multiplier;
    multiplier *= 128;
    bytes += 1;
    if (bytes > 4) throw new Error("MQTT remaining length invalide");
  } while ((encodedByte & 128) !== 0);
  return { value, bytes };
}

function start() {
  mqttClient = new MinimalMqttTlsClient(config.mqtt);
  mqttClient.onState = (patch) => {
    mqttState = { ...mqttState, ...patch };
    broadcast("mqtt", mqttState);
  };
  mqttClient.onMessage = (topic, payload) => {
    const raw = payload.toString("utf8");
    if (topic === config.mqtt.statusTopic) {
      mqttState = { ...mqttState, lastStatus: parseMaybeJson(raw) || raw };
      broadcast("mqtt", mqttState);
      return;
    }

    const parsed = parseMaybeJson(raw);
    const entry = {
      id: crypto.randomUUID(),
      topic,
      receivedAt: new Date().toISOString(),
      raw,
      ...(parsed && typeof parsed === "object" ? parsed : { message: raw })
    };

    telemetry.push(entry);
    if (telemetry.length > 500) telemetry = telemetry.slice(-500);
    writeJson(TELEMETRY_FILE, telemetry);
    broadcast("telemetry", entry);
    broadcast("summary", buildSummary());
  };
  mqttClient.connect();

  const server = http.createServer(async (req, res) => {
    try {
      setSecurityHeaders(res);
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
        return;
      }

      serveStatic(req, res, url);
    } catch (error) {
      console.error(error);
      json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Erreur serveur" });
    }
  });

  server.listen(config.port, config.host, () => {
    console.log(`Smart Home DHT22 app: http://localhost:${config.port}`);
    for (const address of getLanAddresses()) {
      console.log(`LAN access: http://${address}:${config.port}`);
    }
    console.log(`MQTT/TLS: ${config.mqtt.host}:${config.mqtt.port}`);
  });
}

start();

function getLanAddresses() {
  const os = require("os");
  const addresses = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const item of interfaces || []) {
      if (item.family === "IPv4" && !item.internal) addresses.push(item.address);
    }
  }
  return addresses;
}
