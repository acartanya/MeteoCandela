const HISTORY_URL = "data/history.json";

let chartTemp, chartHum;

function degToCardinal(deg){
  const d = Number(deg);
  if (!Number.isFinite(d)) return "—";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(d/22.5) % 16];
}

function fmtTime(ts){
  const d = new Date(ts);
  return d.toLocaleString("ca-ES", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function setText(id, value){
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function buildChart(canvasId, labels, values){
  const ctx = document.getElementById(canvasId);
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
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { ticks: { maxTicksLimit: 6 } }
      }
    }
  });
}

async function loadHistory(){
  const url = `${HISTORY_URL}?t=${Date.now()}`; // evita cache de GitHub Pages / navegador
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("No puc carregar history.json");
  return await res.json();
}

function renderCurrent(last){
  setText("temp", last.temp_c ?? "—");
  setText("hum", last.hum_pct ?? "—");
  setText("wind", last.wind_kmh ?? "—");
  setText("rainDay", last.rain_day_mm ?? "0.0");

  setText("tempSub", last.dew_c != null ? `Punt de rosada: ${last.dew_c} °C` : "—");
  setText("dewSub", last.dew_c != null ? `Punt de rosada: ${last.dew_c} °C` : "—");
  setText("gustSub", `Ratxa: ${last.gust_kmh ?? "—"} km/h · Dir: ${degToCardinal(last.wind_dir)} (${last.wind_dir ?? "—"}º)`);
  setText("rainRateSub", `Intensitat: ${last.rain_rate_mmh ?? "0.0"} mm/h`);

  setText("lastUpdated", `Actualitzat: ${fmtTime(last.ts)}`);
}

function renderCharts(history){
  const cutoff = Date.now() - 24*60*60*1000;
  const last24 = history.filter(p => p.ts >= cutoff);

  const labels = last24.map(p => new Date(p.ts).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" }));
  const temps = last24.map(p => p.temp_c);
  const hums  = last24.map(p => p.hum_pct);

  if (chartTemp) chartTemp.destroy();
  if (chartHum) chartHum.destroy();

  chartTemp = buildChart("chartTemp", labels, temps);
  chartHum  = buildChart("chartHum", labels, hums);
}

setText("year", String(new Date().getFullYear()));

let refreshing = false;

async function refresh(){
  if (refreshing) return; // evita solapaments si la xarxa va lenta
  refreshing = true;
  try{
    const history = await loadHistory();
    if (!Array.isArray(history) || history.length === 0) {
      setText("lastUpdated", "Encara sense dades (espera la primera actualització)");
      return;
    }
    const last = history[history.length - 1];
    renderCurrent(last);
    renderCharts(history);
  } catch (e){
    setText("lastUpdated", "Error carregant dades");
    console.error(e);
  } finally {
    refreshing = false;
  }
}

// 1a càrrega immediata
refresh();

// refresc automàtic cada 60 segons
setInterval(refresh, 60_000);
