const HISTORY_URL = "data/history.json";
const REFRESH_MS = 60_000;

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
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ca-ES", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit"
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function fmtNum(x, digits = 2) {
  const n = toNum(x);
  return n === null ? "—" : n.toFixed(digits);
}

function buildChart(canvasId, labels, values) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  // si no hi ha dades numèriques, no pintem res (evita gràfiques rares)
  const hasAny = values.some(v => toNum(v) !== null);
  if (!hasAny) return null;

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
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: {
          ticks: { maxTicksLimit: 6 },
          // Evita que Chart col·lapsi amb nulls: només es calcula escala amb valors finits.
          suggestedMin: undefined,
          suggestedMax: undefined
        }
      }
    }
  });
}

async function loadHistory() {
  // evita cache fort de GitHub Pages + navegador
  const url = `${HISTORY_URL}?t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("No puc carregar history.json");
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("history.json no és una llista");
  return data;
}

function renderCurrent(last) {
  setText("temp", last?.temp_c == null ? "—" : fmtNum(last.temp_c));
  setText("hum", last?.hum_pct == null ? "—" : fmtNum(last.hum_pct, 0));
  setText("wind", last?.wind_kmh == null ? "—" : fmtNum(last.wind_kmh, 1));
  setText("rainDay", last?.rain_day_mm == null ? "0.0" : fmtNum(last.rain_day_mm, 1));

  const dewTxt = last?.dew_c == null ? "—" : `Punt de rosada: ${fmtNum(last.dew_c)} °C`;
  setText("tempSub", dewTxt);
  setText("dewSub", dewTxt);

  const dirCard = degToCardinal(last?.wind_dir);
  const dirDeg = last?.wind_dir ?? "—";
  const gust = last?.gust_kmh == null ? "—" : fmtNum(last.gust_kmh, 1);

  setText("gustSub", `Ratxa: ${gust} km/h · Dir: ${dirCard} (${dirDeg}º)`);
  setText("rainRateSub", `Intensitat: ${last?.rain_rate_mmh == null ? "0.0" : fmtNum(last.rain_rate_mmh, 1)} mm/h`);

  setText("lastUpdated", `Actualitzat: ${fmtTime(last?.ts)}`);
}

function renderCharts(history) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const last24 = history
    .filter(p => typeof p?.ts === "number" && p.ts >= cutoff)
    .sort((a, b) => a.ts - b.ts);

  // Generem punts només quan el valor és numèric: així no hi ha nulls que trenquin l’escala
  const labels = [];
  const temps = [];
  const hums = [];

  for (const p of last24) {
    const t = toNum(p.temp_c);
    const h = toNum(p.hum_pct);
    // Permetem punts si hi ha mínim una de les dues
    if (t === null && h === null) continue;

    labels.push(new Date(p.ts).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" }));
    temps.push(t); // pot ser null, però ja hem eliminat files totalment buides
    hums.push(h);
  }

  if (chartTemp) { chartTemp.destroy(); chartTemp = null; }
  if (chartHum)  { chartHum.destroy();  chartHum = null; }

  chartTemp = buildChart("chartTemp", labels, temps);
  chartHum  = buildChart("chartHum", labels, hums);

  // Si no hi ha dades, posa un text (opcional; si tens un element per avisos)
  // setText("chartsStatus", (chartTemp || chartHum) ? "" : "Sense dades suficients per a les gràfiques");
}

let refreshing = false;

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const history = await loadHistory();
    if (history.length === 0) {
      setText("lastUpdated", "Encara sense dades (espera la primera actualització)");
      return;
    }
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

// init
setText("year", String(new Date().getFullYear()));
refresh();
setInterval(refresh, REFRESH_MS);
