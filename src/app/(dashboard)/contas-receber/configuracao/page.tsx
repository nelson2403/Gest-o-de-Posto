'use client'

import { useEffect, useState, useMemo } from 'react'
import { Header } from '@/components/layout/Header'
import { useAuthContext } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import { Loader2, Search, Check, Tag, ArrowDownToLine } from 'lucide-react'
import type { Role } from '@/types/database.types'

// ─── Grupos fixos ─────────────────────────────────────────────────────────────

const GRUPOS = [
  { value: 'dinheiro',    label: 'Dinheiro',       color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'cartoes',     label: 'Cartões',         color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'cheques',     label: 'Cheques',         color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'notas_prazo', label: 'Notas a Prazo',   color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 'faturas',     label: 'Faturas',         color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
] as const

type Grupo = typeof GRUPOS[number]['value']

interface ContaRow {
  conta_debitar: string
  conta_nome:    string
  grupo:         Grupo | null
}

// ─── Motivos fixos de caixa ───────────────────────────────────────────────────

const MOTIVOS_CAIXA = [
  { grid: 6706,     nome: 'SANGRIA',             key: 'motivo:6706'     },
  { grid: 29771151, nome: 'DEPOSITO BRINKS',      key: 'motivo:29771151' },
  { grid: 55142291, nome: 'DEPOSITO COFRE POSTO', key: 'motivo:55142291' },
] as const

// ─── Página ───────────────────────────────────────────────────────────────────

export default function CRConfiguracaoPage() {
  const { usuario } = useAuthContext()
  const role = usuario?.role as Role | undefined
  const podeConfigurar = role === 'master' || role === 'adm_financeiro'

  const [loading,       setLoading]       = useState(true)
  const [contas,        setContas]        = useState<ContaRow[]>([])
  const [motivoGrupos,  setMotivoGrupos]  = useState<Record<string, Grupo | null>>({})
  const [salvando,      setSalvando]      = useState<Record<string, boolean>>({})
  const [salvo,         setSalvo]         = useState<Record<string, boolean>>({})
  const [busca,         setBusca]         = useState('')

  useEffect(() => {
    fetch('/api/contas-receber/configuracao')
      .then(r => r.json())
      .then(json => {
        setContas(json.contas ?? [])
        // Extrai grupos dos motivos fixos (vêm como ContaRow com key motivo:GRID)
        const mg: Record<string, Grupo | null> = {}
        for (const m of MOTIVOS_CAIXA) {
          const row = (json.motivos ?? []).find((r: ContaRow) => r.conta_debitar === m.key)
          mg[m.key] = row?.grupo ?? null
        }
        setMotivoGrupos(mg)
        setLoading(false)
      })
  }, [])

  async function handleGrupo(conta: ContaRow, novoGrupo: Grupo | null) {
    setSalvando(p => ({ ...p, [conta.conta_debitar]: true }))
    try {
      const res = await fetch('/api/contas-receber/configuracao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conta_debitar: conta.conta_debitar,
          conta_nome:    conta.conta_nome,
          grupo:         novoGrupo,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setContas(prev => prev.map(c =>
        c.conta_debitar === conta.conta_debitar ? { ...c, grupo: novoGrupo } : c
      ))
      setSalvo(p => ({ ...p, [conta.conta_debitar]: true }))
      setTimeout(() => setSalvo(p => ({ ...p, [conta.conta_debitar]: false })), 2000)
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: e.message })
    } finally {
      setSalvando(p => ({ ...p, [conta.conta_debitar]: false }))
    }
  }

  const contasFiltradas = useMemo(() =>
    contas.filter(c =>
      c.conta_debitar.includes(busca) ||
      c.conta_nome.toLowerCase().includes(busca.toLowerCase())
    ), [contas, busca])

  async function handleMotivoGrupo(motKey: string, motNome: string, novoGrupo: Grupo | null) {
    setSalvando(p => ({ ...p, [motKey]: true }))
    try {
      const res = await fetch('/api/contas-receber/configuracao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conta_debitar: motKey, conta_nome: motNome, grupo: novoGrupo }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setMotivoGrupos(p => ({ ...p, [motKey]: novoGrupo }))
      setSalvo(p => ({ ...p, [motKey]: true }))
      setTimeout(() => setSalvo(p => ({ ...p, [motKey]: false })), 2000)
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: e.message })
    } finally {
      setSalvando(p => ({ ...p, [motKey]: false }))
    }
  }

  const stats = useMemo(() => ({
    total:        contas.length,
    vinculadas:   contas.filter(c => c.grupo).length,
    semVinculo:   contas.filter(c => !c.grupo).length,
  }), [contas])

  if (!podeConfigurar) {
    return (
      <div className="flex flex-col h-screen bg-gray-50">
        <Header title="Configuração Contas a Receber" description="Grupos de recebíveis" />
        <div className="flex items-center justify-center flex-1 text-gray-400">
          <p className="text-sm">Acesso restrito a administradores.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header
        title="Configuração Contas a Receber"
        description="Vincule cada forma de pagamento do AUTOSYSTEM a um grupo"
      />

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 max-w-4xl">

        {/* Legenda dos grupos */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">Grupos disponíveis</p>
          <div className="flex flex-wrap gap-2">
            {GRUPOS.map(g => (
              <span key={g.value} className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border', g.color)}>
                <Tag className="w-3 h-3" />
                {g.label}
              </span>
            ))}
          </div>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total de contas', value: stats.total,      color: 'text-gray-700' },
            { label: 'Vinculadas',      value: stats.vinculadas,  color: 'text-green-700' },
            { label: 'Sem vínculo',     value: stats.semVinculo,  color: stats.semVinculo > 0 ? 'text-amber-600' : 'text-gray-400' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
              <p className="text-[11px] text-gray-400">{s.label}</p>
              <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por código ou nome da conta..."
            className="w-full h-9 pl-9 pr-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
        </div>

        {/* ── Motivos de Caixa ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <ArrowDownToLine className="w-4 h-4 text-gray-400" />
            <span className="text-[12px] font-semibold text-gray-600">Motivos de Movimentação de Caixa</span>
            <span className="text-[11px] text-gray-400 ml-1">AUTOSYSTEM · grids fixos</span>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-200 text-[11px]">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Grid</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Nome do motivo</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-600 w-56">Grupo</th>
                <th className="px-4 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {MOTIVOS_CAIXA.map((m, i) => {
                const isSaving   = salvando[m.key]
                const isSaved    = salvo[m.key]
                const grupoAtual = GRUPOS.find(g => g.value === motivoGrupos[m.key])
                return (
                  <tr key={m.key} className={cn('border-b border-gray-100 last:border-0', i % 2 !== 0 ? 'bg-gray-50/30' : '', !motivoGrupos[m.key] && 'bg-amber-50/20')}>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500">{m.grid}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{m.nome}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={motivoGrupos[m.key] ?? ''}
                        onChange={e => handleMotivoGrupo(m.key, m.nome, (e.target.value as Grupo) || null)}
                        disabled={isSaving}
                        className={cn(
                          'w-full h-8 px-2 text-[12px] rounded-lg border focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:opacity-60 cursor-pointer',
                          grupoAtual ? cn('font-semibold', grupoAtual.color) : 'border-amber-200 bg-amber-50 text-amber-700',
                        )}
                      >
                        <option value="">— Sem grupo —</option>
                        {GRUPOS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-center w-8">
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 mx-auto" />
                        : isSaved  ? <Check className="w-3.5 h-3.5 text-green-500 mx-auto" />
                        : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>

        {/* ── Contas contábeis ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[13px]">Carregando contas do AUTOSYSTEM...</span>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {contasFiltradas.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <p className="text-[13px]">Nenhuma conta encontrada.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-[11px]">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Código</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Nome da conta</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 w-56">Grupo</th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {contasFiltradas.map((conta, i) => {
                    const isSaving = salvando[conta.conta_debitar]
                    const isSaved  = salvo[conta.conta_debitar]
                    const grupoAtual = GRUPOS.find(g => g.value === conta.grupo)

                    return (
                      <tr
                        key={conta.conta_debitar}
                        className={cn(
                          'border-b border-gray-100 last:border-0 transition-colors',
                          i % 2 !== 0 ? 'bg-gray-50/30' : '',
                          !conta.grupo && 'bg-amber-50/20',
                        )}
                      >
                        <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500">
                          {conta.conta_debitar}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">
                          {conta.conta_nome}
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={conta.grupo ?? ''}
                            onChange={e => handleGrupo(conta, (e.target.value as Grupo) || null)}
                            disabled={isSaving}
                            className={cn(
                              'w-full h-8 px-2 text-[12px] rounded-lg border focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:opacity-60 cursor-pointer',
                              grupoAtual
                                ? cn('font-semibold', grupoAtual.color)
                                : 'border-amber-200 bg-amber-50 text-amber-700',
                            )}
                          >
                            <option value="">— Sem grupo —</option>
                            {GRUPOS.map(g => (
                              <option key={g.value} value={g.value}>{g.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-center w-8">
                          {isSaving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 mx-auto" />
                          ) : isSaved ? (
                            <Check className="w-3.5 h-3.5 text-green-500 mx-auto" />
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
