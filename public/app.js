const API_URL = "/.netlify/functions/main";
const SHEET_ID = "1ttfAdqE3TI7G_gwapZhz3Yw3dKSYHM2smpQoILLGcJ0";
const objectMap = {
  "1": "Fenster / Tuere (Metallo)",
  "2": "Anschluss Dachpappe -> Beton (Calcestruzzo)",
  "3": "Ablauf (Metallo)",
  "4": "Notablauf (Metallo)",
  "5": "Anschluss Dachpappe -> Blech (Metallo)"
};

let timerStart = null;
let timerInterval = null;
let financeChart = null;
let cachedReports = [];
const furgoneStock = { MAT001: 250, MAT002: 15000, CON001: 15 };

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".decimal-input").forEach((input) => {
    input.addEventListener("input", () => {
      const fixed = sanitizeDecimal(input.value);
      if (input.value !== fixed) input.value = fixed;
      calculateHours();
    });
    input.addEventListener("blur", () => {
      input.value = toNumber(input.value).toFixed(input.id === "op-temp" ? 1 : 2).replace(/\.00$/, "");
      calculateHours();
    });
  });
  calculateHours();
  loadReports();
});

function sanitizeDecimal(value) {
  const normalized = String(value || "").replace(",", ".").replace(/[^\d.]/g, "");
  const parts = normalized.split(".");
  return parts.length <= 1 ? parts[0] : `${parts.shift()}.${parts.join("")}`;
}

function toNumber(value) {
  const parsed = Number.parseFloat(sanitizeDecimal(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function switchTab(tab) {
  ["operaio", "bauleiter", "admin"].forEach((name) => {
    const active = name === tab;
    document.getElementById(`view-${name}`).classList.toggle("hidden", !active);
    const btn = document.getElementById(`tab-${name}`);
    btn.className = active
      ? "flex-1 sm:flex-none sm:px-4 px-2 py-2 rounded-lg text-xs sm:text-sm font-mono font-bold bg-amber-500 text-slate-950 shadow-md transition-all"
      : "flex-1 sm:flex-none sm:px-4 px-2 py-2 rounded-lg text-xs sm:text-sm font-mono font-bold text-slate-300 bg-slate-800 border border-slate-700 transition-all";
  });
  if (tab !== "operaio") loadReports();
}

function setSystemLocal(system) {
  document.getElementById("op-sistema").value = system;
  ["1K", "2K"].forEach((name) => {
    const btn = document.getElementById(`btn-${name.toLowerCase()}`);
    const active = name === system;
    btn.className = active
      ? "flex-1 py-3 bg-amber-500 text-slate-950 font-bold rounded-lg text-xs font-mono"
      : "flex-1 py-3 bg-slate-800 text-slate-400 font-bold rounded-lg text-xs font-mono border border-slate-700";
  });
  calculateHours();
}

function startMansione() {
  timerStart = Date.now();
  clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 1000);
  updateTimer();
  document.getElementById("box-form-operaio").classList.remove("hidden");
  document.getElementById("btn-start").disabled = true;
  document.getElementById("btn-start").className = "w-full py-4 rounded-xl bg-slate-800 text-slate-500 font-black text-sm sm:text-base shadow-lg cursor-not-allowed transition-all";
  document.getElementById("btn-stop").disabled = false;
  document.getElementById("btn-stop").className = "w-full py-4 rounded-xl bg-red-500 text-white font-black text-sm sm:text-base shadow-lg hover:bg-red-400 transition-all";
}

function stopMansione() {
  clearInterval(timerInterval);
  calculateHours();
  document.getElementById("btn-start").disabled = false;
  document.getElementById("btn-start").className = "w-full py-4 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm sm:text-base shadow-lg hover:bg-emerald-400 transition-all";
  document.getElementById("btn-stop").disabled = true;
  document.getElementById("btn-stop").className = "w-full py-4 rounded-xl bg-slate-800 text-slate-500 font-black text-sm sm:text-base shadow-lg cursor-not-allowed transition-all";
}

function updateTimer() {
  const elapsed = timerStart ? Math.floor((Date.now() - timerStart) / 1000) : 0;
  const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");
  document.getElementById("job-timer").textContent = `${h}:${m}:${s}`;
  calculateHours();
}

function calculateHours() {
  const ml = toNumber(document.getElementById("op-ml")?.value);
  const vlies = toNumber(document.getElementById("op-vlies")?.value);
  const system = document.getElementById("op-sistema")?.value || "1K";
  const elapsedHours = timerStart ? (Date.now() - timerStart) / 3600000 : 0;
  const productionHours = ml * (system === "2K" ? 0.18 : 0.14) + vlies * 0.04;
  const hours = Math.max(elapsedHours, productionHours);
  const target = document.getElementById("op-ore");
  if (target) target.value = hours.toFixed(2);
  return hours;
}

function validateForm() {
  const errors = [];
  const temp = toNumber(document.getElementById("op-temp").value);
  if (!document.getElementById("chk-psa").checked) errors.push("PSA obbligatorio non confermato.");
  if (!document.getElementById("chk-meteo").checked) errors.push("Meteo SIA 271 non confermato.");
  if (!document.getElementById("chk-fiamma").checked) errors.push("Protezione fiamma non confermata.");
  if (!document.getElementById("chk-brenner").checked) errors.push("Brenner non confermato chiuso.");
  if (!document.getElementById("chk-linee-vita").checked) errors.push("Linee vita non confermate.");
  if (temp < 5) errors.push("Temperatura supporto sotto soglia SIA 271.");
  if (toNumber(document.getElementById("op-ml").value) <= 0 && toNumber(document.getElementById("op-vlies").value) <= 0) errors.push("Inserire metri lineari, pezzi o telo.");
  return errors;
}

async function submitForm(event) {
  event.preventDefault();
  const status = document.getElementById("form-status");
  const errors = validateForm();
  if (errors.length) {
    status.textContent = errors.join(" ");
    status.className = "text-xs text-red-400";
    return;
  }
  const payload = buildPayload();
  const button = document.getElementById("submit-btn");
  button.disabled = true;
  status.textContent = "Invio in corso...";
  status.className = "text-xs text-slate-400";
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Invio non riuscito");
    updateInventory(payload);
    status.textContent = "Registrazione completata e normalizzata su 22 colonne.";
    status.className = "text-xs text-emerald-400";
    cachedReports.unshift(data.record || payload);
    renderReports(cachedReports);
    stopMansione();
  } catch (error) {
    status.textContent = error.message;
    status.className = "text-xs text-red-400";
  } finally {
    button.disabled = false;
  }
}

function buildPayload() {
  const objectId = document.getElementById("op-oggetto").value;
  const temp = toNumber(document.getElementById("op-temp").value);
  const now = new Date();
  return {
    source: "DachPlan OS",
    sheet_id: SHEET_ID,
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 8),
    level: "operaio",
    worker: "Cantiere Live",
    site: "DachPlan Diario",
    system: document.getElementById("op-sistema").value,
    object_id: objectId,
    object_label: objectMap[objectId],
    ml: toNumber(document.getElementById("op-ml").value),
    vlies_m: toNumber(document.getElementById("op-vlies").value),
    support_temp_c: temp,
    hours: calculateHours(),
    notes: document.getElementById("op-note").value.trim(),
    suva_psa: document.getElementById("chk-psa").checked,
    suva_meteo: document.getElementById("chk-meteo").checked,
    suva_fire: document.getElementById("chk-fiamma").checked,
    brenner_closed: document.getElementById("chk-brenner").checked,
    linee_vita_ok: document.getElementById("chk-linee-vita").checked,
    joint_photo_name: document.getElementById("foto-giunto").files[0]?.name || "",
    van_stock: { ...furgoneStock },
    sia_118: true,
    sia_271: temp >= 5,
    sia_312: true,
    status: temp >= 5 ? "validato" : "bloccato"
  };
}

function updateInventory(payload) {
  const kgResina = payload.ml * 2.5;
  furgoneStock.MAT001 = Math.max(0, roundStock(furgoneStock.MAT001 - kgResina));
  if (payload.system === "2K") {
    furgoneStock.MAT002 = Math.max(0, roundStock(furgoneStock.MAT002 - kgResina * 20));
  }
  furgoneStock.CON001 = Math.max(0, furgoneStock.CON001 - Math.ceil(payload.ml / 10));
  document.getElementById("lbl-mat001").textContent = `${furgoneStock.MAT001} kg`;
  document.getElementById("lbl-mat002").textContent = `${furgoneStock.MAT002} g`;
  document.getElementById("lbl-con001").textContent = `${furgoneStock.CON001} pz`;
  payload.van_stock = { ...furgoneStock };
}

function roundStock(value) {
  return Math.round(value * 100) / 100;
}

async function loadReports() {
  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    cachedReports = Array.isArray(data.records) ? data.records : cachedReports;
  } catch {
    cachedReports = cachedReports.length ? cachedReports : [];
  }
  renderReports(cachedReports);
}

function renderReports(records) {
  const list = document.getElementById("reports-list");
  const table = document.getElementById("finance-table");
  const count = records.length;
  const compliant = records.filter((r) => r.sia_118 && r.sia_271 && r.sia_312).length;
  const alerts = records.filter((r) => r.status !== "validato").length;
  document.getElementById("kpi-count").textContent = String(count);
  document.getElementById("kpi-sia").textContent = count ? `${Math.round((compliant / count) * 100)}%` : "0%";
  document.getElementById("kpi-alert").textContent = String(alerts);
  list.innerHTML = records.length ? records.map(reportCard).join("") : `<div class="text-sm text-slate-400 border border-dashed border-slate-800 rounded-xl p-6 text-center">Nessuna registrazione disponibile.</div>`;
  table.innerHTML = records.map(financeRow).join("");
  renderChart(records);
}

function reportCard(r) {
  const ok = r.status === "validato";
  return `<div class="bg-slate-950 border border-slate-800 rounded-xl p-4">
    <div class="flex items-start justify-between gap-3">
      <div><div class="font-bold text-slate-100">${escapeHtml(r.object_label || "Mansione")}</div><div class="text-xs text-slate-400 font-mono">${escapeHtml(r.date || "")} ${escapeHtml(r.time || "")} · ${escapeHtml(r.system || "")}</div></div>
      <span class="text-xs font-bold px-2 py-1 rounded-full ${ok ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}">${escapeHtml(r.status || "bozza")}</span>
    </div>
    <div class="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
      <div class="bg-slate-900 rounded-lg p-2"><div class="text-slate-400">ML/PZ</div><div class="font-black">${Number(r.ml || 0).toFixed(2)}</div></div>
      <div class="bg-slate-900 rounded-lg p-2"><div class="text-slate-400">Vlies</div><div class="font-black">${Number(r.vlies_m || 0).toFixed(2)}</div></div>
      <div class="bg-slate-900 rounded-lg p-2"><div class="text-slate-400">Ore</div><div class="font-black">${Number(r.hours || 0).toFixed(2)}</div></div>
    </div>
  </div>`;
}

function financeRow(r) {
  const cost = Number(r.hours || 0) * 84;
  return `<tr class="border-t border-slate-800"><td class="py-2">${escapeHtml(r.date || "")}</td><td class="py-2">${escapeHtml(r.object_label || "")}</td><td class="py-2 text-right">${Number(r.hours || 0).toFixed(2)}</td><td class="py-2 text-right">${cost.toFixed(2)}</td><td class="py-2 text-right">${escapeHtml(r.status || "")}</td></tr>`;
}

function renderChart(records) {
  const ctx = document.getElementById("finance-chart");
  if (!ctx || typeof Chart === "undefined") return;
  const totals = records.reduce((acc, r) => {
    const key = r.object_label || "Mansione";
    acc[key] = (acc[key] || 0) + Number(r.hours || 0);
    return acc;
  }, {});
  const labels = Object.keys(totals).slice(0, 6);
  const data = labels.map((label) => totals[label]);
  if (financeChart) financeChart.destroy();
  financeChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Ore", data, backgroundColor: "#f59e0b" }] },
    options: { responsive: true, plugins: { legend: { labels: { color: "#cbd5e1" } } }, scales: { x: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } }, y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } } } }
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
