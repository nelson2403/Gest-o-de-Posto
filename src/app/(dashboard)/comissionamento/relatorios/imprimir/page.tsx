'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Printer, Loader2, AlertCircle, ArrowLeft } from 'lucide-react'

// ── Tipos locais (mesma forma do orchestrator) ──────────────────────────────

type RegraCampo = 'faturamento' | 'quantidade' | 'lucro' | 'mix' | 'atingimento_meta'

interface ComissaoPorRegra {
  regra_id:             string
  regra_nome:           string
  prioridade:           number
  realizado_campo:      RegraCampo
  realizado_valor:      number
  realizado_qtd_vendas: number
  meta_referencia_id:   string | null
  meta_valor:           number | null
  atingimento_meta:     number | null
  base_campo:           RegraCampo
  base_valor:           number
  base_qtd_vendas:      number
  comissao:             number
  breakdown:            { base_descricao: string; modo: string; taxa: number } | null
}
interface ComissaoPorVendedor {
  vendedor_id:    string
  vendedor_nome:  string
  comissoes:      ComissaoPorRegra[]
  comissao_total: number
}
interface AtingimentoDetalhe {
  meta_id: string; meta_nome: string; campo: string
  membro_id: string; vendedor_id: string
  meta_individual: number; realizado: number; atingimento: number
}
type MembroRole = 'supervisor' | 'manager' | 'pit_boss' | 'oil_changer' | 'seller'

interface VendedorResumo {
  vendedor_id: string; vendedor_nome: string
  membro_id:   string | null
  membro_role: MembroRole | null
  vendas_count: number; quantidade: number
  faturamento: number; custo: number; lucro_bruto: number; margem: number
  comissao_total: number
  atingimentos: AtingimentoDetalhe[]
}

const ROLE_LABEL: Record<MembroRole, string> = {
  manager: 'Gerente', supervisor: 'Supervisor',
  pit_boss: 'Chefe de Pista', oil_changer: 'Trocador de Óleo', seller: 'Vendedor',
}
interface CalcularResponse {
  postoId: string; esquemaId: string; dataIni: string; dataFim: string
  totais: {
    qtdVendas: number; faturamento: number; custo: number; lucroBruto: number; margem: number
    comissaoTotal: number; qtdRegrasAtivas: number; qtdRegrasCasaram: number
  }
  resumoPorVendedor: VendedorResumo[]
  atingimentos: AtingimentoDetalhe[]
  comissaoPorVendedor?: ComissaoPorVendedor[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (v: number) => `${v.toFixed(1)}%`
const fmtQtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const fmtData = (s: string) => {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

// ── Helpers do modelo novo ─────────────────────────────────────────────────

const CAMPO_LABEL: Record<RegraCampo, string> = {
  faturamento:      'Faturamento',
  quantidade:       'Quantidade',
  lucro:            'Lucro',
  mix:              'Mix',
  atingimento_meta: 'Atingimento',
}

function fmtAgregado(valor: number, campo: RegraCampo): string {
  if (campo === 'faturamento' || campo === 'lucro') return fmtBRL(valor)
  if (campo === 'quantidade') return `${fmtQtd(valor)} un.`
  if (campo === 'atingimento_meta') return fmtPct(valor)
  return `${fmtQtd(valor)} produto${valor === 1 ? '' : 's'}`
}

// ── Página ──────────────────────────────────────────────────────────────────

// useSearchParams() exige um <Suspense> em volta para o build conseguir
// pré-renderizar a rota (senão o `next build` falha no prerender).
export default function ImprimirRelatorioPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">Carregando…</div>}>
      <ImprimirRelatorioConteudo />
    </Suspense>
  )
}

function ImprimirRelatorioConteudo() {
  const sp = useSearchParams()
  const postoId   = sp?.get('posto_id')   ?? ''
  const esquemaId = sp?.get('esquema_id') ?? ''
  const dataIni   = sp?.get('data_ini')   ?? ''
  const dataFim   = sp?.get('data_fim')   ?? ''
  const auto      = sp?.get('auto')       === '1'

  const [postoNome,   setPostoNome]   = useState<string>('')
  const [esquemaNome, setEsquemaNome] = useState<string>('')
  const [data,    setData]    = useState<CalcularResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState<string | null>(null)

  useEffect(() => {
    if (!postoId || !esquemaId || !dataIni || !dataFim) {
      setErro('Parâmetros incompletos. Reabra a partir da tela de Relatórios.')
      setLoading(false)
      return
    }

    async function carregar() {
      try {
        // Carrega nomes de posto/esquema em paralelo com cálculo
        const [pResp, eResp, calc] = await Promise.all([
          fetch('/api/postos').then(r => r.json()),
          fetch('/api/comissionamento/esquemas').then(r => r.json()),
          fetch(`/api/comissionamento/calcular?${new URLSearchParams({
            posto_id: postoId, esquema_id: esquemaId,
            data_ini: dataIni, data_fim: dataFim, detalhe: '1',
          })}`).then(r => r.json()),
        ])
        const posto   = (pResp.postos   ?? []).find((p: any) => p.id === postoId)
        const esquema = (eResp.esquemas ?? []).find((e: any) => e.id === esquemaId)
        setPostoNome(posto?.nome ?? postoId)
        setEsquemaNome(esquema?.nome ?? esquemaId)
        if (calc.error) { setErro(calc.error); return }
        setData(calc as CalcularResponse)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro ao carregar')
      } finally {
        setLoading(false)
      }
    }
    carregar()
  }, [postoId, esquemaId, dataIni, dataFim])

  // Dispara impressão automática quando ?auto=1 e tudo carregado
  useEffect(() => {
    if (auto && !loading && !erro && data) {
      const t = setTimeout(() => window.print(), 300)
      return () => clearTimeout(t)
    }
  }, [auto, loading, erro, data])

  // Comissões agregadas por vendedor (key = vendedor_id string)
  const comissaoPorVendedorMap = useMemo(() => {
    const map = new Map<string, ComissaoPorVendedor>()
    if (!data?.comissaoPorVendedor) return map
    for (const cv of data.comissaoPorVendedor) {
      map.set(cv.vendedor_id, cv)
    }
    return map
  }, [data])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[13px]">Gerando relatório…</span>
      </div>
    )
  }

  if (erro || !data) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <p>{erro ?? 'Erro inesperado'}</p>
        </div>
        <Button variant="outline" onClick={() => window.close()} className="mt-4 gap-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Fechar
        </Button>
      </div>
    )
  }

  const vendedoresComComissao = data.resumoPorVendedor
    .filter(v => v.comissao_total > 0)
    .sort((a, b) => b.comissao_total - a.comissao_total)

  return (
    <div className="bg-gray-100 min-h-screen print:bg-white">

      {/* Barra de ações — escondida na impressão */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 print:hidden">
        <Button onClick={() => window.print()} className="gap-1.5 bg-gray-900 hover:bg-black text-white text-[12.5px]">
          <Printer className="w-3.5 h-3.5" /> Imprimir
        </Button>
        <Button variant="outline" onClick={() => window.close()} className="gap-1.5 text-[12.5px]">
          <ArrowLeft className="w-3.5 h-3.5" /> Fechar
        </Button>
        <p className="ml-auto text-[11.5px] text-gray-500">
          {postoNome} · {fmtData(dataIni)} a {fmtData(dataFim)}
        </p>
      </div>

      {/* Conteúdo A4 */}
      <div className="max-w-[800px] mx-auto p-6 print:p-0 print:max-w-none bg-white">

        {/* Cabeçalho */}
        <div className="border-b-2 border-gray-900 pb-3 mb-4">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Apuração de Comissões</p>
          <h1 className="text-[20px] font-bold text-gray-900 mt-0.5">{postoNome}</h1>
          <div className="grid grid-cols-3 gap-4 mt-3 text-[11.5px]">
            <div>
              <p className="text-gray-500 uppercase text-[10px] font-semibold">Esquema</p>
              <p className="text-gray-800 font-medium">{esquemaNome}</p>
            </div>
            <div>
              <p className="text-gray-500 uppercase text-[10px] font-semibold">Período</p>
              <p className="text-gray-800 font-medium">{fmtData(dataIni)} a {fmtData(dataFim)}</p>
            </div>
            <div>
              <p className="text-gray-500 uppercase text-[10px] font-semibold">Emitido em</p>
              <p className="text-gray-800 font-medium">{new Date().toLocaleString('pt-BR')}</p>
            </div>
          </div>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <ResumoBox titulo="Vendas"        valor={`${fmtQtd(data.totais.qtdVendas)}`}        sub="linhas" />
          <ResumoBox titulo="Faturamento"   valor={fmtBRL(data.totais.faturamento)}          sub={`Margem ${fmtPct(data.totais.margem)}`} />
          <ResumoBox titulo="Lucro bruto"   valor={fmtBRL(data.totais.lucroBruto)} />
          <ResumoBox titulo="Comissão total" valor={fmtBRL(data.totais.comissaoTotal)} destaque />
        </div>

        {vendedoresComComissao.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center">
            <p className="text-[13px] text-gray-500 italic">Nenhum vendedor com comissão no período.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {vendedoresComComissao.map((v, idx) => (
              <BlocoVendedor
                key={v.vendedor_id}
                v={v}
                comissao={comissaoPorVendedorMap.get(v.vendedor_id) ?? null}
                indice={idx + 1}
              />
            ))}
          </div>
        )}

        {/* Rodapé */}
        <div className="mt-6 pt-3 border-t border-gray-300 text-[10px] text-gray-500 text-center print:fixed print:bottom-0 print:left-0 print:right-0">
          Documento gerado pelo módulo de Comissionamento · {new Date().toLocaleDateString('pt-BR')}
        </div>
      </div>
    </div>
  )
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function ResumoBox({ titulo, valor, sub, destaque }: { titulo: string; valor: string; sub?: string; destaque?: boolean }) {
  return (
    <div className={`border ${destaque ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50/30'} rounded px-3 py-2`}>
      <p className="text-[9.5px] uppercase tracking-wide text-gray-500 font-semibold">{titulo}</p>
      <p className={`text-[14px] font-bold tabular-nums leading-tight mt-0.5 ${destaque ? 'text-orange-700' : 'text-gray-900'}`}>{valor}</p>
      {sub && <p className="text-[9.5px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

interface BlocoVendedorProps {
  v: VendedorResumo
  comissao: ComissaoPorVendedor | null
  indice: number
}
function BlocoVendedor({ v, comissao, indice }: BlocoVendedorProps) {
  // Ordena regras por comissão desc (maior contribuição primeiro)
  const regras = (comissao?.comissoes ?? []).slice().sort((a, b) => b.comissao - a.comissao)
  return (
    <div className="print-empresa-block break-inside-avoid border border-gray-300 rounded-lg overflow-hidden">

      {/* Header do bloco */}
      <div className="bg-gray-100 px-3 py-2 border-b border-gray-300">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Vendedor #{indice}</p>
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-[14px] font-bold text-gray-900 truncate">{v.vendedor_nome}</h3>
              {v.membro_role && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-gray-300 bg-white text-[10px] font-semibold text-gray-700 whitespace-nowrap print:border-black">
                  {ROLE_LABEL[v.membro_role]}
                </span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">A receber</p>
            <p className="text-[16px] font-bold text-orange-700 tabular-nums">{fmtBRL(v.comissao_total)}</p>
          </div>
        </div>

        {/* Mini-resumo */}
        <div className="grid grid-cols-4 gap-2 mt-2 text-[10.5px]">
          <div><span className="text-gray-500">Vendas:</span> <strong className="text-gray-800 tabular-nums">{fmtQtd(v.vendas_count)}</strong></div>
          <div><span className="text-gray-500">Faturam.:</span> <strong className="text-gray-800 tabular-nums">{fmtBRL(v.faturamento)}</strong></div>
          <div><span className="text-gray-500">Lucro:</span> <strong className="text-gray-800 tabular-nums">{fmtBRL(v.lucro_bruto)}</strong></div>
          <div><span className="text-gray-500">Margem:</span> <strong className="text-gray-800 tabular-nums">{fmtPct(v.margem)}</strong></div>
        </div>
      </div>

      {/* Atingimentos */}
      {v.atingimentos.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-200 bg-gray-50/40">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Atingimento de metas</p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9.5px] text-gray-500 uppercase tracking-wider">
                <th className="text-left">Meta</th>
                <th className="text-right w-24">Meta indiv.</th>
                <th className="text-right w-24">Realizado</th>
                <th className="text-right w-20">%</th>
              </tr>
            </thead>
            <tbody>
              {v.atingimentos.map(a => (
                <tr key={a.meta_id} className="border-t border-gray-100">
                  <td className="py-0.5 text-gray-700 truncate">{a.meta_nome}</td>
                  <td className="py-0.5 text-right tabular-nums text-gray-700">{fmtFormatCampo(a.meta_individual, a.campo)}</td>
                  <td className="py-0.5 text-right tabular-nums text-gray-700">{fmtFormatCampo(a.realizado,       a.campo)}</td>
                  <td className={`py-0.5 text-right tabular-nums font-semibold ${
                    a.atingimento >= 100 ? 'text-emerald-700' : a.atingimento >= 70 ? 'text-amber-700' : 'text-gray-600'
                  }`}>{fmtPct(a.atingimento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Regras aplicadas — uma linha por (vendedor × regra que casou) */}
      <div className="px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
          Regras aplicadas ({regras.length})
        </p>
        {regras.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic py-1">Nenhuma regra casou para este vendedor.</p>
        ) : (
          <table className="w-full text-[10.5px]">
            <thead>
              <tr className="text-[9.5px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="text-left  pb-1">Regra</th>
                <th className="text-right pb-1 w-24">Realizado</th>
                <th className="text-right pb-1 w-14">Atingim.</th>
                <th className="text-right pb-1 w-24">Base</th>
                <th className="text-right pb-1 w-20">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {regras.map(r => {
                const corAtg = r.atingimento_meta == null ? 'text-gray-400'
                              : r.atingimento_meta >= 100 ? 'text-emerald-700'
                              : r.atingimento_meta >= 70  ? 'text-amber-700'
                              : 'text-rose-600'
                return (
                  <tr key={r.regra_id} className="border-b border-gray-100">
                    <td className="py-0.5 px-1 text-gray-800 max-w-[260px] truncate">
                      {r.regra_nome}
                      {r.breakdown && (
                        <span className="block text-[9px] text-gray-400 truncate">{r.breakdown.base_descricao}</span>
                      )}
                    </td>
                    <td className="py-0.5 px-1 text-right tabular-nums text-gray-700">
                      {fmtAgregado(r.realizado_valor, r.realizado_campo)}
                      <span className="block text-[9px] text-gray-400">{CAMPO_LABEL[r.realizado_campo]}</span>
                    </td>
                    <td className={`py-0.5 px-1 text-right tabular-nums font-semibold ${corAtg}`}>
                      {r.atingimento_meta == null ? '—' : fmtPct(r.atingimento_meta)}
                    </td>
                    <td className="py-0.5 px-1 text-right tabular-nums text-gray-700">
                      {fmtAgregado(r.base_valor, r.base_campo)}
                      <span className="block text-[9px] text-gray-400">{CAMPO_LABEL[r.base_campo]}</span>
                    </td>
                    <td className="py-0.5 px-1 text-right tabular-nums font-semibold text-orange-700">
                      {fmtBRL(r.comissao)}
                    </td>
                  </tr>
                )
              })}
              {/* Total da apuração */}
              <tr className="font-bold border-t-2 border-gray-400">
                <td colSpan={4} className="pt-1 pr-2 text-right text-gray-700 uppercase text-[10px]">Total a receber</td>
                <td className="pt-1 px-1 text-right tabular-nums text-orange-700">{fmtBRL(v.comissao_total)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Linha pra assinatura */}
        <div className="mt-4 grid grid-cols-2 gap-6 text-[10px] text-gray-500">
          <div className="border-t border-gray-400 pt-1 text-center">Assinatura do vendedor</div>
          <div className="border-t border-gray-400 pt-1 text-center">Visto da gerência</div>
        </div>
      </div>
    </div>
  )
}

// Formata valor de acordo com o campo da meta
function fmtFormatCampo(v: number, campo: string): string {
  if (campo === 'faturamento') return fmtBRL(v)
  if (campo === 'margem')      return fmtPct(v)
  return fmtQtd(v)
}
