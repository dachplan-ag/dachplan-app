import json
import os
from datetime import datetime

import gspread
from oauth2client.service_account import ServiceAccountCredentials


SHEET_ID = "1ttfAdqE3TI7G_gwapZhz3Yw3dKSYHM2smpQoILLGcJ0"
GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

LISTA_FISSA_FLK = {
    1: {"nome": "Fenster / Tuere", "primer_metallo": True, "beton_tools": False},
    2: {"nome": "Anschluss Dachpappe -> Beton", "primer_metallo": False, "beton_tools": True},
    3: {"nome": "Ablauf", "primer_metallo": True, "beton_tools": False},
    4: {"nome": "Notablauf", "primer_metallo": True, "beton_tools": False},
    5: {"nome": "Anschluss Dachpappe -> Blech", "primer_metallo": True, "beton_tools": False},
}


def handler(event, context):
    method = event.get("httpMethod", "")

    if method == "OPTIONS":
        return response(200, "")

    if method == "GET":
        params = event.get("queryStringParameters") or {}
        if params.get("action") == "get_listino":
            return get_listino()
        return response(400, {"error": "Azione GET non supportata"})

    if method != "POST":
        return response(405, {"error": "Method Not Allowed"})

    try:
        body = json.loads(event.get("body") or "{}")
        id_oggetto = int(body.get("oggetto_id", 1))
        quantita = float(body.get("quantita", 0))
        vlies_m = float(body.get("vlies_m", 0))
        ore_lavorate = float(body.get("ore_lavorate", 8.0))
        temperatura = float(body.get("temperatura", 15.0))
        note_anomalie = str(body.get("note_anomalie", "")).strip()
        nome_operaio = str(body.get("operaio_nome", "Andreas Dancs")).strip()
        indirizzo_cantiere = str(body.get("cantiere_indirizzo", "Keller Solaio")).strip()
        condizione_meteo = str(body.get("meteo_condizione", "Sole")).strip()
    except (TypeError, ValueError, json.JSONDecodeError):
        return response(400, {"error": "Payload Schema Mismatch"})

    if id_oggetto not in LISTA_FISSA_FLK:
        return response(400, {"error": "Oggetto FLK non valido"})

    info = LISTA_FISSA_FLK[id_oggetto]
    kg_flk = round(quantita * 2.5, 2)
    primer_spray = 1 if info["primer_metallo"] and quantita > 0 else 0
    schleifscheibe = 1 if info["beton_tools"] and quantita > 0 else 0
    costo_calcolato = round(quantita * 82.00, 2)
    timestamp_adesso = datetime.now().strftime("%d.%m.%Y %H:%M:%S")

    try:
        sheet = get_sheet()
        tab_cantiere = sheet.worksheet("CANTIERE_CORRENTE")
        riga_completa = [
            f"FLK{id_oggetto:03d}",
            info["nome"],
            indirizzo_cantiere,
            nome_operaio,
            condizione_meteo,
            "1K",
            quantita,
            kg_flk,
            0,
            vlies_m,
            costo_calcolato,
            primer_spray,
            schleifscheibe,
            ore_lavorate,
            temperatura,
            "OK (SUVA)",
            timestamp_adesso,
            note_anomalie,
        ]
        tab_cantiere.append_row(riga_completa)
    except Exception as exc:
        return response(500, {"error": f"Database Link Error: {str(exc)}"})

    return response(
        200,
        {
            "status": "synchronized",
            "notifica_controlling": f"Registrato in 'DachPlan Diario'. Costo: {costo_calcolato} CHF.",
        },
    )


def get_listino():
    try:
        sheet = get_sheet()
        tab_listino = sheet.worksheet("LISTINO_OCI")
        records = tab_listino.get_all_records()
        return response(200, {"status": "success", "listino": records})
    except Exception as exc:
        return response(500, {"error": str(exc)})


def get_sheet():
    raw_credentials = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if not raw_credentials:
        raise RuntimeError("GOOGLE_CREDENTIALS_JSON non configurato")

    creds_dict = json.loads(raw_credentials)
    creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, GOOGLE_SCOPES)
    client = gspread.authorize(creds)
    return client.open_by_key(SHEET_ID)


def response(status_code, body):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Content-Type": "application/json",
    }
    payload = body if isinstance(body, str) else json.dumps(body)
    return {"statusCode": status_code, "headers": headers, "body": payload}
