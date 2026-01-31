(() => {
  // Detecta automàticament si estàs servint sota /MeteoCandela/
  // i evita hardcodejar rutes que després fan 404.
  const BASE = (location.pathname.includes("/MeteoCandela/")) ? "/MeteoCandela" : "";

  const HISTORY_URL = `${BASE}/data/history.json`;
  const HEARTBEAT_URL = `${BASE}/heartbeat/heartbeat.json`;

  const $ = (id) => document.getElementById(id);

  function fToC(f) { return (f - 32) * 5 / 9; }
  function mphToKmh(mph) { return mph * 1.609344; }

  function fmt1(x) {
    if (x === null || x === undefined || Number.isNaN(Number(x))) return "—";
    return Number(x).toFixed(1);
  }

  function fmtDate(tsMs) {
    const d = new Date(tsMs);
    return new Intl.DateTimeFormat("ca-ES", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).format(d);
  }

  function fmtTime(tsMs) {
    const d = new Date(tsMs);
    return new Intl.DateTimeFormat("ca-ES", {
      hour: "2-digit", minute: "2-digit"
    }).format(d);
  }

  // Converteix graus a nom de vent en català (8 sectors) amb Garbí
  function degToWindCatalan(deg) {
    if (deg == null || Number.isNaN(Number(deg))) return "—";

    const d = ((Number(deg) % 360) + 360) % 360;

    if (d >= 337.5 || d < 22.5)   return "N – Tramuntana";
    if (d >= 22.5  && d < 67.5)   return "NE – Gregal";
    if (d >= 67.5  && d < 112.5)  return "E – Llevant";
    if (d >= 112.5 && d < 157.5)  return "SE – Xaloc";
    if (d >= 157.5 && d < 202.5)  return "S – Migjorn";
    if (d >= 202.5 && d < 247.5)  return "SW – Garbí";
    if (d >= 247.5 && d < 292.5)  return "W – Ponent";
    if (d >= 292.5 && d < 337.5)  return "NW – Mestral";

    return "—";
  }

  function normalizeRow(r) {
    // TEMPERATURA (prioritza sempre temp_c)
    let tempC = (r.temp_c ?? null);
    if (tempC === null || tempC === undefined) {
      if (r.temp_f != null) tempC = fToC(Number(r.temp_f));
      else if (r.temperature != null) {
        const t = Number(r.temperature);
        tempC = (t >= 80) ? fToC(t) : t;
      }
    }

    // ROSADA
    let dewC = (r.dew_c ?? null);
    if (dewC === null || dewC === undefined) {
      if (r.dew_f != null) dewC = fToC(Number(r.dew_f));
    }

    // VENT (prioritza km/h)
    let windKmh = (r.wind_kmh ?? null);
    if (windKmh === null || windKmh === undefined) {
      if (r.wind_mph != null) windKmh = mphToKmh(Number(r.wind_mph));
      else if (r.wind_speed != null) windKmh = Number(r.wind_speed);
    }

    // RATXA (prioritza km/h)
    let gustKmh = (r.gust_kmh ?? null);
    if (gustKmh === null || gustKmh === undefined) {
      if (r.gust_mph != null) gustKmh = mphToKmh(Number(r.gust_mph));
      else if (r.wind_gust != null) gustKmh = Number(r.wind_gust);
    }

    // PLUJA
    const rainDay = (r.rain_day_mm ?? r.rain_day ?? null);
    const rainRate = (r.rain_rate_mmh ?? r.rain_rate ?? null);

    return {
      ts: Number(r.ts),
      temp_c: tempC != null ? Number(tempC) : null,
      hum_pct: r.hum_pct != null ? Number(r.hum_pct) : null,
      dew_c: dewC != null ? Number(dewC) : null,
      wind_kmh: windKmh != null ? Number(windKmh) : null,
      gust_kmh: gustKmh != null ? Number(gustKmh) : null,
      wind_dir: (r.wind_dir ?? r.wind_direction ?? null),
      rain_day_mm: rainDay != null ? Number(rainDay) : 0,
      rain_rate_mmh: rainRate != null ? Number(rainRate) : 0,
    };
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} @ ${url}`);
    return await res.json();
  }

  // IMPORTANT: x="category" (sense adapter de temps)
  function buildCharts(rows) {
    const now = Date.now();
    const last24hMs = 24 * 60 * 60 * 1000;
    const r24 = rows.filter(r => r.ts >= (now - last24hMs));

    const labels = r24.map(r => fmtTime(r.ts));
    const temp = r24.map(r => r.temp_c);
    const hum  = r24.map(r => r.hum_pct);
    const wind = r24.map(r => r.wind_kmh);
    const gust = r24.map(r => r.gust_kmh);

    const commonOpts = {
      responsive: true,
      maintainAspectRatio: false,

      interaction: {
        mode: "nearest",
        intersect: false,
        axis: "x"
      },

      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          displayColors: false,
          callbacks: {
            title: () => "",
            label: (ctx) => {
              const v = ctx.parsed?.y;
              if (v == null) return "—";
              const unit = ctx.dataset?.__unit || "";
              const prefix = ctx.dataset?.__prefix || "";
              return `${prefix}${Number(v).toFixed(1)}${unit ? ` ${unit}` : ""}`;
            }
          }
        }
      },

      scales: {
        x: { type: "category", ticks: { maxTicksLimit: 8 } }
      }
    };

    if (window.__chartTemp) window.__chartTemp.destroy();
    if (window.__chartHum) window.__chartHum.destroy();
    if (window.__chartWind) window.__chartWind.destroy();

    window.__chartTemp = new Chart($("chartTemp"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: temp,
          __unit: "°C",
          __prefix: "",
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 7,
          pointHitRadius: 12,
          borderWidth: 2,
          fill: false
        }]
      },
      options: commonOpts
    });

    window.__chartHum = new Chart($("chartHum"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: hum,
          __unit: "%",
          __prefix: "",
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 7,
          pointHitRadius: 12,
          borderWidth: 2,
          fill: false
        }]
      },
      options: {
        ...commonOpts,
        scales: { ...commonOpts.scales, y: { min: 0, max: 100 } }
      }
    });

    const windCanvas = $("chartWind");
    if (windCanvas) {
      window.__chartWind = new Chart(windCanvas, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "vent",
              data: wind,
              __unit: "km/h",
              __prefix: "Vent: ",
              tension: 0.25,
              pointRadius: 2,
              pointHoverRadius: 6,
              pointHitRadius: 12,
              borderWidth: 2.5,
              fill: true
            },
            {
              label: "ratxa",
              data: gust,
              __unit: "km/h",
              __prefix: "Ratxa: ",
              tension: 0.25,
              pointRadius: 2,
              pointHoverRadius: 6,
              pointHitRadius: 12,
              borderWidth: 2,
              borderDash: [6, 4],
              fill: false
            }
          ]
        },
        options: commonOpts
      });
    }
  }

  function renderCurrent(last) {
    $("temp").textContent = last.temp_c == null ? "—" : fmt1(last.temp_c);
    $("hum").textContent = last.hum_pct == null ? "—" : String(Math.round(last.hum_pct));
    $("wind").textContent = last.wind_kmh == null ? "—" : fmt1(last.wind_kmh);
    $("rainDay").textContent = last.rain_day_mm == null ? "—" : fmt1(last.rain_day_mm);

    if ($("tempSub")) {
      $("tempSub").textContent =
        last.dew_c == null ? "Punt de rosada: —" : `Punt de rosada: ${fmt1(last.dew_c)} °C`;
    }

    // Direcció: graus + símbol + nom de vent català
    let dirTxt = "—";
    if (last.wind_dir != null && last.wind_dir !== "") {
      const deg = Number(last.wind_dir);
      if (!Number.isNaN(deg)) dirTxt = `${deg.toFixed(0)}° (${degToWindCatalan(deg)})`;
    }

    if ($("gustSub")) {
      $("gustSub").textContent =
        last.gust_kmh == null
          ? `Ratxa: — · Dir: ${dirTxt}`
          : `Ratxa: ${fmt1(last.gust_kmh)} km/h · Dir: ${dirTxt}`;
    }

    if ($("rainRateSub")) {
      $("rainRateSub").textContent =
        last.rain_rate_mmh == null
          ? "Intensitat de pluja: —"
          : `Intensitat de pluja: ${fmt1(last.rain_rate_mmh)} mm/h`;
    }

    $("lastUpdated").textContent = `Actualitzat: ${fmtDate(last.ts)}`;
  }

  function renderStatus(rows, hb) {
    const el = $("statusLine");
    if (!el) return;

    const now = Date.now();
    const lastDataTs = rows.length ? rows[rows.length - 1].ts : null;
    const hbTs = hb?.run_ts ? Number(hb.run_ts) : null;

    if (!lastDataTs) {
      el.textContent = "Sense dades (history.json buit o no carregat).";
      return;
    }

    const dataAgeMin = (now - lastDataTs) / 60000;
    const hbAgeMin = hbTs ? (now - hbTs) / 60000 : null;

    let msg = `Dada: fa ${Math.round(dataAgeMin)} min`;
    if (hbAgeMin != null) msg += ` · Workflow: fa ${Math.round(hbAgeMin)} min`;

    if (dataAgeMin > 20) msg += " · ⚠️ Dades antigues (possible aturada o límit).";

    el.textContent = msg;
  }

  async function main() {
    if ($("year")) $("year").textContent = String(new Date().getFullYear());

    let raw = await fetchJson(`${HISTORY_URL}?t=${Date.now()}`);
    if (!Array.isArray(raw)) raw = [];

    const rows = raw
      .map(normalizeRow)
      .filter(r => Number.isFinite(r.ts))
      .sort((a, b) => a.ts - b.ts);

    if (rows.length) renderCurrent(rows[rows.length - 1]);

    let hb = null;
    try { hb = await fetchJson(`${HEARTBEAT_URL}?t=${Date.now()}`); } catch (_) {}

    renderStatus(rows, hb);

    try { buildCharts(rows); } catch (e) { console.warn(e); }
  }

  main().catch(err => {
    console.error(err);
    if ($("lastUpdated")) $("lastUpdated").textContent = "Error carregant dades.";
    if ($("statusLine")) $("statusLine").textContent = String(err);
  });
})();
