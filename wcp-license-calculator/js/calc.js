/* WCP License Calculator – Rechen-Engine (ohne DOM, auch in Node testbar) */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Modellkatalog
  // ---------------------------------------------------------------------------
  const MODELS = [
    { id: 'user', name: 'User Lizenz', group: 'Basis', simplicity: 5,
      desc: 'Preis pro aktivem User und Monat.' },
    { id: 'named', name: 'Named User', group: 'Basis', simplicity: 5,
      desc: 'Fester Benutzer (aktive + gelegentliche User), Preis pro Named User.' },
    { id: 'concurrent', name: 'Concurrent User', group: 'Basis', simplicity: 4,
      desc: 'Gleichzeitige Nutzung, Verhältnis konfigurierbar (z. B. 100 User → 40 Concurrent).' },
    { id: 'site', name: 'Standort Lizenz', group: 'Basis', simplicity: 5,
      desc: 'Preis pro Standort und Monat.' },
    { id: 'workshop', name: 'Werkstatt Lizenz', group: 'Basis', simplicity: 5,
      desc: 'Preis pro Werkstatt und Monat.' },
    { id: 'enterprise', name: 'Unternehmenslizenz', group: 'Basis', simplicity: 5,
      desc: 'Flat Fee pro Markt und Jahr.' },
    { id: 'revenue', name: 'Umsatzbasiert', group: 'Basis', simplicity: 3,
      desc: 'Prozentsatz vom Händler-/Marktumsatz.' },
    { id: 'hybrid', name: 'Hybrid', group: 'Basis', simplicity: 3,
      desc: 'Grundgebühr + Standortgebühr + Userpreis + Concurrent-Anteil, frei kombinierbar.' },
    { id: 'tier', name: 'Tier Modell', group: 'Erweitert', simplicity: 4,
      desc: 'Small / Medium / Enterprise nach User-Schwellwerten.' },
    { id: 'consumption', name: 'Consumption', group: 'Erweitert', simplicity: 2,
      desc: 'Abrechnung nach Logins, Sessions, API Calls und AI Requests.' },
    { id: 'transaction', name: 'Transaction', group: 'Erweitert', simplicity: 2,
      desc: 'Preis pro Auftrag, Werkstattauftrag, Fahrzeug und Rechnung.' },
    { id: 'freemium', name: 'Freemium → Premium', group: 'Erweitert', simplicity: 4,
      desc: 'Basisfunktionen kostenlos, Premium-Module kostenpflichtig.' },
    { id: 'modules', name: 'Modulbasiert', group: 'Erweitert', simplicity: 3,
      desc: 'Auswählbare Module (CRM, Werkstatt, Verkauf, Reporting, …).' },
    { id: 'ai', name: 'AI Add-On', group: 'Erweitert', simplicity: 3,
      desc: 'Separate Preise für AI Copilot, Agenten, Automatisierung, RAG, Dokumentenanalyse.' }
  ];
  const MODEL_BY_ID = Object.fromEntries(MODELS.map(m => [m.id, m]));

  const MARKET_FIELDS = [
    { key: 'name', label: 'Markt', type: 'text' },
    { key: 'sites', label: 'Standorte' },
    { key: 'employees', label: 'Mitarbeiter' },
    { key: 'activeUsers', label: 'Aktive User' },
    { key: 'occasionalUsers', label: 'Gelegentl. User' },
    { key: 'workshops', label: 'Werkstätten' },
    { key: 'serviceStaff', label: 'Service-MA' },
    { key: 'salesStaff', label: 'Verkäufer' },
    { key: 'growth', label: 'Wachstum % p.a.', step: 0.1 },
    { key: 'rolloutYear', label: 'Rollout-Jahr' },
    { key: 'marketRevenue', label: 'Marktumsatz Mio €', step: 1 }
  ];

  // ---------------------------------------------------------------------------
  // Standardwerte
  // ---------------------------------------------------------------------------
  function mk(name, sites, employees, activeUsers, occasionalUsers, workshops, serviceStaff, salesStaff, growth, rolloutYear, marketRevenue) {
    return { name, sites, employees, activeUsers, occasionalUsers, workshops, serviceStaff, salesStaff, growth, rolloutYear, marketRevenue };
  }

  function defaultState() {
    return {
      version: 1,
      markets: [
        mk('Österreich', 140, 9500, 5200, 2100, 125, 3400, 1300, 3.0, 2026, 4800),
        mk('Schweiz', 95, 6200, 3300, 1400, 85, 2100, 850, 2.5, 2026, 3900),
        mk('Belgien', 110, 7000, 3800, 1600, 100, 2500, 950, 3.0, 2027, 4100),
        mk('Schweden', 80, 5200, 2800, 1100, 72, 1800, 700, 4.0, 2027, 3200),
        mk('Polen', 160, 8800, 4600, 2300, 140, 3100, 1250, 6.0, 2027, 3600),
        mk('Ungarn', 70, 3900, 2000, 900, 62, 1350, 520, 5.0, 2028, 1500),
        mk('Kroatien', 45, 2300, 1150, 600, 40, 800, 300, 4.5, 2028, 800),
        mk('Slowenien', 40, 2100, 1050, 500, 36, 720, 280, 3.5, 2028, 900)
      ],
      prices: {
        user: { pricePerUser: 9 },
        named: { pricePerNamed: 6.5 },
        concurrent: { ratio: 40, pricePerConcurrent: 18 },
        site: { pricePerSite: 290 },
        workshop: { pricePerWorkshop: 320 },
        enterprise: { flatFee: 300000 },
        revenue: { percent: 0.012 },
        hybrid: {
          useBase: true, baseFee: 60000,
          useSite: true, sitePrice: 90,
          useUser: true, userPrice: 3,
          useConc: true, concShare: 30, concRatio: 40, concPrice: 10
        },
        tier: {
          smallMax: 2000, mediumMax: 6000,
          smallBase: 20000, smallUser: 8,
          mediumBase: 50000, mediumUser: 7,
          entBase: 100000, entUser: 6
        },
        consumption: {
          useLogins: true, loginsPerUser: 40, priceLogin: 0.02,
          useSessions: true, sessionsPerUser: 60, priceSession: 0.04,
          useApi: true, apiPerSite: 50000, priceApi1000: 0.5,
          useAi: true, aiPerActiveUser: 30, priceAi: 0.05
        },
        transaction: {
          useOrders: true, ordersPerSales: 12, priceOrder: 1.0,
          useWorkOrders: true, workOrdersPerService: 40, priceWorkOrder: 0.2,
          useVehicles: true, vehiclesPerSite: 60, priceVehicle: 1.0,
          useInvoices: true, invoicesPerSite: 900, priceInvoice: 0.08
        },
        freemium: { conversion: 35, premiumPrice: 22 },
        modules: {
          items: [
            { key: 'crm', name: 'CRM', enabled: true, basis: 'user', price: 3, adoption: 60 },
            { key: 'werkstatt', name: 'Werkstatt', enabled: true, basis: 'user', price: 4, adoption: 50 },
            { key: 'verkauf', name: 'Verkauf', enabled: true, basis: 'user', price: 3, adoption: 40 },
            { key: 'reporting', name: 'Reporting', enabled: true, basis: 'user', price: 1.5, adoption: 70 },
            { key: 'aiassist', name: 'AI Assistant', enabled: true, basis: 'user', price: 4, adoption: 25 },
            { key: 'analytics', name: 'Analytics', enabled: true, basis: 'user', price: 2, adoption: 30 },
            { key: 'mobile', name: 'Mobile App', enabled: true, basis: 'user', price: 1.5, adoption: 45 },
            { key: 'integration', name: 'Integrationen', enabled: true, basis: 'site', price: 80, adoption: 100 }
          ]
        },
        ai: {
          items: [
            { key: 'copilot', name: 'AI Copilot', enabled: true, basis: 'user', units: 1, price: 15, adoption: 20 },
            { key: 'agents', name: 'AI Agenten', enabled: true, basis: 'site', units: 1, price: 150, adoption: 50 },
            { key: 'automation', name: 'AI Automatisierung', enabled: true, basis: 'unit', units: 500, price: 0.1, adoption: 100 },
            { key: 'rag', name: 'RAG Suche', enabled: true, basis: 'user', units: 1, price: 2, adoption: 40 },
            { key: 'docs', name: 'Dokumentenanalyse', enabled: true, basis: 'unit', units: 300, price: 0.25, adoption: 100 }
          ]
        }
      },
      costs: {
        platformOneTime: 1500000,
        rolloutPerMarket: 150000,
        runPerUserYear: 12,
        runPerMarketYear: 40000
      },
      forecast: {
        startYear: 2026,
        horizon: 5,
        priceIncrease: 2.5,
        newSites: 1.0,
        newUsers: 2.0,
        firstYearAdoption: 50
      },
      scenarios: {
        best: { name: 'Best Case', volume: 1.10, growthDelta: 2, priceDelta: 1, rolloutDelay: 0, adoptionDelta: 20 },
        realistic: { name: 'Realistic Case', volume: 1.0, growthDelta: 0, priceDelta: 0, rolloutDelay: 0, adoptionDelta: 0 },
        worst: { name: 'Worst Case', volume: 0.85, growthDelta: -2, priceDelta: -1, rolloutDelay: 1, adoptionDelta: -20 }
      },
      ui: {
        selectedModel: 'hybrid',
        enabledModels: MODELS.map(m => m.id),
        marketMetric: 'activeUsers',
        heatNorm: 'global',
        forecastScenario: 'realistic',
        sensPct: 20,
        csvSet: 'models'
      },
      optimizer: { targetMio: 3, reference: 'full' },
      monteCarlo: { runs: 3000, growthSd: 1.5, priceSd: 1.0, delayProb: 20, model: 'hybrid' }
    };
  }

  // ---------------------------------------------------------------------------
  // Hilfsfunktionen
  // ---------------------------------------------------------------------------
  const n = v => (Number.isFinite(+v) ? +v : 0);
  const totalUsers = m => n(m.activeUsers) + n(m.occasionalUsers);

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], obj);
    target[last] = value;
  }

  // Preisparameter je Modell (lineare Preis-Hebel, für Optimizer & Preisskalierung)
  function priceKeys(modelId, prices) {
    switch (modelId) {
      case 'user': return [{ path: 'user.pricePerUser', label: 'Preis / aktiver User / Monat', unit: '€' }];
      case 'named': return [{ path: 'named.pricePerNamed', label: 'Preis / Named User / Monat', unit: '€' }];
      case 'concurrent': return [{ path: 'concurrent.pricePerConcurrent', label: 'Preis / Concurrent User / Monat', unit: '€' }];
      case 'site': return [{ path: 'site.pricePerSite', label: 'Preis / Standort / Monat', unit: '€' }];
      case 'workshop': return [{ path: 'workshop.pricePerWorkshop', label: 'Preis / Werkstatt / Monat', unit: '€' }];
      case 'enterprise': return [{ path: 'enterprise.flatFee', label: 'Flat Fee / Markt / Jahr', unit: '€' }];
      case 'revenue': return [{ path: 'revenue.percent', label: 'Anteil vom Marktumsatz', unit: '%' }];
      case 'hybrid': return [
        { path: 'hybrid.baseFee', label: 'Grundgebühr / Markt / Jahr', unit: '€', flag: 'hybrid.useBase' },
        { path: 'hybrid.sitePrice', label: 'Standortgebühr / Monat', unit: '€', flag: 'hybrid.useSite' },
        { path: 'hybrid.userPrice', label: 'Userpreis / Monat', unit: '€', flag: 'hybrid.useUser' },
        { path: 'hybrid.concPrice', label: 'Concurrent-Preis / Monat', unit: '€', flag: 'hybrid.useConc' }
      ];
      case 'tier': return [
        { path: 'tier.smallBase', label: 'Small Grundgebühr / Jahr', unit: '€' },
        { path: 'tier.smallUser', label: 'Small Preis / User / Monat', unit: '€' },
        { path: 'tier.mediumBase', label: 'Medium Grundgebühr / Jahr', unit: '€' },
        { path: 'tier.mediumUser', label: 'Medium Preis / User / Monat', unit: '€' },
        { path: 'tier.entBase', label: 'Enterprise Grundgebühr / Jahr', unit: '€' },
        { path: 'tier.entUser', label: 'Enterprise Preis / User / Monat', unit: '€' }
      ];
      case 'consumption': return [
        { path: 'consumption.priceLogin', label: 'Preis / Login', unit: '€', flag: 'consumption.useLogins' },
        { path: 'consumption.priceSession', label: 'Preis / Session', unit: '€', flag: 'consumption.useSessions' },
        { path: 'consumption.priceApi1000', label: 'Preis / 1.000 API Calls', unit: '€', flag: 'consumption.useApi' },
        { path: 'consumption.priceAi', label: 'Preis / AI Request', unit: '€', flag: 'consumption.useAi' }
      ];
      case 'transaction': return [
        { path: 'transaction.priceOrder', label: 'Preis / Auftrag', unit: '€', flag: 'transaction.useOrders' },
        { path: 'transaction.priceWorkOrder', label: 'Preis / Werkstattauftrag', unit: '€', flag: 'transaction.useWorkOrders' },
        { path: 'transaction.priceVehicle', label: 'Preis / Fahrzeug', unit: '€', flag: 'transaction.useVehicles' },
        { path: 'transaction.priceInvoice', label: 'Preis / Rechnung', unit: '€', flag: 'transaction.useInvoices' }
      ];
      case 'freemium': return [{ path: 'freemium.premiumPrice', label: 'Premium-Preis / User / Monat', unit: '€' }];
      case 'modules':
      case 'ai':
        return prices[modelId].items.map((it, i) => ({
          path: `${modelId}.items.${i}.price`,
          label: `${it.name} – Preis`,
          unit: '€',
          flag: `${modelId}.items.${i}.enabled`
        }));
      default: return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Modellberechnung für einen Markt → { total, parts: [[label, wert]] } (EUR/Jahr)
  // ---------------------------------------------------------------------------
  function tierOf(users, p) {
    if (users <= n(p.smallMax)) return 'small';
    if (users <= n(p.mediumMax)) return 'medium';
    return 'enterprise';
  }

  function calcModel(modelId, m, prices) {
    const p = prices[modelId];
    const U = totalUsers(m);
    const A = n(m.activeUsers);
    const S = n(m.sites);
    const parts = [];
    const add = (label, v) => parts.push([label, v]);

    switch (modelId) {
      case 'user':
        add('Aktive User', A * n(p.pricePerUser) * 12);
        break;
      case 'named':
        add('Named User', U * n(p.pricePerNamed) * 12);
        break;
      case 'concurrent':
        add('Concurrent User', Math.ceil(U * n(p.ratio) / 100) * n(p.pricePerConcurrent) * 12);
        break;
      case 'site':
        add('Standorte', S * n(p.pricePerSite) * 12);
        break;
      case 'workshop':
        add('Werkstätten', n(m.workshops) * n(p.pricePerWorkshop) * 12);
        break;
      case 'enterprise':
        add('Flat Fee', n(p.flatFee));
        break;
      case 'revenue':
        add('Umsatzanteil', n(m.marketRevenue) * 1e6 * n(p.percent) / 100);
        break;
      case 'hybrid': {
        const share = p.useConc ? n(p.concShare) / 100 : 0;
        if (p.useBase) add('Grundgebühr', n(p.baseFee));
        if (p.useSite) add('Standortgebühr', S * n(p.sitePrice) * 12);
        if (p.useUser) add('Userpreis', U * (1 - share) * n(p.userPrice) * 12);
        if (p.useConc) add('Concurrent', Math.ceil(U * share * n(p.concRatio) / 100) * n(p.concPrice) * 12);
        break;
      }
      case 'tier': {
        const t = tierOf(U, p);
        const key = t === 'small' ? 'small' : t === 'medium' ? 'medium' : 'ent';
        const label = t === 'small' ? 'Small' : t === 'medium' ? 'Medium' : 'Enterprise';
        add(`${label} Grundgebühr`, n(p[key + 'Base']));
        add(`${label} Userpreis`, U * n(p[key + 'User']) * 12);
        break;
      }
      case 'consumption':
        if (p.useLogins) add('Logins', U * n(p.loginsPerUser) * 12 * n(p.priceLogin));
        if (p.useSessions) add('Sessions', U * n(p.sessionsPerUser) * 12 * n(p.priceSession));
        if (p.useApi) add('API Calls', S * n(p.apiPerSite) * 12 / 1000 * n(p.priceApi1000));
        if (p.useAi) add('AI Requests', A * n(p.aiPerActiveUser) * 12 * n(p.priceAi));
        break;
      case 'transaction':
        if (p.useOrders) add('Aufträge', n(m.salesStaff) * n(p.ordersPerSales) * 12 * n(p.priceOrder));
        if (p.useWorkOrders) add('Werkstattaufträge', n(m.serviceStaff) * n(p.workOrdersPerService) * 12 * n(p.priceWorkOrder));
        if (p.useVehicles) add('Fahrzeuge', S * n(p.vehiclesPerSite) * 12 * n(p.priceVehicle));
        if (p.useInvoices) add('Rechnungen', S * n(p.invoicesPerSite) * 12 * n(p.priceInvoice));
        break;
      case 'freemium':
        add('Free Tier', 0);
        add('Premium User', U * n(p.conversion) / 100 * n(p.premiumPrice) * 12);
        break;
      case 'modules':
      case 'ai':
        p.items.forEach(it => {
          if (!it.enabled) return;
          const base = it.basis === 'site' ? S : it.basis === 'unit' ? S * n(it.units) : A;
          add(it.name, base * n(it.adoption) / 100 * n(it.price) * 12);
        });
        break;
      default:
        break;
    }
    const total = parts.reduce((s, [, v]) => s + v, 0);
    return { total, parts };
  }

  // Lizenzeinheiten (für Umsatz pro Lizenz / Übersicht)
  function licenseUnits(modelId, m, prices) {
    const p = prices[modelId];
    const U = totalUsers(m);
    switch (modelId) {
      case 'user': return { label: 'User-Lizenzen', value: n(m.activeUsers) };
      case 'named': return { label: 'Named User', value: U };
      case 'concurrent': return { label: 'Concurrent Lizenzen', value: Math.ceil(U * n(p.ratio) / 100) };
      case 'site': return { label: 'Standort-Lizenzen', value: n(m.sites) };
      case 'workshop': return { label: 'Werkstatt-Lizenzen', value: n(m.workshops) };
      case 'enterprise': return { label: 'Unternehmenslizenzen', value: 1 };
      case 'freemium': return { label: 'Premium User', value: Math.round(U * n(p.conversion) / 100) };
      default: return { label: 'User (gesamt)', value: U };
    }
  }

  // ---------------------------------------------------------------------------
  // Forecast
  // ---------------------------------------------------------------------------
  const REALISTIC = { volume: 1, growthDelta: 0, priceDelta: 0, rolloutDelay: 0, adoptionDelta: 0 };

  // Skaliert die Stammdaten eines Markts auf Forecast-Jahr t (0-basiert).
  // Gibt null zurück, wenn der Markt in diesem Jahr noch nicht ausgerollt ist.
  function marketInYear(m, t, fc, sc, idx) {
    sc = sc || REALISTIC;
    const year = n(fc.startYear) + t;
    const delay = Array.isArray(sc.marketDelay) ? n(sc.marketDelay[idx]) : n(sc.rolloutDelay);
    const rollout = n(m.rolloutYear) + delay;
    if (year < rollout) return null;
    const g = (n(m.growth) + n(sc.growthDelta)) / 100;
    const vol = n(sc.volume) || 1;
    const fBase = Math.pow(1 + g, t);
    const fUsers = fBase * Math.pow(1 + n(fc.newUsers) / 100, t) * vol;
    const fSites = Math.pow(1 + n(fc.newSites) / 100, t) * vol;
    const fStaff = fBase * vol;
    const adoption = year === rollout
      ? Math.min(100, Math.max(0, n(fc.firstYearAdoption) + n(sc.adoptionDelta))) / 100
      : 1;
    return {
      name: m.name,
      sites: n(m.sites) * fSites,
      workshops: n(m.workshops) * fSites,
      employees: n(m.employees) * fStaff,
      activeUsers: n(m.activeUsers) * fUsers,
      occasionalUsers: n(m.occasionalUsers) * fUsers,
      serviceStaff: n(m.serviceStaff) * fStaff,
      salesStaff: n(m.salesStaff) * fStaff,
      marketRevenue: n(m.marketRevenue) * fBase * vol,
      growth: m.growth,
      rolloutYear: rollout,
      adoption,
      isRolloutYear: year === rollout
    };
  }

  function priceFactor(t, fc, sc) {
    sc = sc || REALISTIC;
    return Math.pow(1 + (n(fc.priceIncrease) + n(sc.priceDelta)) / 100, t);
  }

  // Forecast eines Modells → { years, byMarket[i][t], total[t], cumulative[t], cost[t], profit[t], cumProfit[t], breakEven }
  function forecast(modelId, state, sc, horizon) {
    const fc = state.forecast;
    const H = horizon || n(fc.horizon) || 5;
    const years = [];
    const byMarket = state.markets.map(() => []);
    const total = [];
    const cost = [];
    const users = [];
    for (let t = 0; t < H; t++) {
      years.push(n(fc.startYear) + t);
      const pf = modelId === 'revenue' ? 1 : priceFactor(t, fc, sc);
      let sum = 0, c = t === 0 ? n(state.costs.platformOneTime) : 0, u = 0;
      state.markets.forEach((m, i) => {
        const mm = marketInYear(m, t, fc, sc, i);
        if (!mm) { byMarket[i].push(0); return; }
        const r = calcModel(modelId, mm, state.prices).total * pf * mm.adoption;
        byMarket[i].push(r);
        sum += r;
        const mu = totalUsers(mm) * mm.adoption;
        u += mu;
        c += (mm.isRolloutYear ? n(state.costs.rolloutPerMarket) : 0)
          + mu * n(state.costs.runPerUserYear)
          + n(state.costs.runPerMarketYear) * mm.adoption;
      });
      total.push(sum);
      cost.push(c);
      users.push(u);
    }
    const cumulative = [], profit = [], cumProfit = [];
    let cs = 0, cp = 0, breakEven = null;
    for (let t = 0; t < H; t++) {
      cs += total[t];
      cumulative.push(cs);
      profit.push(total[t] - cost[t]);
      cp += total[t] - cost[t];
      cumProfit.push(cp);
      if (breakEven === null && cp >= 0) breakEven = years[t];
    }
    return { modelId, years, byMarket, total, cumulative, cost, profit, cumProfit, breakEven, users };
  }

  // Vollausbau-Werte (aktuelle Stammdaten, alle Märkte, ohne Rollout/Ramp-up)
  function steadyState(modelId, state) {
    const perMarket = state.markets.map(m => {
      const r = calcModel(modelId, m, state.prices);
      const units = licenseUnits(modelId, m, state.prices);
      const U = totalUsers(m);
      return {
        name: m.name,
        annual: r.total,
        monthly: r.total / 12,
        perSite: n(m.sites) ? r.total / n(m.sites) : 0,
        perUser: U ? r.total / U : 0,
        parts: r.parts,
        units
      };
    });
    const annual = perMarket.reduce((s, x) => s + x.annual, 0);
    const sites = state.markets.reduce((s, m) => s + n(m.sites), 0);
    const users = state.markets.reduce((s, m) => s + totalUsers(m), 0);
    return {
      modelId,
      perMarket,
      annual,
      monthly: annual / 12,
      perSite: sites ? annual / sites : 0,
      perUser: users ? annual / users : 0
    };
  }

  // ---------------------------------------------------------------------------
  // Pricing Optimizer
  // ---------------------------------------------------------------------------
  function referenceRevenue(modelId, state, reference) {
    if (reference === 'full') return steadyState(modelId, state).annual;
    const t = Math.max(0, n(reference));
    const f = forecast(modelId, state, REALISTIC, t + 1);
    return f.total[t];
  }

  // Löst für einen einzelnen Preishebel: welcher Wert ergibt das Ziel, wenn alle anderen fix bleiben?
  function solveSingle(modelId, state, path, target, reference) {
    const s = clone(state);
    setPath(s.prices, path, 0);
    const r0 = referenceRevenue(modelId, s, reference);
    setPath(s.prices, path, 1);
    const r1 = referenceRevenue(modelId, s, reference);
    const slope = r1 - r0;
    if (slope <= 0) return { value: null, base: r0, slope };
    return { value: (target - r0) / slope, base: r0, slope };
  }

  function optimize(state, target, reference) {
    return MODELS.map(model => {
      const current = referenceRevenue(model.id, state, reference);
      const factor = current > 0 ? target / current : null;
      const keys = priceKeys(model.id, state.prices)
        .filter(k => !k.flag || getPath(state.prices, k.flag))
        .map(k => {
          const cur = n(getPath(state.prices, k.path));
          const single = solveSingle(model.id, state, k.path, target, reference);
          return {
            ...k,
            current: cur,
            scaled: factor !== null ? cur * factor : null,
            single: single.value
          };
        });
      return { model, current, factor, keys };
    });
  }

  function applyFactor(state, modelId, factor) {
    priceKeys(modelId, state.prices).forEach(k => {
      const v = n(getPath(state.prices, k.path));
      setPath(state.prices, k.path, +(v * factor).toPrecision(6));
    });
  }

  // ---------------------------------------------------------------------------
  // Monte-Carlo-Simulation
  // ---------------------------------------------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(rand) {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function triangular(rand, a, c, b) {
    if (b <= a) return c;
    const u = rand();
    const fc = (c - a) / (b - a);
    return u < fc ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
  }
  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function monteCarlo(modelId, state, opts) {
    const o = Object.assign({ runs: 3000, growthSd: 1.5, priceSd: 1, delayProb: 20, seed: 42, target: null }, opts || {});
    const rand = mulberry32(o.seed);
    const H = n(state.forecast.horizon) || 5;
    const best = state.scenarios.best, worst = state.scenarios.worst;
    const vMin = Math.min(n(worst.volume), 1), vMax = Math.max(n(best.volume), 1);
    const cum = [], lastYear = [], profit = [];
    const yearly = Array.from({ length: H }, () => []);
    for (let r = 0; r < o.runs; r++) {
      const sc = {
        volume: triangular(rand, vMin, 1, vMax),
        growthDelta: normal(rand) * n(o.growthSd),
        priceDelta: normal(rand) * n(o.priceSd),
        adoptionDelta: (rand() - 0.5) * (n(best.adoptionDelta) - n(worst.adoptionDelta)),
        marketDelay: state.markets.map(() => (rand() * 100 < n(o.delayProb) ? 1 : 0))
      };
      const f = forecast(modelId, state, sc, H);
      cum.push(f.cumulative[H - 1]);
      lastYear.push(f.total[H - 1]);
      profit.push(f.cumProfit[H - 1]);
      f.total.forEach((v, t) => yearly[t].push(v));
    }
    const sorted = cum.slice().sort((a, b) => a - b);
    const sortedLast = lastYear.slice().sort((a, b) => a - b);
    const mean = cum.reduce((s, v) => s + v, 0) / cum.length;
    const sd = Math.sqrt(cum.reduce((s, v) => s + (v - mean) * (v - mean), 0) / cum.length);
    const bands = yearly.map(arr => {
      const s = arr.sort((a, b) => a - b);
      return { p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9) };
    });
    const lossProb = profit.filter(v => v < 0).length / profit.length;
    const targetProb = o.target ? lastYear.filter(v => v >= o.target).length / lastYear.length : null;
    return {
      runs: o.runs, horizon: H, values: sorted, mean, sd,
      cv: mean ? sd / mean : 0,
      p5: quantile(sorted, 0.05), p10: quantile(sorted, 0.1), p50: quantile(sorted, 0.5), p90: quantile(sorted, 0.9),
      min: sorted[0], max: sorted[sorted.length - 1],
      lastP10: quantile(sortedLast, 0.1), lastP50: quantile(sortedLast, 0.5), lastP90: quantile(sortedLast, 0.9),
      valueAtRisk: mean - quantile(sorted, 0.05),
      bands, lossProb, targetProb
    };
  }

  function histogram(values, bins) {
    if (!values.length) return { edges: [], counts: [] };
    const min = values[0], max = values[values.length - 1];
    const w = (max - min) / bins || 1;
    const counts = new Array(bins).fill(0);
    values.forEach(v => { counts[Math.min(bins - 1, Math.floor((v - min) / w))]++; });
    const edges = counts.map((_, i) => min + i * w);
    return { edges, width: w, counts };
  }

  // ---------------------------------------------------------------------------
  // Sensitivität
  // ---------------------------------------------------------------------------
  const SENS_DRIVERS = [
    { id: 'users', label: 'Anzahl User', apply: (s, f) => s.markets.forEach(m => { m.activeUsers *= f; m.occasionalUsers *= f; }) },
    { id: 'sites', label: 'Standorte & Werkstätten', apply: (s, f) => s.markets.forEach(m => { m.sites *= f; m.workshops *= f; }) },
    { id: 'staff', label: 'Service-MA & Verkäufer', apply: (s, f) => s.markets.forEach(m => { m.serviceStaff *= f; m.salesStaff *= f; }) },
    { id: 'revenue', label: 'Marktumsatz', apply: (s, f) => s.markets.forEach(m => { m.marketRevenue *= f; }) },
    { id: 'price', label: 'Preisniveau', apply: (s, f, id) => applyFactor(s, id, f) },
    { id: 'growth', label: 'Wachstumsrate', apply: (s, f) => s.markets.forEach(m => { m.growth *= f; }) },
    { id: 'priceInc', label: 'Preissteigerung p.a.', apply: (s, f) => { s.forecast.priceIncrease *= f; } },
    { id: 'adoption', label: 'Adoption Rollout-Jahr', apply: (s, f) => { s.forecast.firstYearAdoption = Math.min(100, s.forecast.firstYearAdoption * f); } },
    { id: 'concRatio', label: 'Concurrent-Ratio', apply: (s, f) => { s.prices.concurrent.ratio *= f; s.prices.hybrid.concRatio *= f; } }
  ];

  function sensitivity(modelId, state, pct) {
    const d = (pct || 20) / 100;
    const base = forecast(modelId, state).cumulative.slice(-1)[0];
    const rows = SENS_DRIVERS.map(drv => {
      const lo = clone(state); drv.apply(lo, 1 - d, modelId);
      const hi = clone(state); drv.apply(hi, 1 + d, modelId);
      const vLo = forecast(modelId, lo).cumulative.slice(-1)[0];
      const vHi = forecast(modelId, hi).cumulative.slice(-1)[0];
      return {
        id: drv.id, label: drv.label, low: vLo, high: vHi,
        lowPct: base ? (vLo - base) / base * 100 : 0,
        highPct: base ? (vHi - base) / base * 100 : 0
      };
    });
    rows.sort((a, b) => Math.max(Math.abs(b.lowPct), Math.abs(b.highPct)) - Math.max(Math.abs(a.lowPct), Math.abs(a.highPct)));
    return { base, rows };
  }

  // 2D-Matrix: Preisänderung × Volumenänderung (User & Standorte)
  function sensitivityGrid(modelId, state, steps) {
    steps = steps || [-20, -10, 0, 10, 20];
    return steps.map(vol => steps.map(pr => {
      const s = clone(state);
      applyFactor(s, modelId, 1 + pr / 100);
      s.markets.forEach(m => {
        const f = 1 + vol / 100;
        ['sites', 'workshops', 'activeUsers', 'occasionalUsers', 'serviceStaff', 'salesStaff', 'marketRevenue'].forEach(k => { m[k] *= f; });
      });
      return forecast(modelId, s).cumulative.slice(-1)[0];
    }));
  }

  // ---------------------------------------------------------------------------
  // Management: Szenarien, Ranking & Empfehlung
  // ---------------------------------------------------------------------------
  function scenarioSummary(state, modelIds) {
    const ids = modelIds || MODELS.map(m => m.id);
    return ids.map(id => {
      const res = {};
      ['worst', 'realistic', 'best'].forEach(k => { res[k] = forecast(id, state, state.scenarios[k]); });
      return { model: MODEL_BY_ID[id], ...res };
    });
  }

  function cvAcross(values) {
    const v = values.filter(x => x > 0);
    if (v.length < 2) return 0;
    const mean = v.reduce((s, x) => s + x, 0) / v.length;
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
    return mean ? sd / mean : 0;
  }

  function ranking(state, modelIds) {
    const summary = scenarioSummary(state, modelIds);
    const H = n(state.forecast.horizon) || 5;
    const rows = summary.map(s => {
      const r = s.realistic;
      const revenue = r.cumulative[H - 1];
      const profit = r.cumProfit[H - 1];
      const worstRev = s.worst.cumulative[H - 1];
      const bestRev = s.best.cumulative[H - 1];
      const ss = steadyState(s.model.id, state);
      const fairness = 1 - Math.min(1, cvAcross(ss.perMarket.map(x => x.perUser)));
      return {
        model: s.model, revenue, profit, worstRev, bestRev,
        robustness: bestRev > 0 ? worstRev / bestRev : 0,
        breakEven: r.breakEven,
        margin: revenue > 0 ? profit / revenue : 0,
        fairness,
        annualFirstFull: ss.annual,
        forecast: r
      };
    });
    const maxRev = Math.max(...rows.map(r => r.revenue), 1);
    const start = n(state.forecast.startYear);
    rows.forEach(r => {
      const be = r.breakEven === null ? 0 : 1 - (r.breakEven - start) / H;
      r.scores = {
        revenue: r.revenue / maxRev,
        robustness: r.robustness,
        breakEven: Math.max(0, be),
        fairness: r.fairness,
        simplicity: r.model.simplicity / 5
      };
      r.score = 100 * (0.35 * r.scores.revenue + 0.2 * r.scores.robustness + 0.15 * r.scores.breakEven
        + 0.15 * r.scores.fairness + 0.15 * r.scores.simplicity);
    });
    rows.sort((a, b) => b.score - a.score);
    return rows;
  }

  const api = {
    MODELS, MODEL_BY_ID, MARKET_FIELDS, SENS_DRIVERS, REALISTIC,
    defaultState, clone, getPath, setPath, totalUsers,
    priceKeys, calcModel, licenseUnits, tierOf,
    marketInYear, priceFactor, forecast, steadyState,
    referenceRevenue, solveSingle, optimize, applyFactor,
    monteCarlo, histogram, quantile,
    sensitivity, sensitivityGrid, scenarioSummary, ranking
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WCP = api;
})(typeof window !== 'undefined' ? window : globalThis);
