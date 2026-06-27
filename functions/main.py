import base64
import json
import os
from typing import Any, Dict, List, Optional

import gspread
from google.oauth2.service_account import Credentials


SPREADSHEET_ID = "1ttfAdqE3TI7G_gwapZhz3Yw3dKSYHM2smpQoILLGcJ0"
DIARIO_WORKSHEET = "DachPlan Diario"
LISTINO_WORKSHEET = "LISTINO_OCI"
LISTINO_FIELDS = [
    "Codice_CPN",
    "Fornitore",
    "Descrizione",
    "Lordo",
    "Netto",
    "Categoria",
    "Stock_Attuale",
    "Soglia_Minima",
    "Link_Foto",
]
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def _response(status_code: int, body: Any) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, ensure_ascii=False),
    }


def _parse_json(value: Optional[str]) -> Dict[str, Any]:
    if not value:
        return {}
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return {}


def _get_action(event: Dict[str, Any], body: Dict[str, Any]) -> Optional[str]:
    query = event.get("queryStringParameters") or {}
    return query.get("action") or body.get("action")


def _service_account_info() -> Dict[str, Any]:
    raw_json = (
        os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
        or os.environ.get("GOOGLE_CREDENTIALS_JSON")
        or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    )
    if raw_json:
        return json.loads(raw_json)

    raw_base64 = os.environ.get("GOOGLE_SERVICE_ACCOUNT_BASE64")
    if raw_base64:
        return json.loads(base64.b64decode(raw_base64).decode("utf-8"))

    raise RuntimeError("Google Sheets credentials are not configured")


def _spreadsheet() -> gspread.Spreadsheet:
    credentials = Credentials.from_service_account_info(
        _service_account_info(),
        scopes=SCOPES,
    )
    return gspread.authorize(credentials).open_by_key(SPREADSHEET_ID)


def _clean_listino(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    clean_records = []
    for record in records:
        clean_records.append(
            {
                field: str(record.get(field, "")).strip()
                if record.get(field) is not None
                else ""
                for field in LISTINO_FIELDS
            }
        )
    return clean_records


def _get_listino() -> Dict[str, Any]:
    worksheet = _spreadsheet().worksheet(LISTINO_WORKSHEET)
    records = worksheet.get_all_records()
    return _response(200, _clean_listino(records))


def _append_diario_row(body: Dict[str, Any]) -> Dict[str, Any]:
    worksheet = _spreadsheet().worksheet(DIARIO_WORKSHEET)
    actionless_body = {key: value for key, value in body.items() if key != "action"}

    if "values" in actionless_body and isinstance(actionless_body["values"], list):
        row = actionless_body["values"]
    else:
        headers = worksheet.row_values(1)
        row = [actionless_body.get(header, "") for header in headers]

    worksheet.append_row(row, value_input_option="USER_ENTERED")
    return _response(200, {"ok": True})


def handler(event, context):
    method = event.get("httpMethod")

    if method == "OPTIONS":
        return _response(204, {})

    body = _parse_json(event.get("body"))
    action = _get_action(event, body)

    try:
        if method == "GET" and action == "get_listino":
            return _get_listino()

        if method == "POST":
            return _append_diario_row(body)

        return _response(400, {"error": "Unsupported action"})
    except Exception as error:
        return _response(500, {"error": str(error)})
