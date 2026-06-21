import { getDatabase } from "@netlify/database";

const db = getDatabase();

// Coerce helpers — keep the DB defaults intact when fields are missing.
const str = (v) => (v == null ? "" : String(v));
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const int = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};
const json = (v, fallback) => JSON.stringify(v == null ? fallback : v);

export default async (req) => {
  if (req.method === "GET") {
    const rows = await db.sql`
      SELECT * FROM reports
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return Response.json(rows);
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const workDate = str(body.work_date) || new Date().toISOString().slice(0, 10);

    try {
      const [report] = await db.sql`
        INSERT INTO reports (
          work_date, site_name, worker_name,
          photos, tasks, materials, sia_categories,
          technical_notes, time_start, time_end,
          total_hours, pause_minutes, final_notes, signature,
          weather, risks, logistics, anomalies, workflow
        ) VALUES (
          ${workDate},
          ${str(body.site_name)},
          ${str(body.worker_name)},
          ${json(body.photos, [])}::jsonb,
          ${json(body.tasks, [])}::jsonb,
          ${json(body.materials, [])}::jsonb,
          ${json(body.sia_categories, [])}::jsonb,
          ${str(body.technical_notes)},
          ${str(body.time_start)},
          ${str(body.time_end)},
          ${num(body.total_hours)},
          ${int(body.pause_minutes)},
          ${str(body.final_notes)},
          ${str(body.signature)},
          ${json(body.weather, {})}::jsonb,
          ${json(body.risks, [])}::jsonb,
          ${json(body.logistics, {})}::jsonb,
          ${json(body.anomalies, [])}::jsonb,
          ${json(body.workflow, [])}::jsonb
        )
        RETURNING *
      `;
      return Response.json(report, { status: 201 });
    } catch (err) {
      return Response.json(
        {
          error: "Could not save report",
          detail: String(err?.message || err),
          cause: String(err?.cause?.message || err?.cause || ""),
        },
        { status: 500 }
      );
    }
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = {
  path: "/api/reports",
};
