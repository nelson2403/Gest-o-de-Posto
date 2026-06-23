'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/hooks/use-toast'
import {
  ArrowLeft, Calculator, Loader2, AlertCircle, Play, Building2,
  CheckCircle2, XCircle, Trophy, DollarSign, Hash, Layers, Package, User,
} from 'lucide-react'
import type { Esquema } from '@/app/api/comissionamento/esquemas/route'
import { PostoCombobox } from '../_components/PostoCombobox'
import { ASCombobox }    from '../_components/ASCombobox'

// ── Tipos locais ────────────────────────────────────────────────────────────

interface RegraSimulada {
  regra_id:        string
  regra_nome:      string
  prioridade:      number
  matched:         boolean
  vencedora:       boolean
  comissao:        number
  breakdown: {
    base_valor:      number
    base_descricao:  string
    modo:            string
    tipo:            string
    taxa:            number
    comissao_final:  number
  }
}

interface SimulacaoVenda {
  venda: {
    quantidade: number
    valor_total: number
    custo_medio_unitario: number
    produto_nome: string
    grupo_produto: string | null
    subgrupo_produto: string | null
    produto_tipo: string | null
    vendedor_nome: string | null
    cargo: string | null
  }
  meta_atribuida:       string | null
  atingimento_aplicado: number | null
  regras:               RegraSimulada[]
  vencedora_id:         string | null
  comissao_final:       number
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const fmtPct = (v: number) => `${v.toFixed(2)}%`

const MODO_LABEL: Record<string, string> = {
  sobre:       'Sobre uma base',
  por_unidade: 'Por unidade',
  a_cada:      'A cada faixa',
}

// ── Página ──────────────────────────────────────────────────────────────────

interface PostoOpt { id: string; nome: string; codigo_empresa_externo: string | null }

interface ProdutoOpt {
  grid: number; codigo: string | null; nome: string
  tipo: string | null; grupo_nome: string | null; subgrupo_nome: string | null
}

interface PessoaOpt {
  grid: number; codigo: string | null; nome: string
  cargo: string | null; email: string | null
}

interface GrupoOpt    { grid: number; codigo: number; nome: string }
interface SubgrupoOpt { grid: number; codigo: number; nome: string; grupo: number }

export default function ComissionamentoSimulacaoPage() {
  const [esquemas, setEsquemas] = useState<Esquema[]>([])
  const [esquemaId, setEsquemaId] = useState<string>('')

  // Posto (empresa) — obrigatório, gateia a lista de vendedores
  const [postos,  setPostos]  = useState<PostoOpt[]>([])
  const [postoId, setPostoId] = useState<string>('')

  // Grupos / subgrupos do AUTOSYSTEM (carregados uma vez)
  const [grupos,    setGrupos]    = useState<GrupoOpt[]>([])
  const [subgrupos, setSubgrupos] = useState<SubgrupoOpt[]>([])

  // Venda sintética — strings exibidas + objetos selecionados (grid quando há)
  const [produtoNome,    setProdutoNome]    = useState('')
  const [produtoSel,     setProdutoSel]     = useState<ProdutoOpt | null>(null)
  const [grupoProduto,    setGrupoProduto]    = useState('')
  const [subgrupoProduto, setSubgrupoProduto] = useState('')
  const [produtoTipo,     setProdutoTipo]     = useState<string>('C')
  const [quantidade,      setQuantidade]      = useState<number>(20)
  const [precoUnit,       setPrecoUnit]       = useState<number>(5.99)
  const [custoUnit,       setCustoUnit]       = useState<number>(4.89)
  const [vendedorNome,    setVendedorNome]    = useState('')
  const [vendedorSel,     setVendedorSel]     = useState<PessoaOpt | null>(null)
  const [cargo,           setCargo]           = useState('')
  const [atingMeta,       setAtingMeta]       = useState<string>('')

  const [simulacao, setSimulacao] = useState<SimulacaoVenda | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [erro,      setErro]      = useState<string | null>(null)

  // ── Carrega esquemas + postos + grupos/subgrupos uma vez ──────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/comissionamento/esquemas').then(r => r.json()),
      fetch('/api/postos').then(r => r.json()),
      fetch('/api/comissionamento/grupos-as').then(r => r.json()),
    ]).then(([eResp, pResp, gResp]) => {
      const eList = (eResp.esquemas ?? []) as Esquema[]
      setEsquemas(eList)
      if (eList.length > 0) {
        const ativo = eList.find(e => e.status === 'ativo')
        setEsquemaId(ativo?.id ?? eList[0].id)
      }

      const pList = ((pResp.postos ?? []) as PostoOpt[])
        .filter(p => !!p.codigo_empresa_externo)
        .sort((a, b) => a.nome.localeCompare(b.nome))
      setPostos(pList)
      if (pList.length > 0) setPostoId(pList[0].id)

      setGrupos((gResp.grupos ?? []) as GrupoOpt[])
      setSubgrupos((gResp.subgrupos ?? []) as SubgrupoOpt[])
    }).catch(() => toast({ variant: 'destructive', title: 'Erro ao carregar configuração' }))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Subgrupos filtrados pelo grupo selecionado ────────────────────────────
  const grupoGridSel = useMemo(() => {
    if (!grupoProduto) return null
    return grupos.find(g => g.nome === grupoProduto)?.grid ?? null
  }, [grupoProduto, grupos])

  const subgruposDoGrupo = useMemo(() => {
    if (grupoGridSel === null) return subgrupos
    return subgrupos.filter(s => s.grupo === grupoGridSel)
  }, [subgrupos, grupoGridSel])

  // Quando o produto selecionado autopreenche grupo/subgrupo/tipo
  useEffect(() => {
    if (!produtoSel) return
    if (produtoSel.grupo_nome)    setGrupoProduto(produtoSel.grupo_nome)
    if (produtoSel.subgrupo_nome) setSubgrupoProduto(produtoSel.subgrupo_nome)
    if (produtoSel.tipo)          setProdutoTipo(produtoSel.tipo)
  }, [produtoSel])

  // Quando o vendedor é selecionado autopreenche o cargo
  useEffect(() => {
    if (vendedorSel?.cargo) setCargo(vendedorSel.cargo)
  }, [vendedorSel])

  // Resetar vendedor selecionado se mudar de posto
  useEffect(() => {
    setVendedorNome(''); setVendedorSel(null); setCargo('')
  }, [postoId])

  // Resetar subgrupo se mudar o grupo (a menos que continue válido)
  useEffect(() => {
    if (subgrupoProduto && grupoGridSel !== null) {
      const ok = subgrupos.some(s => s.nome === subgrupoProduto && s.grupo === grupoGridSel)
      if (!ok) setSubgrupoProduto('')
    }
  }, [grupoGridSel])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetchers para os comboboxes ───────────────────────────────────────────
  const fetchProdutos = useCallback(async (busca: string): Promise<ProdutoOpt[]> => {
    const params = new URLSearchParams()
    if (busca.trim()) params.set('busca', busca.trim())
    const r = await fetch(`/api/comissionamento/produtos-as?${params}`)
    const json = await r.json()
    return (json.produtos ?? []) as ProdutoOpt[]
  }, [])

  const fetchVendedores = useCallback(async (busca: string): Promise<PessoaOpt[]> => {
    if (!postoId) return []
    const params = new URLSearchParams({ posto_id: postoId })
    if (busca.trim()) params.set('busca', busca.trim())
    const r = await fetch(`/api/comissionamento/pessoas-as?${params}`)
    const json = await r.json()
    return (json.pessoas ?? []) as PessoaOpt[]
  }, [postoId])

  // Posto selecionado (objeto completo) — usado para empresa_id da venda
  const postoSel = useMemo(() => postos.find(p => p.id === postoId) ?? null, [postos, postoId])

  // ── Simular ───────────────────────────────────────────────────────────────
  const simular = useCallback(async () => {
    if (!esquemaId) {
      toast({ variant: 'destructive', title: 'Selecione um esquema' })
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const valor_total = quantidade * precoUnit
      const empresaId = postoSel?.codigo_empresa_externo ? Number(postoSel.codigo_empresa_externo) : 0
      const body: Record<string, unknown> = {
        esquema_id: esquemaId,
        venda: {
          quantidade,
          valor_total,
          custo_medio_unitario: custoUnit,
          empresa_id:           empresaId,
          produto:              produtoSel?.grid ?? 0,
          produto_nome:         produtoNome.trim(),
          grupo_produto:        grupoProduto.trim() || null,
          subgrupo_produto:     subgrupoProduto.trim() || null,
          produto_tipo:         produtoTipo || null,
          vendedor_id:          vendedorSel?.grid ?? null,
          vendedor_nome:        vendedorNome.trim() || null,
          cargo:                cargo.trim() || null,
        },
      }
      if (atingMeta.trim() !== '') {
        body.atingimento_meta = parseFloat(atingMeta)
      }

      const r = await fetch('/api/comissionamento/simular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await r.json()
      if (!r.ok || json.error) {
        setErro(json.error ?? `Erro HTTP ${r.status}`)
        setSimulacao(null)
        return
      }
      setSimulacao(json.simulacao as SimulacaoVenda)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [esquemaId, quantidade, precoUnit, custoUnit, produtoNome, produtoSel, grupoProduto, subgrupoProduto, produtoTipo, vendedorNome, vendedorSel, cargo, atingMeta, postoSel])

  // Auto-simulação quando muda esquema (UX)
  useEffect(() => {
    if (esquemaId) simular()
  }, [esquemaId])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derivados ─────────────────────────────────────────────────────────────
  const valorTotal = quantidade * precoUnit
  const custoTotal = quantidade * custoUnit
  const lucroBruto = valorTotal - custoTotal
  const margem     = valorTotal > 0 ? (lucroBruto / valorTotal) * 100 : 0

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Simulação"
        description="Simule cálculos de comissão antes de aplicar regras em produção"
        actions={
          <Link href="/comissionamento"
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-[12.5px]">
            <ArrowLeft className="w-3.5 h-3.5" /> Comissionamento
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-5">

          {/* ── Coluna esquerda: editor de venda ── */}
          <div className="space-y-4">
            <Card className="border-gray-200 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Calculator className="w-4 h-4 text-amber-600" />
                  </div>
                  <p className="text-[13px] font-semibold text-gray-800">Venda hipotética</p>
                </div>

                <div>
                  <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Posto / Empresa
                  </Label>
                  <PostoCombobox
                    postos={postos}
                    value={postoId}
                    onChange={setPostoId}
                    placeholder="Selecione o posto"
                  />
                </div>

                <div>
                  <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Esquema</Label>
                  <Select value={esquemaId} onValueChange={setEsquemaId}>
                    <SelectTrigger><SelectValue placeholder="Selecione um esquema" /></SelectTrigger>
                    <SelectContent>
                      {esquemas.length === 0 && (
                        <div className="px-3 py-2 text-[12px] text-gray-400">Nenhum esquema cadastrado</div>
                      )}
                      {esquemas.map(e => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome} {e.status !== 'ativo' && <span className="text-gray-400">({e.status})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Quantidade</Label>
                    <Input type="number" step="0.01" min={0}
                      value={quantidade} onChange={e => setQuantidade(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Preço unit. (R$)</Label>
                    <Input type="number" step="0.01" min={0}
                      value={precoUnit} onChange={e => setPrecoUnit(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Custo unit. (R$)</Label>
                    <Input type="number" step="0.01" min={0}
                      value={custoUnit} onChange={e => setCustoUnit(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Produto (do AUTOSYSTEM)</Label>
                  <ASCombobox<ProdutoOpt>
                    value={produtoNome}
                    onChange={(label, item) => { setProdutoNome(label); setProdutoSel(item) }}
                    fetcher={fetchProdutos}
                    getKey={p => p.grid}
                    getLabel={p => p.nome}
                    icon={<Package className="w-3.5 h-3.5" />}
                    placeholder="Digite para buscar… (ex.: GASOLINA)"
                    renderItem={p => (
                      <div className="min-w-0">
                        <p className="truncate text-gray-800">{p.nome}</p>
                        {(p.grupo_nome || p.tipo) && (
                          <p className="text-[10px] text-gray-400 truncate">
                            {p.grupo_nome ?? ''}{p.grupo_nome && p.subgrupo_nome ? ' / ' : ''}{p.subgrupo_nome ?? ''}
                            {p.tipo ? ` · tipo ${p.tipo}` : ''}
                          </p>
                        )}
                      </div>
                    )}
                  />
                  {produtoSel && (
                    <p className="text-[10.5px] text-gray-400 mt-1">
                      grid <code className="font-mono">{produtoSel.grid}</code>
                      {produtoSel.codigo && <> · cód. <code className="font-mono">{produtoSel.codigo}</code></>}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Grupo</Label>
                    <Select value={grupoProduto || '__none'} onValueChange={v => setGrupoProduto(v === '__none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="(qualquer)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">(qualquer)</SelectItem>
                        {grupos.map(g => <SelectItem key={g.grid} value={g.nome}>{g.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">
                      Subgrupo {grupoGridSel !== null && <span className="text-gray-400 normal-case">({subgruposDoGrupo.length})</span>}
                    </Label>
                    <Select value={subgrupoProduto || '__none'} onValueChange={v => setSubgrupoProduto(v === '__none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">(nenhum)</SelectItem>
                        {subgruposDoGrupo.map(s => <SelectItem key={s.grid} value={s.nome}>{s.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Tipo</Label>
                    <Select value={produtoTipo} onValueChange={setProdutoTipo}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="C">C - Combustível</SelectItem>
                        <SelectItem value="M">M - Mercadoria</SelectItem>
                        <SelectItem value="K">K - Kit</SelectItem>
                        <SelectItem value="S">S - Serviço</SelectItem>
                        <SelectItem value="P">P - Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Atingim. meta (%)</Label>
                    <Input type="number" step="0.1" placeholder="(opcional)"
                      value={atingMeta} onChange={e => setAtingMeta(e.target.value)} />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Vendedor (do posto selecionado)</Label>
                  <ASCombobox<PessoaOpt>
                    value={vendedorNome}
                    onChange={(label, item) => { setVendedorNome(label); setVendedorSel(item) }}
                    fetcher={fetchVendedores}
                    getKey={p => p.grid}
                    getLabel={p => p.nome}
                    icon={<User className="w-3.5 h-3.5" />}
                    disabled={!postoId}
                    disabledHint="Selecione um posto antes de buscar vendedores"
                    placeholder={postoId ? 'Digite para buscar…' : 'Selecione um posto primeiro'}
                    renderItem={p => (
                      <div className="min-w-0">
                        <p className="truncate text-gray-800">{p.nome}</p>
                        {p.cargo && <p className="text-[10px] text-gray-400 truncate">{p.cargo}</p>}
                      </div>
                    )}
                  />
                </div>

                <div>
                  <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">
                    Cargo {vendedorSel?.cargo && <span className="text-gray-400 normal-case text-[10px]">(do vendedor)</span>}
                  </Label>
                  <Input value={cargo} onChange={e => setCargo(e.target.value)} placeholder="(automático ao escolher vendedor)" />
                </div>

                <Button
                  onClick={simular}
                  disabled={loading || !esquemaId}
                  className="w-full gap-2 bg-gray-900 hover:bg-black text-white"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Simular
                </Button>
              </CardContent>
            </Card>

            {/* Mini KPIs da venda */}
            <div className="grid grid-cols-3 gap-2">
              <MiniKpi titulo="Total"  valor={fmtBRL(valorTotal)} cor="blue" />
              <MiniKpi titulo="Lucro"  valor={fmtBRL(lucroBruto)} cor={lucroBruto >= 0 ? 'green' : 'rose'} />
              <MiniKpi titulo="Margem" valor={fmtPct(margem)}     cor="purple" />
            </div>
          </div>

          {/* ── Coluna direita: resultado da simulação ── */}
          <div>
            {erro && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px] mb-4">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <p>{erro}</p>
              </div>
            )}

            {!simulacao && !erro && !loading && (
              <div className="flex flex-col items-center justify-center py-20 text-center bg-white border border-dashed border-gray-200 rounded-xl">
                <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-3">
                  <Calculator className="w-6 h-6 text-amber-400" />
                </div>
                <p className="text-[13px] text-gray-500">Configure a venda à esquerda e clique em <strong>Simular</strong>.</p>
              </div>
            )}

            {loading && !simulacao && (
              <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-[12.5px]">Avaliando regras…</span>
              </div>
            )}

            {simulacao && (
              <div className="space-y-4">
                {/* Card destaque do resultado */}
                <Card className={cn('border-2 shadow-sm', simulacao.vencedora_id ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-gray-50/40')}>
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                        simulacao.vencedora_id ? 'bg-emerald-100' : 'bg-gray-200')}>
                        <Trophy className={cn('w-5 h-5', simulacao.vencedora_id ? 'text-emerald-600' : 'text-gray-500')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Comissão final</p>
                        <p className="text-[26px] font-bold text-gray-900 tabular-nums mt-0.5">
                          {fmtBRL(simulacao.comissao_final)}
                        </p>
                        {simulacao.vencedora_id ? (
                          <p className="text-[12.5px] text-emerald-700 mt-1">
                            Regra vencedora: <strong>{simulacao.regras.find(r => r.vencedora)?.regra_nome}</strong>
                          </p>
                        ) : (
                          <p className="text-[12.5px] text-gray-500 italic mt-1">Nenhuma regra ativa casou — sem comissão.</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Lista de regras avaliadas */}
                <Card className="border-gray-200 shadow-sm">
                  <CardContent className="p-0">
                    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                      <p className="text-[13px] font-semibold text-gray-900">Trace de avaliação</p>
                      <p className="text-[11.5px] text-gray-500">{simulacao.regras.length} regra{simulacao.regras.length === 1 ? '' : 's'} avaliada{simulacao.regras.length === 1 ? '' : 's'} · ordem de prioridade</p>
                    </div>

                    {simulacao.regras.length === 0 ? (
                      <p className="px-4 py-8 text-center text-[12.5px] text-gray-400 italic">
                        Nenhuma regra ativa no esquema. Crie e ative regras em <strong>Esquemas → [esquema] → Nova regra</strong>.
                      </p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {simulacao.regras.map(r => {
                          const isModo: 'sobre' | 'por_unidade' | 'a_cada' = r.breakdown.modo as any
                          const IconeModo = isModo === 'sobre' ? DollarSign
                                          : isModo === 'por_unidade' ? Hash
                                          : Layers
                          return (
                            <div
                              key={r.regra_id}
                              className={cn(
                                'px-4 py-3 flex items-center gap-3',
                                r.vencedora && 'bg-emerald-50/50',
                                !r.matched && 'opacity-70',
                              )}
                            >
                              <div className={cn(
                                'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                                r.matched ? 'bg-emerald-100' : 'bg-rose-100',
                              )}>
                                {r.matched
                                  ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  : <XCircle className="w-4 h-4 text-rose-500" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">#{r.prioridade}</span>
                                  <p className={cn('text-[13px] font-semibold truncate', r.vencedora && 'text-emerald-800')}>
                                    {r.regra_nome}
                                  </p>
                                  {r.vencedora && (
                                    <span className="text-[10px] font-bold uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">vencedora</span>
                                  )}
                                </div>
                                <p className="text-[11.5px] text-gray-500 mt-0.5 flex items-center gap-1.5">
                                  <IconeModo className="w-3 h-3 text-gray-400" />
                                  {r.breakdown.base_descricao}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className={cn('text-[14px] font-bold tabular-nums',
                                  r.vencedora ? 'text-emerald-700' : r.matched ? 'text-gray-700' : 'text-gray-400')}>
                                  {fmtBRL(r.comissao)}
                                </p>
                                <p className="text-[10px] text-gray-400">{MODO_LABEL[isModo] ?? isModo}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Info da meta atribuída */}
                {(simulacao.atingimento_aplicado !== null || simulacao.meta_atribuida) && (
                  <p className="text-[11.5px] text-gray-500 px-2">
                    {simulacao.atingimento_aplicado !== null
                      ? <>Atingimento de meta usado: <strong>{fmtPct(simulacao.atingimento_aplicado)}</strong> (override manual)</>
                      : <>Meta atribuída: <code className="text-[11px]">{simulacao.meta_atribuida}</code> — sem atingimento computado nesta simulação</>
                    }
                  </p>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

function MiniKpi({ titulo, valor, cor }: { titulo: string; valor: string; cor: 'blue' | 'green' | 'rose' | 'purple' }) {
  const cores: Record<typeof cor, { bg: string; texto: string }> = {
    blue:   { bg: 'bg-blue-50',    texto: 'text-blue-700'    },
    green:  { bg: 'bg-emerald-50', texto: 'text-emerald-700' },
    rose:   { bg: 'bg-rose-50',    texto: 'text-rose-700'    },
    purple: { bg: 'bg-purple-50',  texto: 'text-purple-700'  },
  }
  const c = cores[cor]
  return (
    <div className={cn('rounded-xl border border-gray-200 px-3 py-2', c.bg)}>
      <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{titulo}</p>
      <p className={cn('text-[14px] font-bold tabular-nums mt-0.5', c.texto)}>{valor}</p>
    </div>
  )
}
