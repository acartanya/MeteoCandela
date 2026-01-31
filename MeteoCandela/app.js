const HISTORY_URL = "data/history.json";

let chartTemp = null;
let chartHum = null;

function degToCardinal(deg) {
  const d = Number(deg);
  if (!Number.isFinite(d)) return "—";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(d / 22.5) % 16];
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString("ca-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function loadHistory() {
  // cache-buster + no-store
  const url = `${HISTORY_URL}?t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("No puc carregar history.json");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function renderCurrent(last) {
  setText("temp", last.temp_c ?? "—");
  setText("hum", last.hum_pct ?? "—");
  setText("wind", last.wind_kmh ?? "—");
  setText("rainDay", last.rain_day_mm ?? "0.0");

  const dew = last.dew_c != null ? `${last.dew_c} °C` : "—";
  setText("tempSub", `Punt de rosada: ${dew}`);
  setText("dewSub", `Punt de rosada: ${dew}`);

  const gust = last.gust_kmh ?? "—";
  const wdir = last.wind_dir ?? "—";
  setText("gustSub", `Ratxa: ${gust} km/h · Dir: ${degToCardinal(wdir)} (${wdir}º)`);

  setText("rainRateSub", `Intensitat: ${last.rain_rate_mmh ?? "0.0"} mm/h`);
  setText("lastUpdated", `Actualitzat: ${fmtTime(last.ts)}`);
}

function buildChart(canvasId, labels, values) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  return new Chart(canvas, {
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
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { ticks: { maxTicksLimit: 6 } }
      }
    }
  });
}

function renderCharts(history) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  // Filtra últimes 24h i elimina punts sense valor (null/NaN), perquè Chart.js no es torni boig
  const last24 = history
    .filter(p => p.ts >= cutoff)
    .sort((a,b) => a.ts - b.ts);

  const pointsTemp = last24
    .map(p => ({ ts: p.ts, v: safeNum(p.temp_c) }))
    .filter(p => p.v != null);

  const pointsHum = last24
    .map(p => ({ ts: p.ts, v: safeNum(p.hum_pct) }))
    .filter(p => p.v != null);

  const labelsTemp = pointsTemp.map(p => new Date(p.ts).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" }));
  const valuesTemp = pointsTemp.map(p => p.v);

  const labelsHum = pointsHum.map(p => new Date(p.ts).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" }));
  const valuesHum = pointsHum.map(p => p.v);

  if (chartTemp) chartTemp.destroy();
  if (chartHum) chartHum.destroy();

  chartTemp = buildChart("chartTemp", labelsTemp, valuesTemp);
  chartHum  = buildChart("chartHum", labelsHum, valuesHum);

  // Si no hi ha punts, almenys no mostrem “gràfic boig”
  if (!valuesTemp.length) console.warn("Sense dades de temperatura per graficar (24h).");
  if (!valuesHum.length) console.warn("Sense dades d'humitat per graficar (24h).");
}

let refreshing = false;
let lastSeenTs = null;

async function refresh() {
  if (refreshing) return;
  refreshing = true;

  try {
    const history = await loadHistory();
    if (!history.length) {
      setText("lastUpdated", "Encara sense dades (espera la primera actualització)");
      return;
    }

    const last = history[history.length - 1];

    // només re-render si hi ha canvi real
    if (lastSeenTs === last.ts) return;
    lastSeenTs = last.ts;

    renderCurrent(last);
    renderCharts(history);

  } catch (e) {
    console.error(e);
    setText("lastUpdated", "Error carregant dades");
  } finally {
    refreshing = false;
  }
}

// init
setText("year", String(new Date().getFullYear()));
refresh();

// refresc automàtic (cada 60s)
setInterval(refresh, 60_000);
