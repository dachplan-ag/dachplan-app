import json
import os
from datetime import datetime, timezone
from urllib import request, error

SHEET_ID = "1ttfAdqE3TI7G_gwapZhz3Yw3dKSYHM2smpQoILLGcJ0"
COLUMNS = [
    "timestamp",
    "date",
    "time",
    "source",
    "level",
    "worker",
    "site",
    "system",
    "object_id",
    "object_label",
    "ml",
    "vlies_m",
    "support_temp_c",
    "hours",
    "notes",
    "suva_psa",
    "suva_meteo",
    "suva_fire",
    "sia_118",
    "sia_271",
    "sia_312",
    "status",
]

DEMO_RECORDS = [
    {
        "timestamp": "2026-06-26T07:30:00+00:00",
        "date": "2026-06-26",
        "time": "07:30:00",
        "source": "DachPlan OS",
        "level": "operaio",
        "worker": "Cantiere Live",
        "site": "DachPlan Diario",
        "system": "1K",
        "object_id": "3",
        "object_label": "Ablauf (Metallo)",
        "ml": 4.6,
        "vlies_m": 5.0,
        "support_temp_c": 18.5,
        "hours": 0.84,
        "notes": "Controllo scarico completato.",
        "suva_psa": True,
        "suva_meteo": True,
        "suva_fire": True,
        "sia_118": True,
        "sia_271": True,
        "sia_312": True,
        "status": "validato",
    }
]


def handler(event, context):
    method = event.get("httpMethod", "GET").upper()
    if method == "OPTIONS":
        return response(204, "")
    if method == "GET":
        return response(200, {"ok": True, "sheet_id": SHEET_ID, "columns": COLUMNS, "records": load_records()})
    if method != "POST":
        return response(405, {"ok": False, "error": "Metodo non supportato"})

    try:
        body = json.loads(event.get("body") or "{}")
        record = normalize_record(body)
        validation_error = validate_record(record)
        if validation_error:
            return response(422, {"ok": False, "error": validation_error, "columns": COLUMNS})
        upstream = forward_to_sheet(record)
        return response(200, {"ok": True, "record": record, "columns": COLUMNS, "sheet": upstream})
    except Exception as exc:
        return response(500, {"ok": False, "error": str(exc)})


def normalize_record(data):
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "timestamp": now,
        "date": clean_text(data.get("date")) or now[:10],
        "time": clean_text(data.get("time")) or now[11:19],
        "source": clean_text(data.get("source")) or "DachPlan OS",
        "level": clean_text(data.get("level")) or "operaio",
        "worker": clean_text(data.get("worker")) or "Cantiere Live",
        "site": clean_text(data.get("site")) or "DachPlan Diario",
        "system": clean_text(data.get("system")) or "1K",
        "object_id": clean_text(data.get("object_id")),
        "object_label": clean_text(data.get("object_label")),
        "ml": to_float(data.get("ml")),
        "vlies_m": to_float(data.get("vlies_m")),
        "support_temp_c": to_float(data.get("support_temp_c")),
        "hours": to_float(data.get("hours")),
        "notes": clean_text(data.get("notes")),
        "suva_psa": to_bool(data.get("suva_psa")),
        "suva_meteo": to_bool(data.get("suva_meteo")),
        "suva_fire": to_bool(data.get("suva_fire")),
        "sia_118": to_bool(data.get("sia_118")),
        "sia_271": to_bool(data.get("sia_271")),
        "sia_312": to_bool(data.get("sia_312")),
        "status": clean_text(data.get("status")) or "validato",
    }
    return {key: record.get(key) for key in COLUMNS}


def validate_record(record):
    if len(COLUMNS) != len(record):
        return "Column mismatch: schema interno non allineato."
    if not record["object_id"] or not record["object_label"]:
        return "Oggetto obbligatorio mancante."
    if record["support_temp_c"] < 5:
        return "Temperatura supporto sotto soglia SIA 271."
    if not (record["suva_psa"] and record["suva_meteo"] and record["suva_fire"]):
        return "Checklist SUVA incompleta."
    if record["ml"] <= 0 and record["vlies_m"] <= 0:
        return "Quantita lavorata mancante."
    return None


def to_float(value):
    text = str(value if value is not None else "0").replace(",", ".")
    cleaned = []
    dot_seen = False
    for char in text:
        if char.isdigit() or (char == "-" and not cleaned):
            cleaned.append(char)
        elif char == "." and not dot_seen:
            cleaned.append(char)
            dot_seen = True
    try:
        return round(float("".join(cleaned) or "0"), 3)
    except ValueError:
        return 0.0


def to_bool(value):
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "si", "sì", "ok"}


def clean_text(value):
    return str(value or "").strip()[:500]


def load_records():
    return DEMO_RECORDS


def forward_to_sheet(record):
    webhook = os.environ.get("DACHPLAN_DIARIO_WEBHOOK_URL")
    if not webhook:
        return {"ok": False, "mode": "preview", "message": "Webhook non configurato; record validato localmente."}
    payload = json.dumps({"sheet_id": SHEET_ID, "columns": COLUMNS, "values": [record[column] for column in COLUMNS]}).encode("utf-8")
    req = request.Request(webhook, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with request.urlopen(req, timeout=8) as res:
            body = res.read().decode("utf-8")
            return {"ok": 200 <= res.status < 300, "status": res.status, "body": body[:500]}
    except error.URLError as exc:
        return {"ok": False, "error": str(exc)}


def response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": body if isinstance(body, str) else json.dumps(body),
    }
