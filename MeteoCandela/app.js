"use strict";

const HISTORY_URL = "./data/history.json";
const REFRESH_MS = 60_000; // 60s (la web refresca; l'Action pot ser cada 5 min)

let chartTemp = null;
let chartHum = null;

let lastSeenTs = null;
let refreshing = false;

function degToCardinal(deg){
  const d = Number(deg);
  if (!Number.isFinite(d)) return "—";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(d/22.5) % 16];
}

function fmtTime(ts){
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ca-ES", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function setText(id, value){
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function toFiniteNumber(x){
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Protecció contra valors “bogeria” (p. ex. 68°C de cop)
 * Ajusta si vols, però ajuda a evitar que un punt estrany trenqui l'escala.
 */
function clampPlausible(val, min, max){
  const n = Number(val);
  if (!Number.isFinite(n)) return NaN;
  if (n < min || n > max) return NaN;
  return n;
}

async function loadHistory(){
  const url = `${HISTORY_URL}?t=${Date.now()}`; // evita cache
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("No puc carregar history.json");
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("history.json no és una llista");
  return data;
}

function renderCurrent(last){
  const temp = clampPlausible(last.temp_c, -30, 55);
  const hum  = clampPlausible(last.hum_pct, 0, 100);
  const dew  = clampPlausible(last.dew_c, -40, 40);

  const wind = clampPlausible(last.wind_kmh, 0, 250);
  const gust = clampPlausible(last.gust_kmh, 0, 300);

  const dirDeg = toFiniteNumber(last.wind_dir);

  const rainDay  = clampPlausible(last.rain_day_mm, 0, 1000);
  const rainRate = clampPlausible(last.rain_rate_mmh, 0, 500);

  setText("temp", Number.isFinite(temp) ? temp.toFixed(2) : "—");
  setText("hum",  Number.isFinite(hum)  ? hum.toFixed(0) : "—");
  setText("wind", Number.isFinite(wind) ? wind.toFixed(1) : "—");
  setText("rainDay", Number.isFinite(rainDay) ? rainDay.toFixed(1) : "0.0");

  setText("tempSub", Number.isFinite(dew) ? `Punt de rosada: ${dew.toFixed(2)} °C` : "—");
  setText("dewSub",  Number.isFinite(dew) ? `Punt de rosada: ${dew.toFixed(2)} °C` : "—");

  const dirTxt = Number.isFinite(dirDeg) ? `${degToCardinal(dirDeg)} (${dirDeg.toFixed(0)}º)` : "—";
  const gustTxt = Number.isFinite(gust) ? `${gust.toFixed(1)} km/h` : "—";

  setText("gustSub", `Ratxa: ${gustTxt} · Dir: ${dirTxt}`);
  setText("rainRateSub", `Intensitat: ${Number.isFinite(rainRate) ? rainRate.toFixed(1) : "0.0"} mm/h`);

  setText("lastUpdated", `Actualitzat: ${fmtTime(last.ts)}`);
}

function ensureChart(canvasId, label, labels, values){
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const config = {
    type: "line",
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        tension: 0.25,
        pointRadius: 0,
        borderWidth: 2,
        spanGaps: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { ticks: { maxTicksLimit: 6 } }
      }
    }
  };

  return new Chart(ctx, config);
}

function updateChart(chart, labels, values){
  if (!chart) return;
  chart.data.labels = labels;
  chart.data.datasets[0].data = values;
  chart.update("none");
}

function renderCharts(history){
  const cutoff = Date.now() - 24*60*60*1000;
  const last24 = history.filter(p => Number(p.ts) >= cutoff);

  // Labels: hora:minut
  const labels = last24.map(p => {
    const d = new Date(Number(p.ts));
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" });
  });

  // Convertim a NaN si falta o si és absurd -> Chart.js fa “gaps” i NO rebenta escales
  const temps = last24.map(p => clampPlausible(p.temp_c, -30, 55));
  const hums  = last24.map(p => clampPlausible(p.hum_pct, 0, 100));

  // Peu de gràfic
  const tValid = temps.filter(Number.isFinite);
  const hValid = hums.filter(Number.isFinite);

  setText("tempFoot", tValid.length ? `Min: ${Math.min(...tValid).toFixed(1)} · Max: ${Math.max(...tValid).toFixed(1)}` : "Sense dades recents");
  setText("humFoot",  hValid.length ? `Min: ${Math.min(...hValid).toFixed(0)} · Max: ${Math.max(...hValid).toFixed(0)}` : "Sense dades recents");

  // Crea o actualitza
  if (!chartTemp) {
    chartTemp = ensureChart("chartTemp", "Temperatura", labels, temps);
    // dona al canvas una alçada mínima via JS per mòbil (Chart.js + CSS)
    document.getElementById("chartTemp").parentElement.style.height = "220px";
  } else {
    updateChart(chartTemp, labels, temps);
  }

  if (!chartHum) {
    chartHum = ensureChart("chartHum", "Humitat", labels, hums);
    document.getElementById("chartHum").parentElement.style.height = "220px";
  } else {
    updateChart(chartHum, labels, hums);
  }
}

async function
