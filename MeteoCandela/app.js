const HISTORY_URL = "data/history.json";

let chartTemp = null;
let chartHum = null;
let refreshing = false;
let lastSeenTs = null;

function degToCardinal(deg){
  const d = Number(deg);
  if (!Number.isFinite(d)) return "—";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(d/22.5) % 16];
}

function setText(id, value){
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function fmtTime(ts){
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("ca-ES", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
}

function toNum(x){
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function loadHistory(){
  // cache-buster + no-store
  const url = `${HISTORY_URL}?t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("No puc carregar history.json");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function renderCurrent(last){
  setText("temp", last.temp_c ?? "—");
  setText("hum", last.hum_pct ?? "—");
  setText("wind", last.wind_kmh ?? "—");
  setText("rainDay", last.rain_day_mm ?? "0.0");

  const dewTxt = (last.dew_c == null) ? "—" : `${last.dew_c} °C`;
  setText("tempSub", `Punt de rosada: ${dewTxt}`);

  const gustTxt = (last.gust_kmh == null) ? "N/D" : `${last.gust_kmh}`;
  const dirDeg = (last.wind_dir == null) ? null : toNum(last.wind_dir);
  const dirTxt = (dirDeg == null) ? "—" : `${Math.round(dirDeg)}º`;
  const dirCard = (dirDeg == null) ? "—" : degToCardinal(dirDeg);

  setText("gustSub", `Ratxa: ${gustTxt} km/h · Dir: ${dirCard} (${dirTxt})`);

  const rr = (last.rain_rate_mmh == null) ? "0.0" : `${last.rain_rate_mmh}`;
  setText("rainRateSub", `Intensitat: ${rr} mm/h`);

  setText("lastUpdated", `Actualitzat: ${fmtTime(last.ts)}`);
}

function destroyCharts(){
  if (chartTemp) { chartTemp.destroy(); chartTemp = null; }
  if (chartHum)  { chartHum.destroy();  chartHum  = null; }
}

function buildChart(canvasId, labels, values, suggestedMin, suggestedMax){
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
        borderWidth: 2,
        spanGaps: true
      }]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: {
          ticks: { maxTicksLimit: 6 },
          suggestedMin,
          suggestedMax
        }
      }
    }
  });
}

function renderCharts(history){
  const cutoff = Date.now() - 24*60*60*1000;

  // Ordena i limita per rendiment
  const last24 = history
    .filter(p => toNum(p?.ts) != null && p.ts >= cutoff)
    .sort((a,b) => a.ts - b.ts)
    .slice(-600);

  // Construeix sèries; deixem null si falta valor, però calculem min/max només amb valors reals
  const labels = last24.map(p =>
    new Date(p.ts).toLocaleTimeString("ca-ES", { hour:"2-digit", minute:"2-digit" })
  );

  const temps = last24.map(p => {
    const v = toNum(p.temp_c);
    return v == null ? null : v;
  });

  const hums = last24.map(p => {
    const v = toNum(p.hum_pct);
    return v == null ? null : v;
  });

  const tVals = temps.filter(v => v != null);
  const hVals = hums.filter(v => v != null);

  destroyCharts();

  // Evita gràfics “buits” o eixos bojos
  if (labels.length < 2 || tVals.length < 2){
    return;
  }

  const tMin = Math.min(...tVals);
  const tMax = Math.max(...tVals);
  const tPad = Math.max(1, (tMax - tMin) * 0.15);
  chartTemp = buildChart("chartTemp", labels, temps, tMin - tPad, tMax + tPad);

  if (hVals.length >= 2){
    const hMin = Math.min(...hVals);
    const hMax = Math.max(...hVals);
    const hPad = Math.max(3, (hMax - hMin) * 0.15);
    chartHum = buildChart("chartHum", labels, hums, Math.max(0, hMin - hPad), Math.min(100, hMax + hPad));
  }
}

async function refresh(){
  if (refreshing) return;
  refreshing = true;

  try{
    setText("year", String(new Date().getFullYear()));
    const history = await loadHistory();
    if (!history.length){
      setText("lastUpdated", "Encara sense dades (espera la primera actualització)");
      destroyCharts();
      return;
    }

    const last = history[history.length - 1];

    // Si no hi ha punt nou, no cal redibuixar (evita “parpelleig”)
    if (lastSeenTs === last.ts) return;
    lastSeenTs = last.ts;

    renderCurrent(last);
    renderCharts(history);

  } catch (e){
    console.error(e);
    setText("lastUpdated", "Error carregant dades");
  } finally {
    refreshing = false;
  }
}

// init
setText("year", String(new Date().getFullYear()));
refresh();
setInterval(refresh, 60_000);
