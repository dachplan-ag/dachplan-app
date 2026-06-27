import json
import os
from datetime import datetime, timezone

import gspread
from oauth2client.service_account import ServiceAccountCredentials


SPREADSHEET_ID = "1ttfAdqE3TI7G_gwapZhz3Yw3dKSYHM2smpQoILLGcJ0"
SCOPE = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/drive",
]
HEADERS = [
    "timestamp_utc",
    "record_id",
    "ruolo",
    "stato",
    "categoria",
    "codice_cpn",
    "mansione",
    "unita",
    "quantita",
    "ore",
    "temperatura_supporto",
    "materiale_previsto",
    "materiale_reale",
    "scarto_previsto",
    "scarto_reale",
    "delta_scarto",
    "costo_chf",
    "margine_chf",
    "sia_118",
    "sia_271",
    "suva_ok",
    "note",
    "approvato_da",
]


def response(status, payload):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(payload),
    }


def get_credentials():
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON") or os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if not raw:
        raise RuntimeError("Google service account JSON is not configured.")
    return ServiceAccountCredentials.from_json_keyfile_dict(json.loads(raw), SCOPE)


def get_sheet():
    client = gspread.authorize(get_credentials())
    spreadsheet = client.open_by_key(SPREADSHEET_ID)
    try:
        worksheet = spreadsheet.worksheet("Diario")
    except gspread.WorksheetNotFound:
        worksheet = spreadsheet.add_worksheet(title="Diario", rows=1000, cols=len(HEADERS))
    first_row = worksheet.row_values(1)
    if first_row != HEADERS:
        worksheet.update("A1:W1", [HEADERS])
    return worksheet


def normalize_record(data):
    now = datetime.now(timezone.utc).isoformat()
    record_id = data.get("record_id") or f"DACH-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
    return [
        now,
        record_id,
        data.get("ruolo", "operaio"),
        data.get("stato", "registrato"),
        data.get("categoria", ""),
        data.get("codice_cpn", ""),
        data.get("mansione", ""),
        data.get("unita", ""),
        data.get("quantita", 0),
        data.get("ore", 0),
        data.get("temperatura_supporto", 0),
        data.get("materiale_previsto", 0),
        data.get("materiale_reale", 0),
        data.get("scarto_previsto", 0),
        data.get("scarto_reale", 0),
        data.get("delta_scarto", 0),
        data.get("costo_chf", 0),
        data.get("margine_chf", 0),
        data.get("sia_118", "conforme"),
        data.get("sia_271", "conforme"),
        data.get("suva_ok", False),
        data.get("note", ""),
        data.get("approvato_da", ""),
    ]


def handler(event, context):
    method = event.get("httpMethod", "GET")
    if method == "OPTIONS":
        return response(204, {})

    try:
        sheet = get_sheet()
        if method == "POST":
            data = json.loads(event.get("body") or "{}")
            row = normalize_record(data)
            sheet.append_row(row, value_input_option="USER_ENTERED")
            return response(200, {"ok": True, "record_id": row[1]})

        rows = sheet.get_all_records()
        return response(200, {"ok": True, "spreadsheet_id": SPREADSHEET_ID, "records": rows[-100:]})
    except Exception as exc:
        return response(500, {"ok": False, "error": str(exc)})
