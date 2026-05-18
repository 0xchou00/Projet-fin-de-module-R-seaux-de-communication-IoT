"use strict";

const state = {
  csrfToken: null,
  user: null,
  dashboard: null,
  telemetry: [],
  eventSource: null,
  error: null,
  mfaSetup: null,
  mfaPending: false
};

const app = document.querySelector("#app");

boot();

async function boot() {
  await getCsrf();
  try {
    const me = await api("/api/me");
    if (me.authenticated) {
      state.user = me.user;
      await loadDashboard();
      renderDashboard();
      connectEvents();
      return;
    }
  } catch {
    renderLogin();
  }
  renderLogin();
}

async function getCsrf() {
  const response = await fetch("/api/csrf", { credentials: "same-origin" });
  const data = await response.json();
  state.csrfToken = data.csrfToken;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": state.csrfToken,
      ...(options.headers || {})
    },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Requete impossible");
  return data;
}

function renderLogin() {
  app.innerHTML = `
    <section class="auth-shell">
      <div class="auth-panel">
        <div class="brand">
          <div class="brand-mark">IoT</div>
          <div>
            <strong>Smart Home DHT22</strong>
            <p class="muted">ESP32 Wokwi + EMQX MQTT/TLS</p>
          </div>
        </div>
        <p class="eyebrow">Authentification forte</p>
        <h1>Connexion securisee au tableau de bord.</h1>
        <p class="muted">Visualisez la temperature, l'humidite, les alertes et l'etat de securite du projet.</p>
        ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ""}
        <form class="form" id="login-form">
          <div class="field">
            <label for="username">Utilisateur</label>
            <input id="username" name="username" autocomplete="username" required value="admin">
          </div>
          <div class="field">
            <label for="password">Mot de passe</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required>
          </div>
          <button class="primary" type="submit">Se connecter</button>
        </form>
      </div>
      <div class="auth-visual">
        <div class="house-map" aria-hidden="true">
          <div class="room"><strong>Salon</strong><span class="sensor-node">T</span><span class="muted">Temperature</span></div>
          <div class="room"><strong>Capteur</strong><span class="sensor-node">H</span><span class="muted">Humidite</span></div>
          <div class="room"><strong>MQTT</strong><span class="sensor-node">S</span><span class="muted">TLS 8883</span></div>
          <div class="room"><strong>Cloud</strong><span class="sensor-node">A</span><span class="muted">Application</span></div>
        </div>
      </div>
    </section>
  `;

  document.querySelector("#login-form").addEventListener("submit", onLogin);
}

async function onLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.error = null;
  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password")
      })
    });
    if (result.mfaSetupRequired) {
      state.mfaSetup = result;
      renderMfaSetup();
      return;
    }
    state.mfaPending = true;
    renderMfaVerify();
  } catch (error) {
    state.error = error.message;
    renderLogin();
  }
}

function renderMfaSetup() {
  app.innerHTML = `
    <section class="auth-shell">
      <div class="auth-panel">
        <div class="brand">
          <div class="brand-mark">2FA</div>
          <div>
            <strong>Activation MFA</strong>
            <p class="muted">Une seule fois pour ce compte.</p>
          </div>
        </div>
        <h1>Ajoutez cette cle dans votre application TOTP.</h1>
        <p class="muted">Utilisez Google Authenticator, Microsoft Authenticator, 1Password ou une application compatible.</p>
        <div class="secret-box">${escapeHtml(state.mfaSetup.secret)}</div>
        <p class="muted code">${escapeHtml(state.mfaSetup.otpauth)}</p>
        ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ""}
        <form class="form" id="mfa-form">
          <div class="field">
            <label for="code">Code a 6 chiffres</label>
            <input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" required>
          </div>
          <button class="primary" type="submit">Activer et entrer</button>
        </form>
      </div>
      <div class="auth-visual">
        <div class="house-map" aria-hidden="true">
          <div class="room"><strong>Mot de passe</strong><span class="sensor-node">1</span><span class="muted">Facteur 1</span></div>
          <div class="room"><strong>TOTP</strong><span class="sensor-node">2</span><span class="muted">Facteur 2</span></div>
          <div class="room"><strong>Session</strong><span class="sensor-node">3</span><span class="muted">Cookie HttpOnly</span></div>
          <div class="room"><strong>Dashboard</strong><span class="sensor-node">4</span><span class="muted">Acces protege</span></div>
        </div>
      </div>
    </section>
  `;
  document.querySelector("#mfa-form").addEventListener("submit", onMfaVerify);
}

function renderMfaVerify() {
  app.innerHTML = `
    <section class="auth-shell">
      <div class="auth-panel">
        <div class="brand">
          <div class="brand-mark">2FA</div>
          <div>
            <strong>Verification MFA</strong>
            <p class="muted">Code temporaire TOTP.</p>
          </div>
        </div>
        <h1>Entrez votre code de verification.</h1>
        <p class="muted">Le code change toutes les 30 secondes.</p>
        ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ""}
        <form class="form" id="mfa-form">
          <div class="field">
            <label for="code">Code a 6 chiffres</label>
            <input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" required>
          </div>
          <button class="primary" type="submit">Verifier</button>
        </form>
      </div>
      <div class="auth-visual">
        <div class="house-map" aria-hidden="true">
          <div class="room"><strong>MQTT</strong><span class="sensor-node">T</span><span class="muted">TLS actif</span></div>
          <div class="room"><strong>EMQX</strong><span class="sensor-node">E</span><span class="muted">Cloud</span></div>
          <div class="room"><strong>Topic</strong><span class="sensor-node">D</span><span class="muted">DHT22</span></div>
          <div class="room"><strong>App</strong><span class="sensor-node">M</span><span class="muted">MFA</span></div>
        </div>
      </div>
    </section>
  `;
  document.querySelector("#mfa-form").addEventListener("submit", onMfaVerify);
}

async function onMfaVerify(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.error = null;
  try {
    const result = await api("/api/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ code: form.get("code") })
    });
    state.user = result.user;
    await loadDashboard();
    renderDashboard();
    connectEvents();
  } catch (error) {
    state.error = error.message;
    if (state.mfaSetup) renderMfaSetup();
    else renderMfaVerify();
  }
}

async function loadDashboard() {
  state.dashboard = await api("/api/dashboard");
  state.telemetry = [...state.dashboard.telemetry].reverse();
}

function connectEvents() {
  if (state.eventSource) state.eventSource.close();
  state.eventSource = new EventSource("/api/events", { withCredentials: true });

  state.eventSource.addEventListener("telemetry", (event) => {
    state.telemetry.push(JSON.parse(event.data));
    state.telemetry = state.telemetry.slice(-120);
    state.dashboard.summary = buildClientSummary();
    renderLiveParts();
  });

  state.eventSource.addEventListener("summary", (event) => {
    state.dashboard.summary = JSON.parse(event.data);
    renderLiveParts();
  });

  state.eventSource.addEventListener("mqtt", (event) => {
    state.dashboard.mqtt = JSON.parse(event.data);
    renderLiveParts();
  });

  state.eventSource.addEventListener("thresholds", (event) => {
    state.dashboard.thresholds = JSON.parse(event.data);
    renderLiveParts();
  });
}

function renderDashboard() {
  const summary = state.dashboard.summary;
  const mqtt = state.dashboard.mqtt;
  app.innerHTML = `
    <section class="dashboard">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">IoT</div>
          <div>
            <strong>Smart Home</strong>
            <p class="muted">DHT22 securise</p>
          </div>
        </div>
        <nav class="nav-stack">
          <div class="nav-item active"><span class="dot on"></span>Temps reel</div>
          <div class="nav-item"><span class="dot"></span>Historique</div>
          <div class="nav-item"><span class="dot"></span>Securite</div>
          <div class="nav-item"><span class="dot"></span>Controle</div>
        </nav>
        <button class="danger" id="logout">Deconnexion</button>
      </aside>
      <div class="main">
        <header class="topbar">
          <div>
            <p class="eyebrow">Maison intelligente</p>
            <h1>Temperature et humidite DHT22</h1>
            <p class="muted">Flux ESP32/Wokwi recu depuis EMQX Cloud en MQTT/TLS.</p>
          </div>
          <div class="actions">
            <span class="status-pill ${mqtt.connected ? "normal" : "high"}" id="mqtt-status">${mqtt.connected ? "MQTT connecte" : "MQTT deconnecte"}</span>
            <button class="secondary" id="refresh">Actualiser</button>
          </div>
        </header>

        <section class="grid kpis" id="kpis">${renderKpis(summary)}</section>

        <section class="grid wide-grid">
          <div class="card">
            <h2>Evolution des mesures</h2>
            <p class="muted">Les 40 derniers messages recus sur le topic de telemetrie.</p>
            <div class="chart-wrap"><canvas id="chart" width="900" height="330"></canvas></div>
          </div>
          <div class="split">
            <div class="card" id="security-card">${renderSecurity()}</div>
            <div class="card" id="control-card">${renderControl()}</div>
          </div>
        </section>

        <section class="card table-card">
          <h2>Historique MQTT</h2>
          <div class="table-wrap" id="history">${renderHistory()}</div>
        </section>
      </div>
    </section>
  `;

  document.querySelector("#logout").addEventListener("click", logout);
  document.querySelector("#refresh").addEventListener("click", async () => {
    await loadDashboard();
    renderDashboard();
    connectEvents();
  });
  wireControlForm();
  drawChart();
}

function renderLiveParts() {
  const kpis = document.querySelector("#kpis");
  const history = document.querySelector("#history");
  const security = document.querySelector("#security-card");
  const control = document.querySelector("#control-card");
  const mqttStatus = document.querySelector("#mqtt-status");
  if (!kpis) return;

  kpis.innerHTML = renderKpis(state.dashboard.summary);
  history.innerHTML = renderHistory();
  security.innerHTML = renderSecurity();
  control.innerHTML = renderControl();
  const connected = state.dashboard.mqtt.connected;
  mqttStatus.textContent = connected ? "MQTT connecte" : "MQTT deconnecte";
  mqttStatus.className = `status-pill ${connected ? "normal" : "high"}`;
  wireControlForm();
  drawChart();
}

function renderKpis(summary) {
  const last = summary.last || {};
  return `
    <article class="card">
      <div class="kpi-label">Temperature</div>
      <div class="kpi-value">${formatNumber(last.temperature)} C</div>
      ${statusPill(last.temperature_status)}
    </article>
    <article class="card">
      <div class="kpi-label">Humidite</div>
      <div class="kpi-value">${formatNumber(last.humidity)} %</div>
      ${statusPill(last.humidity_status)}
    </article>
    <article class="card">
      <div class="kpi-label">Alertes recentes</div>
      <div class="kpi-value">${summary.recentAlerts || 0}</div>
      <p class="muted">Sur les 50 derniers messages</p>
    </article>
    <article class="card">
      <div class="kpi-label">Messages recus</div>
      <div class="kpi-value">${summary.totalMessages || 0}</div>
      <p class="muted">${summary.lastReceivedAt ? time(summary.lastReceivedAt) : "Aucune donnee"}</p>
    </article>
  `;
}

function renderSecurity() {
  const mqtt = state.dashboard.mqtt;
  return `
    <h2>Securite</h2>
    <ul class="security-list">
      <li><span>Authentification app</span><strong>Mot de passe + TOTP</strong></li>
      <li><span>Session</span><strong>Cookie signe HttpOnly</strong></li>
      <li><span>Broker</span><strong>${escapeHtml(mqtt.host)}</strong></li>
      <li><span>Transport</span><strong>${escapeHtml(mqtt.security)} / ${mqtt.port}</strong></li>
      <li><span>Topic telemetrie</span><strong class="code">${escapeHtml(mqtt.telemetryTopic)}</strong></li>
    </ul>
  `;
}

function renderControl() {
  const t = state.dashboard.thresholds;
  return `
    <h2>Seuils de controle</h2>
    <form class="form" id="control-form">
      <div class="grid control-grid">
        <div class="field">
          <label>Temp. min</label>
          <input name="temperatureLow" type="number" step="0.1" value="${t.temperatureLow}">
        </div>
        <div class="field">
          <label>Temp. max</label>
          <input name="temperatureHigh" type="number" step="0.1" value="${t.temperatureHigh}">
        </div>
        <div class="field">
          <label>Hum. min</label>
          <input name="humidityLow" type="number" step="0.1" value="${t.humidityLow}">
        </div>
        <div class="field">
          <label>Hum. max</label>
          <input name="humidityHigh" type="number" step="0.1" value="${t.humidityHigh}">
        </div>
      </div>
      <button class="primary" type="submit">Publier la commande</button>
    </form>
  `;
}

function renderHistory() {
  const rows = [...state.telemetry].reverse().slice(0, 80);
  if (!rows.length) return `<div class="empty">Aucune telemetrie recue pour le moment. Lancez la simulation Wokwi.</div>`;
  return `
    <table>
      <thead>
        <tr>
          <th>Heure</th>
          <th>Device</th>
          <th>Temperature</th>
          <th>Humidite</th>
          <th>Statut</th>
          <th>Topic</th>
          <th>Payload</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((item) => `
          <tr>
            <td>${time(item.receivedAt)}</td>
            <td>${escapeHtml(item.device || "-")}</td>
            <td>${formatNumber(item.temperature)} C</td>
            <td>${formatNumber(item.humidity)} %</td>
            <td>${statusPill(item.temperature_status)} ${statusPill(item.humidity_status)}</td>
            <td class="code">${escapeHtml(item.topic || "")}</td>
            <td class="code">${escapeHtml(item.raw || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function wireControlForm() {
  const form = document.querySelector("#control-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const result = await api("/api/control", {
      method: "POST",
      body: JSON.stringify(data)
    });
    state.dashboard.thresholds = result.thresholds;
    renderLiveParts();
  });
}

function drawChart() {
  const canvas = document.querySelector("#chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const points = state.telemetry.slice(-40);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const padding = { left: 48, right: 18, top: 18, bottom: 34 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  ctx.strokeStyle = "#e5edf7";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  if (!points.length) {
    ctx.fillStyle = "#657189";
    ctx.font = "18px system-ui";
    ctx.fillText("En attente des donnees Wokwi...", padding.left, height / 2);
    return;
  }

  const values = points.flatMap((item) => [Number(item.temperature), Number(item.humidity)]).filter(Number.isFinite);
  const min = Math.min(0, Math.floor(Math.min(...values) / 10) * 10);
  const max = Math.max(100, Math.ceil(Math.max(...values) / 10) * 10);
  const scaleY = (value) => padding.top + plotH - ((value - min) / (max - min)) * plotH;
  const scaleX = (index) => padding.left + (points.length === 1 ? 0 : (plotW / (points.length - 1)) * index);

  drawLine("temperature", "#2563eb");
  drawLine("humidity", "#15803d");

  ctx.fillStyle = "#172033";
  ctx.font = "13px system-ui";
  ctx.fillText("Temperature", padding.left, 16);
  ctx.fillStyle = "#15803d";
  ctx.fillText("Humidite", padding.left + 120, 16);

  function drawLine(key, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach((item, index) => {
      const value = Number(item[key]);
      if (!Number.isFinite(value)) return;
      const x = scaleX(index);
      const y = scaleY(value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

async function logout() {
  await api("/api/logout", { method: "POST", body: "{}" });
  if (state.eventSource) state.eventSource.close();
  state.user = null;
  state.dashboard = null;
  renderLogin();
}

function buildClientSummary() {
  const last = state.telemetry.at(-1) || null;
  const recent = state.telemetry.slice(-50);
  return {
    last,
    totalMessages: Math.max(state.dashboard.summary.totalMessages || 0, state.telemetry.length),
    recentAlerts: recent.filter((item) => item.high_temperature || item.high_humidity).length,
    recentNormal: recent.filter((item) => item.temperature_status === "NORMAL" && item.humidity_status === "NORMAL").length,
    lastReceivedAt: last ? last.receivedAt : null
  };
}

function statusPill(value) {
  if (!value) return `<span class="status-pill">-</span>`;
  const cls = String(value).toLowerCase();
  return `<span class="status-pill ${cls}">${escapeHtml(value)}</span>`;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return number.toFixed(1);
}

function time(value) {
  return new Date(value).toLocaleString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
