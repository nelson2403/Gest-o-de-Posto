// Extrai as LINHAS (transações) de um extrato bancário anexado, para a
// Confirmação da Conciliação (D-Para banco × AUTOSYSTEM).
// Suporta OFX (Stone e bancos que exportam .ofx), CSV/Excel Stone e Excel
// genérico (Sicoob e afins, por heurística de data + valor).
import * as XLSX from 'xlsx'

export interface LinhaExtrato {
  data:      string   // YYYY-MM-DD
  descricao: string
  valor:     number   // sinal preservado (+ crédito / − débito)
}

// ── valor BR com sinal (1.234,56 / 1234,56 / "123,45 D") ────────────────────
function parseValorBRSigned(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0
  if (typeof raw === 'number') return raw
  const str = String(raw).trim()
  const sufixoD = /\s*[Dd]\s*$/.test(str)
  const semSufixo = str.replace(/\s*[CDcd*]\s*$/, '').trim()
  const negativo = sufixoD || semSufixo.startsWith('-')
  const semSinal = semSufixo.replace(/^-\s*/, '').trim()
  const norm = semSinal.replace(/\./g, '').replace(',', '.')
  const num  = parseFloat(norm)
  if (isNaN(num)) return 0
  return negativo ? -num : num
}

function parseDataExcel(raw: unknown): string | null {
  if (!raw) return null
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const str = String(raw).trim()
  const partes = str.split(/[\/\s]/)[0].split('/')
  if (partes.length === 3) return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str.slice(0, 10)
  return null
}

function parseDataStone(raw: unknown): string | null {
  const [datePart] = String(raw ?? '').trim().split(' ')
  const parts = (datePart ?? '').split('/')
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  if (!d || !m || !y || y.length !== 4) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// ── OFX (SGML) ──────────────────────────────────────────────────────────────
function parseOFXLinhas(texto: string): LinhaExtrato[] {
  const tag = (bloco: string, t: string): string => {
    const m = bloco.match(new RegExp(`<${t}>\\s*([^<\\r\\n]+)`, 'i'))
    return m ? m[1].trim() : ''
  }
  const linhas: LinhaExtrato[] = []
  const blocos = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? []
  for (const b of blocos) {
    const dt = tag(b, 'DTPOSTED')
    const data = dt.length >= 8 ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : ''
    const valor = parseFloat(tag(b, 'TRNAMT').replace(',', '.'))
    if (!data || isNaN(valor)) continue
    linhas.push({ data, valor, descricao: tag(b, 'MEMO') || tag(b, 'NAME') || tag(b, 'TRNTYPE') })
  }
  return linhas
}

// ── Excel / CSV ─────────────────────────────────────────────────────────────
function ehMonetarioBR(s: string) { return !!s && /\d/.test(s) && (/,/.test(s) || /[CDcd*]\s*$/.test(s)) }

function parseExcelLinhas(buffer: ArrayBuffer): LinhaExtrato[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Stone CSV: col0 = Débito/Crédito, col1 = descrição, col2 = valor, col6 = data
  const isStone = rows.some(row => /^(Débito|Crédito)$/i.test(String(row[0] ?? '').trim()))
  if (isStone) {
    const linhas: LinhaExtrato[] = []
    for (const r of rows) {
      if (!/^(Débito|Crédito)$/i.test(String(r[0] ?? '').trim())) continue
      const data = parseDataStone(r[6]); if (!data) continue
      linhas.push({ data, descricao: String(r[1] ?? '').trim(), valor: parseValorBRSigned(r[2]) })
    }
    return linhas
  }

  // Genérico (Sicoob e afins): cada linha com uma DATA e um VALOR monetário BR
  // vira uma transação. Ignora linhas de saldo/cabeçalho.
  const linhas: LinhaExtrato[] = []
  for (const row of rows) {
    const cels = row.map(c => String(c ?? '').trim())
    const texto = cels.join(' ').toUpperCase()
    if (!texto.trim()) continue
    if (/SALDO (DO DIA|ANTERIOR|BLOQUEAD)|SALDO EM|SALDO ATUAL/.test(texto)) continue
    // data: primeira célula-data
    let data: string | null = null
    for (const c of row) { const d = parseDataExcel(c); if (d) { data = d; break } }
    if (!data) continue
    // valor: primeira célula monetária BR (ignora colunas auxiliares em US no fim)
    let valor: number | null = null
    let idxValor = -1
    for (let j = 0; j < cels.length; j++) { if (ehMonetarioBR(cels[j])) { valor = parseValorBRSigned(cels[j]); idxValor = j; break } }
    if (valor == null || valor === 0) continue
    // descrição: maior célula de texto que não é data nem valor
    const descricao = cels
      .filter((c, j) => j !== idxValor && !parseDataExcel(c) && c.length > 2 && !ehMonetarioBR(c) && !/^\d+$/.test(c))
      .sort((a, b) => b.length - a.length)[0] ?? ''
    linhas.push({ data, descricao, valor })
  }
  return linhas
}

// Decodifica texto detectando UTF-8 x Latin-1 (o header do OFX às vezes declara
// CHARSET:1252 mas o conteúdo é UTF-8, e vice-versa).
function decodeSmart(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { return new TextDecoder('latin1').decode(bytes) }
}

// ── Entrada única ───────────────────────────────────────────────────────────
export function parseExtratoLinhas(buffer: ArrayBuffer): LinhaExtrato[] {
  const bytes = new Uint8Array(buffer)
  const cabecalho = new TextDecoder('latin1').decode(bytes.slice(0, 512))
  const isOFX = /OFXHEADER|<OFX>/i.test(cabecalho)
  if (isOFX) return parseOFXLinhas(decodeSmart(bytes))
  return parseExcelLinhas(buffer)
}
