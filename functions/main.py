import json
import os
from datetime import datetime

import gspread
from oauth2client.service_account import ServiceAccountCredentials


SPREADSHEET_ID = "1ttfAdqE3TI7G_gwapZhz3Yw3dKSYHM2smpQoILLGcJ0"
WORKSHEET_NAME = "CANTIERE_CORRENTE"
SCOPE = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

DIZIONARIO_MANSIONI_SIA = {
    "BIT001": {"nome": "Voranstrich Primer", "categoria": "bitume", "prezzo_cpn": 12.00, "fm": 1.00},
    "BIT002": {"nome": "Dampfbremsen (Barriera)", "categoria": "bitume", "prezzo_cpn": 24.00, "fm": 1.12},
    "BIT003": {"nome": "Isolieren (PIR/EPS)", "categoria": "bitume", "prezzo_cpn": 68.00, "fm": 1.03},
    "BIT004": {"nome": "1. Lage Bitume EP4", "categoria": "bitume", "prezzo_cpn": 42.00, "fm": 1.15},
    "BIT005": {"nome": "2. Lage Bitume EP5 AR", "categoria": "bitume", "prezzo_cpn": 48.00, "fm": 1.15},
    "FLK001": {"nome": "Primer ALSAN FLK", "categoria": "flk", "prezzo_cpn": 25.00, "fm": 1.00},
    "FLK002": {"nome": "Stesa ALSAN resina + Vlies", "categoria": "flk", "prezzo_cpn": 95.00, "fm": 1.00},
    "FLK003": {"nome": "Dettaglio Attika risvolti", "categoria": "flk", "prezzo_cpn": 120.00, "fm": 1.05},
    "SYN001": {"nome": "Velo vetro separazione", "categoria": "sintetico", "prezzo_cpn": 14.00, "fm": 1.05},
    "SYN002": {"nome": "Manto PVC Sarnafil meccanico", "categoria": "sintetico", "prezzo_cpn": 74.00, "fm": 1.08},
    "SYN003": {"nome": "Manto FPO zavorrato", "categoria": "sintetico", "prezzo_cpn": 76.00, "fm": 1.08},
    "SYN004": {"nome": "Saldatura giunti aria calda", "categoria": "sintetico", "prezzo_cpn": 18.00, "fm": 1.02},
    "GRN001": {"nome": "Feltro filtrante antipunzonamento", "categoria": "begruenung", "prezzo_cpn": 16.00, "fm": 1.03},
    "GRN002": {"nome": "Drenaggio bugnato accumulo", "categoria": "begruenung", "prezzo_cpn": 28.00, "fm": 1.02},
    "GRN003": {"nome": "Ghiaia lavata perimetrale", "categoria": "begruenung", "prezzo_cpn": 32.00, "fm": 1.05},
    "GRN004": {"nome": "Substrato minerale estensivo", "categoria": "begruenung", "prezzo_cpn": 45.00, "fm": 1.08},
    "MON001": {"nome": "Montaggio Gully Sita", "categoria": "scarichi", "prezzo_cpn": 390.00, "fm": 1.00},
    "MON002": {"nome": "Troppo pieno sicurezza Notablauf", "categoria": "scarichi", "prezzo_cpn": 340.00, "fm": 1.00},
    "MON003": {"nome": "Gancio faldale Attika", "categoria": "scarichi", "prezzo_cpn": 180.00, "fm": 1.00},
}

HEADERS = [
    "timestamp",
    "codice_mansione",
    "nome_mansione",
    "cantiere",
    "operatore",
    "categoria",
    "standard",
    "quantita_metri",
    "consumo_teorico_sia",
    "materiale_reale",
    "volume_spreco",
    "costo_calcolato",
    "cpn_id",
    "percentuale_spreco",
    "ore_lavorate",
    "temperatura",
    "suva_status",
    "note_anomalie",
]


def make_response(status_code, payload, extra_headers=None):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    return {"statusCode": status_code, "headers": headers, "body": json.dumps(payload)}


def get_worksheet():
    raw_credentials = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON") or os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if not raw_credentials:
        raise RuntimeError("Credenziali Google non configurate.")

    creds_dict = json.loads(raw_credentials)
    creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, SCOPE)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(SPREADSHEET_ID)

    try:
        worksheet = sheet.worksheet(WORKSHEET_NAME)
    except gspread.WorksheetNotFound:
        worksheet = sheet.add_worksheet(title=WORKSHEET_NAME, rows=1000, cols=len(HEADERS))

    first_row = worksheet.row_values(1)
    if first_row != HEADERS:
        worksheet.update(f"A1:R1", [HEADERS])

    return worksheet


def parse_payload(event):
    body = json.loads(event.get("body") or "{}")
    codice_mansione = str(body.get("codice_mansione", "BIT002")).strip().upper()
    return {
        "codice_mansione": codice_mansione,
        "quantita_metri": float(body.get("quantita_metri", 0) or 0),
        "materiale_reale": float(body.get("materiale_reale", 0) or 0),
        "ore_lavorate": float(body.get("ore_lavorate", 0) or 0),
        "temperatura": float(body.get("temperatura", 15.0) or 15.0),
        "note_anomalie": str(body.get("note_anomalie", "") or "").strip(),
    }


def handler(event, context):
    method = event.get("httpMethod", "GET")

    if method == "OPTIONS":
        return make_response(200, {})

    if method not in {"GET", "POST"}:
        return make_response(405, {"error": "Method Not Allowed"})

    try:
        worksheet = get_worksheet()
    except Exception as exc:
        return make_response(500, {"error": f"Drive Link Error: {str(exc)}"})

    if method == "GET":
        try:
            records = worksheet.get_all_records()
            return make_response(200, {"status": "ok", "spreadsheet_id": SPREADSHEET_ID, "records": records[-100:]})
        except Exception as exc:
            return make_response(500, {"error": f"Read Error: {str(exc)}"})

    try:
        payload = parse_payload(event)
    except Exception as exc:
        return make_response(400, {"error": f"Schema payload non valido: {str(exc)}"})

    codice_mansione = payload["codice_mansione"]
    if codice_mansione not in DIZIONARIO_MANSIONI_SIA:
        return make_response(400, {"error": "Codice Mansione CPN inesistente"})

    info = DIZIONARIO_MANSIONI_SIA[codice_mansione]
    metri_lavorati = payload["quantita_metri"]
    materiale_reale = payload["materiale_reale"]
    consumo_teorico_sia = round(metri_lavorati * info["fm"], 2)
    volume_spreco = max(0.0, round(materiale_reale - consumo_teorico_sia, 2))
    percentuale_spreco = round((volume_spreco / consumo_teorico_sia * 100), 2) if consumo_teorico_sia > 0 else 0.0
    costo_calcolato = round(metri_lavorati * info["prezzo_cpn"], 2)
    timestamp_adesso = datetime.now().strftime("%d.%m.%Y %H:%M:%S")

    row = [
        timestamp_adesso,
        codice_mansione,
        info["nome"],
        "Keller Solaio",
        "Andreas Dancs",
        info["categoria"].upper(),
        "STANDARD",
        metri_lavorati,
        consumo_teorico_sia,
        materiale_reale,
        volume_spreco,
        costo_calcolato,
        "CPN_ID",
        percentuale_spreco,
        payload["ore_lavorate"],
        payload["temperatura"],
        "OK (SUVA)",
        payload["note_anomalie"],
    ]

    try:
        worksheet.append_row(row, value_input_option="USER_ENTERED")
    except Exception as exc:
        return make_response(500, {"error": f"Drive Link Error: {str(exc)}"})

    return make_response(
        200,
        {
            "status": "synchronized",
            "codice_mansione": codice_mansione,
            "consumo_teorico_sia": consumo_teorico_sia,
            "volume_spreco": volume_spreco,
            "percentuale_spreco": percentuale_spreco,
            "costo_calcolato": costo_calcolato,
            "notifica_controlling": f"Registrato sottomenu {codice_mansione}. Spreco calcolato: {percentuale_spreco}%.",
        },
    )
