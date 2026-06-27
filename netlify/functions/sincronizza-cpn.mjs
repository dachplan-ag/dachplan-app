const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const mansioniSia = {
  BIT001: { nome: "Posa Barriera Vapore Bitume EGV 4", categoria: "bitume", prezzoCpn: 24.0, fm: 1.12, ft: 0.25, matId: "MAT006" },
  BIT002: { nome: "Posa Isolamento PIR 180mm", categoria: "bitume", prezzoCpn: 68.0, fm: 1.03, ft: 0.3, matId: "MAT007" },
  BIT003: { nome: "Posa Doppio Strato Bitume EP4+EP5", categoria: "bitume", prezzoCpn: 82.0, fm: 1.15, ft: 0.35, matId: "MAT008" },
  SYN001: { nome: "Posa Manto Sintetico PVC/FPO Sarnafil", categoria: "sintetico", prezzoCpn: 74.0, fm: 1.08, ft: 0.28, matId: "MAT010" },
  FLK001: { nome: "Sigillatura Liquida Dettagli Alsan", categoria: "flk", prezzoCpn: 120.0, fm: 1.0, ft: 0.5, matId: "MAT001" },
  GRN001: { nome: "Stesa Feltro Drenaggio e Ghiaia Lavata", categoria: "begrunung", prezzoCpn: 38.0, fm: 1.05, ft: 0.2, matId: "MAT011" },
  MON001: { nome: "Montaggio Scarico Verticale Gully Sita/Geberit", categoria: "scarichi", prezzoCpn: 390.0, fm: 1.0, ft: 1.5, matId: "CON004" },
};

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const toNumber = (value, fallback) => {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number)) {
    throw new Error("Valore numerico non valido");
  }
  return number;
};

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  let body;
  try {
    body = await req.json();
  } catch (error) {
    return Response.json(
      { error: `Schema payload non valido: ${error.message}` },
      { status: 400, headers: corsHeaders },
    );
  }

  let payload;
  try {
    payload = {
      codiceMansione: String(body.codice_mansione ?? "BIT001"),
      metriLavorati: toNumber(body.quantita_metri, 0),
      materialeReale: toNumber(body.materiale_reale, 0),
      oreLavorate: toNumber(body.ore_lavorate, 8.0),
      temperatura: toNumber(body.temperatura, 15.0),
      noteAnomalie: String(body.note_anomalie ?? "").trim(),
      nomeOperaio: String(body.nome_operaio ?? "Andreas Dancs").trim() || "Andreas Dancs",
      cantiereIndirizzo: String(body.cantiere_indirizzo ?? "Keller Solaio").trim() || "Keller Solaio",
    };
  } catch (error) {
    return Response.json(
      { error: `Schema payload non valido: ${error.message}` },
      { status: 400, headers: corsHeaders },
    );
  }

  const info = mansioniSia[payload.codiceMansione];
  if (!info) {
    return Response.json(
      { error: "Codice Mansione CPN inesistente" },
      { status: 400, headers: corsHeaders },
    );
  }

  const consumoTeorico = round2(payload.metriLavorati * info.fm);
  const volumeSpreco = payload.materialeReale > consumoTeorico
    ? round2(payload.materialeReale - consumoTeorico)
    : 0;
  const percentualeSpreco = volumeSpreco > 0 && consumoTeorico > 0
    ? round2((volumeSpreco / consumoTeorico) * 100)
    : 0;
  const costoCalcolatoFattura = round2(payload.metriLavorati * info.prezzoCpn);

  let msgConferma = `Sincronizzato CPN ${info.categoria.toUpperCase()}. Registrati ${costoCalcolatoFattura} CHF.`;
  if (percentualeSpreco > 10) {
    msgConferma += ` STRUTTURA ALLARME: Rilevato spreco fuori tolleranza del ${percentualeSpreco}%.`;
  }

  return Response.json(
    {
      status: "synchronized",
      categoria_lavoro: info.categoria,
      notifica_controlling: msgConferma,
      allarme_rosso: percentualeSpreco > 15,
      calcoli: {
        consumo_teorico: consumoTeorico,
        volume_spreco: volumeSpreco,
        percentuale_spreco: percentualeSpreco,
        costo_calcolato_fattura: costoCalcolatoFattura,
      },
    },
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

export const config = {
  path: "/api/sincronizza-cpn",
};
