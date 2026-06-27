let timerInterval = null;
let secondsElapsed = 0;
let cachedRecords = [];

const ALBERO_MANSIONI_CPN = {
  BITUMEN: {
    um: "m2",
    attrezzi: ["Brenner", "Laser Temp", "Martello"],
    sottofasi: {
      BIT001: "Voranstrich (Mano d'aggancio / Primer liquido)",
      BIT002: "Dampfbremsen (Posa Barriera al Vapore fiammata)",
      BIT003: "Isolieren (Posa Pannelli Isolanti PIR/EPS)",
      BIT004: "1. Lage (Stesa primo strato impermeabile EP4)",
      BIT005: "2. Lage (Stesa secondo strato ardesiato EP5 AR)"
    }
  },
  FLK: {
    um: "ml",
    attrezzi: ["Miscelatore", "Pennello/Rullo", "Laser Temp"],
    sottofasi: {
      FLK001: "Voranstrich / Primer bicomponente sottofondi",
      FLK002: "Stesa resina liquida + armatura in tessuto Vlies",
      FLK003: "Sigillatura risvolti verticali muretto Attika"
    }
  },
  KUNSTSTOFFBAHN: {
    um: "m2",
    attrezzi: ["Leister Aria Calda", "Metro CH", "Cesoie"],
    sottofasi: {
      SYN001: "Posa strato di separazione / Velo vetro",
      SYN002: "Stesa manto sintetico PVC fissato meccanicamente",
      SYN003: "Stesa manto sintetico FPO zavorrato a ghiaia",
      SYN004: "Saldatura ad aria calda dei giunti di testa"
    }
  },
  BEGRUENUNG: {
    um: "m2",
    attrezzi: ["Cutter", "Badile", "Metro"],
    sottofasi: {
      GRN001: "Posa feltro filtrante antipunzonamento",
      GRN002: "Posa elementi bugnati di drenaggio e accumulo",
      GRN003: "Stesa ghiaia lavata di zavorra perimetrale (16/32)",
      GRN004: "Stesa substrato minerale per piante grasse estensive"
    }
  },
  LATTONERIA: {
    um: "pz",
    attrezzi: ["Tassellatore", "Flex", "Martello"],
    sottofasi: {
      MON001: "Carotaggio isolamento e posa scarico principale Gully",
      MON002: "Posa troppo pieno di sicurezza Notablauf",
      MON003: "Fissaggio ed impermeabilizzazione gancio faldale Attika"
    }
  }
};

const PREZZI_CPN = {
  BIT001: { prezzo_cpn: 12.0, fm: 1.0 },
  BIT002: { prezzo_cpn: 24.0, fm: 1.12 },
  BIT003: { prezzo_cpn: 68.0, fm: 1.03 },
  BIT004: { prezzo_cpn: 42.0, fm: 1.15 },
  BIT005: { prezzo_cpn: 48.0, fm: 1.15 },
  FLK001: { prezzo_cpn: 25.0, fm: 1.0 },
  FLK002: { prezzo_cpn: 95.0, fm: 1.0 },
  FLK003: { prezzo_cpn: 120.0, fm: 1.05 },
  SYN001: { prezzo_cpn: 14.0, fm: 1.05 },
  SYN002: { prezzo_cpn: 74.0, fm: 1.08 },
  SYN003: { prezzo_cpn: 76.0, fm: 1.08 },
  SYN004: { prezzo_cpn: 18.0, fm: 1.02 },
  GRN001: { prezzo_cpn: 16.0, fm: 1.03 },
  GRN002: { prezzo_cpn: 28.0, fm: 1.02 },
  GRN003: { prezzo_cpn: 32.0, fm: 1.05 },
  GRN004: { prezzo_cpn: 45.0, fm: 1.08 },
  MON001: { prezzo_cpn: 390.0, fm: 1.0 },
  MON002: { prezzo_cpn: 340.0, fm: 1.0 },
  MON003: { prezzo_cpn: 180.0, fm: 1.0 }
};

function byId(id) {
  return document.getElementById(id);
}

function switchTab(tabId) {
  ["operaio", "bauleiter", "admin"].forEach((tab) => {
    byId(`view-${tab}`).classList.toggle("hidden", tab !== tabId);
    byId(`tab-${tab}`).className = tab === tabId
      ? "flex-1 sm:flex-none sm:px-4 px-2 py-2 rounded-lg text-xs font-mono font-bold bg-amber-500 text-slate-950 shadow-md"
      : "flex-1 sm:flex-none sm:px-4 px-2 py-2 rounded-lg text-xs font-mono font-bold text-slate-300 bg-slate-800 border border-slate-700";
  });

  if (tabId !== "operaio") {
    loadAudit();
  }
}

function aggiornaSottomenuDinamico() {
  const macro = byId("op-macro").value;
  const selectSotto = byId("op-sottofase");
  const config = ALBERO_MANSIONI_CPN[macro];

  byId("lbl-quantita").innerText = `Metri o Pezzi da Disegno / Capitolato (${config.um})`;
  byId("lbl-reale").innerText = `Materiale Reale Consumato sul Campo (${config.um})`;

  selectSotto.innerHTML = Object.entries(config.sottofasi)
    .map(([codice, descrizione]) => `<option value="${codice}">${codice} - ${descrizione}</option>`)
    .join("");

  cambiaSottofase();
}

function cambiaSottofase() {
  const macro = byId("op-macro").value;
  const config = ALBERO_MANSIONI_CPN[macro];

  byId("attrezzi-richiesti-box").innerHTML = config.attrezzi
    .map((attrezzo) => `<span class="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300 font-bold">${attrezzo}</span>`)
    .join("");

  updatePreview();
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function startMansione() {
  if (timerInterval) return;

  secondsElapsed = 0;
  byId("job-timer").innerText = "00:00:00";
  byId("box-form-operaio").classList.add("hidden");
  byId("btn-start").disabled = true;
  byId("btn-start").className = "w-full py-4 rounded-xl bg-slate-800 text-slate-600 font-black text-sm cursor-not-allowed border border-slate-700";
  byId("btn-stop").disabled = false;
  byId("btn-stop").className = "w-full py-4 rounded-xl bg-red-500 text-slate-950 font-black text-sm shadow-lg hover:bg-red-400";

  timerInterval = setInterval(() => {
    secondsElapsed += 1;
    byId("job-timer").innerText = formatDuration(secondsElapsed);
  }, 1000);
}

function stopMansione() {
  clearInterval(timerInterval);
  timerInterval = null;
  byId("btn-start").disabled = false;
  byId("btn-start").className = "w-full py-4 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm shadow-lg hover:bg-emerald-400";
  byId("btn-stop").disabled = true;
  byId("btn-stop").className = "w-full py-4 rounded-xl bg-slate-800 text-slate-500 font-black text-sm border border-slate-700 cursor-not-allowed";

  const oreFrazione = Math.max(0.01, Math.round((secondsElapsed / 3600) * 100) / 100);
  byId("op-ore").value = oreFrazione;
  byId("box-form-operaio").classList.remove("hidden");
  updatePreview();
}

function currentCalculation() {
  const codice = byId("op-sottofase").value || "BIT001";
  const metri = Number(byId("op-quantita").value || 0);
  const reale = Number(byId("op-materiale-reale").value || 0);
  const info = PREZZI_CPN[codice] || { prezzo_cpn: 0, fm: 1 };
  const consumoTeorico = Math.round(metri * info.fm * 100) / 100;
  const volumeSpreco = Math.max(0, Math.round((reale - consumoTeorico) * 100) / 100);
  const percentualeSpreco = consumoTeorico > 0 ? Math.round((volumeSpreco / consumoTeorico) * 10000) / 100 : 0;
  const costo = Math.round(metri * info.prezzo_cpn * 100) / 100;
  return { codice, metri, reale, consumoTeorico, volumeSpreco, percentualeSpreco, costo };
}

function updatePreview() {
  const box = byId("calcolo-preview");
  if (!box) return;
  const calc = currentCalculation();
  box.innerHTML = `Consumo teorico SIA: <strong>${calc.consumoTeorico}</strong> · Materiale reale: <strong>${calc.reale}</strong> · Spreco stimato: <strong>${calc.volumeSpreco}</strong> (${calc.percentualeSpreco}%) · Valore CPN: <strong>CHF ${calc.costo}</strong>`;
}

async function submitOperaio(e) {
  e.preventDefault();
  const payload = {
    codice_mansione: byId("op-sottofase").value,
    quantita_metri: Number(byId("op-quantita").value || 0),
    materiale_reale: Number(byId("op-materiale-reale").value || 0),
    ore_lavorate: Number(byId("op-ore").value || 0),
    temperatura: Number(byId("op-temp").value || 0),
    note_anomalie: byId("op-note").value,
    suva: {
      brenner: byId("suva-brenner").checked,
      bordi: byId("suva-bordi").checked,
      foto: byId("suva-foto").checked
    }
  };

  setSync("Sincronizzazione...");
  try {
    const res = await fetch("/api/main", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Errore API");

    alert(`Sincronizzato Cloud: ${data.notifica_controlling}`);
    byId("box-form-operaio").classList.add("hidden");
    byId("form-operaio-core").reset();
    byId("job-timer").innerText = "00:00:00";
    secondsElapsed = 0;
    setSync("DB Connesso");
    aggiornaSottomenuDinamico();
    await loadAudit();
  } catch (err) {
    const offline = JSON.parse(localStorage.getItem("dachplan_offline_records") || "[]");
    offline.push({ ...payload, offline_at: new Date().toISOString(), preview: currentCalculation() });
    localStorage.setItem("dachplan_offline_records", JSON.stringify(offline));
    setSync("Offline locale");
    alert("Dati archiviati localmente offline.");
  }
}

async function loadAudit() {
  try {
    const res = await fetch("/api/main", { headers: { Accept: "application/json" } });
    const data = await res.json();
    cachedRecords = data.records || [];
  } catch {
    cachedRecords = JSON.parse(localStorage.getItem("dachplan_offline_records") || "[]");
  }
  renderAudit();
}

function renderAudit() {
  const list = byId("bauleiter-list");
  const table = byId("admin-table");
  const records = cachedRecords.slice(-50).reverse();

  if (list) {
    list.innerHTML = records.length
      ? records.map((r) => `<article class="bg-slate-950 border border-slate-800 rounded-xl p-4"><div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><div class="text-amber-400 font-black">${r.codice_mansione || r.Codice || ""} · ${r.nome_mansione || r.Mansione || ""}</div><div class="text-xs text-slate-400">${r.categoria || r.Categoria || ""} · ${r.quantita_metri || r.Quantita || 0} · Temp ${r.temperatura || r.Temperatura || 0} C</div></div><div class="text-xs font-mono text-red-300">Spreco ${r.percentuale_spreco || r.SprecoPercentuale || 0}%</div></div></article>`).join("")
      : `<div class="text-sm text-slate-400 bg-slate-950 border border-slate-800 rounded-xl p-6">Nessuna riga disponibile.</div>`;
  }

  if (table) {
    table.innerHTML = records.map((r) => `<tr class="border-b border-slate-800"><td class="py-2">${r.timestamp || r.Timestamp || ""}</td><td>${r.codice_mansione || r.Codice || ""}</td><td>${r.nome_mansione || r.Mansione || ""}</td><td>${r.categoria || r.Categoria || ""}</td><td>${r.quantita_metri || r.Quantita || 0}</td><td>${r.consumo_teorico_sia || r.ConsumoTeorico || 0}</td><td>${r.materiale_reale || r.MaterialeReale || 0}</td><td>${r.percentuale_spreco || r.SprecoPercentuale || 0}%</td><td>${r.costo_calcolato || r.Costo || 0}</td></tr>`).join("");
  }

  const sum = (key) => cachedRecords.reduce((acc, item) => acc + Number(item[key] || 0), 0);
  if (byId("kpi-quantita")) byId("kpi-quantita").innerText = sum("quantita_metri").toFixed(1);
  if (byId("kpi-costo")) byId("kpi-costo").innerText = sum("costo_calcolato").toFixed(2);
  if (byId("kpi-righe")) byId("kpi-righe").innerText = String(cachedRecords.length);
  if (byId("kpi-spreco")) {
    const totalTheory = sum("consumo_teorico_sia");
    const totalWaste = sum("volume_spreco");
    byId("kpi-spreco").innerText = totalTheory > 0 ? `${((totalWaste / totalTheory) * 100).toFixed(2)}%` : "0%";
  }
}

function setSync(text) {
  const badge = byId("sync-badge");
  if (badge) badge.querySelector("span:last-child").innerText = text;
}

document.addEventListener("DOMContentLoaded", () => {
  aggiornaSottomenuDinamico();
  ["op-quantita", "op-materiale-reale", "op-sottofase"].forEach((id) => byId(id).addEventListener("input", updatePreview));
});
