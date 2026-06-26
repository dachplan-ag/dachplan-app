// DachPlan OS — ordini automatici fornitori (onOrderGenerated).
import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

export default async (_req: Request) => {
  const db = getDatabase();
  const rows = await db.sql`
    SELECT id, fornitore, materiale_id, materiale_nome, quantita,
           stock_attuale, soglia_minima, status, created_at
    FROM auto_orders
    ORDER BY created_at DESC
    LIMIT 50
  `;

  const orders = (rows as any[]).map((r) => ({
    id: r.id,
    fornitore: r.fornitore,
    materiale_id: r.materiale_id,
    materiale_nome: r.materiale_nome,
    quantita: Number(r.quantita),
    stock_attuale: Number(r.stock_attuale),
    soglia_minima: Number(r.soglia_minima),
    status: r.status,
    data: new Date(r.created_at).toISOString(),
  }));

  return Response.json({ orders });
};

export const config: Config = {
  path: "/api/orders",
  method: ["GET"],
};
