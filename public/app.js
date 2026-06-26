// DachPlan OS — logica frontend dashboard.
// Intercetta l'input "zero attrito" dell'operaio, lo invia alla Netlify Function
// /api/main (motore consumi + Netlify Database) e aggiorna stock/ordini a video.

let currentSystem = "1K";

// Regole UI per oggetto: avvisi mostrati all'operaio (allineate al motore backend).
const OBJECT_HINTS = {
  1: { primer: true },
  3: { primer: true },
  4: { primer: true },
  5: { primer: true },
  2: { beton: true },
};

function setSystem(system) {
  currentSystem = system;
  const active = "px-4 py-2 rounded-lg font-mono font-bold text-sm transition-all border border-amber-500 bg-amber-500 text-gray-950";
  const idle = "px-4 py-2 rounded-lg font-mono font-bold text-sm transition-all border border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600";
  document.getElementById("btnSystem1K").className = system === "1K" ? active : idle;
  document.getElementById("btnSystem2K").className = system === "2K" ? active : idle;
  handleObjectChange();
}

function handleObjectChange() {
  const val = parseInt(document.getElementById("selectOggetto").value, 10);
  const box = document.getElementById("boxCondizionale");
  const hint = OBJECT_HINTS[val] || {};
  let html = "";
  if (hint.primer) {
    html += `<div class="text-amber-400">⚠️ <b>REGOLA:</b> Oggetto metallico → Primer Metallo Spray (MAT005) scalato automaticamente.</div>`;
  }
  if (hint.beton) {
    html += `<div class="text-red-400">⚙️ <b>ATTREZZO:</b> Lavorazione Beton → Schleifscheibe (CON001) + Mascherina FFP2.</div>`;
  }
  if (currentSystem === "2K") {
    html += `<div class="text-emerald-400 border-t border-gray-800 pt-1 mt-1">🧪 <b>2K:</b> Resina (MAT001) + Catalizzatore (MAT002, 20 g/kg) scalati automaticamente.</div>`;
  }
  box.classList.remove("hidden");
  box.innerHTML = html || `<div class="text-gray-400">ℹ️ Sottofondo standard SIA 271.</div>`;
}

async function submitForm(e) {
  e.preventDefault();
  const btn = document.getElementById("btnSubmit");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "SINCRONIZZAZIONE…";

  const payload = {
    oggetto_id: document.getElementById("selectOggetto").value,
    sistema: currentSystem,
    quantita: document.getElementById("inputQuantita").value,
    vlies_m: document.getElementById("vliesM").value,
    glass_vlies_m: document.getElementById("glassM").value,
    montaggio_scarichi: document.getElementById("montaggioScarichi").checked,
  };

  try {
    const response = await fetch("/api/main", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Errore server");

    pushAlert(data.notifica_controlling, data.ordini_generati && data.ordini_generati.length ? "order" : "ok");
    await Promise.all([loadInventory(), loadOrders()]);
  } catch (err) {
    pushAlert("Errore: " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function pushAlert(message, kind) {
  const styles = {
    ok: "bg-amber-950/30 border-amber-900/50 text-amber-200",
    order: "bg-emerald-950/30 border-emerald-900/50 text-emerald-200",
    err: "bg-red-950/40 border-red-900/60 text-red-200",
  };
  const div = document.createElement("div");
  div.className = `p-4 rounded-lg border text-sm ${styles[kind] || styles.ok}`;
  div.textContent = message;
  document.getElementById("alertBox").prepend(div);
}

async function loadInventory() {
  const container = document.getElementById("stockContainer");
  try {
    const res = await fetch("/api/inventory");
    const { items } = await res.json();
    setDbStatus(true);
    container.innerHTML = items
      .map((it) => {
        if (it.categoria === "attrezzi") {
          const state = it.disponibile
            ? '<span class="text-emerald-400 font-bold">DISPONIBILE</span>'
            : '<span class="text-red-400 font-bold">IN USO</span>';
          return row(it.id + " — " + it.nome, state, "border-gray-800");
        }
        const low = it.sotto_soglia;
        const color = low ? "text-red-400" : "text-emerald-400";
        const border = low ? "border-red-900/60" : "border-gray-800";
        const val = `<span class="${color} font-bold">${formatNum(it.stock)} ${it.unita}</span>`;
        return row(it.id + " — " + it.nome, val, border);
      })
      .join("");
  } catch (e) {
    setDbStatus(false);
    container.innerHTML = '<div class="text-red-400 p-3">Magazzino non raggiungibile.</div>';
  }
}

async function loadOrders() {
  const container = document.getElementById("ordersContainer");
  try {
    const res = await fetch("/api/orders");
    const { orders } = await res.json();
    if (!orders.length) {
      container.innerHTML = '<div class="text-gray-500 p-3">Nessun ordine automatico.</div>';
      return;
    }
    container.innerHTML = orders
      .map((o) => {
        const left = `${o.materiale_id} — ${o.materiale_nome}`;
        const right = `<span class="text-amber-400 font-bold">${formatNum(o.quantita)} pz</span> <span class="text-gray-500">@ ${o.fornitore}</span>`;
        return row(left, right, "border-amber-900/40");
      })
      .join("");
  } catch (e) {
    container.innerHTML = '<div class="text-red-400 p-3">Ordini non raggiungibili.</div>';
  }
}

function row(left, right, border) {
  return `<div class="flex justify-between gap-3 p-3 bg-gray-950 rounded border ${border}"><span class="text-gray-300">${left}</span><span class="text-right">${right}</span></div>`;
}

function formatNum(n) {
  return Number(n).toLocaleString("de-CH", { maximumFractionDigits: 2 });
}

function setDbStatus(ok) {
  const el = document.getElementById("dbStatus");
  if (ok) {
    el.className = "flex items-center gap-2 text-emerald-400 font-medium text-sm";
    el.innerHTML = '<span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span> Netlify DB: Sincronizzato';
  } else {
    el.className = "flex items-center gap-2 text-red-400 font-medium text-sm";
    el.innerHTML = '<span class="h-2 w-2 rounded-full bg-red-500"></span> Netlify DB: Offline';
  }
}

function initChart() {
  const canvas = document.getElementById("evmChart");
  if (!canvas || typeof Chart === "undefined") return;
  new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: ["G1", "G2", "G3", "G4", "G5"],
      datasets: [
        { label: "Budget CPN (PV)", data: [2000, 4000, 6000, 8000, 10000], borderColor: "#f59e0b", tension: 0.3, fill: false },
        { label: "Earned Value (EV)", data: [1800, 3600, 5200, 7400, 9100], borderColor: "#10b981", tension: 0.3, fill: false },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#9ca3af" } } },
      scales: {
        x: { ticks: { color: "#6b7280" }, grid: { color: "#1f2937" } },
        y: { ticks: { color: "#6b7280" }, grid: { color: "#1f2937" } },
      },
    },
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("formCantiere").addEventListener("submit", submitForm);
  handleObjectChange();
  initChart();
  loadInventory();
  loadOrders();
});
