const HISTORY_URL = "data/history.json";

let chartTemp = null;
let chartHum  = null;
let refreshing = false;

/** Converteix graus a punt cardinal (N, NNE, ...) */
function degToCardinal(deg){
  const d = Number(deg);
  if (!Number.isFinite(d)) return "—";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(d / 22.5) % 16];
}

/** Formata hora i data en català */
function fmtTime(ts){
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("ca-ES", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  });
}

/** Escriu text a un element */
function setText(id, value){
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

/** Converteix a número si es pot */
function toNum(x){
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/** Per mostrar números amb decimals coherents */
function fmtNum(x, decimals = 1){
  const n = toNum(x);
  if (n === null) return "—";
  return n.toFixed(decimals);
}

/** Construeix un gràfic Chart.js */
function buildChart(canvasId, labels, values){
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

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
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { ticks: { maxTicksLimit: 6 } }
      }
    }
  });
}

/** Carrega history.json evitant cache */
async function loadHistory(){
  const url = `${HISTORY_URL}?t=${Date.now()}`; // cache-buster
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("No puc carregar history.json");
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("history.json no és una llista");
  return data;
}

/** Normalitza wind_dir: pot venir com número, string o objecte (value/unit) */
function normalizeWindDir(wind_dir){
  if (wind_dir == null) return { deg: null, card: "—", label: "—" };

  // Si ve com objecte {value:"341", unit:"º", ...}
  if (typeof wind_dir === "object" && wind_dir !== null) {
    const v = wind_dir.value ?? wind_dir.deg ?? null;
    const deg = toNum(v);
    return {
      deg,
      card: degToCardinal(deg),
      label: deg === null ? "—" : `${deg}º`
    };
  }

  // Si ve com string o número
  const deg = toNum(wind_dir);
  return {
    deg,
    card: degToCardinal(deg),
    label: deg === null ? "—" : `${deg}º`
  };
}

/** Renderitza la targeta "current" */
function renderCurrent(last){
  // Cards principals
  setText("temp", last?.temp_c == null ? "—" : fmtNum(last.temp_c, 2));
  setText("hum",  last?.hum_pct == null ? "—" : fmtNum(last.hum_pct, 0));
  setText("wind", last?.wind_kmh == null ? "—" : fmtNum(last.wind_kmh, 1));
  setText("rainDay", last?.rain_day_mm == null ? "0.0" : fmtNum(last.rain_day_mm, 1));

  // Subtexts
  const dew = (last?.dew_c == null) ? "—" : `${fmtNum(last.dew_c, 2)} °C`;
  setText("tempSub", last?.dew_c != null ? `Punt de rosada: ${dew}` : "—");
  setText("dewSub",  last?.dew_c != null ? `Punt de rosada: ${dew}` : "—");

  const gustTxt = (last?.gust_kmh == null) ? "N/D" : fmtNum(last.gust_kmh, 1);
  const dir = normalizeWindDir(last?.wind_dir);

  setText("gustSub", `Ratxa: ${gustTxt} km/h · Dir: ${dir.card} (${dir.label})`);

  const rr = (last?.rain_rate_mmh == null) ? "0.0" : fmtNum(last.rain_rate_mmh, 1);
  setText("rainRateSub", `Intensitat: ${rr} mm/h`);

  // Timestamp
  setText("lastUpdated", `Actualitzat: ${fmtTime(last?.ts)}`);
}

/** Renderitza gràfiques últimes 24h */
function renderCharts(history){
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const last24 = history.filter(p => toNum(p?.ts) !== null && p.ts >= cutoff);

  // Etiquetes i dades (si hi ha nulls, Chart.js ho pot representar amb trams tallats)
  const labels = last24.map(p =>
    new Date(p.ts).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" })
  );

  const temps = last24.map(p => (p?.temp_c == null ? null : toNum(p.temp_c)));
  const hums  = last24.map(p => (p?.hum_pct == null ? null : toNum(p.hum_pct)));

  if (chartTemp) { chartTemp.destroy(); chartTemp = null; }
  if (chartHum)  { chartHum.destroy();  chartHum  = null; }

  chartTemp = buildChart("chartTemp", labels, temps);
  chartHum  = buildChart("chartHum", labels, hums);
}

/** Refresc complet (dades + gràfiques) */
async function refresh(){
  if (refreshing) return;
  refreshing = true;

  try{
    const history = await loadHistory();
    if (history.length === 0) {
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

/** Init */
(function init(){
  setText("year", String(new Date().getFullYear()));

  // Primera càrrega immediata
  refresh();

  // Auto-refresh (recomanat 60–120s). Aquí: 60s
  setInterval(refresh, 60_000);
})();
