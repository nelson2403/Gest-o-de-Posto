'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils/cn'
import { Loader2, Search, X, Package } from 'lucide-react'

// Multi-select de produtos do AUTOSYSTEM com busca server-side em
// `/api/comissionamento/produtos-as?busca=...`. Mantém os selecionados como
// chips (acima do input) e renderiza os resultados como checkbox-list.
// Usado nos filtros de produto do esquema e da meta.

interface ProdutoAS {
  grid:   number
  codigo: string | null
  nome:   string
}

export interface ProdutoItem {
  grid: number
  nome: string
}

interface ProdutoMultiSelectProps {
  valores:  string[]                        // nomes dos produtos selecionados
  onChange: (v: string[]) => void
  label?:   string
  placeholder?: string
  // Restringe a busca a produtos do tipo informado no AUTOSYSTEM
  // (ex.: 'C' para combustíveis, 'M' para mercadoria). Opcional.
  tipoFiltro?: string
}

export function ProdutoMultiSelect({
  valores, onChange,
  label = 'Produtos',
  placeholder = 'Digite para buscar no AUTOSYSTEM…',
  tipoFiltro,
}: ProdutoMultiSelectProps) {
  const [busca,   setBusca]   = useState('')
  const [results, setResults] = useState<ProdutoAS[]>([])
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState<string | null>(null)

  // Debounced fetch — só consulta quando há texto de busca
  useEffect(() => {
    if (!busca.trim()) { setResults([]); setErro(null); return }
    setLoading(true)
    setErro(null)
    const t = setTimeout(() => {
      const params = new URLSearchParams({ busca: busca.trim() })
      if (tipoFiltro) params.set('tipo', tipoFiltro)
      fetch(`/api/comissionamento/produtos-as?${params}`)
        .then(async r => {
          const json = await r.json().catch(() => ({}))
          if (!r.ok || json?.error) {
            setErro(String(json?.error ?? `Erro HTTP ${r.status}`))
            setResults([])
            return
          }
          setResults((json?.produtos ?? []) as ProdutoAS[])
        })
        .catch(e => {
          setErro(e instanceof Error ? e.message : String(e))
          setResults([])
        })
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [busca, tipoFiltro])

  const setSelecionados = useMemo(() => new Set(valores.map(v => v.toLowerCase())), [valores])

  function toggle(nome: string) {
    if (setSelecionados.has(nome.toLowerCase())) {
      onChange(valores.filter(v => v.toLowerCase() !== nome.toLowerCase()))
    } else {
      onChange([...valores, nome])
    }
  }
  function remove(nome: string) {
    onChange(valores.filter(v => v.toLowerCase() !== nome.toLowerCase()))
  }
  function limparTodos() { onChange([]) }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-[11px] uppercase tracking-wide text-gray-500">
          {label} ({valores.length} selecionado{valores.length === 1 ? '' : 's'})
        </Label>
        {valores.length > 0 && (
          <button
            type="button"
            onClick={limparTodos}
            className="text-[10.5px] text-gray-500 hover:text-red-600 font-medium"
          >
            Limpar todos
          </button>
        )}
      </div>

      {/* Chips dos produtos já selecionados */}
      {valores.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2 p-2 bg-gray-50 border border-gray-200 rounded-lg max-h-32 overflow-y-auto">
          {valores.map(v => (
            <span
              key={v}
              className="inline-flex items-center gap-1 text-[11px] bg-white border border-gray-300 rounded-md pl-2 pr-1 py-0.5"
            >
              <Package className="w-2.5 h-2.5 text-gray-400" />
              <span className="text-gray-700 truncate max-w-[180px]" title={v}>{v}</span>
              <button
                type="button"
                onClick={() => remove(v)}
                className="p-0.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                title="Remover"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={placeholder}
          className="h-9 pl-7 text-[12.5px]"
        />
      </div>

      {/* Resultados — só mostra quando há texto de busca */}
      {busca.trim() && (
        <div className="mt-1 border border-gray-200 rounded-lg bg-white overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-4 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : erro ? (
            <div className="px-3 py-3 text-center text-[11.5px] text-red-600 bg-red-50">
              <p className="font-semibold mb-0.5">Erro ao buscar</p>
              <p className="text-[10.5px] opacity-80">{erro}</p>
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-center text-[11.5px] text-gray-400">
              Nenhum produto encontrado
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
              {results.map(p => {
                const sel = setSelecionados.has(p.nome.toLowerCase())
                return (
                  <label
                    key={p.grid}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors',
                      sel ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-gray-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggle(p.nome)}
                      className="accent-orange-500 w-3.5 h-3.5 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-[12px] truncate', sel ? 'text-orange-700 font-medium' : 'text-gray-700')}>
                        {p.nome}
                      </p>
                      {p.codigo && (
                        <p className="text-[10px] text-gray-400">Cód. {p.codigo}</p>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}

      {!busca.trim() && valores.length === 0 && (
        <p className="text-[10.5px] text-gray-400 mt-1">
          Digite acima para buscar produtos cadastrados no AUTOSYSTEM e marcar/desmarcar.
        </p>
      )}
    </div>
  )
}

// ── Variante "Items" — mantém { grid, nome } para usos que precisam do FK
// lógico (ex.: cadastro de categorias que referencia produto.grid).
//
// API idêntica à versão `ProdutoMultiSelect` exceto pelo tipo dos valores.

interface ProdutoMultiSelectItemsProps {
  itens:    ProdutoItem[]
  onChange: (v: ProdutoItem[]) => void
  label?:   string
  placeholder?: string
  tipoFiltro?: string
}

export function ProdutoMultiSelectItems({
  itens, onChange,
  label = 'Produtos',
  placeholder = 'Digite para buscar no AUTOSYSTEM…',
  tipoFiltro,
}: ProdutoMultiSelectItemsProps) {
  const [busca,   setBusca]   = useState('')
  const [results, setResults] = useState<ProdutoAS[]>([])
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState<string | null>(null)

  useEffect(() => {
    if (!busca.trim()) { setResults([]); setErro(null); return }
    setLoading(true)
    setErro(null)
    const t = setTimeout(() => {
      const params = new URLSearchParams({ busca: busca.trim() })
      if (tipoFiltro) params.set('tipo', tipoFiltro)
      fetch(`/api/comissionamento/produtos-as?${params}`)
        .then(async r => {
          const json = await r.json().catch(() => ({}))
          if (!r.ok || json?.error) {
            setErro(String(json?.error ?? `Erro HTTP ${r.status}`))
            setResults([])
            return
          }
          setResults((json?.produtos ?? []) as ProdutoAS[])
        })
        .catch(e => {
          setErro(e instanceof Error ? e.message : String(e))
          setResults([])
        })
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [busca, tipoFiltro])

  const selecionados = useMemo(() => new Set(itens.map(i => i.grid)), [itens])

  function toggle(p: ProdutoAS) {
    if (selecionados.has(p.grid)) {
      onChange(itens.filter(i => i.grid !== p.grid))
    } else {
      onChange([...itens, { grid: p.grid, nome: p.nome }])
    }
  }
  function remove(grid: number) { onChange(itens.filter(i => i.grid !== grid)) }
  function limparTodos()        { onChange([]) }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-[11px] uppercase tracking-wide text-gray-500">
          {label} ({itens.length} selecionado{itens.length === 1 ? '' : 's'})
        </Label>
        {itens.length > 0 && (
          <button type="button" onClick={limparTodos} className="text-[10.5px] text-gray-500 hover:text-red-600 font-medium">
            Limpar todos
          </button>
        )}
      </div>

      {itens.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2 p-2 bg-gray-50 border border-gray-200 rounded-lg max-h-32 overflow-y-auto">
          {itens.map(it => (
            <span key={it.grid} className="inline-flex items-center gap-1 text-[11px] bg-white border border-gray-300 rounded-md pl-2 pr-1 py-0.5">
              <Package className="w-2.5 h-2.5 text-gray-400" />
              <span className="text-gray-700 truncate max-w-[180px]" title={it.nome}>{it.nome}</span>
              <button type="button" onClick={() => remove(it.grid)} className="p-0.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" title="Remover">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={placeholder}
          className="h-9 pl-7 text-[12.5px]"
        />
      </div>

      {busca.trim() && (
        <div className="mt-1 border border-gray-200 rounded-lg bg-white overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-4 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : erro ? (
            <div className="px-3 py-3 text-center text-[11.5px] text-red-600 bg-red-50">
              <p className="font-semibold mb-0.5">Erro ao buscar</p>
              <p className="text-[10.5px] opacity-80">{erro}</p>
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-center text-[11.5px] text-gray-400">Nenhum produto encontrado</div>
          ) : (
            <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
              {results.map(p => {
                const sel = selecionados.has(p.grid)
                return (
                  <label
                    key={p.grid}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors',
                      sel ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-gray-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggle(p)}
                      className="accent-orange-500 w-3.5 h-3.5 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-[12px] truncate', sel ? 'text-orange-700 font-medium' : 'text-gray-700')}>{p.nome}</p>
                      {p.codigo && <p className="text-[10px] text-gray-400">Cód. {p.codigo}</p>}
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}

      {!busca.trim() && itens.length === 0 && (
        <p className="text-[10.5px] text-gray-400 mt-1">
          Digite acima para buscar produtos cadastrados no AUTOSYSTEM.
        </p>
      )}
    </div>
  )
}
