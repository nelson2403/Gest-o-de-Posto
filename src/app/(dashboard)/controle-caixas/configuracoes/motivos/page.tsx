'use client'

import { useEffect, useState, useMemo } from 'react'
import { Header } from '@/components/layout/Header'
import { useAuthContext } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils/cn'
import { Loader2, Search, Check, Tag } from 'lucide-react'
import type { Role } from '@/types/database.types'

const GRUPOS = [
  { value: 'dinheiro', label: 'Dinheiro', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'cartoes',  label: 'Cartões',  color: 'bg-blue-100 text-blue-800 border-blue-200'   },
  { value: 'pix',      label: 'PIX',      color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'frotas',   label: 'Frotas',   color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 'a_prazo',  label: 'A Prazo',  color: 'bg-gray-100 text-gray-600 border-gray-200'   },
] as const

type Grupo = typeof GRUPOS[number]['value']

interface MotivoRow {
  grid:  number
  nome:  string
  grupo: Grupo | null
}

export default function ConfigMotivosCaixaPage() {
  const { usuario } = useAuthContext()
  const role = usuario?.role as Role | undefined
  const podeConfigurar = role === 'master' || role === 'adm_financeiro'

  const [loading,  setLoading]  = useState(true)
  const [motivos,  setMotivos]  = useState<MotivoRow[]>([])
  const [salvando, setSalvando] = useState<Record<number, boolean>>({})
  const [salvo,    setSalvo]    = useState<Record<number, boolean>>({})
  const [busca,    setBusca]    = useState('')

  useEffect(() => {
    fetch('/api/caixa/config-motivos')
      .then(r => r.json())
      .then(j => { setMotivos(j.motivos ?? []); setLoading(false) })
  }, [])

  async function salvar(motivo: MotivoRow, novoGrupo: Grupo | null) {
    setSalvando(p => ({ ...p, [motivo.grid]: true }))

    const res = await fetch('/api/caixa/config-motivos', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ motivo_grid: motivo.grid, motivo_nome: motivo.nome, grupo: novoGrupo }),
    })
    const json = await res.json()

    if (!json.error) {
      setMotivos(prev => prev.map(m => m.grid === motivo.grid ? { ...m, grupo: novoGrupo } : m))
      setSalvo(p => ({ ...p, [motivo.grid]: true }))
      setTimeout(() => setSalvo(p => ({ ...p, [motivo.grid]: false })), 1800)
    }
    setSalvando(p => ({ ...p, [motivo.grid]: false }))
  }

  const filtrados = useMemo(() =>
    motivos.filter(m => m.nome.toLowerCase().includes(busca.toLowerCase()) || String(m.grid).includes(busca)),
    [motivos, busca],
  )

  const stats = useMemo(() => ({
    total:      motivos.length,
    vinculados: motivos.filter(m => m.grupo).length,
    semGrupo:   motivos.filter(m => !m.grupo).length,
  }), [motivos])

  if (!podeConfigurar) {
    return (
      <div className="flex flex-col h-screen bg-gray-50">
        <Header title="Motivos de Pagamento" description="Configuração · Fechamento de Caixa" />
        <div className="flex items-center justify-center flex-1 text-gray-400">
          <p className="text-sm">Acesso restrito a administradores.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header
        title="Motivos de Pagamento"
        description="Vincule cada forma de pagamento do AUTOSYSTEM a um grupo"
      />

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 max-w-4xl">

        {/* Grupos disponíveis */}
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
        {!loading && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total de motivos', value: stats.total,      color: 'text-gray-700' },
              { label: 'Configurados',     value: stats.vinculados,  color: 'text-green-700' },
              { label: 'Sem grupo',        value: stats.semGrupo,    color: stats.semGrupo > 0 ? 'text-amber-600' : 'text-gray-400' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                <p className="text-[11px] text-gray-400">{s.label}</p>
                <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome do motivo..."
            className="w-full h-9 pl-9 pr-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
        </div>

        {/* Tabela */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[13px]">Carregando motivos do AUTOSYSTEM...</span>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <p className="text-[13px]">
              {busca ? 'Nenhum motivo encontrado para esta busca.' : 'Nenhum motivo encontrado. Os postos precisam estar vinculados a empresas no AUTOSYSTEM.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-[11px]">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Grid</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Nome do motivo</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 w-56">Grupo</th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((motivo, i) => {
                    const isSaving   = salvando[motivo.grid]
                    const isSaved    = salvo[motivo.grid]
                    const grupoAtual = GRUPOS.find(g => g.value === motivo.grupo)

                    return (
                      <tr
                        key={motivo.grid}
                        className={cn(
                          'border-b border-gray-100 last:border-0 transition-colors',
                          i % 2 !== 0 ? 'bg-gray-50/30' : '',
                          !motivo.grupo && 'bg-amber-50/20',
                        )}
                      >
                        <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500">{motivo.grid}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{motivo.nome}</td>
                        <td className="px-4 py-2.5">
                          <select
                            value={motivo.grupo ?? ''}
                            onChange={e => salvar(motivo, (e.target.value as Grupo) || null)}
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
          </div>
        )}
      </div>
    </div>
  )
}
