import json
import os
from datetime import datetime
from typing import Any, Dict

import gspread
from oauth2client.service_account import ServiceAccountCredentials


SHEET_ID = "1ttfAdqE3TI7G_gwapZhz3Yw3dKSYHM2smpQoILLGcJ0"
WORKSHEET_NAME = "CANTIERE_CORRENTE"

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

# MATRICE COMPLETA DELLE MANSIONI CPN EDILI SVIZZERE 2026 (CHPLAN AG)
DIZIONARIO_MANSIONI_SIA: Dict[str, Dict[str, Any]] = {
    # CATEGORIA: BITUMEN (CPN 364)
    "BIT001": {
        "nome": "Posa Barriera Vapore Bitume EGV 4",
        "categoria": "bitume",
        "prezzo_cpn": 24.0,
        "fm": 1.12,
        "ft": 0.25,
        "mat_id": "MAT006",
    },
    "BIT002": {
        "nome": "Posa Isolamento PIR 180mm",
        "categoria": "bitume",
        "prezzo_cpn": 68.0,
        "fm": 1.03,
        "ft": 0.30,
        "mat_id": "MAT007",
    },
    "BIT003": {
        "nome": "Posa Doppio Strato Bitume EP4+EP5",
        "categoria": "bitume",
        "prezzo_cpn": 82.0,
        "fm": 1.15,
        "ft": 0.35,
        "mat_id": "MAT008",
    },
    # CATEGORIA: KUNSTSTOFFBAHN / SINTETICO (CPN 364)
    "SYN001": {
        "nome": "Posa Manto Sintetico PVC/FPO Sarnafil",
        "categoria": "sintetico",
        "prezzo_cpn": 74.0,
        "fm": 1.08,
        "ft": 0.28,
        "mat_id": "MAT010",
    },
    # CATEGORIA: FLK (CPN 365)
    "FLK001": {
        "nome": "Sigillatura Liquida Dettagli Alsan",
        "categoria": "flk",
        "prezzo_cpn": 120.0,
        "fm": 1.0,
        "ft": 0.50,
        "mat_id": "MAT001",
    },
    # CATEGORIA: BEGRUNUNG & ZAVORRA (CPN 364)
    "GRN001": {
        "nome": "Stesa Feltro Drenaggio e Ghiaia Lavata",
        "categoria": "begrunung",
        "prezzo_cpn": 38.0,
        "fm": 1.05,
        "ft": 0.20,
        "mat_id": "MAT011",
    },
    # CATEGORIA: SCARICHI & LATTONERIA (CPN 351)
    "MON001": {
        "nome": "Montaggio Scarico Verticale Gully Sita/Geberit",
        "categoria": "scarichi",
        "prezzo_cpn": 390.0,
        "fm": 1.0,
        "ft": 1.50,
        "mat_id": "CON004",
    },
}


def _json_response(status_code: int, payload: Dict[str, Any], extra_headers: Dict[str, str] | None = None):
    headers = {**CORS_HEADERS, "Content-Type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)

    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(payload, ensure_ascii=False),
    }


def _as_float(value: Any, fallback: float) -> float:
    candidate = fallback if value in (None, "") else value
    try:
        number = float(candidate)
    except (TypeError, ValueError) as exc:
        raise ValueError("Valore numerico non valido") from exc

    if number != number or number in (float("inf"), float("-inf")):
        raise ValueError("Valore numerico non valido")

    return number


def _as_text(value: Any, fallback: str) -> str:
    text = str(fallback if value is None else value).strip()
    return text or fallback


def _get_google_sheet():
    creds_raw = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if not creds_raw:
        raise RuntimeError("Credenziali Google non configurate")

    creds_dict = json.loads(creds_raw)
    scope = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.file",
    ]
    creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
    client = gspread.authorize(creds)
    return client.open_by_key(SHEET_ID).worksheet(WORKSHEET_NAME)


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    if event.get("httpMethod") != "POST":
        return {"statusCode": 405, "headers": CORS_HEADERS, "body": "Method Not Allowed"}

    try:
        body = json.loads(event.get("body") or "{}")
        codice_mansione = _as_text(body.get("codice_mansione"), "BIT001")
        metri_lavorati = _as_float(body.get("quantita_metri"), 0.0)
        materiale_reale_consumato = _as_float(body.get("materiale_reale"), 0.0)
        ore_lavorate_reali = _as_float(body.get("ore_lavorate"), 8.0)
        temperatura = _as_float(body.get("temperatura"), 15.0)
        note_anomalie = str(body.get("note_anomalie", "")).strip()
        nome_operaio = _as_text(body.get("nome_operaio"), "Andreas Dancs")
        cantiere_indirizzo = _as_text(body.get("cantiere_indirizzo"), "Keller Solaio")
    except Exception as exc:
        return _json_response(400, {"error": f"Schema payload non valido: {str(exc)}"})

    if codice_mansione not in DIZIONARIO_MANSIONI_SIA:
        return _json_response(400, {"error": "Codice Mansione CPN inesistente"})

    info = DIZIONARIO_MANSIONI_SIA[codice_mansione]

    # Calcolo dello spreco materiale secondo fattore mansione SIA.
    consumo_teorico_diritto = round(float(metri_lavorati) * float(info["fm"]), 2)
    volume_spreco = 0.0
    percentuale_spreco = 0.0

    if materiale_reale_consumato > consumo_teorico_diritto:
        volume_spreco = round(materiale_reale_consumato - consumo_teorico_diritto, 2)
        if consumo_teorico_diritto > 0:
            percentuale_spreco = round((volume_spreco / consumo_teorico_diritto) * 100.0, 2)

    costo_calcolato_fattura = round(metri_lavorati * float(info["prezzo_cpn"]), 2)
    timestamp_adesso = datetime.now().strftime("%d.%m.%Y %H:%M:%S")

    try:
        tab_cantiere = _get_google_sheet()
        tab_cantiere.append_row(
            [
                codice_mansione,
                info["nome"],
                cantiere_indirizzo,
                nome_operaio,
                info["categoria"].upper(),
                "STANDARD",
                float(round(metri_lavorati, 2)),
                float(consumo_teorico_diritto),
                float(round(materiale_reale_consumato, 2)),
                float(volume_spreco),
                float(costo_calcolato_fattura),
                info["mat_id"],
                float(percentuale_spreco),
                float(round(ore_lavorate_reali, 2)),
                float(round(temperatura, 2)),
                "VERIFICATO",
                timestamp_adesso,
                note_anomalie,
            ],
            value_input_option="USER_ENTERED",
        )
    except Exception as exc:
        return _json_response(500, {"error": f"Errore Google Drive Link: {str(exc)}"})

    msg_conferma = (
        f"Sincronizzato CPN {info['categoria'].upper()}. "
        f"Registrati {costo_calcolato_fattura} CHF."
    )
    if percentuale_spreco > 10.0:
        msg_conferma += (
            f" STRUTTURA ALLARME: Rilevato spreco fuori tolleranza del "
            f"{percentuale_spreco}%."
        )

    return _json_response(
        200,
        {
            "status": "synchronized",
            "database": "DachPlan Diario",
            "categoria_lavoro": info["categoria"],
            "notifica_controlling": msg_conferma,
            "allarme_rosso": percentuale_spreco > 15.0,
            "calcoli": {
                "consumo_teorico": consumo_teorico_diritto,
                "volume_spreco": volume_spreco,
                "percentuale_spreco": percentuale_spreco,
                "costo_calcolato_fattura": costo_calcolato_fattura,
            },
        },
    )
