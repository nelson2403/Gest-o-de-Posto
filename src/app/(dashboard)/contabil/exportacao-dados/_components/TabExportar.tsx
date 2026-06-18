'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/hooks/use-toast'
import {
  Download, Loader2, AlertCircle, Calendar, Building2,
  ChevronDown, FileText, Database, ArrowRight, Wand2,
} from 'lucide-react'

interface PostoOpt { id: string; nome: string; codigo_empresa_externo: string | null }

function fmtIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function defaultPeriodo() {
  const hoje = new Date()
  // Mês anterior completo é o caso de uso típico (envio para escritório)
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const fim    = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
  return { dataIni: fmtIsoDate(inicio), dataFim: fmtIsoDate(fim) }
}

interface Props {
  onIrParaMapeamento: () => void
  onIrParaRegras?:    () => void
}

export function TabExportar({ onIrParaMapeamento, onIrParaRegras }: Props) {
  const { dataIni: iniDef, dataFim: fimDef } = defaultPeriodo()

  const [dataIni, setDataIni] = useState(iniDef)
  const [dataFim, setDataFim] = useState(fimDef)

  const [postos, setPostos]           = useState<PostoOpt[]>([])
  const [empresasSel, setEmpresasSel] = useState<Set<string>>(new Set())
  const [empDropOpen, setEmpDropOpen] = useState(false)
  const empDropRef = useRef<HTMLDivElement>(null)

  // Preview (json)
  const [previewLoading,   setPreviewLoading]     = useState(false)
  const [previewTotal,     setPreviewTotal]       = useState<number | null>(null)
  const [previewSemMap,    setPreviewSemMap]      = useState<number | null>(null)
  const [previewTotalMaps, setPreviewTotalMaps]   = useState<number | null>(null)
  const [previewRegrasOk,  setPreviewRegrasOk]    = useState<number | null>(null)
  const [previewTotalRegras, setPreviewTotalRegras] = useState<number | null>(null)
  const [previewErro,      setPreviewErro]        = useState<string | null>(null)

  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    fetch('/api/postos')
      .then(r => r.json())
      .then(json => {
        const lista = ((json.postos ?? []) as PostoOpt[]).filter(p => p.codigo_empresa_externo)
        setPostos(lista)
      })
      .catch(() => toast({ variant: 'destructive', title: 'Erro ao carregar postos' }))
  }, [])

  useEffect(() => {
    if (!empDropOpen) return
    function onClick(e: MouseEvent) {
      if (empDropRef.current && !empDropRef.current.contains(e.target as Node)) setEmpDropOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [empDropOpen])

  function resetPreview() {
    setPreviewTotal(null); setPreviewSemMap(null); setPreviewTotalMaps(null)
    setPreviewRegrasOk(null); setPreviewTotalRegras(null)
  }
  function toggleEmpresa(codigo: string) {
    setEmpresasSel(prev => {
      const n = new Set(prev)
      if (n.has(codigo)) n.delete(codigo); else n.add(codigo)
      return n
    })
    resetPreview()
  }
  function selecionarTodas() {
    setEmpresasSel(new Set(postos.map(p => p.codigo_empresa_externo!)))
    resetPreview()
  }
  function limparEmpresas() { setEmpresasSel(new Set()); resetPreview() }

  const empresasCsv = Array.from(empresasSel).join(',')
  const empresaLabel = empresasSel.size === 0
    ? 'Todas as empresas'
    : empresasSel.size === 1
      ? (postos.find(p => p.codigo_empresa_externo === Array.from(empresasSel)[0])?.nome ?? '1 empresa')
      : `${empresasSel.size} empresas selecionadas`

  function buildUrl(formato: 'csv' | 'json') {
    const params = new URLSearchParams({ data_ini: dataIni, data_fim: dataFim, formato })
    if (empresasCsv) params.set('empresa', empresasCsv)
    return `/api/contabil/exportacao-dados?${params}`
  }

  async function previewCount() {
    setPreviewLoading(true); setPreviewErro(null); resetPreview()
    try {
      const r = await fetch(buildUrl('json'))
      const json = await r.json()
      if (!r.ok || json.error) { setPreviewErro(json.error ?? `Erro HTTP ${r.status}`); return }
      setPreviewTotal(Number(json.total ?? 0))
      setPreviewSemMap(Number(json.sem_mapeamento ?? 0))
      setPreviewTotalMaps(Number(json.total_mapeados ?? 0))
      setPreviewRegrasOk(Number(json.regras_aplicadas ?? 0))
      setPreviewTotalRegras(Number(json.total_regras ?? 0))
    } catch (e) {
      setPreviewErro(e instanceof Error ? e.message : String(e))
    } finally {
      setPreviewLoading(false)
    }
  }

  function baixarCsv() {
    if (!dataIni || !dataFim) { toast({ variant: 'destructive', title: 'Defina o período' }); return }
    setDownloading(true)
    window.location.href = buildUrl('csv')
    setTimeout(() => setDownloading(false), 1500)
  }

  const diasPeriodo = (() => {
    if (!dataIni || !dataFim) return 0
    const a = new Date(dataIni).getTime()
    const b = new Date(dataFim).getTime()
    return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1)
  })()

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="rounded-xl bg-white border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Database className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-gray-800">Parâmetros da exportação</p>
            <p className="text-[11.5px] text-gray-500">
              Selecione o período e (opcionalmente) as empresas. Sem empresa, traz <strong>todas</strong>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-3">
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-1.5 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Data início
            </label>
            <input type="date" value={dataIni}
              onChange={e => { setDataIni(e.target.value); resetPreview() }}
              className="w-full h-9 px-3 border border-gray-200 rounded-md text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-1.5 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Data fim
            </label>
            <input type="date" value={dataFim}
              onChange={e => { setDataFim(e.target.value); resetPreview() }}
              className="w-full h-9 px-3 border border-gray-200 rounded-md text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          </div>

          <div className="md:col-span-6 relative" ref={empDropRef}>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-1.5">
              Empresa{empresasSel.size > 0 && <span className="ml-1 text-indigo-600 normal-case tracking-normal">({empresasSel.size})</span>}
            </label>
            <button type="button" onClick={() => setEmpDropOpen(o => !o)}
              className="w-full h-9 px-3 border border-gray-200 rounded-md text-[13px] bg-white flex items-center justify-between gap-2 focus:outline-none focus:ring-1 focus:ring-indigo-400">
              <span className="flex items-center gap-1.5 truncate text-gray-700">
                <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                {empresaLabel}
              </span>
              <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0', empDropOpen && 'rotate-180')} />
            </button>
            {empDropOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                  <button type="button" onClick={selecionarTodas} disabled={empresasSel.size === postos.length}
                    className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium disabled:text-gray-300 disabled:cursor-default">
                    Selecionar todas
                  </button>
                  <span className="text-gray-300 text-[11px]">·</span>
                  <button type="button" onClick={limparEmpresas} disabled={empresasSel.size === 0}
                    className="text-[11px] text-gray-500 hover:text-gray-700 font-medium disabled:text-gray-300 disabled:cursor-default">
                    Limpar
                  </button>
                  <span className="ml-auto text-[10.5px] text-gray-400">
                    {empresasSel.size === 0 ? 'Sem filtro' : `${empresasSel.size} / ${postos.length}`}
                  </span>
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                  {postos.length === 0 ? (
                    <p className="px-3 py-3 text-[12px] text-gray-400 italic text-center">Nenhuma empresa</p>
                  ) : (
                    postos.map(p => {
                      const cod = p.codigo_empresa_externo!
                      const sel = empresasSel.has(cod)
                      return (
                        <label key={p.id} className={cn(
                          'flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors',
                          sel ? 'bg-indigo-50 hover:bg-indigo-100' : 'hover:bg-gray-50',
                        )}>
                          <input type="checkbox" checked={sel} onChange={() => toggleEmpresa(cod)}
                            className="accent-indigo-500 w-3.5 h-3.5 flex-shrink-0" />
                          <span className={cn('text-[12.5px] truncate', sel ? 'text-indigo-800 font-medium' : 'text-gray-700')}>
                            {p.nome}
                          </span>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Resumo + ações */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-4 text-[12px] text-gray-500 flex-wrap">
            <span>
              Período: <strong className="text-gray-800">{diasPeriodo}</strong> dia{diasPeriodo === 1 ? '' : 's'}
            </span>
            <span>
              Empresas: <strong className="text-gray-800">
                {empresasSel.size === 0 ? `${postos.length} (todas)` : empresasSel.size}
              </strong>
            </span>
            {previewTotal !== null && (
              <>
                <span>
                  Linhas: <strong className="text-indigo-700 tabular-nums">{previewTotal.toLocaleString('pt-BR')}</strong>
                </span>
                {previewSemMap !== null && previewSemMap > 0 && (
                  <span className="text-amber-700">
                    Sem mapeamento: <strong className="tabular-nums">{previewSemMap.toLocaleString('pt-BR')}</strong>
                  </span>
                )}
                {previewTotalMaps !== null && (
                  <span>
                    Mapeamentos ativos: <strong className="text-gray-800 tabular-nums">{previewTotalMaps}</strong>
                  </span>
                )}
                {previewTotalRegras !== null && previewTotalRegras > 0 && (
                  <span className="text-violet-700">
                    Regras: <strong className="tabular-nums">{previewRegrasOk}</strong> de {previewTotal} linhas afetadas
                    <span className="text-gray-400 ml-1">({previewTotalRegras} ativa{previewTotalRegras === 1 ? '' : 's'})</span>
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={previewCount} disabled={previewLoading || !dataIni || !dataFim}
              className="h-9 px-3 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:text-gray-300 text-[12.5px] font-medium flex items-center gap-1.5">
              {previewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              Pré-visualizar contagem
            </button>
            <button onClick={baixarCsv} disabled={downloading || !dataIni || !dataFim}
              className="h-9 px-4 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white text-[12.5px] font-semibold flex items-center gap-1.5">
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Baixar CSV
            </button>
          </div>
        </div>

        {previewErro && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-[12.5px]">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>{previewErro}</p>
          </div>
        )}

        {/* Aviso de mapeamento pendente */}
        {previewSemMap !== null && previewSemMap > 0 && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[12.5px]">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p>
                <strong>{previewSemMap.toLocaleString('pt-BR')}</strong> linha{previewSemMap === 1 ? '' : 's'} sem <strong>conta contábil</strong> correspondente.
                As colunas <code className="bg-amber-100 px-1 rounded text-[11px]">conta_debitar</code> / <code className="bg-amber-100 px-1 rounded text-[11px]">conta_creditar</code> sairão com o código original do AUTOSYSTEM.
              </p>
              <div className="mt-1 flex items-center gap-3 text-[12px] font-semibold">
                <button onClick={onIrParaMapeamento}
                  className="text-amber-900 hover:text-amber-950 underline underline-offset-2 inline-flex items-center gap-1">
                  Ir para Mapeamento De/Para <ArrowRight className="w-3 h-3" />
                </button>
                {onIrParaRegras && (
                  <button onClick={onIrParaRegras}
                    className="text-violet-700 hover:text-violet-900 underline underline-offset-2 inline-flex items-center gap-1">
                    Ir para Regras <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* O que vai no arquivo */}
      <div className="rounded-xl bg-white border border-gray-200 p-5">
        <p className="text-[13px] font-semibold text-gray-800 mb-2">O que vai no arquivo</p>
        <p className="text-[12px] text-gray-500 mb-3">
          CSV com <strong>5 colunas</strong> separadas por <code className="text-[11px] bg-gray-100 px-1 rounded">;</code>.
          Cada linha é um movimento contábil (<code className="text-[11px] bg-gray-100 px-1 rounded">movto</code>) do AUTOSYSTEM no período.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-[11.5px]">
          {[
            ['data',           'Data do lançamento (YYYY-MM-DD)'],
            ['conta_debitar',  'Conta a débito — código contábil mapeado (ou original do AUTOSYSTEM se não houver mapeamento)'],
            ['conta_creditar', 'Conta a crédito — código contábil mapeado (idem)'],
            ['valor',          'Valor em R$ sem símbolo de moeda (ex.: 1.234,56)'],
            ['historico',      'Texto da observação do lançamento'],
          ].map(([col, desc]) => (
            <div key={col} className="rounded-md border border-gray-100 bg-gray-50/50 px-2.5 py-1.5">
              <code className="text-[11px] font-mono text-indigo-700 font-semibold">{col}</code>
              <p className="text-[10.5px] text-gray-500 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>

        {/* Pipeline */}
        <div className="mt-4 rounded-md bg-gray-50 border border-gray-100 p-3">
          <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Pipeline aplicado em cada linha</p>
          <ol className="text-[11.5px] text-gray-600 space-y-1 list-decimal list-inside">
            <li>Lê o movimento original do AUTOSYSTEM (<code className="bg-white px-1 rounded text-[11px]">movto</code>)</li>
            <li>
              Aplica <strong className="text-amber-700">Mapeamento De/Para</strong>:
              <code className="bg-white px-1 rounded text-[11px] ml-1">conta_debitar</code> e
              <code className="bg-white px-1 rounded text-[11px] ml-1">conta_creditar</code> ganham o código contábil
            </li>
            <li>
              Aplica <strong className="text-violet-700">Regras</strong> ativas em ordem — cada uma pode sobrescrever
              <code className="bg-white px-1 rounded text-[11px] ml-1">conta_debitar</code>,
              <code className="bg-white px-1 rounded text-[11px] ml-1">conta_creditar</code> ou
              <code className="bg-white px-1 rounded text-[11px] ml-1">historico</code> com base na linha original
            </li>
            <li>Grava a linha no CSV</li>
          </ol>
        </div>

        <p className="text-[10.5px] text-gray-400 mt-3">
          Separador: <code>;</code> (Excel pt-BR abre direto). Codificação: UTF-8 com BOM (acentos preservados).
          Limite por exportação: 200 000 linhas. Para volumes maiores, divida o período.
        </p>
      </div>
    </div>
  )
}
