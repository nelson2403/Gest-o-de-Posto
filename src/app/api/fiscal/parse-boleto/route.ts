import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { inflateSync, inflateRawSync } from 'node:zlib'
import { createWorker } from 'tesseract.js'

// ─── Extração de texto de PDF text-based (FlateDecode) ────────────────────────
function extractPdfTextStreams(buf: Buffer): string {
  const texts: string[] = [buf.toString('latin1')]
  let pos = 0
  while (pos < buf.length) {
    const sIdx = buf.indexOf('stream', pos)
    if (sIdx < 0) break
    let dataStart = sIdx + 6
    if (buf[dataStart] === 13) dataStart++
    if (buf[dataStart] !== 10) { pos = sIdx + 1; continue }
    dataStart++
    const endIdx = buf.indexOf('endstream', dataStart)
    if (endIdx <= dataStart) { pos = sIdx + 6; continue }
    const pre = buf.slice(Math.max(0, sIdx - 1000), sIdx).toString('latin1')
    const hasFlateDecode = pre.includes('FlateDecode') || pre.includes('/Fl ')
      || pre.includes('/Fl\n') || pre.includes('/Fl\r')
    if (!hasFlateDecode) { pos = sIdx + 6; continue }
    let dataEnd = endIdx
    if (buf[dataEnd - 1] === 10) dataEnd--
    if (buf[dataEnd - 1] === 13) dataEnd--
    const streamData = buf.slice(dataStart, dataEnd)
    if (streamData.length > 10) {
      try { texts.push(inflateSync(streamData).toString('latin1')) } catch {
        try { texts.push(inflateRawSync(streamData).toString('latin1')) } catch {}
      }
    }
    pos = endIdx + 9
  }
  return texts.join(' ')
}

// ─── Extrai maior JPEG do PDF (DCTDecode / image scan) ───────────────────────
function extractLargestJpegFromPdf(buf: Buffer): Buffer | null {
  let best: Buffer | null = null
  let pos = 0
  while (pos < buf.length) {
    // Procura qualquer magic byte JPEG (FF D8 FF) no buffer
    const jpgStart = buf.indexOf(Buffer.from([0xFF, 0xD8, 0xFF]), pos)
    if (jpgStart < 0) break
    // Procura o marcador de fim de JPEG (FF D9)
    const jpgEnd = buf.indexOf(Buffer.from([0xFF, 0xD9]), jpgStart + 2)
    if (jpgEnd < 0) { pos = jpgStart + 1; continue }
    const end = jpgEnd + 2
    const jpeg = buf.slice(jpgStart, end)
    if (jpeg.length > 5000 && (!best || jpeg.length > best.length)) {
      best = jpeg
      console.log(`[parse-boleto] JPEG candidato: ${jpeg.length} bytes @ offset ${jpgStart}`)
    }
    pos = end
  }
  if (best) console.log(`[parse-boleto] Maior JPEG selecionado: ${best.length} bytes`)
  return best
}

// ─── Parse dos dados do boleto no texto extraído ──────────────────────────────
function extractBoletoData(text: string, valorRef?: number): { vencimento: string; valor: string } {
  const strs: string[] = []
  const re = /\(([^()]{0,500})\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const s = m[1]
      .replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
      .replace(/\\\\/g, '\\').replace(/\\n/g, ' ').replace(/\\r/g, ' ')
    strs.push(s)
  }
  const combined = strs.join(' ') + ' ' + text
  console.log('[parse-boleto] texto sample:', combined.replace(/[^\x20-\x7E]/g, ' ').slice(0, 500))

  // ─── Fator de vencimento → data ─────────────────────────────────────────────
  function fatorToDate(fator: number): string | null {
    if (fator <= 0) return null
    // Ciclo original: base = 07/10/1997; válido até fator 9999 = 21/02/2025
    const base = new Date(Date.UTC(1997, 9, 7))
    base.setUTCDate(base.getUTCDate() + fator)
    const agora = Date.now()
    // Se a data resultante for razoável (até 2 anos no futuro), usa ela
    if (base.getTime() >= agora - 86_400_000 * 30 && base.getTime() <= agora + 86_400_000 * 730) {
      return base.toISOString().slice(0, 10)
    }
    // Novo ciclo (pós 21/02/2025): fator 1000 = 22/02/2025
    // Bancos reiniciaram o fator a partir de 1000 após o rollover do 9999
    if (fator >= 1000) {
      const novaBase = new Date(Date.UTC(2025, 1, 22)) // 22/02/2025
      novaBase.setUTCDate(novaBase.getUTCDate() + (fator - 1000))
      if (novaBase.getTime() >= agora - 86_400_000 * 30 && novaBase.getTime() <= agora + 86_400_000 * 730) {
        return novaBase.toISOString().slice(0, 10)
      }
    }
    return null
  }

  // ── 1. Valor + vencimento pelo código de barras / linha digitável ───────────
  // (não retorna direto: o valor do código de barras pode vir errado em PDFs
  //  escaneados via OCR — será cruzado com o valor impresso abaixo)
  let vencBarcode  = ''
  let valorBarcode = ''
  const linhaMatch = combined.match(
    /(\d{5})[.\- ]?(\d{5})\s{0,6}(\d{5})[.\- ]?(\d{6})\s{0,6}(\d{5})[.\- ]?(\d{6})\s{0,6}(\d)\s{0,6}(\d{14})/,
  )
  if (linhaMatch) {
    const f5    = linhaMatch[8]
    const fator = parseInt(f5.slice(0, 4), 10)
    const cts   = parseInt(f5.slice(4), 10)
    const venc = fatorToDate(fator)
    if (venc) vencBarcode = venc
    if (cts > 0) valorBarcode = (cts / 100).toFixed(2)
  }
  if (!valorBarcode) {
    for (const m47 of combined.matchAll(/\b(\d{47})\b/g)) {
      const seq   = m47[1]
      const c5    = seq.slice(32, 46)
      const fator = parseInt(c5.slice(0, 4), 10)
      const cts   = parseInt(c5.slice(4), 10)
      const venc  = fatorToDate(fator)
      if (venc && cts > 0) { vencBarcode = venc; valorBarcode = (cts / 100).toFixed(2); break }
    }
  }

  const lower = combined.toLowerCase()

  // ── 2. Vencimento por texto (fallback) ──────────────────────────────────────
  let vencData = ''
  const dateRe = /(\d{2})[\/.](\d{2})[\/.](\d{4})/
  const dateReG = /(\d{2})[\/.](\d{2})[\/.](\d{4})/g
  const vIdx = Math.max(lower.indexOf('vencimento'), lower.indexOf('vencto'))
  if (vIdx >= 0) {
    const janela = combined.slice(vIdx, vIdx + 300)
    const dm = janela.match(dateRe)
    if (dm) vencData = `${dm[3]}-${dm[2]}-${dm[1]}`
  }
  if (!vencData) {
    for (const dm of combined.matchAll(dateReG)) {
      const ano = +dm[3]
      if (ano >= 2024 && ano <= 2035) {
        const d = Date.UTC(ano, +dm[2] - 1, +dm[1])
        if (d >= Date.now() - 86_400_000 * 30) { vencData = `${dm[3]}-${dm[2]}-${dm[1]}`; break }
      }
    }
  }

  // ── 3. Valor impresso ("VALOR DO DOCUMENTO / VALOR COBRADO") ─────────────────
  let valorLabel = ''
  for (const label of ['valor do documento', 'valor cobrado', '(=) valor cobrado']) {
    const vi = lower.indexOf(label)
    if (vi < 0) continue
    const janela = combined.slice(vi, vi + 200)
    const vm = janela.match(/(\d{1,3}(?:[.\s]\d{3})*,\d{2})/)
    if (vm) { valorLabel = vm[1].replace(/[.\s]/g, '').replace(',', '.'); break }
  }

  // ── 4. Decide o valor cruzando código de barras × valor impresso ────────────
  // Detecta "dígito a mais à esquerda" (erro clássico de leitura): o maior valor
  // é o menor com dígito(s) prefixado(s). Ex.: 2.450,70 = "2"+450,70.
  function digitoExtra(maior: number, menor: number): boolean {
    const dM = Math.round(maior * 100).toString()
    const dm = Math.round(menor * 100).toString()
    return dM.length > dm.length && dM.endsWith(dm)
  }

  let valor = ''
  const vb = valorBarcode ? Number(valorBarcode) : null
  const vl = valorLabel   ? Number(valorLabel)   : null
  if (vb != null && vl != null) {
    const menor = Math.min(vb, vl)
    const maior = Math.max(vb, vl)
    if (Math.abs(vb - vl) <= 0.02) {
      valor = valorBarcode                 // batem → confiável
    } else if (digitoExtra(maior, menor)) {
      // um é o outro com dígito a mais na frente → leitura errada.
      // Usa o menor, a menos que a referência (NF) confirme claramente o maior.
      const refConfirmaMaior = !!valorRef && valorRef > 0 &&
        Math.abs(maior - valorRef) + 0.02 < Math.abs(menor - valorRef)
      const escolhido = refConfirmaMaior ? maior : menor
      valor = escolhido === vb ? valorBarcode : valorLabel
    } else if (valorRef && valorRef > 0) {
      // divergem → usa o candidato mais próximo do valor da NF (referência)
      valor = Math.abs(vb - valorRef) <= Math.abs(vl - valorRef) ? valorBarcode : valorLabel
    } else {
      valor = valorLabel                   // divergem sem referência → impresso é mais confiável no OCR
    }
  } else {
    valor = valorLabel || valorBarcode || ''
  }

  const vencimento = vencBarcode || vencData
  console.log(`[parse-boleto] resultado: venc="${vencimento}" valor="${valor}" (barcode=${valorBarcode || '-'} label=${valorLabel || '-'} ref=${valorRef ?? '-'})`)
  return { vencimento, valor }
}

// ─── OCR com Tesseract ────────────────────────────────────────────────────────
async function ocrImage(imageBuffer: Buffer): Promise<string> {
  const worker = await createWorker('por', 1, {
    logger: () => {},
  })
  try {
    const { data: { text } } = await worker.recognize(imageBuffer)
    console.log('[parse-boleto] OCR sample:', text.slice(0, 500))
    return text
  } finally {
    await worker.terminate()
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const { url, valorReferencia } = await req.json()
    if (!url || typeof url !== 'string') return NextResponse.json({ vencimento: '', valor: '' })
    const valorRef = typeof valorReferencia === 'number' && valorReferencia > 0 ? valorReferencia : undefined

    console.log('[parse-boleto] fetching:', url.slice(0, 80))

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    let buffer: Buffer
    try {
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      if (!response.ok) {
        console.log('[parse-boleto] fetch error:', response.status)
        return NextResponse.json({ vencimento: '', valor: '' })
      }
      buffer = Buffer.from(await response.arrayBuffer())
    } catch (e) {
      clearTimeout(timeout)
      console.log('[parse-boleto] fetch failed:', e)
      return NextResponse.json({ vencimento: '', valor: '' })
    }

    console.log(`[parse-boleto] bufSize=${buffer.length}`)

    // 1. Tenta extração de texto direto (PDF text-based)
    const textContent = extractPdfTextStreams(buffer)
    let result = extractBoletoData(textContent, valorRef)
    if (result.vencimento || result.valor) {
      return NextResponse.json(result)
    }

    // 2. PDF-imagem: extrai maior JPEG e faz OCR
    const jpeg = extractLargestJpegFromPdf(buffer)
    if (jpeg) {
      console.log('[parse-boleto] iniciando OCR...')
      const ocrText = await ocrImage(jpeg)
      result = extractBoletoData(ocrText, valorRef)
    }

    return NextResponse.json(result)
  } catch (e) {
    console.log('[parse-boleto] error:', e)
    return NextResponse.json({ vencimento: '', valor: '' })
  }
}
