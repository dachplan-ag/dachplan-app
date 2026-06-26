// DachPlan OS — endpoint principale del Rapporto Giornaliero.
// Riceve l'input "zero attrito" dell'operaio, applica il motore dei consumi,
// aggiorna il magazzino su Netlify Database e genera gli ordini automatici.
import type { Config, Context } from "@netlify/functions";
import { calcolaConsumi } from "./lib/engine.mjs";
import { applicaConsumi, checkInventoryThresholds } from "./lib/warehouse.mjs";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method Not Allowed" }, { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Payload non valido" }, { status: 400 });
  }

  const oggettoId = parseInt(body.oggetto_id, 10);
  const sistema = body.sistema === "2K" ? "2K" : "1K";
  const quantita = Number(body.quantita) || 0;
  const vliesM = Number(body.vlies_m) || 0;
  const glassM = Number(body.glass_vlies_m) || 0;
  const montaggioScarichi = Boolean(body.montaggio_scarichi);

  if (!Number.isInteger(oggettoId)) {
    return Response.json({ error: "Oggetto FLK mancante" }, { status: 400 });
  }

  let calcolo;
  try {
    calcolo = calcolaConsumi({
      oggettoId,
      sistema,
      quantita,
      vliesM,
      glassM,
      montaggioScarichi,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }

  try {
    await applicaConsumi({
      consumi: calcolo.consumi,
      oggettoId,
      oggettoNome: calcolo.info.nome,
      sistema,
      quantita,
      vliesM,
      glassM,
      montaggioScarichi,
    });

    const ordiniGenerati = await checkInventoryThresholds();

    const resina = calcolo.consumi.MAT001 || 0;
    const notifica =
      ordiniGenerati.length > 0
        ? `Magazzino aggiornato. ${ordiniGenerati.length} ordine/i automatico/i generato/i (soglia minima raggiunta).`
        : `Magazzino aggiornato: scalati ${resina} kg di Resina (MAT001) e relativi consumabili.`;

    return Response.json({
      status: "synchronized",
      oggetto_processato: calcolo.info.nome,
      sistema,
      materiali_scalati: calcolo.consumi,
      ordini_generati: ordiniGenerati,
      notifica_controlling: notifica,
    });
  } catch (e: any) {
    return Response.json(
      { error: `Errore Netlify Database: ${e.message}` },
      { status: 500 },
    );
  }
};

export const config: Config = {
  path: "/api/main",
  method: ["POST"],
};
