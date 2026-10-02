/* WCP License Calculator – UI, Charts, Export */
(function () {
  'use strict';
  const W = window.WCP;
  const STORE_KEY = 'wcp-license-calculator-v1';
  const charts = {};
  let state = load();
  let current = 'markets';
  let mcResult = null;

  // ---------------------------------------------------------------------------
  // Persistenz
  // ---------------------------------------------------------------------------
  function merge(base, saved) {
    if (Array.isArray(base) || Array.isArray(saved)) return saved !== undefined ? saved : base;
    if (base && typeof base === 'object') {
      const out = { ...base };
      if (saved && typeof saved === 'object') {
        Object.keys(saved).forEach(k => { out[k] = k in base ? merge(base[k], saved[k]) : saved[k]; });
      }
      return out;
    }
    return saved !== undefined ? saved : base;
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return merge(W.defaultState(), JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return W.defaultState();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Formatierung
  // ---------------------------------------------------------------------------
  const nf0 = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf4 = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const num = v => nf0.format(Math.round(v || 0));
  const eur = v => nf0.format(Math.round(v || 0)) + ' €';
  const eur2 = v => nf2.format(v || 0) + ' €';
  function eurC(v) {
    v = v || 0;
    const a = Math.abs(v);
    if (a >= 1e9) return nf2.format(v / 1e9) + ' Mrd €';
    if (a >= 1e6) return nf2.format(v / 1e6) + ' Mio €';
    if (a >= 1e4) return nf0.format(v / 1e3) + ' T€';
    return eur(v);
  }
  const pct = (v, d = 1) => (d === 0 ? nf0 : d === 2 ? nf2 : nf1).format(v || 0) + ' %';
  function fmtPrice(v, unit) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '–';
    const s = Math.abs(v) < 1 ? nf4.format(v) : Math.abs(v) < 1000 ? nf2.format(v) : nf0.format(Math.round(v));
    return unit === '%' ? s + ' %' : s + ' €';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------------------------------------------------------------------------
  // Farben (validierte kategoriale Palette, feste Reihenfolge)
  // ---------------------------------------------------------------------------
  const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  const OTHER = '#a9a79f';
  const GRID = '#e1e0d9';
  const AXIS = '#c3c2b7';
  const SURFACE = '#fcfcfb';
  const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
  const SCEN_COLORS = { worst: SERIES[1], realistic: SERIES[0], best: SERIES[2] };
  const marketColor = i => (i < SERIES.length ? SERIES[i] : OTHER);
  function rampColor(t) {
    const i = Math.max(0, Math.min(RAMP.length - 1, Math.round(t * (RAMP.length - 1))));
    return { bg: RAMP[i], fg: i >= 7 ? '#ffffff' : '#0b0b0b' };
  }
  function alpha(hex, a) {
    const v = parseInt(hex.slice(1), 16);
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
  }

  // ---------------------------------------------------------------------------
  // Chart-Helfer
  // ---------------------------------------------------------------------------
  if (window.Chart) {
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#52514e';
    Chart.defaults.animation.duration = 300;
    Chart.defaults.plugins.tooltip.backgroundColor = '#0e1418';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 6;
    Chart.defaults.plugins.tooltip.boxPadding = 4;
  }

  function makeChart(id, config) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    const el = document.getElementById(id);
    if (!el || !window.Chart) return null;
    charts[id] = new Chart(el, config);
    return charts[id];
  }

  function opts({ stacked = false, horizontal = false, money = true, legend = true, mode = 'index', fmt } = {}) {
    const f = fmt || (money ? eurC : num);
    const valueAxis = {
      beginAtZero: true, stacked,
      grid: { color: GRID }, border: { display: false },
      ticks: { callback: v => f(v), maxRotation: 0, autoSkipPadding: 12 }
    };
    const catAxis = { stacked, grid: { display: false }, border: { color: AXIS } };
    return {
      responsive: true, maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode, intersect: false, axis: horizontal ? 'y' : 'x' },
      plugins: {
        legend: { display: legend, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded' } },
        tooltip: {
          callbacks: {
            label: c => `${c.dataset.label ? c.dataset.label + ': ' : ''}${f(horizontal ? c.parsed.x : c.parsed.y)}`
          }
        }
      },
      scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis }
    };
  }
  const barDs = (label, data, color, extra) => Object.assign({
    label, data, backgroundColor: color, borderRadius: 4, borderSkipped: 'start',
    maxBarThickness: 46, categoryPercentage: 0.75, barPercentage: 0.9
  }, extra || {});
  const stackDs = (label, data, color) => ({
    label, data, backgroundColor: color, borderColor: SURFACE, borderWidth: { top: 2 }, borderSkipped: 'start', maxBarThickness: 56
  });
  const lineDs = (label, data, color, extra) => Object.assign({
    label, data, borderColor: color, backgroundColor: color, borderWidth: 2,
    pointRadius: 4, pointHoverRadius: 6, pointBorderColor: SURFACE, pointBorderWidth: 2, tension: 0
  }, extra || {});

  // ---------------------------------------------------------------------------
  // Formular-Helfer
  // ---------------------------------------------------------------------------
  function inp(path, o = {}) {
    const v = W.getPath(state, path);
    const type = o.type || 'number';
    const attrs = [
      `type="${type}"`, `data-bind="${path}"`,
      `value="${type === 'number' ? (v ?? '') : esc(v)}"`,
      type === 'number' ? `step="${o.step || 'any'}"` : '',
      o.min !== undefined ? `min="${o.min}"` : '',
      o.max !== undefined ? `max="${o.max}"` : ''
    ].join(' ');
    return `<input ${attrs}>`;
  }
  function field(label, path, unit, o) {
    return `<label class="field">${label}<div class="input-unit">${inp(path, o)}${unit ? `<span>${unit}</span>` : ''}</div></label>`;
  }
  function chk(label, path) {
    return `<label class="check"><input type="checkbox" data-bind="${path}" ${W.getPath(state, path) ? 'checked' : ''}>${label}</label>`;
  }
  function select(path, options, isNum) {
    const v = W.getPath(state, path);
    return `<select data-bind="${path}" ${isNum ? 'data-num="1"' : ''}>${options.map(([val, lab]) =>
      `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
  }
  function kpi(label, value, hint, accent, text) {
    return `<div class="kpi ${accent ? 'accent' : ''}"><div class="label">${label}</div><div class="value ${text ? 'text' : ''}" title="${esc(value)}">${value}</div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  }
  function pageHead(title, sub, tools) {
    return `<div class="page-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${tools ? `<div class="toolbar">${tools}</div>` : ''}</div>`;
  }
  const modelName = id => (W.MODEL_BY_ID[id] || { name: id }).name;
  function enabledModels() {
    const on = new Set(state.ui.enabledModels);
    const list = W.MODELS.filter(m => on.has(m.id));
    return list.length ? list : W.MODELS;
  }
  function modelOptions(list) { return (list || W.MODELS).map(m => [m.id, m.name]); }
  function horizon() { return state.forecast.horizon || 5; }
  function lastYear() { return state.forecast.startYear + horizon() - 1; }
  function scenarioOptions() { return ['worst', 'realistic', 'best'].map(k => [k, state.scenarios[k].name]); }

  // ---------------------------------------------------------------------------
  // Seite 1 – Märkte
  // ---------------------------------------------------------------------------
  function renderMarkets() {
    const ms = state.markets;
    const sum = k => ms.reduce((s, m) => s + (+m[k] || 0), 0);
    const users = sum('activeUsers') + sum('occasionalUsers');
    const metric = state.ui.marketMetric || 'activeUsers';
    const numericFields = W.MARKET_FIELDS.filter(f => f.type !== 'text');
    const warnings = ms.filter(m => W.totalUsers(m) > m.employees).map(m => esc(m.name));

    const rows = ms.map((m, i) => `<tr>
      <td><span class="swatch" style="background:${marketColor(i)}"></span></td>
      ${W.MARKET_FIELDS.map(f => `<td>${inp(`markets.${i}.${f.key}`, { type: f.type === 'text' ? 'text' : 'number', step: f.step || 1, min: 0 })}</td>`).join('')}
      <td><button class="btn small ghost danger" data-action="remove-market" data-i="${i}" title="Markt entfernen">✕</button></td>
    </tr>`).join('');
    const totals = `<tr class="total"><td></td><td>Gesamt (${ms.length})</td>${numericFields.map(f => {
      if (f.key === 'growth') {
        const w = users ? ms.reduce((s, m) => s + m.growth * W.totalUsers(m), 0) / users : 0;
        return `<td class="num">Ø ${nf1.format(w)}</td>`;
      }
      if (f.key === 'rolloutYear') return `<td class="num">${ms.length ? Math.min(...ms.map(m => m.rolloutYear)) + '–' + Math.max(...ms.map(m => m.rolloutYear)) : ''}</td>`;
      return `<td class="num">${num(sum(f.key))}</td>`;
    }).join('')}<td></td></tr>`;

    document.getElementById('page-markets').innerHTML = `
      ${pageHead('Märkte', 'Stammdaten pro Markt pflegen. Alle Berechnungen, Forecasts und Szenarien bauen auf diesen Werten auf.',
        `<button class="btn" data-action="defaults-markets">Beispielmärkte laden</button><button class="btn primary" data-action="add-market">+ Markt hinzufügen</button>`)}
      <div class="kpis">
        ${kpi('Märkte', num(ms.length), 'im Business Case', true)}
        ${kpi('Standorte', num(sum('sites')), num(sum('workshops')) + ' Werkstätten')}
        ${kpi('Mitarbeiter', num(sum('employees')), num(sum('serviceStaff')) + ' Service · ' + num(sum('salesStaff')) + ' Verkauf')}
        ${kpi('User gesamt', num(users), num(sum('activeUsers')) + ' aktiv · ' + num(sum('occasionalUsers')) + ' gelegentlich')}
        ${kpi('Marktumsatz', eurC(sum('marketRevenue') * 1e6), 'Basis für umsatzbasiertes Modell')}
      </div>
      ${warnings.length ? `<div class="callout">Plausibilität: In ${warnings.join(', ')} übersteigt die Anzahl der User die Mitarbeiterzahl.</div>` : ''}
      <div class="card flush">
        <div class="card-head"><h3>Stammdaten</h3><span class="sub">Änderungen werden sofort übernommen</span></div>
        <div class="table-wrap" style="padding:8px 10px 12px">
          <table class="edit">
            <thead><tr><th></th>${W.MARKET_FIELDS.map(f => `<th class="${f.type === 'text' ? '' : 'num'}">${f.label}</th>`).join('')}<th></th></tr></thead>
            <tbody>${rows}${totals}</tbody>
          </table>
        </div>
      </div>
      <div class="grid grid-2 mt">
        <div class="card">
          <div class="card-head"><h3>Marktvergleich</h3>${select('ui.marketMetric', numericFields.filter(f => f.key !== 'rolloutYear').map(f => [f.key, f.label]))}</div>
          <div class="chart-box"><canvas id="chMarketCompare"></canvas></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>User-Struktur je Markt</h3><span class="sub">aktive vs. gelegentliche User</span></div>
          <div class="chart-box"><canvas id="chUserStruct"></canvas></div>
        </div>
      </div>`;

    const labels = ms.map(m => m.name);
    const isMoney = metric === 'marketRevenue';
    const isPct = metric === 'growth';
    makeChart('chMarketCompare', {
      type: 'bar',
      data: { labels, datasets: [barDs(W.MARKET_FIELDS.find(f => f.key === metric).label, ms.map(m => isMoney ? m[metric] * 1e6 : m[metric]), ms.map((_, i) => marketColor(i)))] },
      options: opts({ legend: false, fmt: isMoney ? eurC : isPct ? (v => pct(v)) : num })
    });
    makeChart('chUserStruct', {
      type: 'bar',
      data: {
        labels, datasets: [
          stackDs('Aktive User', ms.map(m => m.activeUsers), SERIES[0]),
          stackDs('Gelegentliche User', ms.map(m => m.occasionalUsers), RAMP[3])
        ]
      },
      options: opts({ stacked: true, money: false })
    });
  }

  // ---------------------------------------------------------------------------
  // Seite 2 – Lizenzmodelle
  // ---------------------------------------------------------------------------
  function renderModels() {
    const sel = state.ui.selectedModel;
    const on = new Set(state.ui.enabledModels);
    const all = W.MODELS.map(m => ({ model: m, ss: W.steadyState(m.id, state) }));
    const enabled = all.filter(x => on.has(x.model.id));
    const cur = all.find(x => x.model.id === sel) || all[0];
    const ss = cur.ss;
    const heatNorm = state.ui.heatNorm || 'global';

    const cards = all.map(({ model, ss: s }) => `
      <div class="model-card ${model.id === sel ? 'sel' : ''} ${on.has(model.id) ? '' : 'off'}" data-action="select-model" data-id="${model.id}">
        <div class="mc-head"><h3>${model.name}</h3><span class="badge ${model.group === 'Erweitert' ? 'accent' : ''}">${model.group}</span></div>
        <div class="mc-desc">${model.desc}</div>
        <div><div class="mc-value">${eurC(s.annual)}</div><div class="note" style="margin:0">Jahresumsatz (Vollausbau)</div></div>
        <div class="mc-stats">
          <div>Monat<b>${eurC(s.monthly)}</b></div>
          <div>/ Standort<b>${eurC(s.perSite)}</b></div>
          <div>/ User<b>${eur2(s.perUser)}</b></div>
        </div>
      </div>`).join('');

    const partLabels = [];
    ss.perMarket.forEach(pm => pm.parts.forEach(([l]) => { if (!partLabels.includes(l)) partLabels.push(l); }));
    const detailRows = ss.perMarket.map((pm, i) => `<tr>
      <td><span class="swatch" style="background:${marketColor(i)}"></span>${esc(pm.name)}</td>
      <td class="num">${eur(pm.annual)}</td><td class="num">${eur(pm.monthly)}</td>
      <td class="num">${eur(pm.perSite)}</td><td class="num">${eur2(pm.perUser)}</td>
      <td class="num">${num(pm.units.value)}</td>
      <td class="num">${pct(ss.annual ? pm.annual / ss.annual * 100 : 0)}</td></tr>`).join('');

    // Heatmap Markt × Modell
    const hmVals = state.markets.map((m, i) => enabled.map(x => x.ss.perMarket[i].annual));
    const gMax = Math.max(1, ...hmVals.flat());
    const colMax = enabled.map((_, j) => Math.max(1, ...hmVals.map(r => r[j])));
    const hmRows = state.markets.map((m, i) => `<tr><td><span class="swatch" style="background:${marketColor(i)}"></span>${esc(m.name)}</td>${
      hmVals[i].map((v, j) => {
        const c = rampColor(v / (heatNorm === 'global' ? gMax : colMax[j]));
        return `<td class="hm" style="background:${c.bg};color:${c.fg}" title="${esc(m.name)} · ${enabled[j].model.name}: ${eur(v)}">${eurC(v)}</td>`;
      }).join('')}</tr>`).join('');

    document.getElementById('page-models').innerHTML = `
      ${pageHead('Lizenzmodelle', 'Alle Modelle auf Basis der aktuellen Stammdaten im Vollausbau (alle Märkte ausgerollt). Modell anklicken für Details; Chips steuern, welche Modelle in Vergleiche, Szenarien und Management-Auswertungen einfließen.')}
      <div class="card">
        <div class="card-head"><h3>Modelle im Vergleich</h3><span class="sub">${on.size} von ${W.MODELS.length} aktiv</span></div>
        <div class="chips">${W.MODELS.map(m => `<button class="chip ${on.has(m.id) ? 'on' : ''}" data-action="toggle-model" data-id="${m.id}">${m.name}</button>`).join('')}</div>
      </div>
      <div class="model-grid mt">${cards}</div>
      <div class="grid grid-2 mt">
        <div class="card">
          <div class="card-head"><h3>Umsatz je Modell</h3><span class="sub">Jahresumsatz Vollausbau</span></div>
          <div class="chart-box tall"><canvas id="chModels"></canvas></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Umsatzverteilung nach Markt</h3><span class="sub">${cur.model.name}</span></div>
          <div class="chart-box tall"><canvas id="chModelShare"></canvas></div>
        </div>
      </div>
      <div class="card mt flush">
        <div class="card-head"><h3>${cur.model.name} – Umsatz je Markt</h3>
          <div class="toolbar"><span class="sub">Lizenzeinheit: ${esc(ss.perMarket[0] ? ss.perMarket[0].units.label : '')}</span><button class="btn small" data-goto="catalog">Preise bearbeiten →</button></div></div>
        <div class="table-wrap" style="padding:8px 10px 12px"><table>
          <thead><tr><th>Markt</th><th class="num">Jahresumsatz</th><th class="num">Monatsumsatz</th><th class="num">Umsatz / Standort</th><th class="num">Umsatz / User</th><th class="num">Lizenzen</th><th class="num">Anteil</th></tr></thead>
          <tbody>${detailRows}<tr class="total"><td>Gesamt</td><td class="num">${eur(ss.annual)}</td><td class="num">${eur(ss.monthly)}</td><td class="num">${eur(ss.perSite)}</td><td class="num">${eur2(ss.perUser)}</td><td class="num">${num(ss.perMarket.reduce((s, x) => s + x.units.value, 0))}</td><td class="num">100 %</td></tr></tbody>
        </table></div>
      </div>
      <div class="card mt">
        <div class="card-head"><h3>Lizenzverteilung – Umsatzkomponenten je Markt</h3><span class="sub">${cur.model.name}</span></div>
        <div class="chart-box"><canvas id="chParts"></canvas></div>
      </div>
      <div class="card mt flush">
        <div class="card-head"><h3>Heatmap Markt × Modell</h3>
          <div class="seg"><button class="${heatNorm === 'global' ? 'on' : ''}" data-action="heatnorm" data-v="global">Global skaliert</button><button class="${heatNorm === 'column' ? 'on' : ''}" data-action="heatnorm" data-v="column">Je Modell skaliert</button></div></div>
        <div class="table-wrap" style="padding:8px 10px 12px"><table class="heatmap">
          <thead><tr><th>Markt</th>${enabled.map(x => `<th class="num">${x.model.name}</th>`).join('')}</tr></thead>
          <tbody>${hmRows}<tr class="total"><td>Gesamt</td>${enabled.map(x => `<td class="num">${eurC(x.ss.annual)}</td>`).join('')}</tr></tbody>
        </table>
        <div class="legend-scale">niedrig <span class="bar"></span> hoch · Jahresumsatz Vollausbau</div></div>
      </div>`;

    const sorted = enabled.slice().sort((a, b) => b.ss.annual - a.ss.annual);
    makeChart('chModels', {
      type: 'bar',
      data: { labels: sorted.map(x => x.model.name), datasets: [barDs('Jahresumsatz', sorted.map(x => x.ss.annual), sorted.map(x => x.model.id === sel ? SERIES[0] : RAMP[2]))] },
      options: Object.assign(opts({ horizontal: true, legend: false }), {
        onClick: (e, els) => { if (els.length) { state.ui.selectedModel = sorted[els[0].index].model.id; save(); render(); } }
      })
    });
    makeChart('chModelShare', {
      type: 'doughnut',
      data: { labels: ss.perMarket.map(p => p.name), datasets: [{ data: ss.perMarket.map(p => p.annual), backgroundColor: ss.perMarket.map((_, i) => marketColor(i)), borderColor: SURFACE, borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded' } },
          tooltip: { callbacks: { label: c => `${c.label}: ${eurC(c.parsed)} (${pct(ss.annual ? c.parsed / ss.annual * 100 : 0)})` } }
        }
      }
    });
    const partsShown = partLabels.slice(0, 7);
    const partsOther = partLabels.slice(7);
    const partDatasets = partsShown.map((l, k) => stackDs(l, ss.perMarket.map(pm => (pm.parts.find(p => p[0] === l) || [0, 0])[1]), SERIES[k]));
    if (partsOther.length) {
      partDatasets.push(stackDs('Sonstige', ss.perMarket.map(pm => pm.parts.filter(p => partsOther.includes(p[0])).reduce((s, p) => s + p[1], 0)), OTHER));
    }
    makeChart('chParts', {
      type: 'bar',
      data: { labels: ss.perMarket.map(p => p.name), datasets: partDatasets },
      options: opts({ stacked: true, legend: partDatasets.length > 1 })
    });
  }

  // ---------------------------------------------------------------------------
  // Seite 3 – Preiskatalog
  // ---------------------------------------------------------------------------
  const SIMPLE_CATALOG = {
    user: [['user.pricePerUser', 'Preis pro aktivem User', '€ / Monat']],
    named: [['named.pricePerNamed', 'Preis pro Named User', '€ / Monat']],
    concurrent: [['concurrent.ratio', 'Concurrent-Verhältnis', '% der User'], ['concurrent.pricePerConcurrent', 'Preis pro Concurrent User', '€ / Monat']],
    site: [['site.pricePerSite', 'Preis pro Standort', '€ / Monat']],
    workshop: [['workshop.pricePerWorkshop', 'Preis pro Werkstatt', '€ / Monat']],
    enterprise: [['enterprise.flatFee', 'Flat Fee pro Markt', '€ / Jahr']],
    revenue: [['revenue.percent', 'Anteil vom Marktumsatz', '%']],
    freemium: [['freemium.conversion', 'Conversion Free → Premium', '% der User'], ['freemium.premiumPrice', 'Premium-Preis', '€ / User / Monat']]
  };
  const GROUP_CATALOG = {
    hybrid: [
      ['hybrid.useBase', 'Grundgebühr', [['hybrid.baseFee', 'Grundgebühr', '€ / Markt / Jahr']]],
      ['hybrid.useSite', 'Standortgebühr', [['hybrid.sitePrice', 'Standortgebühr', '€ / Monat']]],
      ['hybrid.useUser', 'Userpreis', [['hybrid.userPrice', 'Userpreis (nicht-concurrent)', '€ / Monat']]],
      ['hybrid.useConc', 'Concurrent Anteil', [['hybrid.concShare', 'Anteil User im Pool', '%'], ['hybrid.concRatio', 'Concurrent-Ratio', '%'], ['hybrid.concPrice', 'Preis / Concurrent', '€ / Monat']]]
    ],
    consumption: [
      ['consumption.useLogins', 'Logins', [['consumption.loginsPerUser', 'Logins / User', 'pro Monat'], ['consumption.priceLogin', 'Preis / Login', '€']]],
      ['consumption.useSessions', 'Sessions', [['consumption.sessionsPerUser', 'Sessions / User', 'pro Monat'], ['consumption.priceSession', 'Preis / Session', '€']]],
      ['consumption.useApi', 'API Calls', [['consumption.apiPerSite', 'API Calls / Standort', 'pro Monat'], ['consumption.priceApi1000', 'Preis / 1.000 Calls', '€']]],
      ['consumption.useAi', 'AI Requests', [['consumption.aiPerActiveUser', 'AI Requests / aktiver User', 'pro Monat'], ['consumption.priceAi', 'Preis / Request', '€']]]
    ],
    transaction: [
      ['transaction.useOrders', 'Auftrag', [['transaction.ordersPerSales', 'Aufträge / Verkäufer', 'pro Monat'], ['transaction.priceOrder', 'Preis / Auftrag', '€']]],
      ['transaction.useWorkOrders', 'Werkstattauftrag', [['transaction.workOrdersPerService', 'Aufträge / Service-MA', 'pro Monat'], ['transaction.priceWorkOrder', 'Preis / Werkstattauftrag', '€']]],
      ['transaction.useVehicles', 'Fahrzeug', [['transaction.vehiclesPerSite', 'Fahrzeuge / Standort', 'pro Monat'], ['transaction.priceVehicle', 'Preis / Fahrzeug', '€']]],
      ['transaction.useInvoices', 'Rechnung', [['transaction.invoicesPerSite', 'Rechnungen / Standort', 'pro Monat'], ['transaction.priceInvoice', 'Preis / Rechnung', '€']]]
    ]
  };

  function catalogCard(model, body) {
    const ss = W.steadyState(model.id, state);
    return `<div class="card catalog-card" id="cat-${model.id}">
      <div class="card-head"><h3>${model.name}</h3><span class="badge ${model.group === 'Erweitert' ? 'accent' : ''}">${model.group}</span></div>
      <p class="note" style="margin:0 0 12px">${model.desc}</p>
      ${body}
      <div class="result"><span>Jahresumsatz Vollausbau</span><b>${eur(ss.annual)}</b></div>
      <div class="result" style="border:0;margin-top:2px;padding-top:0"><span>pro User / Monat</span><b>${eur2(ss.perUser / 12)}</b></div>
    </div>`;
  }

  function itemTable(modelId, withUnits) {
    const items = state.prices[modelId].items;
    return `<div class="table-wrap"><table class="edit"><thead><tr><th></th><th>Modul</th><th>Basis</th>${withUnits ? '<th class="num">Einheiten / Standort</th>' : ''}<th class="num">Preis €</th><th class="num">Adoption %</th></tr></thead><tbody>
      ${items.map((it, i) => `<tr>
        <td><input type="checkbox" data-bind="prices.${modelId}.items.${i}.enabled" ${it.enabled ? 'checked' : ''}></td>
        <td>${esc(it.name)}</td>
        <td>${select(`prices.${modelId}.items.${i}.basis`, [['user', 'aktiver User'], ['site', 'Standort']].concat(withUnits ? [['unit', 'Einheit']] : []))}</td>
        ${withUnits ? `<td>${it.basis === 'unit' ? inp(`prices.${modelId}.items.${i}.units`, { min: 0 }) : '<span class="note">–</span>'}</td>` : ''}
        <td>${inp(`prices.${modelId}.items.${i}.price`, { min: 0 })}</td>
        <td>${inp(`prices.${modelId}.items.${i}.adoption`, { min: 0, max: 100 })}</td>
      </tr>`).join('')}</tbody></table></div>
      <p class="note">Preise pro Monat je ${withUnits ? 'aktivem User, Standort bzw. Einheit (z. B. Automatisierungslauf, Dokument)' : 'aktivem User bzw. Standort'}; Adoption = Anteil der Basis, der das Modul nutzt.</p>`;
  }

  function renderCatalog() {
    const cards = W.MODELS.map(model => {
      let body = '';
      if (SIMPLE_CATALOG[model.id]) {
        body = `<div class="field-row">${SIMPLE_CATALOG[model.id].map(([p, l, u]) => field(l, 'prices.' + p, u, { min: 0 })).join('')}</div>`;
      } else if (GROUP_CATALOG[model.id]) {
        body = GROUP_CATALOG[model.id].map(([flag, label, fields]) => `
          <div class="subgroup" style="grid-template-columns:150px repeat(${fields.length}, minmax(0,1fr))">
            ${chk(label, 'prices.' + flag)}
            ${fields.map(([p, l, u]) => field(l, 'prices.' + p, u, { min: 0 })).join('')}
          </div>`).join('');
      } else if (model.id === 'tier') {
        const tiers = state.markets.map(m => `${esc(m.name)}: <b>${({ small: 'Small', medium: 'Medium', enterprise: 'Enterprise' })[W.tierOf(W.totalUsers(m), state.prices.tier)]}</b>`).join(' · ');
        body = `<div class="field-row">
            ${field('Small bis', 'prices.tier.smallMax', 'User', { min: 0, step: 1 })}
            ${field('Medium bis', 'prices.tier.mediumMax', 'User', { min: 0, step: 1 })}
          </div>
          <div class="table-wrap mt"><table class="edit"><thead><tr><th>Tier</th><th class="num">Grundgebühr € / Jahr</th><th class="num">Preis € / User / Monat</th></tr></thead><tbody>
            <tr><td>Small</td><td>${inp('prices.tier.smallBase', { min: 0 })}</td><td>${inp('prices.tier.smallUser', { min: 0 })}</td></tr>
            <tr><td>Medium</td><td>${inp('prices.tier.mediumBase', { min: 0 })}</td><td>${inp('prices.tier.mediumUser', { min: 0 })}</td></tr>
            <tr><td>Enterprise</td><td>${inp('prices.tier.entBase', { min: 0 })}</td><td>${inp('prices.tier.entUser', { min: 0 })}</td></tr>
          </tbody></table></div>
          <p class="note">Einstufung nach User gesamt je Markt – ${tiers}</p>`;
      } else if (model.id === 'modules') {
        body = itemTable('modules', false);
      } else if (model.id === 'ai') {
        body = itemTable('ai', true);
      }
      return catalogCard(model, body);
    }).join('');

    const c = state.costs;
    document.getElementById('page-catalog').innerHTML = `
      ${pageHead('Preiskatalog', 'Preise und Parameter je Lizenzmodell. Alle Monatspreise werden ×12 auf den Jahresumsatz hochgerechnet. Die Kostenbasis wird für Break-Even und Profitabilität verwendet.',
        `<select id="catJump">${modelOptions().map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`)}
      <div class="card">
        <div class="card-head"><h3>Kostenbasis (Break-Even)</h3><span class="sub">Annahmen für Plattform, Rollout und Betrieb</span></div>
        <div class="field-row">
          ${field('Plattform einmalig', 'costs.platformOneTime', '€', { min: 0 })}
          ${field('Rollout pro Markt (einmalig)', 'costs.rolloutPerMarket', '€', { min: 0 })}
          ${field('Betrieb pro User', 'costs.runPerUserYear', '€ / Jahr', { min: 0 })}
          ${field('Betrieb pro Markt', 'costs.runPerMarketYear', '€ / Jahr', { min: 0 })}
        </div>
        <p class="note">Plattformkosten fallen im Startjahr ${state.forecast.startYear} an, Rolloutkosten im jeweiligen Rollout-Jahr des Markts.</p>
      </div>
      <div class="catalog-grid mt">${cards}</div>`;

    const jump = document.getElementById('catJump');
    jump.addEventListener('change', () => {
      const el = document.getElementById('cat-' + jump.value);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ---------------------------------------------------------------------------
  // Seite 4 – Forecast
  // ---------------------------------------------------------------------------
  function renderForecast() {
    const fc = state.forecast;
    const sel = state.ui.selectedModel;
    const scKey = state.ui.forecastScenario || 'realistic';
    const f = W.forecast(sel, state, state.scenarios[scKey]);
    const H = f.years.length;
    const firstFull = f.total.find(v => v > 0) || 0;
    const firstIdx = f.total.findIndex(v => v > 0);
    const cagr = H > 1 && firstFull > 0 && firstIdx < H - 1 ? (Math.pow(f.total[H - 1] / firstFull, 1 / (H - 1 - firstIdx)) - 1) * 100 : null;
    const models = enabledModels();
    const allF = models.map(m => ({ model: m, f: W.forecast(m.id, state, state.scenarios[scKey]) }));

    const mRows = state.markets.map((m, i) => `<tr><td><span class="swatch" style="background:${marketColor(i)}"></span>${esc(m.name)}</td><td class="num">${m.rolloutYear}</td>${f.byMarket[i].map(v => `<td class="num">${v ? eur(v) : '<span class="note">–</span>'}</td>`).join('')}<td class="num"><b>${eur(f.byMarket[i].reduce((s, v) => s + v, 0))}</b></td></tr>`).join('');
    const modelRows = allF.map(({ model, f: g }) => `<tr class="${model.id === sel ? 'sel' : ''}" style="cursor:pointer" data-action="select-model" data-id="${model.id}"><td>${model.name}</td>${g.total.map(v => `<td class="num">${eurC(v)}</td>`).join('')}<td class="num"><b>${eurC(g.cumulative[H - 1])}</b></td><td class="num">${g.breakEven || `<span class="badge bad">&gt; ${lastYear()}</span>`}</td></tr>`).join('');

    document.getElementById('page-forecast').innerHTML = `
      ${pageHead('Forecast', 'Hochrechnung über 1, 3 oder 5 Jahre unter Berücksichtigung von Marktwachstum, neuen Standorten, neuen Usern, Preissteigerungen und Rollout-Jahren.',
        `<div class="seg">${[1, 3, 5].map(h => `<button class="${fc.horizon === h ? 'on' : ''}" data-action="horizon" data-h="${h}">${h} ${h === 1 ? 'Jahr' : 'Jahre'}</button>`).join('')}</div>`)}
      <div class="card">
        <div class="card-head"><h3>Forecast-Parameter</h3><span class="sub">gelten für alle Modelle</span></div>
        <div class="field-row">
          <label class="field">Lizenzmodell${select('ui.selectedModel', modelOptions())}</label>
          <label class="field">Szenario${select('ui.forecastScenario', scenarioOptions())}</label>
          ${field('Startjahr', 'forecast.startYear', '', { step: 1 })}
          ${field('Preissteigerung', 'forecast.priceIncrease', '% p.a.', { step: 0.1 })}
          ${field('Neue Standorte', 'forecast.newSites', '% p.a.', { step: 0.1 })}
          ${field('Neue User (zusätzl. zum Wachstum)', 'forecast.newUsers', '% p.a.', { step: 0.1 })}
          ${field('Adoption im Rollout-Jahr', 'forecast.firstYearAdoption', '%', { min: 0, max: 100 })}
        </div>
        <p class="note">User und Mitarbeiter wachsen mit der Marktwachstumsrate (Stammdaten) plus „Neue User“; Standorte/Werkstätten mit „Neue Standorte“. Im Rollout-Jahr wird nur die eingestellte Adoption realisiert. Preissteigerung gilt nicht für das umsatzbasierte Modell (wächst mit dem Marktumsatz).</p>
      </div>
      <div class="kpis mt">
        ${kpi(`Umsatz ${f.years[0]}`, eurC(f.total[0]), modelName(sel), true)}
        ${kpi(`Umsatz ${f.years[H - 1]}`, eurC(f.total[H - 1]), eurC(f.total[H - 1] / 12) + ' / Monat')}
        ${kpi(`Kumuliert ${H} ${H === 1 ? 'Jahr' : 'Jahre'}`, eurC(f.cumulative[H - 1]), state.scenarios[scKey].name)}
        ${kpi('CAGR', cagr === null ? '–' : pct(cagr), 'ab erstem Umsatzjahr')}
        ${kpi('Break-Even', f.breakEven ? String(f.breakEven) : `> ${lastYear()}`, 'kumulierter Gewinn ≥ 0')}
      </div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h3>Forecast-Entwicklung je Markt</h3><span class="sub">${modelName(sel)}</span></div><div class="chart-box tall"><canvas id="chFc"></canvas></div></div>
        <div class="card"><div class="card-head"><h3>Umsatz vs. Kosten</h3><span class="sub">jährlich</span></div><div class="chart-box tall"><canvas id="chFcCost"></canvas></div></div>
      </div>
      <div class="card mt flush">
        <div class="card-head"><h3>Umsatz je Markt und Jahr</h3><span class="sub">${modelName(sel)} · ${state.scenarios[scKey].name}</span></div>
        <div class="table-wrap" style="padding:8px 10px 12px"><table>
          <thead><tr><th>Markt</th><th class="num">Rollout</th>${f.years.map(y => `<th class="num">${y}</th>`).join('')}<th class="num">Summe</th></tr></thead>
          <tbody>${mRows}
            <tr class="total"><td>Gesamt</td><td></td>${f.total.map(v => `<td class="num">${eur(v)}</td>`).join('')}<td class="num">${eur(f.cumulative[H - 1])}</td></tr>
            <tr><td>Kosten</td><td></td>${f.cost.map(v => `<td class="num">${eur(v)}</td>`).join('')}<td class="num">${eur(f.cost.reduce((s, v) => s + v, 0))}</td></tr>
            <tr><td>Ergebnis kumuliert</td><td></td>${f.cumProfit.map(v => `<td class="num ${v < 0 ? 'delta-down' : 'delta-up'}">${eur(v)}</td>`).join('')}<td></td></tr>
          </tbody></table></div>
      </div>
      <div class="card mt flush">
        <div class="card-head"><h3>Alle Modelle im Forecast</h3><span class="sub">Zeile anklicken, um Modell auszuwählen</span></div>
        <div class="table-wrap" style="padding:8px 10px 12px"><table>
          <thead><tr><th>Modell</th>${f.years.map(y => `<th class="num">${y}</th>`).join('')}<th class="num">Kumuliert</th><th class="num">Break-Even</th></tr></thead>
          <tbody>${modelRows}</tbody></table></div>
      </div>`;

    makeChart('chFc', {
      type: 'bar',
      data: { labels: f.years, datasets: state.markets.map((m, i) => stackDs(m.name, f.byMarket[i], marketColor(i))) },
      options: opts({ stacked: true })
    });
    makeChart('chFcCost', {
      type: 'line',
      data: { labels: f.years, datasets: [lineDs('Umsatz', f.total, SERIES[0]), lineDs('Kosten', f.cost, SERIES[1])] },
      options: opts()
    });
  }

  // ---------------------------------------------------------------------------
  // Seite 5 – Szenarien
  // ---------------------------------------------------------------------------
  function renderScenarios() {
    const sel = state.ui.selectedModel;
    const models = enabledModels();
    const summary = W.scenarioSummary(state, models.map(m => m.id));
    const H = horizon();
    const selSum = W.scenarioSummary(state, [sel])[0];
    const keys = ['worst', 'realistic', 'best'];

    const scCard = k => {
      const s = state.scenarios[k];
      return `<div class="card">
        <div class="card-head"><h3><span class="swatch" style="background:${SCEN_COLORS[k]}"></span>${s.name}</h3><span class="sub">${modelName(sel)}: ${eurC(selSum[k].cumulative[H - 1])}</span></div>
        <div class="field-row" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
          ${field('Volumen-Faktor', `scenarios.${k}.volume`, '×', { step: 0.01, min: 0 })}
          ${field('Wachstum Δ', `scenarios.${k}.growthDelta`, 'pp', { step: 0.1 })}
          ${field('Preissteigerung Δ', `scenarios.${k}.priceDelta`, 'pp', { step: 0.1 })}
          ${field('Rollout-Verzögerung', `scenarios.${k}.rolloutDelay`, 'Jahre', { step: 1, min: 0 })}
          ${field('Adoption Δ (Rollout-Jahr)', `scenarios.${k}.adoptionDelta`, 'pp', { step: 1 })}
        </div>
      </div>`;
    };

    const rows = summary.map(s => {
      const w = s.worst.cumulative[H - 1], r = s.realistic.cumulative[H - 1], b = s.best.cumulative[H - 1];
      return `<tr class="${s.model.id === sel ? 'sel' : ''}" style="cursor:pointer" data-action="select-model" data-id="${s.model.id}">
        <td>${s.model.name}</td>
        <td class="num">${eurC(w)}</td><td class="num"><b>${eurC(r)}</b></td><td class="num">${eurC(b)}</td>
        <td class="num">${eurC(b - w)}</td><td class="num">${pct(r ? (b - w) / r * 100 : 0, 0)}</td>
        ${keys.map(k => `<td class="num">${s[k].breakEven || '–'}</td>`).join('')}
      </tr>`;
    }).join('');

    document.getElementById('page-scenarios').innerHTML = `
      ${pageHead('Szenarien', `Best, Realistic und Worst Case nebeneinander – kumulierter Umsatz über ${H} ${H === 1 ? 'Jahr' : 'Jahre'} (${state.forecast.startYear}–${lastYear()}).`,
        `<label class="field" style="min-width:220px">Modell für Detailansicht${select('ui.selectedModel', modelOptions())}</label>`)}
      <div class="grid grid-3">${keys.map(scCard).join('')}</div>
      <div class="grid grid-2 mt">
        <div class="card"><div class="card-head"><h3>Szenarien im Zeitverlauf</h3><span class="sub">${modelName(sel)} · Jahresumsatz</span></div><div class="chart-box tall"><canvas id="chScLine"></canvas></div></div>
        <div class="card"><div class="card-head"><h3>Modelle × Szenarien</h3><span class="sub">kumuliert ${state.forecast.startYear}–${lastYear()}</span></div><div class="chart-box tall"><canvas id="chScBars"></canvas></div></div>
      </div>
      <div class="card mt flush">
        <div class="card-head"><h3>Vergleich aller Varianten</h3><span class="sub">kumulierter Umsatz · Break-Even-Jahr</span></div>
        <div class="table-wrap" style="padding:8px 10px 12px"><table>
          <thead><tr><th>Modell</th><th class="num">Worst</th><th class="num">Realistic</th><th class="num">Best</th><th class="num">Bandbreite</th><th class="num">Spread</th><th class="num">BE Worst</th><th class="num">BE Realistic</th><th class="num">BE Best</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>`;

    makeChart('chScLine', {
      type: 'line',
      data: { labels: selSum.realistic.years, datasets: keys.map(k => lineDs(state.scenarios[k].name, selSum[k].total, SCEN_COLORS[k])) },
      options: opts()
    });
    makeChart('chScBars', {
      type: 'bar',
      data: { labels: summary.map(s => s.model.name), datasets: keys.map(k => barDs(state.scenarios[k].name, summary.map(s => s[k].cumulative[H - 1]), SCEN_COLORS[k], { maxBarThickness: 18 })) },
      options: opts({ horizontal: true })
    });
  }

  // ---------------------------------------------------------------------------
  // Seite 6 – Management Dashboard
  // ---------------------------------------------------------------------------
  function renderManagement() {
    const models = enabledModels();
    const rank = W.ranking(state, models.map(m => m.id));
    const top = rank[0];
    const H = horizon();
    const byProfit = rank.slice().sort((a, b) => b.profit - a.profit);
    const potential = rank.slice().sort((a, b) => b.bestRev - a.bestRev)[0];
    const sensModel = state.ui.sensModel && W.MODEL_BY_ID[state.ui.sensModel] ? state.ui.sensModel : top.model.id;
    const sensPct = state.ui.sensPct || 20;
    const sens = W.sensitivity(sensModel, state, sensPct);
    const gridSteps = [-20, -10, 0, 10, 20];
    const grid = W.sensitivityGrid(sensModel, state, gridSteps);
    const gMin = Math.min(...grid.flat()), gMax = Math.max(...grid.flat());
    const potSum = W.scenarioSummary(state, [top.model.id])[0];

    const reasons = [];
    if (top.scores.revenue > 0.9) reasons.push('sehr hohes Umsatzpotenzial');
    if (top.scores.robustness > 0.7) reasons.push('robust über alle Szenarien');
    if (top.breakEven && top.breakEven <= state.forecast.startYear + 2) reasons.push(`früher Break-Even (${top.breakEven})`);
    if (top.scores.fairness > 0.8) reasons.push('faire Preisverteilung über Märkte');
    if (top.scores.simplicity >= 0.8) reasons.push('einfach zu vertreiben und abzurechnen');
    if (!reasons.length) reasons.push('bester Gesamt-Score aus Umsatz, Robustheit, Break-Even, Fairness und Einfachheit');

    const scoreBar = (label, v) => `<div class="score-bar"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.round(v * 100)}%"></div></div><span class="v">${Math.round(v * 100)}</span></div>`;

    const topRows = byProfit.slice(0, 5).map((r, i) => `<tr><td>${i + 1}. ${r.model.name}</td><td class="num">${eurC(r.revenue)}</td><td class="num ${r.profit < 0 ? 'delta-down' : 'delta-up'}">${eurC(r.profit)}</td><td class="num">${pct(r.margin * 100)}</td></tr>`).join('');
    const beRows = rank.map(r => {
      const costSum = r.forecast.cost.reduce((s, v) => s + v, 0);
      const be = r.breakEven ? `<span class="badge ${r.breakEven <= state.forecast.startYear + 2 ? 'good' : 'warn'}">${r.breakEven}</span>` : `<span class="badge bad">&gt; ${lastYear()}</span>`;
      return `<tr class="${r === top ? 'sel' : ''}"><td>${r.model.name}</td><td class="num">${eurC(r.revenue)}</td><td class="num">${eurC(costSum)}</td><td class="num ${r.profit < 0 ? 'delta-down' : 'delta-up'}">${eurC(r.profit)}</td><td class="num">${pct(r.margin * 100)}</td><td class="num">${be}</td><td class="num"><b>${nf1.format(r.score)}</b></td></tr>`;
    }).join('');
    const gridRows = gridSteps.slice().reverse().map(vol => {
      const i = gridSteps.indexOf(vol);
      return `<tr><th class="num">${vol > 0 ? '+' : ''}${vol} %</th>${grid[i].map((v, j) => {
        const c = rampColor(gMax > gMin ? (v - gMin) / (gMax - gMin) : 0.5);
        return `<td class="hm" style="background:${c.bg};color:${c.fg}" title="Volumen ${vol} %, Preis ${gridSteps[j]} %: ${eur(v)}">${eurC(v)}</td>`;
      }).join('')}</tr>`;
    }).join('');

    document.getElementById('page-management').innerHTML = `
      ${pageHead('Management Dashboard', `Entscheidungsgrundlage: Profitabilität, Umsatzpotenzial, Break-Even und Empfehlung (Realistic Case, ${state.forecast.startYear}–${lastYear()}).`)}
      <div class="kpis">
        ${kpi('Empfohlenes Modell', top.model.name, `Score ${nf1.format(top.score)} / 100`, true, true)}
        ${kpi(`Umsatz ${lastYear()}`, eurC(top.forecast.total[H - 1]), top.model.name)}
        ${kpi(`Kumuliert ${H} J.`, eurC(top.revenue), `Ergebnis ${eurC(top.profit)}`)}
        ${kpi('Break-Even', top.breakEven ? String(top.breakEven) : `> ${lastYear()}`, top.model.name)}
        ${kpi('Max. Umsatzpotenzial', eurC(potential.bestRev), `${potential.model.name} · Best Case`)}
        ${kpi('Profitabelstes Modell', byProfit[0].model.name, `Ergebnis ${eurC(byProfit[0].profit)}`, false, true)}
      </div>
      <div class="grid grid-2">
        <div class="reco">
          <div class="label">Empfohlenes Lizenzmodell</div>
          <div class="name">${top.model.name}</div>
          <div class="why">${top.model.desc} Begründung: ${reasons.join(', ')}.</div>
          <div class="score-bars">
            ${scoreBar('Umsatz (35 %)', top.scores.revenue)}
            ${scoreBar('Robustheit (20 %)', top.scores.robustness)}
            ${scoreBar('Break-Even (15 %)', top.scores.breakEven)}
            ${scoreBar('Fairness (15 %)', top.scores.fairness)}
            ${scoreBar('Einfachheit (15 %)', top.scores.simplicity)}
          </div>
          <p class="note" style="color:#aab5bb">Alternativen: ${rank.slice(1, 3).map(r => `${r.model.name} (${nf1.format(r.score)})`).join(', ')}</p>
        </div>
        <div class="card flush">
          <div class="card-head"><h3>Top 5 profitabelste Modelle</h3><span class="sub">kumuliertes Ergebnis ${H} J.</span></div>
          <div class="table-wrap" style="padding:8px 10px 12px"><table>
            <thead><tr><th>Modell</th><th class="num">Umsatz</th><th class="num">Ergebnis</th><th class="num">Marge</th></tr></thead>
            <tbody>${topRows}</tbody></table></div>
          <div class="chart-box short" style="margin:0 14px 14px"><canvas id="chTopProfit"></canvas></div>
        </div>
      </div>
      <div class="grid grid-2 mt">
        <div class="card"><div class="card-head"><h3>Break-Even-Verlauf</h3><span class="sub">kumuliertes Ergebnis, Top 4 nach Ergebnis</span></div><div class="chart-box"><canvas id="chBreakEven"></canvas></div></div>
        <div class="card"><div class="card-head"><h3>Umsatzpotenzial je Markt</h3><span class="sub">${top.model.name} · Jahresumsatz ${lastYear()}</span></div><div class="chart-box"><canvas id="chPotential"></canvas></div></div>
      </div>
      <div class="card mt flush">
        <div class="card-head"><h3>Break-Even-Übersicht & Ranking</h3><span class="sub">Score = 35 % Umsatz · 20 % Robustheit · 15 % Break-Even · 15 % Fairness · 15 % Einfachheit</span></div>
        <div class="table-wrap" style="padding:8px 10px 12px"><table>
          <thead><tr><th>Modell</th><th class="num">Umsatz kum.</th><th class="num">Kosten kum.</th><th class="num">Ergebnis</th><th class="num">Marge</th><th class="num">Break-Even</th><th class="num">Score</th></tr></thead>
          <tbody>${beRows}</tbody></table></div>
      </div>
      <div class="card mt">
        <div class="card-head"><h3>Sensitivitätsanalyse</h3>
          <div class="toolbar">
            <select data-bind="ui.sensModel">${modelOptions(models).map(([v, l]) => `<option value="${v}" ${v === sensModel ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
            <div class="seg">${[10, 20, 30].map(p => `<button class="${sensPct === p ? 'on' : ''}" data-action="sens-pct" data-v="${p}">±${p} %</button>`).join('')}</div>
          </div></div>
        <div class="grid grid-2">
          <div>
            <h4>Tornado – Einfluss auf kumulierten Umsatz (Basis ${eurC(sens.base)})</h4>
            <div class="chart-box tall"><canvas id="chTornado"></canvas></div>
          </div>
          <div>
            <h4>Heatmap Preis × Volumen (User, Standorte, Personal)</h4>
            <div class="table-wrap mt"><table class="heatmap">
              <thead><tr><th class="num">Volumen ↓ / Preis →</th>${gridSteps.map(s => `<th class="num">${s > 0 ? '+' : ''}${s} %</th>`).join('')}</tr></thead>
              <tbody>${gridRows}</tbody></table></div>
            <div class="legend-scale">niedrig <span class="bar"></span> hoch · kumulierter Umsatz ${H} J.</div>
          </div>
        </div>
      </div>`;

    makeChart('chTopProfit', {
      type: 'bar',
      data: { labels: byProfit.slice(0, 5).map(r => r.model.name), datasets: [barDs('Ergebnis', byProfit.slice(0, 5).map(r => r.profit), SERIES[0])] },
      options: opts({ horizontal: true, legend: false })
    });
    const top4 = byProfit.slice(0, 4);
    makeChart('chBreakEven', {
      type: 'line',
      data: { labels: top.forecast.years, datasets: top4.map((r, i) => lineDs(r.model.name, r.forecast.cumProfit, SERIES[i])) },
      options: (() => { const o = opts(); o.scales.y.beginAtZero = false; o.scales.y.grid.color = c => (c.tick && c.tick.value === 0 ? '#52514e' : GRID); return o; })()
    });
    makeChart('chPotential', {
      type: 'bar',
      data: { labels: state.markets.map(m => m.name), datasets: ['worst', 'realistic', 'best'].map(k => barDs(state.scenarios[k].name, potSum[k].byMarket.map(a => a[H - 1]), SCEN_COLORS[k], { maxBarThickness: 16 })) },
      options: opts()
    });
    const sr = sens.rows;
    makeChart('chTornado', {
      type: 'bar',
      data: {
        labels: sr.map(r => r.label),
        datasets: [
          barDs(`−${sensPct} %`, sr.map(r => r.lowPct), SERIES[1], { borderSkipped: false, maxBarThickness: 20, grouped: false }),
          barDs(`+${sensPct} %`, sr.map(r => r.highPct), SERIES[0], { borderSkipped: false, maxBarThickness: 20, grouped: false })
        ]
      },
      options: (() => {
        const o = opts({ horizontal: true, fmt: v => (v > 0 ? '+' : '') + nf1.format(v) + ' %' });
        o.scales.x.beginAtZero = false;
        return o;
      })()
    });
  }

  // ---------------------------------------------------------------------------
  // Bonus – Pricing Optimizer & Monte Carlo
  // ---------------------------------------------------------------------------
  function renderOptimizer() {
    const o = state.optimizer;
    const target = (+o.targetMio || 0) * 1e6;
    const H = horizon();
    const refOptions = [['full', 'Vollausbau (aktuelle Stammdaten)']].concat(
      Array.from({ length: H }, (_, t) => [String(t), `Forecast-Jahr ${state.forecast.startYear + t} (Realistic)`]));
    if (o.reference !== 'full' && +o.reference >= H) o.reference = 'full';
    const res = W.optimize(state, target, o.reference);
    const get = (id, path) => {
      const r = res.find(x => x.model.id === id);
      const k = r && r.keys.find(x => x.path === path);
      return k ? k : null;
    };
    const hl = [
      ['user', 'user.pricePerUser', 'Benötigter Userpreis', '/ aktiver User / Monat'],
      ['named', 'named.pricePerNamed', 'Benötigter Named-User-Preis', '/ Named User / Monat'],
      ['concurrent', 'concurrent.pricePerConcurrent', 'Benötigter Concurrent-Preis', '/ Concurrent / Monat'],
      ['site', 'site.pricePerSite', 'Benötigter Standortpreis', '/ Standort / Monat'],
      ['workshop', 'workshop.pricePerWorkshop', 'Benötigter Werkstattpreis', '/ Werkstatt / Monat'],
      ['enterprise', 'enterprise.flatFee', 'Benötigte Flat Fee', '/ Markt / Jahr']
    ].map(([id, path, label, unit]) => {
      const k = get(id, path);
      if (!k) return '';
      const d = k.current ? (k.single - k.current) / k.current * 100 : 0;
      return kpi(label, fmtPrice(k.single, k.unit), `${unit} · aktuell ${fmtPrice(k.current, k.unit)} <span class="${d >= 0 ? 'delta-up' : 'delta-down'}">(${d >= 0 ? '+' : ''}${nf1.format(d)} %)</span>`);
    }).join('');

    const rows = res.map(r => {
      const gap = target - r.current;
      const keys = r.keys.length ? r.keys : [{ label: '–', current: null, scaled: null, single: null }];
      return keys.map((k, i) => `<tr>
        ${i === 0 ? `<td rowspan="${keys.length}"><b>${r.model.name}</b></td>
          <td rowspan="${keys.length}" class="num">${eurC(r.current)}</td>
          <td rowspan="${keys.length}" class="num ${gap >= 0 ? 'delta-down' : 'delta-up'}">${gap >= 0 ? '+' : ''}${eurC(gap)}</td>
          <td rowspan="${keys.length}" class="num">${r.factor === null ? '–' : '×' + nf2.format(r.factor)}</td>` : ''}
        <td>${k.label}</td>
        <td class="num">${fmtPrice(k.current, k.unit)}</td>
        <td class="num"><b>${fmtPrice(k.scaled, k.unit)}</b></td>
        <td class="num">${k.single === null || k.single === undefined ? '–' : k.single < 0 ? '<span class="badge good">Ziel bereits erreicht</span>' : fmtPrice(k.single, k.unit)}</td>
        ${i === 0 ? `<td rowspan="${keys.length}">${r.factor ? `<button class="btn small" data-action="apply-opt" data-id="${r.model.id}" data-f="${r.factor}">Übernehmen</button>` : ''}</td>` : ''}
      </tr>`).join('');
    }).join('');

    const mc = state.monteCarlo;
    const mcr = mcResult && mcResult.model === mc.model ? mcResult : null;

    document.getElementById('page-optimizer').innerHTML = `
      ${pageHead('Pricing Optimizer', 'Umsatzziel vorgeben – das System berechnet die benötigten Preise je Lizenzmodell. Dazu Monte-Carlo-Simulation für Umsatzprognosen mit Risikobetrachtung.')}
      <div class="card">
        <div class="card-head"><h3>Umsatzziel</h3><span class="sub">jährlich, alle Märkte</span></div>
        <div class="field-row">
          ${field('Gewünschter Jahresumsatz', 'optimizer.targetMio', 'Mio €', { step: 0.1, min: 0 })}
          <label class="field">Bezugsbasis${select('optimizer.reference', refOptions)}</label>
        </div>
        <p class="note">„Alle Preise skaliert“ = alle Preishebel des Modells proportional angepasst. „Nur dieser Hebel“ = nur dieser Preis wird verändert, alle anderen bleiben wie im Preiskatalog. „Übernehmen“ schreibt die skalierten Preise in den Preiskatalog.</p>
      </div>
      <div class="opt-highlight mt">${hl}</div>
      <div class="card flush opt-table">
        <div class="card-head"><h3>Benötigte Preise je Lizenzmodell für ${eurC(target)} p.a.</h3></div>
        <div class="table-wrap" style="padding:8px 10px 12px"><table>
          <thead><tr><th>Modell</th><th class="num">Aktuell</th><th class="num">Lücke</th><th class="num">Faktor</th><th>Preishebel</th><th class="num">Aktueller Preis</th><th class="num">Alle Preise skaliert</th><th class="num">Nur dieser Hebel</th><th></th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>

      <div class="page-head mt-lg"><div><h2>Monte-Carlo-Simulation</h2><p>Zufällige Variation von Volumen (Dreiecksverteilung zwischen Worst- und Best-Case-Faktor), Wachstum, Preissteigerung, Adoption und Rollout-Verzögerungen je Markt.</p></div></div>
      <div class="card">
        <div class="field-row">
          <label class="field">Lizenzmodell${select('monteCarlo.model', modelOptions())}</label>
          ${field('Simulationsläufe', 'monteCarlo.runs', '', { step: 500, min: 100, max: 20000 })}
          ${field('Wachstum σ', 'monteCarlo.growthSd', 'pp', { step: 0.1, min: 0 })}
          ${field('Preissteigerung σ', 'monteCarlo.priceSd', 'pp', { step: 0.1, min: 0 })}
          ${field('Risiko Rollout-Verzögerung', 'monteCarlo.delayProb', '% je Markt', { step: 1, min: 0, max: 100 })}
          <label class="field">&nbsp;<button class="btn primary" data-action="run-mc">▶ Simulation starten</button></label>
        </div>
      </div>
      ${mcr ? `
      <div class="kpis mt">
        ${kpi('P50 (Median)', eurC(mcr.p50), `kumuliert ${H} J.`, true)}
        ${kpi('P10 – P90', `${nf2.format(mcr.p10 / 1e6)}–${nf2.format(mcr.p90 / 1e6)} Mio`, '80 %-Konfidenzband')}
        ${kpi('Erwartungswert', eurC(mcr.mean), `σ ${eurC(mcr.sd)} · CV ${pct(mcr.cv * 100)}`)}
        ${kpi('Value at Risk (95 %)', eurC(mcr.valueAtRisk), `Worst 5 %: ≤ ${eurC(mcr.p5)}`)}
        ${kpi('Verlustwahrscheinlichkeit', pct(mcr.lossProb * 100), `kum. Ergebnis < 0 bis ${lastYear()}`)}
        ${kpi(`Ziel ${eurC(target)} in ${lastYear()}`, pct((mcr.targetProb || 0) * 100), `Jahresumsatz P50 ${eurC(mcr.lastP50)}`)}
      </div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h3>Verteilung kumulierter Umsatz</h3><span class="sub">${num(mcr.runs)} Läufe · ${modelName(mc.model)}</span></div><div class="chart-box tall"><canvas id="chMcHist"></canvas></div></div>
        <div class="card"><div class="card-head"><h3>Prognoseband je Jahr</h3><span class="sub">P10 / P50 / P90 Jahresumsatz</span></div><div class="chart-box tall"><canvas id="chMcFan"></canvas></div></div>
      </div>` : `<div class="callout info mt">Simulation starten, um Verteilung, Konfidenzbänder und Risikokennzahlen zu berechnen.</div>`}`;

    if (mcr) {
      const h = W.histogram(mcr.values, 30);
      makeChart('chMcHist', {
        type: 'bar',
        data: {
          labels: h.edges.map(e => eurC(e + h.width / 2)),
          datasets: [{
            label: 'Häufigkeit', data: h.counts, borderRadius: 3, categoryPercentage: 1, barPercentage: 0.92,
            backgroundColor: h.edges.map(e => { const mid = e + h.width / 2; return mid < mcr.p10 ? SERIES[1] : mid > mcr.p90 ? SERIES[2] : SERIES[0]; })
          }]
        },
        options: (() => {
          const o2 = opts({ money: false, legend: false });
          o2.scales.x.ticks = { maxTicksLimit: 7, autoSkip: true, maxRotation: 0 };
          o2.plugins.tooltip.callbacks.title = items => 'Umsatz ≈ ' + items[0].label;
          o2.plugins.tooltip.callbacks.label = c => `${num(c.parsed.y)} Läufe (${pct(c.parsed.y / mcr.runs * 100)})`;
          return o2;
        })()
      });
      const years = mcr.bands.map((_, t) => state.forecast.startYear + t);
      makeChart('chMcFan', {
        type: 'line',
        data: {
          labels: years, datasets: [
            lineDs('P90', mcr.bands.map(b => b.p90), SERIES[2], { fill: '+1', backgroundColor: alpha(SERIES[0], 0.12), pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3] }),
            lineDs('P10', mcr.bands.map(b => b.p10), SERIES[1], { fill: false, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3] }),
            lineDs('P50', mcr.bands.map(b => b.p50), SERIES[0])
          ]
        },
        options: opts()
      });
    }
  }

  function runMonteCarlo() {
    const mc = state.monteCarlo;
    const btn = document.querySelector('[data-action="run-mc"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Simulation läuft …'; }
    setTimeout(() => {
      const runs = Math.max(100, Math.min(20000, Math.round(+mc.runs || 1000)));
      const r = W.monteCarlo(mc.model, state, {
        runs, growthSd: mc.growthSd, priceSd: mc.priceSd, delayProb: mc.delayProb,
        target: (+state.optimizer.targetMio || 0) * 1e6, seed: Date.now() % 100000
      });
      mcResult = Object.assign(r, { model: mc.model });
      render();
      toast(`Monte-Carlo: ${num(runs)} Läufe berechnet`);
    }, 30);
  }

  // ---------------------------------------------------------------------------
  // Seite 7 – Export
  // ---------------------------------------------------------------------------
  const DATASETS = {
    markets: 'Märkte (Stammdaten)',
    models: 'Lizenzmodelle (Vollausbau)',
    heatmap: 'Umsatz Markt × Modell',
    forecast: 'Forecast alle Modelle',
    forecastMarkets: 'Forecast gewähltes Modell je Markt',
    scenarios: 'Szenarienvergleich',
    ranking: 'Management Ranking & Break-Even',
    optimizer: 'Pricing Optimizer',
    prices: 'Preiskatalog (Parameter)'
  };

  function datasetRows(key) {
    const H = horizon();
    const years = Array.from({ length: H }, (_, t) => state.forecast.startYear + t);
    const models = enabledModels();
    switch (key) {
      case 'markets':
        return [W.MARKET_FIELDS.map(f => f.label)].concat(state.markets.map(m => W.MARKET_FIELDS.map(f => m[f.key])));
      case 'models':
        return [['Modell', 'Gruppe', 'Jahresumsatz €', 'Monatsumsatz €', 'Umsatz / Standort €', 'Umsatz / User €']]
          .concat(W.MODELS.map(m => { const s = W.steadyState(m.id, state); return [m.name, m.group, r0(s.annual), r0(s.monthly), r2(s.perSite), r2(s.perUser)]; }));
      case 'heatmap': {
        const ss = W.MODELS.map(m => W.steadyState(m.id, state));
        return [['Markt'].concat(W.MODELS.map(m => m.name))]
          .concat(state.markets.map((m, i) => [m.name].concat(ss.map(s => r0(s.perMarket[i].annual)))))
          .concat([['Gesamt'].concat(ss.map(s => r0(s.annual)))]);
      }
      case 'forecast':
        return [['Modell'].concat(years, ['Kumuliert', 'Kosten kumuliert', 'Ergebnis kumuliert', 'Break-Even'])]
          .concat(W.MODELS.map(m => { const f = W.forecast(m.id, state); return [m.name].concat(f.total.map(r0), [r0(f.cumulative[H - 1]), r0(f.cost.reduce((s, v) => s + v, 0)), r0(f.cumProfit[H - 1]), f.breakEven || `> ${lastYear()}`]); }));
      case 'forecastMarkets': {
        const f = W.forecast(state.ui.selectedModel, state);
        return [[`Markt (${modelName(state.ui.selectedModel)})`].concat(years, ['Summe'])]
          .concat(state.markets.map((m, i) => [m.name].concat(f.byMarket[i].map(r0), [r0(f.byMarket[i].reduce((s, v) => s + v, 0))])))
          .concat([['Gesamt'].concat(f.total.map(r0), [r0(f.cumulative[H - 1])])], [['Kosten'].concat(f.cost.map(r0))], [['Ergebnis kumuliert'].concat(f.cumProfit.map(r0))]);
      }
      case 'scenarios':
        return [['Modell', 'Worst kum. €', 'Realistic kum. €', 'Best kum. €', 'BE Worst', 'BE Realistic', 'BE Best']]
          .concat(W.scenarioSummary(state).map(s => [s.model.name, r0(s.worst.cumulative[H - 1]), r0(s.realistic.cumulative[H - 1]), r0(s.best.cumulative[H - 1]), s.worst.breakEven || '–', s.realistic.breakEven || '–', s.best.breakEven || '–']));
      case 'ranking':
        return [['Rang', 'Modell', 'Score', 'Umsatz kum. €', 'Ergebnis kum. €', 'Marge %', 'Break-Even', 'Robustheit', 'Fairness']]
          .concat(W.ranking(state, models.map(m => m.id)).map((r, i) => [i + 1, r.model.name, r2(r.score), r0(r.revenue), r0(r.profit), r2(r.margin * 100), r.breakEven || `> ${lastYear()}`, r2(r.robustness), r2(r.fairness)]));
      case 'optimizer': {
        const target = (+state.optimizer.targetMio || 0) * 1e6;
        const rows = [['Modell', 'Aktueller Umsatz €', 'Ziel €', 'Faktor', 'Preishebel', 'Aktueller Preis', 'Alle Preise skaliert', 'Nur dieser Hebel']];
        W.optimize(state, target, state.optimizer.reference).forEach(r => r.keys.forEach(k => rows.push([r.model.name, r0(r.current), r0(target), r.factor === null ? '' : r4(r.factor), k.label, r4(k.current), k.scaled === null ? '' : r4(k.scaled), k.single === null ? '' : r4(k.single)])));
        return rows;
      }
      case 'prices': {
        const rows = [['Parameter', 'Wert']];
        const walk = (o, p) => Object.keys(o).forEach(k => {
          const v = o[k], path = p ? p + '.' + k : k;
          if (v && typeof v === 'object') walk(v, path); else rows.push([path, v]);
        });
        walk({ prices: state.prices, costs: state.costs, forecast: state.forecast, scenarios: state.scenarios }, '');
        return rows;
      }
      default: return [];
    }
  }
  const r0 = v => Math.round(v || 0);
  const r2 = v => Math.round((v || 0) * 100) / 100;
  const r4 = v => (v === null || v === undefined ? '' : Math.round(v * 10000) / 10000);

  function renderExport() {
    const csvSet = state.ui.csvSet || 'models';
    const libs = { xlsx: !!window.XLSX, pdf: !!(window.jspdf && window.jspdf.jsPDF) };
    document.getElementById('page-export').innerHTML = `
      ${pageHead('Export', 'Ergebnisse für Präsentationen, Controlling und Vertrieb exportieren.')}
      ${!libs.xlsx || !libs.pdf ? '<div class="callout">Export-Bibliotheken konnten nicht geladen werden (keine Internetverbindung zu den CDNs?). CSV und JSON funktionieren weiterhin.</div>' : ''}
      <div class="export-grid">
        <div class="card export-card"><div class="icon">📊</div><h3>Excel</h3><p>Arbeitsmappe mit allen Auswertungen als eigene Tabellenblätter: Märkte, Modelle, Heatmap, Forecast, Szenarien, Ranking, Optimizer, Preise.</p><button class="btn primary" data-action="export-xlsx" ${libs.xlsx ? '' : 'disabled'}>Excel exportieren</button></div>
        <div class="card export-card"><div class="icon">📄</div><h3>PDF Management Report</h3><p>Management-Bericht mit KPIs, Empfehlung, Charts, Ranking, Szenarien und Forecast im Querformat.</p><button class="btn primary" data-action="export-pdf" ${libs.pdf ? '' : 'disabled'}>PDF erstellen</button></div>
        <div class="card export-card"><div class="icon">🧾</div><h3>CSV</h3><p>Einzelne Datensätze als CSV (Semikolon-getrennt, Excel-kompatibel).</p>
          <div class="toolbar">${select('ui.csvSet', Object.entries(DATASETS))}<button class="btn primary" data-action="export-csv">CSV</button></div>
          <p class="note">Aktuell: ${esc(DATASETS[csvSet])}</p></div>
        <div class="card export-card"><div class="icon">💾</div><h3>Konfiguration</h3><p>Alle Eingaben (Märkte, Preise, Szenarien) als JSON sichern oder wieder laden – ideal zum Teilen von Business Cases.</p>
          <div class="toolbar"><button class="btn" data-action="export-json">JSON speichern</button><button class="btn" data-action="import-json">JSON laden</button></div></div>
        <div class="card export-card"><div class="icon">🖨️</div><h3>Drucken</h3><p>Aktuelle Seite über den Browser drucken bzw. als PDF speichern.</p><button class="btn" data-action="print">Drucken</button></div>
      </div>
      <div class="card mt flush">
        <div class="card-head"><h3>Vorschau: ${esc(DATASETS[csvSet])}</h3></div>
        <div class="table-wrap" style="padding:8px 10px 12px;max-height:420px">${tableFromRows(datasetRows(csvSet))}</div>
      </div>`;
  }

  function tableFromRows(rows) {
    if (!rows.length) return '';
    const fmt = v => (typeof v === 'number' ? (Number.isInteger(v) && Math.abs(v) > 9999 ? num(v) : String(v).replace('.', ',')) : esc(v));
    return `<table><thead><tr>${rows[0].map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r.map(v => `<td class="${typeof v === 'number' ? 'num' : ''}">${fmt(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);

  function exportCSV() {
    const key = state.ui.csvSet || 'models';
    const rows = datasetRows(key);
    const cell = v => {
      let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v == null ? '' : v);
      if (/[";\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    download(`WCP_${key}_${stamp()}.csv`, '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
    toast('CSV exportiert');
  }

  function exportXLSX() {
    if (!window.XLSX) return toast('Excel-Bibliothek nicht verfügbar');
    const wb = XLSX.utils.book_new();
    const sheets = { markets: 'Märkte', models: 'Lizenzmodelle', heatmap: 'Markt x Modell', forecast: 'Forecast', forecastMarkets: 'Forecast je Markt', scenarios: 'Szenarien', ranking: 'Management', optimizer: 'Optimizer', prices: 'Preiskatalog' };
    Object.entries(sheets).forEach(([k, name]) => {
      const rows = datasetRows(k);
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = rows[0].map((_, j) => ({ wch: Math.min(40, Math.max(10, ...rows.map(r => String(r[j] == null ? '' : r[j]).length + 2))) }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, `WCP_License_Calculator_${stamp()}.xlsx`);
    toast('Excel exportiert');
  }

  function chartImage(config, w, h) {
    if (!window.Chart) return null;
    const holder = document.createElement('div');
    holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px`;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    holder.appendChild(canvas);
    document.body.appendChild(holder);
    config.options = Object.assign({}, config.options, { responsive: false, animation: false, devicePixelRatio: 1.5 });
    config.plugins = [{ id: 'whiteBg', beforeDraw: ch => { const g = ch.ctx; g.save(); g.fillStyle = '#ffffff'; g.fillRect(0, 0, ch.width, ch.height); g.restore(); } }];
    const c = new Chart(canvas, config);
    const url = c.toBase64Image('image/jpeg', 0.92);
    c.destroy();
    holder.remove();
    return url;
  }

  function exportPDF() {
    if (!(window.jspdf && window.jspdf.jsPDF)) return toast('PDF-Bibliothek nicht verfügbar');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const H = horizon();
    const models = enabledModels();
    const rank = W.ranking(state, models.map(m => m.id));
    const top = rank[0];
    const PW = doc.internal.pageSize.getWidth();
    const header = title => {
      doc.setFillColor(14, 20, 24); doc.rect(0, 0, PW, 18, 'F');
      doc.setFillColor(213, 0, 28); doc.rect(0, 18, PW, 1.2, 'F');
      doc.setTextColor(255); doc.setFontSize(13); doc.text('WCP License Calculator & Market Forecast', 12, 11.5);
      doc.setFontSize(9); doc.text(`${title} · ${new Date().toLocaleDateString('de-AT')}`, PW - 12, 11.5, { align: 'right' });
      doc.setTextColor(11);
    };
    const table = (head, body, startY) => doc.autoTable({
      head: [head], body, startY, theme: 'grid', margin: { left: 12, right: 12 },
      styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: [34, 44, 51], textColor: 255 },
      alternateRowStyles: { fillColor: [246, 246, 244] }
    });
    const txt = s => String(s).replace(/→/g, '->').replace(/€/g, 'EUR').replace(/–/g, '-').replace(/[^\x00-\xFF]/g, '');

    // Seite 1: Management Summary
    header('Management Summary');
    doc.setFontSize(18); doc.text(txt(`Empfehlung: ${top.model.name}`), 12, 32);
    doc.setFontSize(10); doc.setTextColor(82);
    doc.text(txt(`Realistic Case ${state.forecast.startYear}-${lastYear()} · ${state.markets.length} Märkte · Score ${nf1.format(top.score)}/100`), 12, 39);
    const tiles = [
      [`Umsatz ${lastYear()}`, eurC(top.forecast.total[H - 1])],
      [`Kumuliert ${H} J.`, eurC(top.revenue)],
      ['Ergebnis kumuliert', eurC(top.profit)],
      ['Break-Even', top.breakEven ? String(top.breakEven) : `> ${lastYear()}`],
      ['Profitabelstes Modell', rank.slice().sort((a, b) => b.profit - a.profit)[0].model.name]
    ];
    const tw = (PW - 24 - 4 * 4) / 5;
    tiles.forEach(([l, v], i) => {
      const x = 12 + i * (tw + 4);
      doc.setDrawColor(220); doc.setFillColor(252, 252, 251); doc.roundedRect(x, 45, tw, 20, 2, 2, 'FD');
      doc.setFillColor(213, 0, 28); doc.rect(x, 45, 1, 20, 'F');
      doc.setFontSize(8); doc.setTextColor(82); doc.text(txt(l), x + 4, 51);
      doc.setFontSize(13); doc.setTextColor(11); doc.text(txt(v), x + 4, 60);
    });
    const ss = models.map(m => ({ m, s: W.steadyState(m.id, state) })).sort((a, b) => b.s.annual - a.s.annual);
    const img1 = chartImage({ type: 'bar', data: { labels: ss.map(x => x.m.name), datasets: [barDs('Jahresumsatz', ss.map(x => x.s.annual), ss.map(x => x.m.id === top.model.id ? SERIES[0] : RAMP[2]))] }, options: opts({ horizontal: true, legend: false }) }, 900, 520);
    const fTop = top.forecast;
    const img2 = chartImage({ type: 'bar', data: { labels: fTop.years, datasets: state.markets.map((m, i) => stackDs(m.name, fTop.byMarket[i], marketColor(i))) }, options: opts({ stacked: true }) }, 900, 520);
    const cw = (PW - 24 - 6) / 2;
    doc.setFontSize(10); doc.setTextColor(11);
    doc.text('Umsatz je Modell (Vollausbau, jährlich)', 12, 74);
    doc.text(txt(`Forecast ${top.model.name} je Markt`), 12 + cw + 6, 74);
    if (img1) doc.addImage(img1, 'JPEG', 12, 77, cw, cw * 520 / 900);
    if (img2) doc.addImage(img2, 'JPEG', 12 + cw + 6, 77, cw, cw * 520 / 900);

    // Seite 2: Ranking & Szenarien
    doc.addPage(); header('Ranking, Break-Even & Szenarien');
    table(['Rang', 'Modell', 'Score', 'Umsatz kum.', 'Kosten kum.', 'Ergebnis', 'Marge', 'Break-Even'],
      rank.map((r, i) => [i + 1, r.model.name, nf1.format(r.score), txt(eurC(r.revenue)), txt(eurC(r.forecast.cost.reduce((s, v) => s + v, 0))), txt(eurC(r.profit)), txt(pct(r.margin * 100)), r.breakEven || `> ${lastYear()}`]).map(r => r.map(txt)), 26);
    const sc = W.scenarioSummary(state, models.map(m => m.id));
    table(['Modell', 'Worst Case', 'Realistic Case', 'Best Case', 'Bandbreite'],
      sc.map(s => [s.model.name, eurC(s.worst.cumulative[H - 1]), eurC(s.realistic.cumulative[H - 1]), eurC(s.best.cumulative[H - 1]), eurC(s.best.cumulative[H - 1] - s.worst.cumulative[H - 1])].map(txt)), doc.lastAutoTable.finalY + 8);

    // Seite 3: Forecast & Märkte
    doc.addPage(); header('Forecast & Märkte');
    const years = fTop.years;
    table(['Modell'].concat(years.map(String), ['Kumuliert']),
      models.map(m => { const f = W.forecast(m.id, state); return [m.name].concat(f.total.map(v => eurC(v)), [eurC(f.cumulative[H - 1])]).map(txt); }), 26);
    table(W.MARKET_FIELDS.map(f => txt(f.label)), state.markets.map(m => W.MARKET_FIELDS.map(f => txt(typeof m[f.key] === 'number' && f.key !== 'rolloutYear' && f.key !== 'growth' ? num(m[f.key]) : m[f.key]))), doc.lastAutoTable.finalY + 8);

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(137);
      doc.text(`Seite ${i} / ${pages}`, PW - 12, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
    }
    doc.save(`WCP_Management_Report_${stamp()}.pdf`);
    toast('PDF erstellt');
  }

  // ---------------------------------------------------------------------------
  // Rendering & Events
  // ---------------------------------------------------------------------------
  const PAGES = {
    markets: renderMarkets, models: renderModels, catalog: renderCatalog, forecast: renderForecast,
    scenarios: renderScenarios, management: renderManagement, export: renderExport, optimizer: renderOptimizer
  };

  function renderHeader() {
    const users = state.markets.reduce((s, m) => s + W.totalUsers(m), 0);
    const ss = W.steadyState(state.ui.selectedModel, state);
    document.getElementById('headerMeta').innerHTML =
      `<span>Märkte <b>${state.markets.length}</b></span><span>User <b>${num(users)}</b></span>` +
      `<span>Modell <b>${modelName(state.ui.selectedModel)}</b></span><span>Jahresumsatz <b>${eurC(ss.annual)}</b></span>` +
      `<span>Forecast <b>${state.forecast.startYear}–${lastYear()}</b></span>`;
  }

  function render() {
    Object.keys(charts).forEach(id => { charts[id].destroy(); delete charts[id]; });
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + current));
    document.querySelectorAll('[data-page]').forEach(a => a.classList.toggle('active', a.dataset.page === current));
    try { PAGES[current](); } catch (e) { console.error(e); }
    renderHeader();
  }

  function scheduleRender() {
    setTimeout(() => {
      const a = document.activeElement;
      const bind = a && a.dataset ? a.dataset.bind : null;
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
      if (bind) {
        const el = document.querySelector(`[data-bind="${CSS.escape(bind)}"]`);
        if (el) { el.focus(); if (el.select && el.type !== 'checkbox') try { el.select(); } catch (e) { /* ignore */ } }
      }
    }, 0);
  }

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function go(page) {
    if (!PAGES[page]) page = 'markets';
    current = page;
    document.body.classList.remove('nav-open');
    if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
    render();
    window.scrollTo(0, 0);
  }

  document.addEventListener('change', e => {
    const el = e.target;
    if (!el.dataset || !el.dataset.bind) return;
    const path = el.dataset.bind;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number') { v = parseFloat(el.value); if (!Number.isFinite(v)) v = 0; }
    else if (el.dataset.num) v = +el.value;
    else v = el.value;
    W.setPath(state, path, v);
    if (path === 'monteCarlo.model') mcResult = null;
    save();
    scheduleRender();
  });

  document.addEventListener('click', e => {
    const g = e.target.closest('[data-goto]');
    if (g) { go(g.dataset.goto); return; }
    const navA = e.target.closest('a[data-page]');
    if (navA) { e.preventDefault(); go(navA.dataset.page); return; }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const d = el.dataset;
    switch (d.action) {
      case 'select-model':
        state.ui.selectedModel = d.id; break;
      case 'toggle-model': {
        const set = new Set(state.ui.enabledModels);
        if (set.has(d.id)) { if (set.size > 1) set.delete(d.id); } else set.add(d.id);
        state.ui.enabledModels = W.MODELS.map(m => m.id).filter(id => set.has(id));
        break;
      }
      case 'heatnorm': state.ui.heatNorm = d.v; break;
      case 'horizon': state.forecast.horizon = +d.h; mcResult = null; break;
      case 'sens-pct': state.ui.sensPct = +d.v; break;
      case 'add-market':
        state.markets.push({ name: 'Neuer Markt', sites: 30, employees: 1500, activeUsers: 800, occasionalUsers: 350, workshops: 26, serviceStaff: 500, salesStaff: 200, growth: 3, rolloutYear: state.forecast.startYear + 1, marketRevenue: 600 });
        toast('Markt hinzugefügt'); break;
      case 'remove-market':
        if (state.markets.length <= 1) return toast('Mindestens ein Markt erforderlich');
        if (!confirm(`Markt „${state.markets[+d.i].name}“ entfernen?`)) return;
        state.markets.splice(+d.i, 1); break;
      case 'defaults-markets':
        if (!confirm('Stammdaten durch Beispielmärkte ersetzen?')) return;
        state.markets = W.defaultState().markets; break;
      case 'apply-opt':
        W.applyFactor(state, d.id, +d.f);
        state.ui.selectedModel = d.id;
        toast(`Preise für ${modelName(d.id)} übernommen (×${nf2.format(+d.f)})`); break;
      case 'run-mc': runMonteCarlo(); return;
      case 'export-csv': exportCSV(); return;
      case 'export-xlsx': exportXLSX(); return;
      case 'export-pdf': exportPDF(); return;
      case 'export-json':
        download(`WCP_Konfiguration_${stamp()}.json`, JSON.stringify(state, null, 2), 'application/json'); toast('Konfiguration gespeichert'); return;
      case 'import-json': document.getElementById('fileImport').click(); return;
      case 'print': window.print(); return;
      default: return;
    }
    save();
    scheduleRender();
  });

  document.getElementById('fileImport').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.markets)) throw new Error('Ungültige Datei');
        state = merge(W.defaultState(), parsed);
        mcResult = null;
        save(); render(); toast('Konfiguration geladen');
      } catch (err) { toast('Datei konnte nicht gelesen werden'); }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  document.getElementById('btnReset').addEventListener('click', () => {
    if (!confirm('Alle Eingaben auf Standardwerte zurücksetzen?')) return;
    state = W.defaultState();
    mcResult = null;
    save(); render(); toast('Standardwerte geladen');
  });
  document.getElementById('menuToggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  window.addEventListener('hashchange', () => go(location.hash.slice(1)));

  go(location.hash.slice(1) || 'markets');
})();
