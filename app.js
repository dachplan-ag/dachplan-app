let activeTab = 'operaio';
let timerInterval = null;
let secondsElapsed = 0;
let magazzinoDinamico = [];

const tabBaseClass = 'flex-1 sm:flex-none sm:px-4 px-2 py-2 rounded-lg text-xs sm:text-sm font-mono font-bold transition-all';
const activeTabClass = `${tabBaseClass} bg-amber-500 text-slate-950 shadow-md`;
const inactiveTabClass = `${tabBaseClass} text-slate-300 bg-slate-800 border border-slate-700`;

async function caricaMagazzinoDalCloud() {
  const status = document.getElementById('stock-status');
  if (status) status.textContent = 'Sincronizzazione listino OCI in corso...';

  try {
    const response = await fetch('/api/main?action=get_listino');
    const data = await response.json();

    if (!response.ok || data.status !== 'success') {
      throw new Error(data.error || 'Risposta listino non valida');
    }

    magazzinoDinamico = data.listino || [];
    renderizzaMagazzinoVisivo();
    if (status) status.textContent = `Listino OCI sincronizzato: ${magazzinoDinamico.length} righe.`;
  } catch (err) {
    console.warn('Fallback offline attivo.', err);
    if (status) status.textContent = 'Fallback offline attivo: verifica credenziali Google o tab LISTINO_OCI.';
    renderizzaMagazzinoFallback();
  }
}

function renderizzaMagazzinoVisivo() {
  const container = document.getElementById('stockContainer');
  if (!container) return;

  if (!magazzinoDinamico.length) {
    container.innerHTML = '<div class="p-3 rounded-lg border border-slate-800 bg-slate-950 text-sm text-slate-400">Nessun articolo trovato nel tab LISTINO_OCI.</div>';
    return;
  }

  container.innerHTML = magazzinoDinamico.map((item) => {
    const categoria = String(item.Categoria || '').toLowerCase();
    const badgeColor = categoria.includes('material') ? 'bg-cyan-950 text-cyan-400 border-cyan-900' : 'bg-pink-950 text-pink-400 border-pink-900';
    const fotoHTML = item.Link_Foto
      ? `<img src="${escapeHTML(item.Link_Foto)}" alt="" class="w-12 h-12 rounded object-cover border border-slate-700">`
      : '<div class="w-12 h-12 rounded bg-slate-800 flex items-center justify-center text-xs font-black text-slate-400">CPN</div>';
    const codice = escapeHTML(item.Codice_CPN || item.Codice || 'S/C');
    const descrizione = escapeHTML(item.Descrizione || 'Articolo senza descrizione');
    const stock = escapeHTML(item.Stock_Attuale ?? item.Stock ?? '-');
    const um = escapeHTML(item.UM || '');

    return `
      <div class="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950">
        <div class="flex items-center gap-3 min-w-0">
          ${fotoHTML}
          <div class="min-w-0">
            <div class="font-bold text-slate-200 text-xs break-words">${codice} - ${descrizione}</div>
            <div class="text-[10px] text-slate-500 font-mono">${escapeHTML(item.Categoria || 'LISTINO_OCI')}</div>
          </div>
        </div>
        <span class="shrink-0 px-2 py-1 rounded text-[10px] font-bold border ${badgeColor}">${stock} ${um}</span>
      </div>
    `;
  }).join('');
}

function renderizzaMagazzinoFallback() {
  const container = document.getElementById('stockContainer');
  if (!container) return;

  const fallback = [
    ['MAT001', 'Resina FLK', '250 kg', 'bg-cyan-950 text-cyan-400 border-cyan-900'],
    ['MAT002', 'Catalizzatore', "15'000 g", 'bg-cyan-950 text-cyan-400 border-cyan-900'],
    ['CON001', 'Dischi Cemento', '15 pz', 'bg-pink-950 text-pink-400 border-pink-900'],
  ];

  container.innerHTML = fallback.map(([code, label, stock, badge]) => `
    <div class="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950">
      <div class="font-bold text-slate-200 text-xs">${code} - ${label}</div>
      <span class="px-2 py-1 rounded text-[10px] font-bold border ${badge}">${stock}</span>
    </div>
  `).join('');
}

function switchTab(tabId) {
  activeTab = tabId;

  ['operaio', 'bauleiter', 'admin'].forEach((id) => {
    document.getElementById(`view-${id}`).classList.toggle('hidden', id !== tabId);
    document.getElementById(`tab-${id}`).className = id === tabId ? activeTabClass : inactiveTabClass;
  });

  if (tabId === 'bauleiter') caricaMagazzinoDalCloud();
}

function startMansione() {
  if (timerInterval) return;

  secondsElapsed = 0;
  document.getElementById('job-timer').innerText = '00:00:00';
  document.getElementById('box-form-operaio').classList.add('hidden');
  setButtonState(true);

  timerInterval = setInterval(() => {
    secondsElapsed += 1;
    document.getElementById('job-timer').innerText = formatDuration(secondsElapsed);
  }, 1000);
}

function stopMansione() {
  if (!timerInterval) return;

  clearInterval(timerInterval);
  timerInterval = null;
  setButtonState(false);
  document.getElementById('box-form-operaio').classList.remove('hidden');
}

async function submitOperaio(e) {
  e.preventDefault();

  const submitButton = document.getElementById('btn-submit');
  submitButton.disabled = true;
  submitButton.textContent = 'SINCRONIZZAZIONE IN CORSO...';

  const payload = {
    oggetto_id: parseInt(document.getElementById('op-oggetto').value, 10),
    quantita: parseFloat(document.getElementById('op-ml').value),
    vlies_m: parseFloat(document.getElementById('op-vlies').value),
    ore_lavorate: Math.max(0.5, Math.round((secondsElapsed / 3600) * 100) / 100),
    temperatura: parseFloat(document.getElementById('op-temp').value),
    note_anomalie: document.getElementById('op-note').value,
    operaio_nome: 'Andreas Dancs',
    cantiere_indirizzo: 'Keller Solaio',
    meteo_condizione: 'Sole',
  };

  try {
    const res = await fetch('/api/main', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Errore di sincronizzazione');

    alert(`Sincronizzato: ${data.notifica_controlling}`);
    document.getElementById('box-form-operaio').classList.add('hidden');
  } catch (err) {
    alert(`Offline Save: ${err.message}`);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'SINCRO CLOUD E TRASMETTI RAPPORTI';
  }
}

function setButtonState(isRunning) {
  const start = document.getElementById('btn-start');
  const stop = document.getElementById('btn-stop');

  start.disabled = isRunning;
  stop.disabled = !isRunning;
  start.className = isRunning
    ? 'w-full py-4 rounded-xl bg-slate-800 text-slate-500 font-black text-sm sm:text-base border border-slate-700 cursor-not-allowed transition-all'
    : 'w-full py-4 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm sm:text-base shadow-lg hover:bg-emerald-400 active:scale-[0.99] transition-all';
  stop.className = isRunning
    ? 'w-full py-4 rounded-xl bg-red-500 text-slate-950 font-black text-sm sm:text-base shadow-lg hover:bg-red-400 active:scale-[0.99] transition-all'
    : 'w-full py-4 rounded-xl bg-slate-800 text-slate-500 font-black text-sm sm:text-base border border-slate-700 cursor-not-allowed transition-all';
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

document.addEventListener('DOMContentLoaded', () => {
  switchTab(activeTab);

  const chartEl = document.getElementById('evmChart');
  if (chartEl && window.Chart) {
    new Chart(chartEl.getContext('2d'), {
      type: 'line',
      data: {
        labels: ['G1', 'G2', 'G3', 'G4', 'G5'],
        datasets: [
          { label: 'Budget CPN', data: [1200, 1800, 2450, 3100, 3820], borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.12)', tension: 0.35, fill: true },
          { label: 'Ore Reali', data: [950, 1700, 2600, 3350, 4100], borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.12)', tension: 0.35, fill: true },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#cbd5e1' } } },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
        },
      },
    });
  }
});
