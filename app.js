let timerInterval = null;
let secondsElapsed = 0;
let magazzinoDinamico = [];
let reports = [];
let evmChart = null;

const fallbackStock = [
  { Codice_CPN: 'MAT001', Descrizione: 'Resina FLK 1K', Categoria: 'materiali', Stock_Attuale: 250, Soglia_Minima: 80, UM: 'kg', Fornitore: 'Sika Schweiz', Netto: 8.7 },
  { Codice_CPN: 'MAT002', Descrizione: 'Catalizzatore PMMA', Categoria: 'materiali', Stock_Attuale: 15000, Soglia_Minima: 3500, UM: 'g', Fornitore: 'Soprema', Netto: 0.08 },
  { Codice_CPN: 'CON001', Descrizione: 'Dischi cemento', Categoria: 'consumabili', Stock_Attuale: 15, Soglia_Minima: 10, UM: 'pz', Fornitore: 'Wuerth', Netto: 4.2 },
  { Codice_CPN: 'ATZ001', Descrizione: 'Flex', Categoria: 'attrezzi', Stock_Attuale: 1, Soglia_Minima: 1, UM: 'pz', Fornitore: 'Bosch', Netto: 180 },
  { Codice_CPN: 'ATZ006', Descrizione: 'Brenner gas Linde', Categoria: 'attrezzi', Stock_Attuale: 2, Soglia_Minima: 1, UM: 'pz', Fornitore: 'Linde', Netto: 96 }
];

function setCloudStatus(text, ok = true) {
  const el = document.getElementById('cloudStatus');
  if (!el) return;
  el.className = `inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 ${ok ? 'text-emerald-400' : 'text-amber-400'} font-bold`;
  el.innerHTML = `<span class="w-2 h-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse"></span> ${text}`;
}

async function caricaMagazzinoDalCloud() {
  try {
    const response = await fetch('/api/main?action=get_listino');
    const data = await response.json();
    if (data.status === 'success') {
      magazzinoDinamico = data.listino && data.listino.length ? data.listino : fallbackStock;
      reports = data.reports || reports;
      updateAdmin(data.kpi);
      renderizzaMagazzinoVisivo();
      renderReports();
      setCloudStatus(data.source === 'google_sheet' ? 'Cloud DB Linked' : 'Offline Cache');
      return;
    }
  } catch (err) {
    setCloudStatus('Offline Cache', false);
  }
  magazzinoDinamico = fallbackStock;
  renderizzaMagazzinoVisivo();
}

function renderizzaMagazzinoVisivo() {
  const container = document.getElementById('stockContainer');
  if (!container) return;
  const items = magazzinoDinamico.length ? magazzinoDinamico : fallbackStock;
  container.innerHTML = items.map((item) => {
    const current = parseFloat(item.Stock_Attuale || 0);
    const min = parseFloat(item.Soglia_Minima || 0);
    const alertClass = current < min ? 'border-red-900/60 bg-red-950/20' : 'border-slate-800 bg-slate-950';
    const badge = item.Categoria === 'materiali' ? 'bg-cyan-950 text-cyan-300 border-cyan-900' : item.Categoria === 'consumabili' ? 'bg-pink-950 text-pink-300 border-pink-900' : 'bg-purple-950 text-purple-300 border-purple-900';
    return `<div class="flex items-center justify-between gap-3 p-3 rounded-lg border ${alertClass}">
      <div>
        <div class="font-bold text-slate-200 text-xs">${escapeHtml(item.Codice_CPN)} - ${escapeHtml(item.Descrizione)}</div>
        <div class="text-[10px] text-slate-500 font-mono mt-0.5">Fornitore: ${escapeHtml(item.Fornitore || 'CHPLAN')} | Netto: CHF ${escapeHtml(item.Netto || '0')}</div>
      </div>
      <span class="shrink-0 px-2 py-1 rounded text-[10px] font-bold border ${badge}">${escapeHtml(item.Stock_Attuale)} ${escapeHtml(item.UM || '')}</span>
    </div>`;
  }).join('');
}

function renderReports() {
  const container = document.getElementById('reportContainer');
  if (!container) return;
  const rows = reports.length ? reports.slice(-8).reverse() : [{ timestamp: 'Live', oggetto: 'Nessun rapporto ancora registrato', quantita: 0, ore_lavorate: 0, temperatura: 15, note_anomalie: 'In attesa della prima chiusura mansione.' }];
  container.innerHTML = rows.map((r) => {
    const temp = parseFloat(r.temperatura || 0);
    const risk = temp < 5 ? 'SIA 271: temperatura supporto critica' : 'SIA/SUVA conforme';
    const color = temp < 5 ? 'text-red-300 border-red-900/60 bg-red-950/20' : 'text-emerald-300 border-slate-800 bg-slate-950';
    return `<div class="p-3 rounded-lg border ${color}">
      <div class="flex items-center justify-between gap-3">
        <div class="font-bold text-sm">${escapeHtml(r.oggetto || r.oggetto_id || 'Mansione')}</div>
        <div class="text-[10px] font-mono text-slate-500">${escapeHtml(r.timestamp || '')}</div>
      </div>
      <div class="mt-2 text-xs text-slate-400 font-mono">${escapeHtml(r.quantita || 0)} unita · ${escapeHtml(r.ore_lavorate || 0)} h · ${escapeHtml(r.temperatura || 0)} C · ${risk}</div>
      <div class="mt-1 text-xs text-slate-300">${escapeHtml(r.note_anomalie || '')}</div>
    </div>`;
  }).join('');
}

function switchTab(tabId) {
  ['operaio', 'bauleiter', 'admin'].forEach((id) => {
    document.getElementById(`view-${id}`).classList.toggle('hidden', id !== tabId);
    const tab = document.getElementById(`tab-${id}`);
    tab.className = id === tabId
      ? 'flex-1 sm:flex-none sm:px-4 px-2 py-3 rounded-lg text-xs sm:text-sm font-mono font-bold bg-amber-500 text-slate-950 shadow-lg transition-all'
      : 'flex-1 sm:flex-none sm:px-4 px-2 py-3 rounded-lg text-xs sm:text-sm font-mono font-bold text-slate-300 bg-slate-800 border border-slate-700 transition-all';
  });
  if (tabId === 'bauleiter' || tabId === 'admin') refreshCloud();
}

function startMansione() {
  if (timerInterval) return;
  secondsElapsed = 0;
  document.getElementById('btn-start').disabled = true;
  document.getElementById('btn-start').className = 'w-full py-5 rounded-xl bg-slate-800 text-slate-600 font-black cursor-not-allowed border border-slate-700';
  document.getElementById('btn-stop').disabled = false;
  document.getElementById('btn-stop').className = 'w-full py-5 rounded-xl bg-red-500 text-slate-950 font-black shadow-lg hover:bg-red-400';
  timerInterval = setInterval(() => {
    secondsElapsed += 1;
    document.getElementById('job-timer').innerText = formatSeconds(secondsElapsed);
  }, 1000);
}

function stopMansione() {
  clearInterval(timerInterval);
  timerInterval = null;
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-start').className = 'w-full py-5 rounded-xl bg-emerald-500 text-slate-950 font-black text-base shadow-lg hover:bg-emerald-400 active:scale-[0.99] transition-all tracking-wide';
  document.getElementById('btn-stop').disabled = true;
  document.getElementById('btn-stop').className = 'w-full py-5 rounded-xl bg-slate-800 text-slate-500 font-black text-base border border-slate-700 cursor-not-allowed transition-all';
  document.getElementById('box-form-operaio').classList.remove('hidden');
}

async function submitOperaio(e) {
  e.preventDefault();
  const payload = {
    oggetto_id: parseInt(document.getElementById('op-oggetto').value, 10),
    quantita: parseFloat(document.getElementById('op-ml').value || '0'),
    vlies_m: parseFloat(document.getElementById('op-vlies').value || '0'),
    ore_lavorate: Math.max(0.5, Math.round((secondsElapsed / 3600) * 100) / 100),
    temperatura: parseFloat(document.getElementById('op-temp').value || '0'),
    note_anomalie: document.getElementById('op-note').value,
    operaio_nome: 'Andreas Dancs',
    cantiere_indirizzo: 'Keller Solaio',
    meteo_condizione: 'Sole'
  };
  try {
    const res = await fetch('/api/main', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.status !== 'success') throw new Error(data.message || 'sync failed');
    reports.push(data.report);
    alert(`Sincronizzato: ${data.notifica_controlling}`);
    document.getElementById('box-form-operaio').classList.add('hidden');
    document.getElementById('job-timer').innerText = '00:00:00';
    secondsElapsed = 0;
    refreshCloud();
  } catch (err) {
    localStorage.setItem(`dachplan-offline-${Date.now()}`, JSON.stringify(payload));
    alert('Archiviato offline in LocalStorage.');
  }
}

function triggerSoluzione(tipo) {
  const out = document.getElementById('soluzioneOutput');
  out.classList.remove('hidden');
  out.innerText = tipo === 'A' ? 'Soluzione A applicata (+CHF 8/m2)' : tipo === 'B' ? 'Soluzione B applicata (+CHF 15/m2)' : 'Soluzione C applicata (+CHF 28/m2)';
}

function updateAdmin(kpi = {}) {
  document.getElementById('kpiMargin').innerText = `${kpi.margin || 28.4}%`;
  document.getElementById('kpiRevenue').innerText = `CHF ${Number(kpi.revenue || 0).toLocaleString('de-CH')}`;
  document.getElementById('kpiRisks').innerText = kpi.risks || 0;
  const ctx = document.getElementById('evmChart');
  if (!ctx || typeof Chart === 'undefined') return;
  if (evmChart) evmChart.destroy();
  evmChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['G1', 'G2', 'G3', 'G4', 'G5'],
      datasets: [
        { label: 'Budget CPN', data: [1200, 2400, 3600, 4800, 6200], borderColor: '#f59e0b', tension: 0.35 },
        { label: 'Valore prodotto', data: kpi.evm || [980, 2320, 3180, 5050, 5900], borderColor: '#10b981', tension: 0.35 }
      ]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#cbd5e1' } } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } }
  });
}

function refreshCloud() {
  return caricaMagazzinoDalCloud();
}

function formatSeconds(total) {
  const h = Math.floor(total / 3600).toString().padStart(2, '0');
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

document.addEventListener('DOMContentLoaded', () => {
  updateAdmin();
  refreshCloud();
});
