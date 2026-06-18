'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react'

// Combobox com busca server-side e debounce.
// Permite tanto SELECIONAR um item da lista (captura o objeto completo)
// quanto digitar TEXTO LIVRE (item = null). O componente pai recebe:
//   - onChange(label, item): chamado a cada digitação e seleção
//
// Quando o usuário seleciona da lista, label = nome do item e item = objeto.
// Quando digita livremente, label = texto e item = null.

interface Props<T> {
  value:        string                              // texto exibido atualmente
  onChange:     (label: string, item: T | null) => void
  fetcher:      (busca: string) => Promise<T[]>
  getLabel:     (item: T) => string
  getKey:       (item: T) => string | number
  placeholder?: string
  renderItem?:  (item: T) => React.ReactNode        // override do item no dropdown
  icon?:        React.ReactNode
  disabled?:    boolean
  disabledHint?: string                              // tooltip quando disabled
  emptyText?:   string                              // mensagem quando lista vazia
  className?:   string                              // classes adicionais no wrapper
  debounceMs?:  number                              // default 300
  // Quando true, ao limpar o input chama onChange('', null) imediatamente
  allowClear?:  boolean
}

export function ASCombobox<T>({
  value, onChange, fetcher, getLabel, getKey,
  placeholder, renderItem, icon, disabled, disabledHint,
  emptyText = 'Nada encontrado', className,
  debounceMs = 300, allowClear = true,
}: Props<T>) {
  const [open,    setOpen]    = useState(false)
  const [items,   setItems]   = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef               = useRef<HTMLDivElement>(null)
  const inputRef              = useRef<HTMLInputElement>(null)

  // Click outside fecha
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Refetch com debounce quando o dropdown está aberto E o texto muda
  useEffect(() => {
    if (!open) return
    setLoading(true)
    let cancelled = false
    const t = setTimeout(() => {
      fetcher(value)
        .then(list => { if (!cancelled) setItems(list) })
        .catch(() => { if (!cancelled) setItems([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, debounceMs)
    return () => { cancelled = true; clearTimeout(t) }
  // fetcher é estável no caller (useCallback). value não — refetch cada digit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, open, debounceMs])

  function selecionar(item: T) {
    const label = getLabel(item)
    setOpen(false)
    onChange(label, item)
  }

  function limpar(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('', null)
    inputRef.current?.focus()
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape')      { setOpen(false); e.preventDefault() }
    else if (e.key === 'Enter' && items.length > 0) {
      selecionar(items[0]); e.preventDefault()
    }
    else if (e.key === 'ArrowDown') { setOpen(true); e.preventDefault() }
  }

  return (
    <div ref={wrapRef} className={cn('relative', className)} title={disabled ? disabledHint : undefined}>
      <div className="relative">
        {icon && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
            {icon}
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value, null); setOpen(true) }}
          onFocus={() => !disabled && setOpen(true)}
          onKeyDown={onKey}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            'w-full h-9 rounded-md border border-gray-200 bg-white text-[13px] focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:bg-gray-50 disabled:text-gray-400',
            icon ? 'pl-8' : 'pl-3',
            allowClear && value ? 'pr-14' : 'pr-8',
          )}
        />
        {allowClear && value && !disabled && (
          <button type="button" onClick={limpar}
            className="absolute right-7 top-1/2 -translate-y-1/2 w-5 h-5 rounded hover:bg-gray-100 text-gray-400 flex items-center justify-center">
            <X className="w-3 h-3" />
          </button>
        )}
        <ChevronDown className={cn(
          'w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none transition-transform',
          open && 'rotate-180',
        )} />
      </div>

      {open && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1 z-40 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden min-w-[260px]">
          <div className="max-h-72 overflow-y-auto py-1">
            {loading ? (
              <div className="px-3 py-4 text-center">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" />
              </div>
            ) : items.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-gray-400 italic text-center flex items-center justify-center gap-1.5">
                <Search className="w-3 h-3" />
                {value.trim() ? emptyText : 'Digite para buscar…'}
              </p>
            ) : (
              items.map(item => {
                const label = getLabel(item)
                const sel = label === value
                return (
                  <button
                    key={getKey(item)}
                    type="button"
                    onClick={() => selecionar(item)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-[12.5px] flex items-center gap-2 hover:bg-amber-50/60 transition-colors',
                      sel && 'bg-amber-50',
                    )}
                  >
                    {sel ? <Check className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" /> : <span className="w-3.5 flex-shrink-0" />}
                    <span className="flex-1 truncate">
                      {renderItem ? renderItem(item) : <span className={cn(sel ? 'text-amber-800 font-medium' : 'text-gray-700')}>{label}</span>}
                    </span>
                  </button>
                )
              })
            )}
          </div>
          {items.length > 0 && (
            <div className="px-3 py-1 border-t border-gray-100 text-[10px] text-gray-400 text-right">
              Enter seleciona · Esc fecha
            </div>
          )}
        </div>
      )}
    </div>
  )
}
