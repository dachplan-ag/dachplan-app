import { google } from 'googleapis'

const LISTA_FISSA_FLK = {
  1: { nome: 'Fenster / Türe', primer_metallo: true, beton_tools: false },
  2: { nome: 'Anschluss Dachpappe -> Beton', primer_metallo: false, beton_tools: true },
  3: { nome: 'Ablauf', primer_metallo: true, beton_tools: false },
  4: { nome: 'Notablauf', primer_metallo: true, beton_tools: false },
  5: { nome: 'Anschluss Dachpappe -> Blech', primer_metallo: true, beton_tools: false },
}

const SHEET_ID = '1ttfAdqE3TI7G_gwapZhz3Yw3dKSYHM2smpQoILLGcJ0'
const WORKSHEET_NAME = 'CANTIERE_CORRENTE'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function cleanSwissCurrency(value) {
  let valueString = String(value ?? '').trim().replace(/[^\d.,-]/g, '')

  if (valueString.includes(',') && valueString.includes('.')) {
    valueString = valueString.replace(/'/g, '').replace(/\./g, '').replace(',', '.')
  } else if (valueString.includes(',')) {
    valueString = valueString.replace(/'/g, '').replace(',', '.')
  } else {
    valueString = valueString.replace(/'/g, '')
  }

  const parsed = Number.parseFloat(valueString)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function numberFromBody(value, fallback = 0) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function inferObjectId(body) {
  const source = `${body.mansioni ?? ''} ${body.zone ?? ''}`.toLowerCase()

  if (source.includes('beton') || source.includes('untergrund')) return 2
  if (source.includes('ablauf')) return 3
  if (source.includes('notablauf')) return 4
  if (source.includes('blech')) return 5
  return 1
}

async function appendSheetRow(row) {
  const rawCredentials = process.env.GOOGLE_CREDENTIALS_JSON

  if (!rawCredentials) {
    throw new Error('GOOGLE_CREDENTIALS_JSON is not configured')
  }

  const credentials = JSON.parse(rawCredentials)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${WORKSHEET_NAME}!A:M`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row],
    },
  })
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  let body
  let idOggetto
  let sistema
  let quantita
  let vliesM
  let nomeOperaio
  let indirizzoCantiere
  let condizioneMeteo
  let tipoLavoro

  try {
    body = await request.json()
    idOggetto = Number.parseInt(body.oggetto_id ?? inferObjectId(body), 10)
    sistema = String(body.sistema ?? '1K')
    quantita = numberFromBody(body.quantita ?? body.mlFLK ?? body.mqNetti)
    vliesM = numberFromBody(body.vlies_m ?? body.mqMat ?? body.mlFLK)
    nomeOperaio = String(body.operaio_nome ?? body.worker ?? 'Andreas Dancs')
    indirizzoCantiere = String(body.cantiere_indirizzo ?? body.site ?? 'Keller Solaio')
    condizioneMeteo = String(body.meteo_condizione ?? body.meteo ?? 'Sole')
    tipoLavoro = LISTA_FISSA_FLK[idOggetto]?.nome ?? 'FLK Standard'
  } catch (error) {
    return jsonResponse(400, { error: `Payload Error: ${error.message}` })
  }

  const info = LISTA_FISSA_FLK[idOggetto]

  if (!info) {
    return jsonResponse(400, { error: `Payload Error: oggetto_id ${idOggetto} is not supported` })
  }

  const kgFlk = Math.round(quantita * 2.5 * 100) / 100
  const gCat = sistema === '2K' ? Math.round(kgFlk * 20 * 100) / 100 : 0
  const primerSpray = info.primer_metallo && quantita > 0 ? 1 : 0
  const schleifscheibe = info.beton_tools && quantita > 0 ? 1 : 0
  const costoTeoricoLordo = cleanSwissCurrency(quantita * 82)

  const row = [
    `FLK${String(idOggetto).padStart(3, '0')}`,
    tipoLavoro,
    indirizzoCantiere,
    nomeOperaio,
    condizioneMeteo,
    sistema,
    quantita,
    kgFlk,
    gCat,
    vliesM,
    costoTeoricoLordo,
    primerSpray,
    schleifscheibe,
  ]

  try {
    await appendSheetRow(row)
  } catch (error) {
    return jsonResponse(500, { error: `Database Sync Blocked: ${error.message}` })
  }

  return jsonResponse(200, {
    ok: true,
    status: 'synchronized',
    notifica_controlling: `Allineato a 'DachPlan Diario'. Scrittura corretta: ${costoTeoricoLordo} CHF.`,
  })
}

export const config = {
  path: '/api/sync-flk',
}
