import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarMovtosParaExportacao, type MovtoExportacao } from '@/lib/autosystem'
import type {
  ContabilRegraExportacao, RegraCampoCondicao, RegraCampoAcao, RegraOperador,
} from '@/types/database.types'

export const dynamic = 'force-dynamic'

// GET /api/contabil/exportacao-dados
//   ?data_ini=YYYY-MM-DD
//   &data_fim=YYYY-MM-DD
//   &empresa=A,B,C       (CSV de codigo_empresa_externo; vazio = todas)
//   &formato=csv|json    (default: csv — força download; json para preview)
//
// CSV de saída (5 colunas, separador `;`, BOM UTF-8 para Excel pt-BR):
//   data | conta_debitar | conta_creditar | valor | historico
//
// Pipeline por linha:
//   1. Lê linha original do AUTOSYSTEM (movto)
//   2. conta_debitar/conta_creditar = mapeamento_de_para[codigo] ?? codigo_original
//   3. Aplica regras ativas em ordem — a condição testa o valor ORIGINAL
//      do AUTOSYSTEM; a ação sobrescreve o valor FINAL de saída
//   4. Escreve no CSV

// ── CSV helpers ──────────────────────────────────────────────────────────────
function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[;"\n\r]/.test(s) || s !== s.trim()) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function fmtBrlSemSimbolo(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Engine de regras ─────────────────────────────────────────────────────────
function valorOriginal(linha: MovtoExportacao, campo: RegraCampoCondicao): string {
  switch (campo) {
    case 'conta_debitar':  return linha.conta_debitar  ?? ''
    case 'conta_creditar': return linha.conta_creditar ?? ''
    case 'observacao':     return linha.observacao     ?? ''
    case 'documento':      return linha.documento      ?? ''
    case 'pessoa':         return linha.pessoa_nome    ?? ''
  }
}

function condicaoBate(val: string, op: RegraOperador, ref: string): boolean {
  switch (op) {
    case 'starts_with':     return val.startsWith(ref)
    case 'not_starts_with': return !val.startsWith(ref)
    case 'equals':          return val === ref
    case 'not_equals':      return val !== ref
    case 'contains':        return val.includes(ref)
    case 'not_contains':    return !val.includes(ref)
  }
}

interface LinhaSaida {
  data:           string
  conta_debitar:  string
  conta_creditar: string
  valor:          number
  historico:      string
}

function processarLinha(
  linha: MovtoExportacao,
  mapeamento: Map<string, string>,
  regrasAtivas: ContabilRegraExportacao[],
): LinhaSaida {
  // Defaults: aplica mapeamento padrão; historico = observacao
  const out: LinhaSaida = {
    data:           linha.data,
    conta_debitar:  linha.conta_debitar  ? (mapeamento.get(linha.conta_debitar)  ?? linha.conta_debitar)  : '',
    conta_creditar: linha.conta_creditar ? (mapeamento.get(linha.conta_creditar) ?? linha.conta_creditar) : '',
    valor:          linha.valor,
    historico:      linha.observacao ?? '',
  }

  // Regras: cada uma pode sobrescrever conta_debitar / conta_creditar / historico
  for (const r of regrasAtivas) {
    const v = valorOriginal(linha, r.condicao_campo)
    if (!condicaoBate(v, r.condicao_operador, r.condicao_valor)) continue
    switch (r.acao_campo) {
      case 'conta_debitar':  out.conta_debitar  = r.acao_valor; break
      case 'conta_creditar': out.conta_creditar = r.acao_valor; break
      case 'observacao':     out.historico      = r.acao_valor; break
    }
  }

  return out
}

// ── CSV ──────────────────────────────────────────────────────────────────────
function gerarCsvResponse(
  filename: string,
  rowsOut: LinhaSaida[],
): Response {
  const header = ['data', 'conta_debitar', 'conta_creditar', 'valor', 'historico'].join(';')

  const linhas = rowsOut.map(r => [
    r.data,
    r.conta_debitar,
    r.conta_creditar,
    fmtBrlSemSimbolo(r.valor),
    r.historico,
  ].map(escapeCsv).join(';'))

  // BOM UTF-8 para Excel reconhecer acentos
  const body = '﻿' + header + '\n' + linhas.join('\n')

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}

// ── Params helpers ───────────────────────────────────────────────────────────
function parseEmpresaCsv(raw: string | null): number[] | null {
  if (!raw) return null
  const arr = raw.split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number)
  return arr.length > 0 ? arr : null
}

// ── Handler ──────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const dataIni = sp.get('data_ini') ?? ''
  const dataFim = sp.get('data_fim') ?? ''
  const formato = (sp.get('formato') ?? 'csv').toLowerCase()
  if (!dataIni) return NextResponse.json({ error: 'data_ini é obrigatório' }, { status: 400 })
  if (!dataFim) return NextResponse.json({ error: 'data_fim é obrigatório' }, { status: 400 })

  const empresaFiltro = parseEmpresaCsv(sp.get('empresa'))
  const admin = createAdminClient()

  // Resolve postos → codigo_empresa_externo (filtro de empresa)
  const { data: postos, error: erPostos } = await admin
    .from('postos')
    .select('codigo_empresa_externo')
    .not('codigo_empresa_externo', 'is', null)
  if (erPostos) return NextResponse.json({ error: erPostos.message }, { status: 500 })

  const todasEmpresas: number[] = []
  for (const p of postos ?? []) {
    const cod = Number(p.codigo_empresa_externo)
    if (!Number.isNaN(cod)) todasEmpresas.push(cod)
  }
  const empresaIds = empresaFiltro && empresaFiltro.length > 0
    ? todasEmpresas.filter(c => empresaFiltro.includes(c))
    : todasEmpresas
  if (empresaIds.length === 0) {
    return NextResponse.json({ error: 'Nenhuma empresa válida para exportar' }, { status: 400 })
  }

  try {
    const rowsRaw = await buscarMovtosParaExportacao(empresaIds, dataIni, dataFim)

    // Mapeamento de/para ATIVO
    const { data: mapsRow } = await admin
      .from('contabil_mapeamento_contas')
      .select('conta_autosystem, conta_contabil')
      .eq('ativo', true)
    const mapeamento = new Map<string, string>()
    for (const m of mapsRow ?? []) mapeamento.set(m.conta_autosystem, m.conta_contabil)

    // Regras ATIVAS, em ordem
    const { data: regrasRow } = await admin
      .from('contabil_regras_exportacao')
      .select('*')
      .eq('ativa', true)
      .order('ordem', { ascending: true })
      .order('criado_em', { ascending: true })
    const regrasAtivas = (regrasRow ?? []) as ContabilRegraExportacao[]

    // Processa todas as linhas
    const rowsOut: LinhaSaida[] = rowsRaw.map(r => processarLinha(r, mapeamento, regrasAtivas))

    if (formato === 'json') {
      // Estatísticas auxiliares para o preview
      let semMapeamento = 0
      let regrasAplicadas = 0
      for (let i = 0; i < rowsRaw.length; i++) {
        const r = rowsRaw[i]
        const fD = r.conta_debitar  ? mapeamento.has(r.conta_debitar)  : true
        const fC = r.conta_creditar ? mapeamento.has(r.conta_creditar) : true
        if (!fD || !fC) semMapeamento++
        for (const reg of regrasAtivas) {
          if (condicaoBate(valorOriginal(r, reg.condicao_campo), reg.condicao_operador, reg.condicao_valor)) {
            regrasAplicadas++
            break
          }
        }
      }

      return NextResponse.json({
        total:            rowsRaw.length,
        sem_mapeamento:   semMapeamento,
        total_mapeados:   mapeamento.size,
        total_regras:     regrasAtivas.length,
        regras_aplicadas: regrasAplicadas,
        rows_originais:   rowsRaw.slice(0, 5),
        rows_saida:       rowsOut.slice(0, 5),
      })
    }

    const filename = `lancamentos_${dataIni}_a_${dataFim}.csv`
    return gerarCsvResponse(filename, rowsOut)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao consultar AUTOSYSTEM'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
