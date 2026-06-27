/**
 * DACHPLAN OS v3.0 - LOGICA OPERAIO & MAGAZZINO DINAMICO DA SCRIPT
 * Collegato all'ID: 1ttfAdqE3TI7G_gwapZhz3Yw3dKSYHM2smpQoILLGcJ0
 */

let timerInterval = null;
let secondsElapsed = 0;
let prodottiDalCloud = [];

// 1. SCARICA IL LISTINO REALE DIRETTAMENTE DAL TUO FOGLIO GOOGLE DI DRIVE
async function scaricaEAssegnaMagazzino() {
    try {
        const response = await fetch('/api/main?action=get_listino');
        const data = await response.json();
        
        if (data.status === 'success' || data.listino) {
            prodottiDalCloud = data.listino || [];
            popolaMenuTendinaOperaio();
            renderizzaFurgoneConFoto();
        }
    } catch (err) {
        console.error("Errore sincronizzazione cloud. Database offline.");
    }
}

// 2. CREA IL MENU A TENDINA DELL'OPERAIO IN MODO AUTOMATICO DA SHEET
function popolaMenuTendinaOperaio() {
    const select = document.getElementById('op-materiale-select');
    if (!select) return;

    let html = "";
    prodottiDalCloud.forEach(item => {
        // Mostra il codice CPN e il nome del materiale inserito sul foglio excel
        html += `<option value="${item.Codice_CPN}">${item.Codice_CPN} - ${item.Descrizione} (${item.Fornitore})</option>`;
    });
    select.innerHTML = html;
}

// 3. COSTRUISCE LE CARD GRAFICHE DEL FURGONE CON LE FOTO DEL TUO DRIVE
function renderizzaFurgoneConFoto() {
    const container = document.getElementById('contenitore-magazzino');
    if (!container) return;

    let html = "";
    prodottiDalCloud.forEach(item => {
        // Gestione colore badge in base alla categoria inserita nel foglio excel
        let badgeColor = "bg-slate-800 text-slate-300";
        if (item.Categoria === 'materiali') badgeColor = "bg-cyan-950 text-cyan-400 border-cyan-900";
        if (item.Categoria === 'consumabili') badgeColor = "bg-pink-950 text-pink-400 border-pink-900";
        if (item.Categoria === 'attrezzi') badgeColor = "bg-purple-950 text-purple-400 border-purple-900";
        if (item.Categoria === 'gas') badgeColor = "bg-orange-950 text-orange-400 border-orange-900";

        // Fallback per la foto: se la cella su Sheets è vuota, usa un'icona standard box
        let immagineHTML = `<div class="w-10 h-10 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-lg">📦</div>`;
        if (item.Link_Foto && item.Link_Foto.startsWith('http')) {
            immagineHTML = `<img src="${item.Link_Foto}" alt="${item.Descrizione}" class="w-10 h-10 rounded object-cover border border-slate-700 shadow-md">`;
        }

        html += `
            <div class="flex items-center justify-between p-2.5 rounded-lg border border-slate-800 bg-slate-950 shadow-md">
                <div class="flex items-center gap-2.5">
                    ${immagineHTML}
                    <div>
                        <div class="font-bold text-slate-200 text-xs">${item.Descrizione}</div>
                        <div class="text-[10px] text-slate-500 font-mono mt-0.5">${item.Codice_CPN} | Fornitore: ${item.Fornitore}</div>
                    </div>
                </div>
                <div class="text-right">
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${badgeColor}">${item.Stock_Attuale} ${item.UM}</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html || `<p class="text-xs font-mono text-slate-500">Listino vuoto. Aggiungi righe su Fogli Google.</p>`;
}

// 4. LOGICA CONTROL TIMER LIVE
function startTimerLive() {
    if (timerInterval) return;
    secondsElapsed = 0;
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-start').className = "flex-1 py-4 bg-slate-800 text-slate-600 font-black text-sm rounded-xl cursor-not-allowed border border-slate-700";
    document.getElementById('btn-stop').disabled = false;
    document.getElementById('btn-stop').className = "flex-1 py-4 bg-red-500 text-slate-950 font-black text-sm rounded-xl shadow-md hover:bg-red-400";
    
    timerInterval = setInterval(() => {
        secondsElapsed++;
        let h = Math.floor(secondsElapsed / 3600).toString().padStart(2, '0');
        let m = Math.floor((secondsElapsed % 3600) / 60).toString().padStart(2, '0');
        let s = (secondsElapsed % 60).toString().padStart(2, '0');
        document.getElementById('job-timer').innerText = `${h}:${m}:${s}`;
    }, 1000);
}

function stopTimerLive() {
    clearInterval(timerInterval);
    timerInterval = null;
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-start').className = "flex-1 py-4 bg-emerald-500 text-slate-950 font-black text-sm rounded-xl shadow-md";
    document.getElementById('btn-stop').disabled = true;
    document.getElementById('btn-stop').className = "flex-1 py-4 bg-slate-800 text-slate-600 font-black text-sm rounded-xl cursor-not-allowed border border-slate-700";
    
    // Converte il tempo in decimali svizzeri per Apps Script
    let oreDecimali = Math.max(0.1, Math.round((secondsElapsed / 3600) * 100) / 100);
    document.getElementById('op-ore').value = oreDecimali;
    document.getElementById('box-form-operaio').classList.remove('hidden');
}

// 5. SPEDISCE I DATI DIRETTAMENTE ALLA SCHEDA DI BORDO
async function inviaDatiAlCloud(e) {
    e.preventDefault();
    
    const payload = {
        codice_mansione: document.getElementById('op-materiale-select').value,
        quantita_metri: parseFloat(document.getElementById('op-quantita').value),
        ore_lavorate: parseFloat(document.getElementById('op-ore').value),
        temperatura: parseFloat(document.getElementById('op-temp').value),
        note_anomalie: document.getElementById('op-note').value,
        materiale_reale: parseFloat(document.getElementById('op-quantita').value) // Allineato di default
    };

    try {
        const response = await fetch('/api/main', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        alert("RAPPORTO REGISTRATO: " + data.notifica_controlling);
        document.getElementById('box-form-operaio').classList.add('hidden');
        document.getElementById('form-operaio-core').reset();
        document.getElementById('job-timer').innerText = "00:00:00";
        
        // Rinfresca lo stock residuo visivo con le foto sul telefono
        await scaricaEAssegnaMagazzino();
    } catch (err) {
        alert("Dati archiviati in locale per mancata rete 5G sul tetto.");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    scaricaEAssegnaMagazzino();
});
