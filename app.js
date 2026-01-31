"use strict";

/**
 * MeteoCandela - app.js
 * - Llegeix MeteoCandela/data/history.json
 * - Mostra valors actuals + gràfics 24h
 * - Auto-refresc cada 60s sense recarregar la pàgina
 */

const HISTORY_URL = "data/history.json";
const REFRESH_MS = 60_000; // 60s (pots posar 300_000 si vols igualar el cron de 5 min)

let chartTemp = null;
let chartHum = null;
let refreshing = false;

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function fmt1(n) {
  const v = toNumber(n);
  return v === null ? "—" : v.toFixed(1);
}

function fmt2(n) {
  const v = toNumber(n);
  return v === null ? "—" : v.toFixed(2);
}

function degToCardinal(deg) {
  const d = toNumber(deg);
  if (d === null) return "—";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(d / 22.5) % 16];
}

function fmtTime(ts) {
  const t = toNumber(ts);
  if (t === null) return "—";
  const d = new Date(t);
  return d.toLocaleString("ca-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

async function loadHistory() {
  const url = `${HISTORY_URL}?t=${Date.now()}`; // evita cache (GitHub Pages / navegador)
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`No puc carregar history.json (${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("history.json no és una llista");
  return data;
}

function normalizePoint(p) {
  // Converteix strings a números quan toqui, però preserva nulls
  return {
    ts: toNumber(p.ts),
    temp_c: toNumber(p.temp_c),
    hum_pct: toNumber(p.hum_pct),
    dew_c: toNumber(p.dew_c),
    wind_kmh: toNumber(p.wind_kmh),
    gust_kmh: toNumber(p.gust_kmh),
    wind_dir: toNumber(p.wind_dir),
    rain_day_mm: toNumber(p.rain_day_mm),
    rain_rate_mmh: toNumber(p.rain_rate_mmh),
  };
}

function renderCurrent(last) {
  setText("temp", last.temp_c === null ? "—" : fmt2(last.temp_c));
  setText("hum", last.hum_pct === null ? "—" : String(Math.round(last.hum_pct)));
  setText("wind", last.wind_kmh === null ? "—" : fmt1(last.wind_kmh));
  setText("rainDay", last.rain_day_mm === null ? "0.0" : fmt1(last.rain_day_mm));

  // Subtexts
  setText("tempSub", last.dew_c === null ? "Punt de rosada: —" : `Punt de rosada: ${fmt2(last.dew_c)} °C`);

  const gustTxt = last.gust_kmh === null ? "—" : fmt1(last.gust_kmh);
  const dirTxt = degToCardinal(last.wind_dir);
  const degTxt = last.wind_dir === null ? "—" : String(Math.round(last.wind_dir));

  setText("gustSub", `Ratxa: ${gustTxt} km/h · Dir: ${dirTxt} (${degTxt}º)`);
  setText("rainRateSub", `Intensitat: ${last.rain_rate_mmh === null ? "0.0" : fmt1(last.rain_rate_mmh)} mm/h`);

  setText("lastUpdated", `Actualitzat: ${fmtTime(last.ts)}`);
}

function buildLineChart(canvasId, labels, values) {
  const canvas = $(canvasId);
  if (!canvas) return null;
  if (typeof Chart === "undefined") {
    console.warn("Chart.js no està carregat");
    return null;
  }

  const ctx = canvas.getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: values,
        tension: 0.25,
        pointRadius: 0,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: {
          ticks: { maxTicksLimit: 6 },
          beginAtZero: false
        }
      }
    }
  });
}

function renderCharts(history) {
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;

  const last24 = history
    .map(normalizePoint)
    .filter(p => p.ts !== null && p.ts >= cutoff)
    .sort((a, b) => a.ts - b.ts);

  // Si no hi ha prou punts, no rebentem charts: deixem-los buits
  const labels = last24.map(p =>
    new Date(p.ts).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" })
  );

  // IMPORTANT: Chart.js tolera nulls (trenca la línia). Filtrar només infinits/NaN.
  const temps = last24.map(p => (p.temp_c === null ? null : p.temp_c));
  const hums  = last24.map(p => (p.hum_pct === null ? null : p.hum_pct));

  if (chartTemp) { chartTemp.destroy(); chartTemp = null; }
  if (chartHum)  { chartHum.destroy();  chartHum = null; }

  chartTemp = buildLineChart("chartTemp", labels, temps);
  chartHum  = buildLineChart("chartHum", labels, hums);
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;

  try {
    const raw = await loadHistory();
    const history = raw.map(normalizePoint).filter(p => p.ts !== null);

    if (history.length === 0) {
      setText("lastUpdated", "Encara sense dades (espera la primera actualització)");
      return;
    }

    // Últim punt
    history.sort((a, b) => a.ts - b.ts);
    const last = history[history.length - 1];

    renderCurrent(last);
    renderCharts(history);
  } catch (e) {
    console.error(e);
    setText("lastUpdated", "Error carregant dades");
  } finally {
    refreshing = false;
  }
}

// Boot
setText("year", String(new Date().getFullYear()));
refresh();
setInterval(refresh, REFRESH_MS);

// Opcional: refresc quan tornes a la pestanya
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});
