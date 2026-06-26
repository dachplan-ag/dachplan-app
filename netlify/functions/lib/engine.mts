// DachPlan OS — Motore logico di traduzione dei consumi (background engine).
//
// L'operaio dichiara soltanto: oggetto FLK, quantità (ml o pz), sistema (1K/2K),
// metri di Vlies e il flag "Montaggio Scarichi". Questo modulo traduce quelle
// informazioni nei consumi reali di magazzino (ID MAT/CON), senza che l'operaio
// debba conoscere codici o quantità tecniche.

export interface OperatoreInput {
  oggettoId: number;
  sistema: "1K" | "2K";
  quantita: number;
  vliesM: number;
  glassM: number;
  montaggioScarichi: boolean;
}

export interface OggettoFLK {
  nome: string;
  primerMetallo: boolean; // oggetto metallico → Primer Metallo Spray (MAT005)
  betonTools: boolean;    // lavorazione su cemento → Schleifscheibe Beton (CON001)
  misura: "ml" | "pezzi"; // come va interpretata la quantità inserita
}

// Lista fissa obbligatoria. Gli oggetti metallici (Fenster, Blech, Ablauf,
// Notablauf) richiedono il primer; l'attacco su Beton richiede il disco abrasivo.
export const LISTA_FISSA_FLK: Record<number, OggettoFLK> = {
  1:  { nome: "Fenster / Türe",                          primerMetallo: true,  betonTools: false, misura: "pezzi" },
  2:  { nome: "Anschluss Dachpappe → Beton",             primerMetallo: false, betonTools: true,  misura: "ml" },
  3:  { nome: "Ablauf",                                  primerMetallo: true,  betonTools: false, misura: "pezzi" },
  4:  { nome: "Notablauf",                               primerMetallo: true,  betonTools: false, misura: "pezzi" },
  5:  { nome: "Anschluss Dachpappe → Blech",             primerMetallo: true,  betonTools: false, misura: "ml" },
  6:  { nome: "Anschluss Holz → Dachpappe",              primerMetallo: false, betonTools: false, misura: "ml" },
  7:  { nome: "Anschluss Dachpappe → Kunststoffbahn",    primerMetallo: false, betonTools: false, misura: "ml" },
  8:  { nome: "Lüftrohr",                                primerMetallo: false, betonTools: false, misura: "pezzi" },
  9:  { nome: "Kontrollstütze",                          primerMetallo: false, betonTools: false, misura: "pezzi" },
  10: { nome: "Dachaufstieg",                            primerMetallo: false, betonTools: false, misura: "pezzi" },
  11: { nome: "Treppe / Zugang Dach",                    primerMetallo: false, betonTools: false, misura: "pezzi" },
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ConsumoCalcolato {
  info: OggettoFLK;
  consumi: Record<string, number>; // id magazzino → quantità da sottrarre
}

// Traduce l'input operaio nei consumi di magazzino, applicando tutte le regole.
export function calcolaConsumi(input: OperatoreInput): ConsumoCalcolato {
  const info = LISTA_FISSA_FLK[input.oggettoId];
  if (!info) {
    throw new Error(`Oggetto FLK non valido: ${input.oggettoId}`);
  }

  const quantita = Math.max(0, input.quantita || 0);
  const consumi: Record<string, number> = {};
  const add = (id: string, q: number) => {
    if (q > 0) consumi[id] = round2((consumi[id] || 0) + q);
  };

  // 1. Cemento (Beton): 1 pz CON001 (disco abrasivo) ogni 10 ml lavorati.
  if (info.betonTools && quantita > 0) {
    add("CON001", Math.ceil(quantita / 10));
  }

  // 2. Oggetti metallici: MAT005 (Primer Metallo Spray).
  //    1 bomboletta ogni 5 pezzi, oppure 1 ogni 15 ml.
  if (info.primerMetallo && quantita > 0) {
    const bombole =
      info.misura === "ml" ? Math.ceil(quantita / 15) : Math.ceil(quantita / 5);
    add("MAT005", bombole);
  }

  // 3. Sistema FLK: Resina (MAT001) 2.5 kg per unità di lavoro.
  //    In 2K il Catalizzatore (MAT002) = 20 g per ogni kg di resina.
  if (quantita > 0) {
    const resina = round2(quantita * 2.5);
    add("MAT001", resina);
    if (input.sistema === "2K") {
      add("MAT002", round2(resina * 20));
    }
  }

  // 4. Vlies dichiarati dall'operaio (metri lineari → metri di magazzino).
  add("MAT003", Math.max(0, input.vliesM || 0)); // FLK-Vlies
  add("MAT004", Math.max(0, input.glassM || 0)); // Glass-Vlies

  // 5. Montaggio Scarichi: tasselli + disco flessibile per pezzo montato.
  if (input.montaggioScarichi && quantita > 0) {
    add("CON004", 2 * quantita);             // Schlagdübel
    add("CON005", 2 * quantita);             // Fassaden-Dübel
    add("CON003", Math.ceil(0.2 * quantita)); // Flexscheibe (arrotondato in eccesso)
  }

  return { info, consumi };
}
