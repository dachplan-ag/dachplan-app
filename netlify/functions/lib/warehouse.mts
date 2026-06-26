// DachPlan OS — accesso magazzino su Netlify Database (Postgres).
// Applica i consumi calcolati dal motore e gestisce gli ordini automatici
// quando lo stock scende sotto la soglia minima (onStockChange / onThresholdReached).
import { getDatabase } from "@netlify/database";

export interface OrdineGenerato {
  fornitore: string;
  materiale_id: string;
  materiale_nome: string;
  quantita: number;
  stock_attuale: number;
  soglia_minima: number;
  data: string;
}

// Applica i consumi al magazzino e registra il lavoro dell'operaio.
// Lo stock viene aggiornato in un solo statement atomico (VALUES list), poi il
// work log viene scritto: niente transazione esplicita, coerente con il driver
// serverless di Netlify Database.
export async function applicaConsumi(params: {
  consumi: Record<string, number>;
  oggettoId: number;
  oggettoNome: string;
  sistema: string;
  quantita: number;
  vliesM: number;
  glassM: number;
  montaggioScarichi: boolean;
}): Promise<void> {
  const db = getDatabase();
  const entries = Object.entries(params.consumi);

  if (entries.length > 0) {
    const rows = db.sql.values(entries.map(([id, q]) => [id, q]));
    await db.sql`
      UPDATE inventory AS i
      SET stock = i.stock - c.qty::numeric, updated_at = now()
      FROM (VALUES ${rows}) AS c(id, qty)
      WHERE i.id = c.id
    `;
  }

  await db.sql`
    INSERT INTO work_logs
      (oggetto_id, oggetto_nome, sistema, quantita, vlies_m, glass_vlies_m, montaggio_scarichi, consumi)
    VALUES (
      ${params.oggettoId}, ${params.oggettoNome}, ${params.sistema}, ${params.quantita},
      ${params.vliesM}, ${params.glassM}, ${params.montaggioScarichi},
      ${JSON.stringify(params.consumi)}::jsonb
    )
  `;
}

// Scansiona il magazzino dopo ogni aggiornamento. Per ogni articolo sotto soglia
// con ordine_auto attivo, genera un ordine automatico (se non già pendente) e
// restituisce l'oggetto ordine pulito pronto per il fornitore.
export async function checkInventoryThresholds(): Promise<OrdineGenerato[]> {
  const db = getDatabase();
  const sotto = await db.sql`
    SELECT id, nome, stock, soglia_minima, reorder_qty, fornitore
    FROM inventory
    WHERE ordine_auto = TRUE AND stock < soglia_minima
  `;

  const generati: OrdineGenerato[] = [];
  for (const it of sotto as any[]) {
    const esistente = await db.sql`
      SELECT id FROM auto_orders
      WHERE materiale_id = ${it.id} AND status = 'pending'
      LIMIT 1
    `;
    if ((esistente as any[]).length > 0) continue;

    const reorder = Number(it.reorder_qty) || 0;
    const mancante = Number(it.soglia_minima) - Number(it.stock);
    const quantita = Math.max(reorder, Math.ceil(mancante));

    const inserted = await db.sql`
      INSERT INTO auto_orders
        (fornitore, materiale_id, materiale_nome, quantita, stock_attuale, soglia_minima)
      VALUES (${it.fornitore}, ${it.id}, ${it.nome}, ${quantita}, ${Number(it.stock)}, ${Number(it.soglia_minima)})
      RETURNING fornitore, materiale_id, materiale_nome, quantita, stock_attuale, soglia_minima, created_at
    `;
    const row = (inserted as any[])[0];
    generati.push({
      fornitore: row.fornitore,
      materiale_id: row.materiale_id,
      materiale_nome: row.materiale_nome,
      quantita: Number(row.quantita),
      stock_attuale: Number(row.stock_attuale),
      soglia_minima: Number(row.soglia_minima),
      data: new Date(row.created_at).toISOString(),
    });
  }
  return generati;
}
