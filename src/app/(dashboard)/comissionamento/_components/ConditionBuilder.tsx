'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, FolderPlus, X, Search, Loader2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils/cn'
import {
  type ConditionGroup, type Condition, type FieldKey, type OperatorKey, type LogicOperator,
  FIELD_DEFS, FIELD_KEYS, OPERATOR_DEFS, operatorsFor, newCondition, newGroup,
} from '../_lib/conditions'

// Roles cadastradas em Membros (Supabase). O engine usa o `role` do membro
// como ctx.cargo — então as opções aqui batem com o que cabe nas regras.
const CARGO_ROLES: readonly { value: string; label: string }[] = [
  { value: 'seller',      label: 'Vendedor'         },
  { value: 'manager',     label: 'Gerente'          },
  { value: 'supervisor',  label: 'Supervisor'       },
  { value: 'pit_boss',    label: 'Chefe de Pista'   },
  { value: 'oil_changer', label: 'Trocador de Óleo' },
]

interface Props {
  value:    ConditionGroup
  onChange: (g: ConditionGroup) => void
}

// Componente recursivo: o grupo raiz é renderizado sem "card" externo; sub-grupos
// recebem borda + título "Sub-grupo (E/OU)" para distinguir visualmente.
export function ConditionBuilder({ value, onChange }: Props) {
  return (
    <GroupNode
      group={value}
      onChange={onChange}
      onRemove={null}     // raiz não pode ser removida
      isRoot
      depth={0}
    />
  )
}

// ── GroupNode ───────────────────────────────────────────────────────────────

interface GroupNodeProps {
  group:    ConditionGroup
  onChange: (g: ConditionGroup) => void
  onRemove: (() => void) | null
  isRoot:   boolean
  depth:    number
}

function GroupNode({ group, onChange, onRemove, isRoot, depth }: GroupNodeProps) {
  // Helpers imutáveis pra editar a árvore preservando referências.
  const updateLogic = useCallback((logic: LogicOperator) => {
    onChange({ ...group, logic })
  }, [group, onChange])

  const addCondition = useCallback(() => {
    onChange({ ...group, conditions: [...group.conditions, newCondition()] })
  }, [group, onChange])

  const addSubGroup = useCallback(() => {
    onChange({ ...group, groups: [...group.groups, newGroup('AND')] })
  }, [group, onChange])

  const updateCondition = useCallback((idx: number, next: Condition) => {
    onChange({
      ...group,
      conditions: group.conditions.map((c, i) => i === idx ? next : c),
    })
  }, [group, onChange])

  const removeCondition = useCallback((idx: number) => {
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== idx) })
  }, [group, onChange])

  const updateSubGroup = useCallback((idx: number, next: ConditionGroup) => {
    onChange({
      ...group,
      groups: group.groups.map((g, i) => i === idx ? next : g),
    })
  }, [group, onChange])

  const removeSubGroup = useCallback((idx: number) => {
    onChange({ ...group, groups: group.groups.filter((_, i) => i !== idx) })
  }, [group, onChange])

  const vazio = group.conditions.length === 0 && group.groups.length === 0

  return (
    <div
      className={cn(
        'rounded-lg',
        isRoot
          ? 'border border-dashed border-gray-300 p-3 bg-gray-50/30'
          : 'border-l-4 pl-3 ml-1',
        !isRoot && (group.logic === 'AND' ? 'border-l-blue-300 bg-blue-50/30' : 'border-l-purple-300 bg-purple-50/30'),
        !isRoot && 'py-2 pr-2 rounded-r-lg',
      )}
    >
      {/* Cabeçalho: lógica + ações de remoção (sub-grupos) */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10.5px] uppercase tracking-wide font-semibold text-gray-500">
          {isRoot ? 'Condições — todas avaliadas como' : `Sub-grupo`}
        </span>
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
          <button
            type="button"
            onClick={() => updateLogic('AND')}
            className={cn(
              'px-2.5 py-0.5 text-[11px] font-bold transition-colors',
              group.logic === 'AND' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
            )}
          >
            E
          </button>
          <button
            type="button"
            onClick={() => updateLogic('OR')}
            className={cn(
              'px-2.5 py-0.5 text-[11px] font-bold transition-colors',
              group.logic === 'OR' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
            )}
          >
            OU
          </button>
        </div>
        {!isRoot && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
            title="Remover sub-grupo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Lista de condições */}
      <div className="space-y-1.5">
        {group.conditions.map((c, idx) => (
          <ConditionRow
            key={c.id}
            condition={c}
            onChange={(next) => updateCondition(idx, next)}
            onRemove={() => removeCondition(idx)}
          />
        ))}

        {/* Sub-grupos */}
        {group.groups.map((sg, idx) => (
          <GroupNode
            key={sg.id}
            group={sg}
            onChange={(next) => updateSubGroup(idx, next)}
            onRemove={() => removeSubGroup(idx)}
            isRoot={false}
            depth={depth + 1}
          />
        ))}

        {vazio && (
          <p className="text-[12px] text-gray-400 italic px-1 py-1">
            Sem condições — a regra aplica para qualquer venda. Adicione uma condição abaixo.
          </p>
        )}
      </div>

      {/* Botões de adicionar */}
      <div className="flex flex-wrap items-center gap-2 mt-2.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCondition}
          className="h-7 gap-1.5 text-[11.5px] px-2.5"
        >
          <Plus className="w-3 h-3" /> Condição
        </Button>
        {depth < 3 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSubGroup}
            className="h-7 gap-1.5 text-[11.5px] px-2.5"
          >
            <FolderPlus className="w-3 h-3" /> Sub-grupo
          </Button>
        )}
      </div>
    </div>
  )
}

// ── ConditionRow ────────────────────────────────────────────────────────────

interface ConditionRowProps {
  condition: Condition
  onChange:  (c: Condition) => void
  onRemove:  () => void
}

function ConditionRow({ condition, onChange, onRemove }: ConditionRowProps) {
  const fieldDef    = condition.field    ? FIELD_DEFS[condition.field]      : null
  const operatorDef = condition.operator ? OPERATOR_DEFS[condition.operator] : null
  const valor1Tipo  = fieldDef?.type === 'number' ? 'number' : 'text'
  const needsTwo    = operatorDef?.needs === 2

  // Quando muda o campo, reseta operador se ele não combina com o novo tipo
  function setField(field: FieldKey) {
    const valid = operatorsFor(field)
    const op = condition.operator && valid.includes(condition.operator) ? condition.operator : null
    onChange({ ...condition, field, operator: op })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-white border border-gray-200 rounded-md p-1.5">
      {/* Campo */}
      <Select
        value={condition.field ?? ''}
        onValueChange={(v) => setField(v as FieldKey)}
      >
        <SelectTrigger className="h-7 text-[12px] w-44">
          <SelectValue placeholder="Campo..." />
        </SelectTrigger>
        <SelectContent>
          {FIELD_KEYS.map(k => (
            <SelectItem key={k} value={k}>{FIELD_DEFS[k].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operador */}
      <Select
        value={condition.operator ?? ''}
        onValueChange={(v) => onChange({ ...condition, operator: v as OperatorKey })}
        disabled={!condition.field}
      >
        <SelectTrigger className="h-7 text-[12px] w-36">
          <SelectValue placeholder="Operador..." />
        </SelectTrigger>
        <SelectContent>
          {operatorsFor(condition.field).map(k => (
            <SelectItem key={k} value={k}>
              <span className="inline-flex items-center gap-2">
                <span className="font-mono font-bold text-gray-500">{OPERATOR_DEFS[k].symbol}</span>
                {OPERATOR_DEFS[k].label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Valor 1 — combobox remoto p/ produto / grupo / subgrupo; input p/ os demais */}
      {condition.field === 'produto' ? (
        <RemoteCombobox
          value={typeof condition.value === 'string' ? condition.value : ''}
          onChange={(v) => onChange({ ...condition, value: v })}
          endpoint="/api/comissionamento/produtos-as"
          responseKey="produtos"
          placeholder="Selecione produto..."
          disabled={!condition.operator}
        />
      ) : condition.field === 'grupo_produto' ? (
        <RemoteCombobox
          value={typeof condition.value === 'string' ? condition.value : ''}
          onChange={(v) => onChange({ ...condition, value: v })}
          endpoint="/api/comissionamento/grupos-as"
          responseKey="grupos"
          placeholder="Selecione grupo..."
          disabled={!condition.operator}
          localFilter
        />
      ) : condition.field === 'subgrupo_produto' ? (
        <RemoteCombobox
          value={typeof condition.value === 'string' ? condition.value : ''}
          onChange={(v) => onChange({ ...condition, value: v })}
          endpoint="/api/comissionamento/grupos-as"
          responseKey="subgrupos"
          placeholder="Selecione subgrupo..."
          disabled={!condition.operator}
          localFilter
        />
      ) : condition.field === 'cargo' ? (
        <Select
          value={typeof condition.value === 'string' ? condition.value : ''}
          onValueChange={(v) => onChange({ ...condition, value: v })}
          disabled={!condition.operator}
        >
          <SelectTrigger className="h-7 text-[12px] w-40">
            <SelectValue placeholder="Selecione cargo..." />
          </SelectTrigger>
          <SelectContent>
            {CARGO_ROLES.map(r => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type={valor1Tipo}
          step={valor1Tipo === 'number' ? '0.01' : undefined}
          value={condition.value ?? ''}
          onChange={(e) => onChange({
            ...condition,
            value: valor1Tipo === 'number' ? (e.target.value === '' ? null : parseFloat(e.target.value)) : e.target.value,
          })}
          placeholder={fieldDef?.unit === 'R$' ? '0,00' : fieldDef?.unit === '%' ? '0' : '...'}
          disabled={!condition.operator}
          className="h-7 text-[12px] w-32"
        />
      )}

      {/* Valor 2 (between) */}
      {needsTwo && (
        <>
          <span className="text-[11px] text-gray-400">e</span>
          <Input
            type={valor1Tipo}
            step={valor1Tipo === 'number' ? '0.01' : undefined}
            value={condition.value2 ?? ''}
            onChange={(e) => onChange({
              ...condition,
              value2: valor1Tipo === 'number' ? (e.target.value === '' ? null : parseFloat(e.target.value)) : e.target.value,
            })}
            placeholder="..."
            className="h-7 text-[12px] w-32"
          />
        </>
      )}

      {/* Unidade do campo (decoração) */}
      {fieldDef?.unit && condition.operator && (
        <span className="text-[10.5px] text-gray-400 font-mono">{fieldDef.unit}</span>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="ml-auto p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
        title="Remover condição"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ── RemoteCombobox ──────────────────────────────────────────────────────────
// Input com dropdown popover que busca dados de uma API REST. Genérico para
// reuso futuro com grupo_produto / subgrupo_produto. Salva o `nome` no value
// (string) — o motor de cálculo compara o nome em runtime.

interface RemoteItem {
  grid:   number | string
  codigo: string | null
  nome:   string
}

interface RemoteComboboxProps {
  value:        string                     // texto atual (nome do item selecionado)
  onChange:     (v: string) => void
  endpoint:     string                     // ex.: '/api/comissionamento/produtos-as'
  responseKey:  string                     // chave do array no JSON (ex.: 'produtos')
  placeholder?: string
  disabled?:    boolean
  // Quando true, o combobox busca a lista inteira uma única vez (sem `?busca`
  // na URL) e filtra client-side. Útil para endpoints leves (grupos/subgrupos)
  // que devolvem a coleção completa sem suporte a busca server-side.
  localFilter?: boolean
}

// Cache de listas remotas em modo localFilter — uma fetch por (endpoint+key)
// durante a vida do bundle. Evita re-buscar grupos/subgrupos a cada abertura.
const remoteListCache = new Map<string, RemoteItem[]>()

function RemoteCombobox({
  value, onChange, endpoint, responseKey, placeholder, disabled, localFilter,
}: RemoteComboboxProps) {
  const [open,    setOpen]    = useState(false)
  const [busca,   setBusca]   = useState('')
  const [results, setResults] = useState<RemoteItem[]>(
    () => (localFilter && remoteListCache.get(`${endpoint}::${responseKey}`)) || [],
  )
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  // Ref para o onChange atual — usado no listener nativo de pointerdown
  // (a closure capturada na primeira montagem fica obsoleta entre re-renders).
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Posicionamento fixed do popover (rendered via portal pra escapar do
  // overflow-hidden do DialogContent).
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 288 })

  // Necessário p/ evitar SSR mismatch — createPortal só roda no client.
  useEffect(() => { setMounted(true) }, [])

  // Recalcula posição do popover sempre que abre, redimensiona ou rola
  useEffect(() => {
    if (!open) return
    const update = () => {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPos({
        top:   rect.bottom + 4,
        left:  rect.left,
        width: Math.max(rect.width, 288),
      })
    }
    update()
    window.addEventListener('resize', update)
    document.addEventListener('scroll', update, true)  // capture: pega scrolls em qualquer overflow:auto ancestral
    return () => {
      window.removeEventListener('resize', update)
      document.removeEventListener('scroll', update, true)
    }
  }, [open])

  // Listener nativo em fase de captura para:
  //   - selecionar item ao clicar (ANTES de qualquer focus trap do Radix
  //     Dialog roubar o evento): lê o valor de `data-combobox-value` no
  //     elemento clicado, chama onChange e fecha o popover.
  //   - fechar quando clica fora do popover (e fora do trigger).
  //
  // Roda em capture phase para preceder o pointerDownOutside do Radix.
  useEffect(() => {
    if (!open) return
    function nativeCapture(e: PointerEvent | MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!target) return
      const item = target.closest('[data-combobox-item]') as HTMLElement | null
      if (item) {
        const val = item.getAttribute('data-combobox-value') ?? ''
        e.preventDefault()
        e.stopPropagation()
        if (typeof (e as MouseEvent).stopImmediatePropagation === 'function') {
          (e as MouseEvent).stopImmediatePropagation()
        }
        onChangeRef.current(val)
        setOpen(false)
        return
      }
      if (target.closest('[data-combobox-popover]')) {
        // Clique dentro do popover (input, botão de scroll, etc.) — só
        // silencia para o Radix não ver, sem fechar.
        e.stopPropagation()
        if (typeof (e as MouseEvent).stopImmediatePropagation === 'function') {
          (e as MouseEvent).stopImmediatePropagation()
        }
        return
      }
      if (triggerRef.current?.contains(target)) return
      // Fora: fecha o popover.
      setOpen(false)
    }
    document.addEventListener('pointerdown', nativeCapture, true)
    document.addEventListener('mousedown',   nativeCapture, true)
    return () => {
      document.removeEventListener('pointerdown', nativeCapture, true)
      document.removeEventListener('mousedown',   nativeCapture, true)
    }
  }, [open])

  // Modo `localFilter`: busca uma vez quando abre (se cache vazio) e filtra
  // client-side. Modo padrão (server-side): refaz fetch sempre que `busca`
  // muda, com debounce de 250ms.
  useEffect(() => {
    if (!open) return

    if (localFilter) {
      const cacheKey = `${endpoint}::${responseKey}`
      const cached = remoteListCache.get(cacheKey)
      if (cached) { setResults(cached); return }
      setLoading(true)
      setErro(null)
      fetch(endpoint)
        .then(async r => {
          const json = await r.json().catch(() => ({}))
          if (!r.ok || json?.error) {
            setErro(String(json?.error ?? `Erro HTTP ${r.status}`))
            setResults([])
            return
          }
          const lista = (json?.[responseKey] ?? []) as RemoteItem[]
          remoteListCache.set(cacheKey, lista)
          setResults(lista)
        })
        .catch(e => {
          setErro(e instanceof Error ? e.message : String(e))
          setResults([])
        })
        .finally(() => setLoading(false))
      return
    }

    const t = setTimeout(() => {
      setLoading(true)
      setErro(null)
      const url = busca.trim() ? `${endpoint}?busca=${encodeURIComponent(busca.trim())}` : endpoint
      fetch(url)
        .then(async r => {
          const json = await r.json().catch(() => ({}))
          if (!r.ok || json?.error) {
            setErro(String(json?.error ?? `Erro HTTP ${r.status}`))
            setResults([])
            return
          }
          const lista = (json?.[responseKey] ?? []) as RemoteItem[]
          setResults(lista)
        })
        .catch(e => {
          setErro(e instanceof Error ? e.message : String(e))
          setResults([])
        })
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [open, busca, endpoint, responseKey, localFilter])

  // Lista efetivamente exibida — quando localFilter, aplica filtro em memória.
  const resultsExibidos = (() => {
    if (!localFilter) return results
    const q = busca.trim().toLowerCase()
    if (!q) return results
    return results.filter(r =>
      r.nome.toLowerCase().includes(q) ||
      String(r.codigo ?? '').toLowerCase().includes(q),
    )
  })()

  const popover = open && (
    <div
      data-combobox-popover
      style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
      className="fixed z-[100] w-72 bg-white border border-gray-200 rounded-lg shadow-2xl overflow-hidden"
      // Bloqueia que o Radix Dialog detecte o clique como `pointerDownOutside`
      // e roube o foco antes do onClick do item disparar. Usa capture phase
      // para garantir que rodamos antes de qualquer outro listener.
      onPointerDownCapture={(e) => e.stopPropagation()}
      onMouseDownCapture={(e) => e.stopPropagation()}
    >
      <div className="p-2 border-b border-gray-100 relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <Input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar..."
          className="h-7 pl-7 text-[12px]"
        />
      </div>
      <div className="max-h-56 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-4 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : erro ? (
          <div className="px-3 py-4 text-center text-[11.5px] text-red-600 bg-red-50 border-b border-red-100">
            <p className="font-semibold mb-0.5">Erro ao buscar</p>
            <p className="text-[10.5px] opacity-80">{erro}</p>
          </div>
        ) : resultsExibidos.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11.5px] text-gray-400">
            {busca ? 'Nenhum resultado' : 'Sem registros'}
          </div>
        ) : (
          resultsExibidos.map(item => {
            const selecionado = item.nome === value
            return (
              <button
                key={`${item.grid}`}
                type="button"
                // A seleção é tratada pelo listener nativo capture em
                // useEffect via `data-combobox-item` + `data-combobox-value`.
                // Os handlers React abaixo são fallback (no-op) para mouse e
                // touch — eles previnem a navegação/submit default mas a
                // ação real já rodou no pointerdown.
                data-combobox-item="true"
                data-combobox-value={item.nome}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-[12px] border-b border-gray-100 last:border-0 transition-colors',
                  selecionado ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700',
                )}
              >
                <span className="block truncate">{item.nome}</span>
                {item.codigo && (
                  <span className="block truncate text-[10px] text-gray-400 mt-0.5">Cód. {item.codigo}</span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'h-7 w-48 px-2.5 pr-7 text-left text-[12px] rounded-md border border-gray-300 bg-white',
          'flex items-center gap-1.5 truncate relative',
          'disabled:bg-gray-50 disabled:text-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/30',
          !value && 'text-gray-400',
        )}
      >
        <span className="truncate flex-1">{value || (placeholder ?? 'Selecione...')}</span>
        <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform absolute right-2', open && 'rotate-180')} />
      </button>
      {mounted && popover ? createPortal(popover, document.body) : null}
    </>
  )
}
