import json
import os
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation


SPREADSHEET_ID = "1ttfAdqE3TI7G_gwapZhz3Yw3dKSYHM2smpQoILLGcJ0"
SHEET_NAME = "CANTIERE_CORRENTE"


CATALOG = {
    "MAT001": {"name": "EVA barriera vapore", "unit": "m2", "aliases": ["eva"]},
    "MAT002": {"name": "EGV guaina bituminosa", "unit": "m2", "aliases": ["egv"]},
    "MAT003": {"name": "EP5 guaina bituminosa", "unit": "m2", "aliases": ["ep5"]},
    "MAT004": {"name": "Primer bitume", "unit": "l", "aliases": ["primer bitume"]},
    "MAT005": {"name": "Primer FLK", "unit": "l", "aliases": ["primer flk"]},
    "MAT006": {"name": "FLK resina", "unit": "kg", "aliases": ["flk resina", "flk kit"]},
    "MAT007": {"name": "Catalizzatore FLK", "unit": "kg", "aliases": ["catalizzatore"]},
    "MAT008": {"name": "Vlies FLK", "unit": "m", "aliases": ["vlies flk"]},
    "MAT009": {"name": "Pannelli PIR", "unit": "m2", "aliases": ["pannelli pir", "pannelli isolanti"]},
    "CON001": {"name": "Lana di roccia", "unit": "m2", "aliases": ["lana di roccia"]},
    "CON002": {"name": "Colla PU", "unit": "kg", "aliases": ["colla pu"]},
    "CON003": {"name": "Tasselli", "unit": "pz", "aliases": ["tasselli"]},
    "CON004": {"name": "Klebeband", "unit": "m", "aliases": ["klebeband"]},
    "CON005": {"name": "Lamiera raccordo", "unit": "m", "aliases": ["lamiera"]},
    "CON006": {"name": "Viti fissaggio", "unit": "pz", "aliases": ["viti"]},
    "CON007": {"name": "Silicone / sigillante", "unit": "cart", "aliases": ["silicone", "sigillante"]},
    "CON008": {"name": "Bocchettone / scarico", "unit": "pz", "aliases": ["bocchettone", "scarico emergenza"]},
    "ATZ001": {"name": "Cannello", "unit": "pz", "aliases": ["cannello"]},
    "ATZ002": {"name": "Cutter", "unit": "pz", "aliases": ["cutter"]},
    "ATZ003": {"name": "Rullo pressore", "unit": "pz", "aliases": ["rullo pressore", "rullo", "rolle"]},
    "ATZ004": {"name": "Pennello / Pinsel", "unit": "pz", "aliases": ["pennello", "pinsel"]},
    "ATZ005": {"name": "Schleifmaschine", "unit": "pz", "aliases": ["schleifmaschine", "schleifmaschine + disco"]},
    "ATZ006": {"name": "Soffiatore", "unit": "pz", "aliases": ["soffiatore"]},
    "ATZ007": {"name": "Trapano / Akuschrauber", "unit": "pz", "aliases": ["trapano", "akuschrauber", "avvitatore"]},
    "ATZ008": {"name": "Metro / strumenti misura", "unit": "pz", "aliases": ["metro", "igrometro"]},
    "ATZ009": {"name": "DPI e utensili manuali", "unit": "pz", "aliases": ["guanti", "handschuhe", "forbici", "spatola", "cesoia"]},
    "GAS001": {"name": "Bombola gas propano", "unit": "pz", "aliases": ["bombola gas", "bombole gas"]},
}

SUPPLIER_OCI = {
    "OCI001": {"supplier": "Sika Schweiz AG", "scope": "FLK, primer, sigillanti"},
    "OCI002": {"supplier": "Swisspearl Schweiz AG", "scope": "PIR, isolamento, accessori tetto"},
}


JOB_RULES = {
    "Dampfbremse (EVA + EGV)": {"MAT001": "mqMat", "MAT002": "mqMat", "GAS001": 0.15},
    "Dachpappe 1. Lage (EGV)": {"MAT002": "mqMat", "GAS001": "bombole"},
    "Dachpappe 2. Lage (EP5)": {"MAT003": "mqMat", "GAS001": "bombole"},
    "Aufbordung/Abbordung": {"MAT001": 0.2, "MAT002": 0.4, "MAT003": 0.4, "GAS001": 0.1},
    "Voranstrich Bitumen": {"MAT004": 0.25},
    "Primer FLK": {"MAT005": 0.2},
    "Vorbereitung FLK": {"CON004": "mlFLK"},
    "FLK 1. Hand": {"MAT006": 1.5, "MAT007": 0.03},
    "Vlies FLK verlegen": {"MAT008": "mlFLK"},
    "FLK 2. Hand": {"MAT006": 1.2, "MAT007": 0.025},
    "Dämmung verlegen": {"MAT009": "mqMat", "CON001": 0.25, "CON002": 0.2},
    "Isolieren": {"MAT009": "mqMat", "CON003": 6},
    "Anschluss Blech": {"CON005": "mlFLK", "CON006": 8, "CON007": 0.2},
    "Ablauf": {"CON008": "kessel", "MAT003": 1, "GAS001": 0.05},
    "Notablauf": {"CON008": "kessel", "CON007": 0.25},
    "Durchdringung": {"CON007": 0.25, "MAT003": 0.5, "GAS001": 0.05},
    "Seilsystem": {"CON006": 8},
    "Tagesabschottung": {"MAT002": 2, "CON004": 5, "GAS001": 0.05},
}


def _response(status, payload):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(payload, ensure_ascii=False),
    }


def _parse_body(event):
    body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        import base64

        body = base64.b64decode(body).decode("utf-8")
    if isinstance(body, dict):
        return body
    return json.loads(body)


def _money_float(value):
    if value is None:
        return 0.0
    cleaned = re.sub(r"[^\d,.\-]", "", str(value)).strip()
    if not cleaned:
        return 0.0
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace("'", "").replace(",", "")
    else:
        cleaned = cleaned.replace("'", "").replace(",", ".")
    try:
        return float(Decimal(cleaned))
    except (InvalidOperation, ValueError):
        return 0.0


def _num(data, key):
    return _money_float(data.get(key))


def _text(data, key):
    value = data.get(key, "")
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return str(value).strip()


def _mansioni(data):
    raw = data.get("mansioni", "")
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    return [x.strip() for x in str(raw).split(";") if x.strip()]


def _inventory_deductions(data):
    deductions = {}
    measures = {
        "mqMat": _num(data, "mqMat"),
        "mlFLK": _num(data, "mlFLK"),
        "rotoli": _num(data, "rotoli"),
        "kessel": _num(data, "kessel"),
        "bombole": _num(data, "bombole"),
    }
    for job in _mansioni(data):
        for code, rule in JOB_RULES.get(job, {}).items():
            if isinstance(rule, str):
                qty = measures.get(rule, 0.0)
            else:
                base = measures["mqMat"] or measures["mlFLK"] or measures["kessel"] or 1.0
                qty = float(rule) * base
            deductions[code] = deductions.get(code, 0.0) + qty

    if measures["rotoli"]:
        deductions["MAT002"] = deductions.get("MAT002", 0.0) + measures["rotoli"]
    if measures["bombole"]:
        deductions["GAS001"] = max(deductions.get("GAS001", 0.0), measures["bombole"])

    return [
        {
            "code": code,
            "name": CATALOG[code]["name"],
            "unit": CATALOG[code]["unit"],
            "quantity": round(qty, 3),
        }
        for code, qty in sorted(deductions.items())
        if qty > 0
    ]


def _sheet_row(data, deductions):
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    mansioni = "; ".join(_mansioni(data))
    materials = ", ".join(f"{d['code']} {d['quantity']} {d['unit']}" for d in deductions)
    oci = ", ".join(f"{code}:{meta['supplier']}" for code, meta in SUPPLIER_OCI.items())
    total_hours = _num(data, "totalHours")
    labour_hours = total_hours * (_num(data, "operai") or 1.0)
    return [
        _text(data, "date") or now[:10],
        _text(data, "site"),
        _text(data, "worker"),
        _text(data, "zone"),
        mansioni,
        f"{_num(data, 'operai') or 1:.2f}",
        f"{total_hours:.2f}",
        f"{_num(data, 'pause'):.2f}",
        _text(data, "meteo"),
        f"{_num(data, 'tempAria'):.2f}",
        f"{_num(data, 'tempSotto'):.2f}",
        f"{_num(data, 'umidita'):.2f}",
        f"{_num(data, 'mqNetti'):.2f}",
        f"{_num(data, 'mqMat'):.2f}",
        f"{_num(data, 'mlFLK'):.2f}",
        f"{_num(data, 'rotoli'):.2f} / {_num(data, 'kessel'):.2f} / {_num(data, 'bombole'):.2f}",
        f"{_text(data, 'pendenza')} | Tagesabschottung: {_text(data, 'tagesabschottung')} | Lavoro: {labour_hours:.2f} h | {materials} | OCI: {oci}",
        f"Note: {_text(data, 'note')} | Incidente: {_text(data, 'incidente') or 'Nessuno'} | Foto: {_num(data, 'photos'):.0f} | Sync: {now}",
    ]


def _get_gspread_client():
    import gspread
    from google.oauth2.service_account import Credentials

    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    service_account_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if service_account_json:
        info = json.loads(service_account_json)
        creds = Credentials.from_service_account_info(info, scopes=scopes)
        return gspread.authorize(creds)

    credentials_file = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if credentials_file:
        creds = Credentials.from_service_account_file(credentials_file, scopes=scopes)
        return gspread.authorize(creds)

    return gspread.service_account(scopes=scopes)


def _append_to_sheet(row):
    client = _get_gspread_client()
    worksheet = client.open_by_key(SPREADSHEET_ID).worksheet(SHEET_NAME)
    worksheet.append_row(row, value_input_option="USER_ENTERED")


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return _response(204, {})
    if event.get("httpMethod") == "GET":
        return _response(
            200,
            {
                "ok": True,
                "catalog_count": len(CATALOG) + len(SUPPLIER_OCI),
                "material_tool_code_count": len(CATALOG),
                "supplier_oci_count": len(SUPPLIER_OCI),
                "sheet": SHEET_NAME,
            },
        )
    if event.get("httpMethod") != "POST":
        return _response(405, {"ok": False, "error": "method_not_allowed"})

    try:
        data = _parse_body(event)
        deductions = _inventory_deductions(data)
        row = _sheet_row(data, deductions)
        if len(row) != 18:
            return _response(500, {"ok": False, "error": "row_alignment_error", "columns": len(row)})
        if not data.get("dryRun"):
            _append_to_sheet(row)
        return _response(
            200,
            {
                "ok": True,
                "columns": len(row),
                "inventory_deductions": deductions,
                "supplier_oci": SUPPLIER_OCI,
            },
        )
    except Exception as exc:
        return _response(500, {"ok": False, "error": exc.__class__.__name__})
