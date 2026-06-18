'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { Check, ChevronDown, Search } from 'lucide-react'

// Combobox de seleção de posto com input de busca embutido.
// Mantém o visual do SelectTrigger do projeto (h-9, rounded-md, borda
// cinza) para encaixar nas toolbars existentes sem destoar.

interface PostoOpt {
  id:    string
  nome:  string
}

interface Props {
  postos:        PostoOpt[]
  value:         string                       // id do posto selecionado ('' = nenhum)
  onChange:      (id: string) => void
  placeholder?:  string
  className?:    string                       // dimensiona o trigger (ex.: "min-w-[200px]")
}

export function PostoCombobox({ postos, value, onChange, placeholder = 'Posto', className }: Props) {
  const [open, setOpen]     = useState(false)
  const [busca, setBusca]   = useState('')
  const wrapRef             = useRef<HTMLDivElement>(null)
  const inputRef            = useRef<HTMLInputElement>(null)

  const selecionado = useMemo(() => postos.find(p => p.id === value), [postos, value])

  const filtrados = useMemo(() => {
    const s = busca.trim().toLowerCase()
    if (!s) return postos
    return postos.filter(p => p.nome.toLowerCase().includes(s))
  }, [postos, busca])

  // Auto-foco no input ao abrir
  useEffect(() => {
    if (open) {
      // setTimeout 0 para esperar o render do popup
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  // Click outside fecha
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setBusca('')
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function selecionar(id: string) {
    onChange(id)
    setOpen(false)
    setBusca('')
  }

  // Enter na busca: se filtrado tem 1 só, seleciona
  function onKeyInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape')          { setOpen(false); setBusca(''); e.preventDefault() }
    else if (e.key === 'Enter' && filtrados.length > 0) {
      selecionar(filtrados[0].id); e.preventDefault()
    }
  }

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full h-9 px-3 pr-8 rounded-md border border-gray-200 bg-white text-[13px] text-left flex items-center focus:outline-none focus:ring-1 focus:ring-amber-400 hover:bg-gray-50/60 transition-colors"
      >
        <span className={cn('truncate flex-1', !selecionado && 'text-gray-400')}>
          {selecionado?.nome ?? placeholder}
        </span>
        <ChevronDown className={cn(
          'w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 transition-transform',
          open && 'rotate-180',
        )} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-40 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden min-w-[260px]">
          <div className="relative p-2 border-b border-gray-100">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={onKeyInput}
              placeholder="Buscar empresa..."
              className="w-full h-8 pl-7 pr-2 border border-gray-200 rounded text-[12.5px] bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {filtrados.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-gray-400 italic text-center">Nenhum posto encontrado</p>
            ) : (
              filtrados.map(p => {
                const sel = p.id === value
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selecionar(p.id)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-[12.5px] flex items-center gap-2 hover:bg-amber-50/60 transition-colors',
                      sel && 'bg-amber-50',
                    )}
                  >
                    {sel
                      ? <Check className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                      : <span className="w-3.5 flex-shrink-0" />
                    }
                    <span className={cn('truncate', sel ? 'text-amber-800 font-medium' : 'text-gray-700')}>
                      {p.nome}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          <div className="px-3 py-1.5 border-t border-gray-100 text-[10.5px] text-gray-400 flex items-center justify-between">
            <span>{filtrados.length} de {postos.length}</span>
            <span className="text-gray-300">Esc fecha · Enter seleciona</span>
          </div>
        </div>
      )}
    </div>
  )
}
