import { getDatabase } from "@netlify/database";

const db = getDatabase();

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

// Coerce an incoming value to a JSON string for a jsonb column.
const jb = (v, fallback) => JSON.stringify(v === undefined || v === null ? fallback : v);

export default async (req) => {
  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      const id = url.searchParams.get("id");
      if (id) {
        const [row] = await db.sql`SELECT * FROM reports WHERE id = ${Number(id)}`;
        return row ? json(row) : json({ error: "Rapporto non trovato" }, 404);
      }
      const rows = await db.sql`
        SELECT * FROM reports
        ORDER BY work_date DESC, id DESC`;
      return json(rows);
    }

    if (req.method === "POST") {
      const b = await req.json();

      if (!b || !b.work_date) {
        return json({ error: "La data del rapporto è obbligatoria" }, 400);
      }

      const [row] = await db.sql`
        INSERT INTO reports (
          work_date, site_name, worker_name,
          photos, tasks, materials, sia_categories,
          technical_notes, time_start, time_end,
          total_hours, pause_minutes, final_notes, signature,
          weather, risks, logistics, anomalies, workflow
        ) VALUES (
          ${b.work_date},
          ${b.site_name ?? ""},
          ${b.worker_name ?? ""},
          ${jb(b.photos, [])}::jsonb,
          ${jb(b.tasks, [])}::jsonb,
          ${jb(b.materials, [])}::jsonb,
          ${jb(b.sia_categories, [])}::jsonb,
          ${b.technical_notes ?? ""},
          ${b.time_start ?? ""},
          ${b.time_end ?? ""},
          ${Number(b.total_hours ?? 0)},
          ${Number.parseInt(b.pause_minutes ?? 0, 10) || 0},
          ${b.final_notes ?? ""},
          ${b.signature ?? ""},
          ${jb(b.weather, {})}::jsonb,
          ${jb(b.risks, [])}::jsonb,
          ${jb(b.logistics, {})}::jsonb,
          ${jb(b.anomalies, [])}::jsonb,
          ${jb(b.workflow, [])}::jsonb
        )
        RETURNING *`;

      return json(row, 201);
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "id mancante" }, 400);
      await db.sql`DELETE FROM reports WHERE id = ${Number(id)}`;
      return json({ ok: true });
    }

    return json({ error: "Metodo non consentito" }, 405);
  } catch (err) {
    return json({ error: err?.message ?? "Errore del server" }, 500);
  }
};

export const config = {
  path: "/api/reports",
};
