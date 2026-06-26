// DachPlan OS — stato corrente del magazzino (onStockChange).
import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

export default async (_req: Request) => {
  const db = getDatabase();
  const rows = await db.sql`
    SELECT id, nome, categoria, unita, stock, soglia_minima, ordine_auto, disponibile
    FROM inventory
    ORDER BY categoria, id
  `;

  const items = (rows as any[]).map((r) => {
    const stock = Number(r.stock);
    const soglia = Number(r.soglia_minima);
    return {
      id: r.id,
      nome: r.nome,
      categoria: r.categoria,
      unita: r.unita,
      stock,
      soglia_minima: soglia,
      ordine_auto: r.ordine_auto,
      disponibile: r.disponibile,
      sotto_soglia: r.categoria !== "attrezzi" && stock < soglia,
    };
  });

  return Response.json({ items });
};

export const config: Config = {
  path: "/api/inventory",
  method: ["GET"],
};
