import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { inflateSync, inflateRawSync } from 'node:zlib'
import { createWorker } from 'tesseract.js'

// ─── Lógica de parse (igual ao route parse-boleto) ───────────────────────────

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
    if (!pre.includes('FlateDecode') && !pre.includes('/Fl ') && !pre.includes('/Fl\n')) {
      pos = sIdx + 6; continue
    }
    let dataEnd = endIdx
    if (buf[dataEnd - 1] === 10) dataEnd--
    if (buf[dataEnd - 1] === 13) dataEnd--
    const data = buf.slice(dataStart, dataEnd)
    if (data.length > 10) {
      try { texts.push(inflateSync(data).toString('latin1')) } catch {
        try { texts.push(inflateRawSync(data).toString('latin1')) } catch {}
      }
    }
    pos = endIdx + 9
  }
  return texts.join(' ')
}

function extractLargestJpeg(buf: Buffer): Buffer | null {
  let best: Buffer | null = null
  let pos = 0
  while (pos < buf.length) {
    const s = buf.indexOf(Buffer.from([0xFF, 0xD8, 0xFF]), pos)
    if (s < 0) break
    const e = buf.indexOf(Buffer.from([0xFF, 0xD9]), s + 2)
    if (e < 0) { pos = s + 1; continue }
    const jpeg = buf.slice(s, e + 2)
    if (jpeg.length > 5000 && (!best || jpeg.length > best.length)) best = jpeg
    pos = e + 2
  }
  return best
}

function fatorToDate(fator: number): string | null {
  if (fator <= 0) return null
  const agora = Date.now()
  const base = new Date(Date.UTC(1997, 9, 7))
  base.setUTCDate(base.getUTCDate() + fator)
  if (base.getTime() >= agora - 86_400_000 * 30 && base.getTime() <= agora + 86_400_000 * 730) {
    return base.toISOString().slice(0, 10)
  }
  if (fator >= 1000) {
    const nb = new Date(Date.UTC(2025, 1, 22))
    nb.setUTCDate(nb.getUTCDate() + (fator - 1000))
    if (nb.getTime() >= agora - 86_400_000 * 30 && nb.getTime() <= agora + 86_400_000 * 730) {
      return nb.toISOString().slice(0, 10)
    }
  }
  return null
}

function parseBoletoData(text: string): { vencimento: string; valor: string } {
  const strs: string[] = []
  const re = /\(([^()]{0,500})\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    strs.push(m[1].replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
      .replace(/\\\\/g, '\\').replace(/\\n/g, ' ').replace(/\\r/g, ' '))
  }
  const combined = strs.join(' ') + ' ' + text

  // Linha digitável
  const lm = combined.match(
    /(\d{5})[.\- ]?(\d{5})\s{0,6}(\d{5})[.\- ]?(\d{6})\s{0,6}(\d{5})[.\- ]?(\d{6})\s{0,6}(\d)\s{0,6}(\d{14})/,
  )
  if (lm) {
    const f5 = lm[8]; const fator = parseInt(f5.slice(0, 4), 10); const cts = parseInt(f5.slice(4), 10)
    const venc = fatorToDate(fator)
    if (venc && cts > 0) return { vencimento: venc, valor: (cts / 100).toFixed(2) }
  }
  for (const m47 of combined.matchAll(/\b(\d{47})\b/g)) {
    const c5 = m47[1].slice(32, 46)
    const venc = fatorToDate(parseInt(c5.slice(0, 4), 10))
    const cts  = parseInt(c5.slice(4), 10)
    if (venc && cts > 0) return { vencimento: venc, valor: (cts / 100).toFixed(2) }
  }

  const lower = combined.toLowerCase()
  const dateRe = /(\d{2})[\/.](\d{2})[\/.](\d{4})/

  let vencimento = ''
  const vIdx = Math.max(lower.indexOf('vencimento'), lower.indexOf('vencto'))
  if (vIdx >= 0) {
    const dm = combined.slice(vIdx, vIdx + 300).match(dateRe)
    if (dm) vencimento = `${dm[3]}-${dm[2]}-${dm[1]}`
  }
  if (!vencimento) {
    for (const dm of combined.matchAll(/(\d{2})[\/.](\d{2})[\/.](\d{4})/g)) {
      const ano = +dm[3]
      if (ano >= 2024 && ano <= 2035) {
        const d = Date.UTC(ano, +dm[2] - 1, +dm[1])
        if (d >= Date.now() - 86_400_000 * 30) { vencimento = `${dm[3]}-${dm[2]}-${dm[1]}`; break }
      }
    }
  }

  let valor = ''
  for (const label of ['valor do documento', 'valor cobrado', '(=) valor cobrado', 'valor']) {
    const vi = lower.indexOf(label)
    if (vi < 0) continue
    const vm = combined.slice(vi, vi + 200).match(/(\d{1,3}(?:[.\s]\d{3})*,\d{2})/)
    if (vm) { valor = vm[1].replace(/[.\s]/g, '').replace(',', '.'); break }
  }
  return { vencimento, valor }
}

async function parsePdfUrl(url: string): Promise<{ vencimento: string; valor: string }> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20_000)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return { vencimento: '', valor: '' }
    const buffer = Buffer.from(await res.arrayBuffer())

    // 1. Texto
    const text = extractPdfTextStreams(buffer)
    const r1 = parseBoletoData(text)
    if (r1.vencimento || r1.valor) return r1

    // 2. OCR
    const jpeg = extractLargestJpeg(buffer)
    if (jpeg) {
      const worker = await createWorker('por', 1, { logger: () => {} })
      try {
        const { data: { text: ocrText } } = await worker.recognize(jpeg)
        return parseBoletoData(ocrText)
      } finally {
        await worker.terminate()
      }
    }
    return { vencimento: '', valor: '' }
  } catch {
    return { vencimento: '', valor: '' }
  }
}

// ─── POST — reprocessa todos os boletos ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: usuario } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (usuario?.role !== 'master' && usuario?.role !== 'adm_fiscal') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Busca todas as tarefas com boleto_url ou coluna boletos preenchida
  const { data: tarefas, error } = await admin
    .from('fiscal_tarefas')
    .select('id, boleto_url, boleto_vencimento, boleto_valor, boletos')
    .or('boleto_url.not.is.null,boletos.not.is.null')
    .not('status', 'in', '(desconhecida)')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const resultados: { id: string; status: string; vencimento?: string; valor?: string }[] = []

  for (const tarefa of tarefas ?? []) {
    // Monta lista de boletos: prefere coluna boletos (nova), fallback boleto_url
    const boletosList: { url: string; idx: number }[] = []

    if (Array.isArray(tarefa.boletos) && tarefa.boletos.length > 0) {
      tarefa.boletos.forEach((b: any, i: number) => {
        if (b?.url) boletosList.push({ url: b.url, idx: i })
      })
    } else if (tarefa.boleto_url) {
      boletosList.push({ url: tarefa.boleto_url, idx: 0 })
    }

    if (!boletosList.length) continue

    // Reprocessa cada boleto
    const boletosAtualizados = Array.isArray(tarefa.boletos) ? [...tarefa.boletos] : []
    let anyUpdated = false

    for (const { url, idx } of boletosList) {
      const { vencimento, valor } = await parsePdfUrl(url)
      if (!vencimento && !valor) {
        resultados.push({ id: tarefa.id, status: 'sem_dados' })
        continue
      }

      if (Array.isArray(boletosAtualizados) && boletosAtualizados[idx]) {
        boletosAtualizados[idx] = {
          ...boletosAtualizados[idx],
          ...(vencimento ? { vencimento } : {}),
          ...(valor     ? { valor: parseFloat(valor) } : {}),
        }
      }
      anyUpdated = true
      resultados.push({ id: tarefa.id, status: 'atualizado', vencimento, valor })
    }

    if (!anyUpdated) continue

    // Vencimento mais próximo para o campo legado
    const vencimentos = boletosAtualizados
      .map((b: any) => b?.vencimento).filter(Boolean).sort() as string[]
    const earliestVenc = vencimentos[0] ?? null
    const primeiroBoleto = boletosAtualizados[0]

    const campos: Record<string, any> = { atualizada_em: new Date().toISOString() }
    if (earliestVenc)               campos.boleto_vencimento = earliestVenc
    if (primeiroBoleto?.valor != null) campos.boleto_valor = primeiroBoleto.valor

    // Tenta salvar com coluna boletos
    let upd = await admin.from('fiscal_tarefas').update({ ...campos, boletos: boletosAtualizados }).eq('id', tarefa.id)
    if (upd.error?.message?.includes('boletos')) {
      await admin.from('fiscal_tarefas').update(campos).eq('id', tarefa.id)
    }
  }

  const atualizados = resultados.filter(r => r.status === 'atualizado').length
  const semDados    = resultados.filter(r => r.status === 'sem_dados').length
  return NextResponse.json({ atualizados, semDados, detalhes: resultados })
}
