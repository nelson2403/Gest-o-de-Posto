'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/hooks/use-toast'
import {
  Plus, Pencil, Trash2, Loader2, Power, ChevronUp, ChevronDown,
  Wand2, Save, X, ArrowRight,
} from 'lucide-react'
import type {
  ContabilRegraExportacao, RegraCampoCondicao, RegraCampoAcao, RegraOperador,
} from '@/types/database.types'

type Regra = ContabilRegraExportacao

const CAMPOS_COND_LABEL: Record<RegraCampoCondicao, string> = {
  conta_debitar:  'Conta a débito (AUTOSYSTEM)',
  conta_creditar: 'Conta a crédito (AUTOSYSTEM)',
  observacao:     'Observação',
  documento:      'Documento',
  pessoa:         'Pessoa / Fornecedor',
}
const CAMPOS_ACAO_LABEL: Record<RegraCampoAcao, string> = {
  conta_debitar:  'Conta a débito do CSV',
  conta_creditar: 'Conta a crédito do CSV',
  observacao:     'Histórico do CSV',
}
const OPERADORES_LABEL: Record<RegraOperador, string> = {
  starts_with:     'começa com',
  not_starts_with: 'NÃO começa com',
  equals:          'é igual a',
  not_equals:      'é diferente de',
  contains:        'contém',
  not_contains:    'NÃO contém',
}

const CAMPOS_COND_ENTRIES = Object.entries(CAMPOS_COND_LABEL) as [RegraCampoCondicao, string][]
const CAMPOS_ACAO_ENTRIES = Object.entries(CAMPOS_ACAO_LABEL) as [RegraCampoAcao, string][]
const OPERADORES_ENTRIES  = Object.entries(OPERADORES_LABEL)  as [RegraOperador,  string][]

type Draft = {
  nome:              string
  descricao:         string
  ativa:             boolean
  condicao_campo:    RegraCampoCondicao
  condicao_operador: RegraOperador
  condicao_valor:    string
  acao_campo:        RegraCampoAcao
  acao_valor:        string
}
const DRAFT_VAZIO: Draft = {
  nome: '', descricao: '', ativa: true,
  condicao_campo: 'conta_debitar', condicao_operador: 'starts_with', condicao_valor: '',
  acao_campo:     'conta_debitar', acao_valor: '',
}

export function TabRegras() {
  const [items, setItems]   = useState<Regra[]>([])
  const [loading, setLoading] = useState(true)

  const [editId, setEditId] = useState<string | null>(null)  // '__new' = nova; uuid = editar
  const [draft, setDraft]   = useState<Draft>(DRAFT_VAZIO)
  const [saving, setSaving] = useState(false)

  async function carregar() {
    setLoading(true)
    try {
      const r = await fetch('/api/contabil/regras-exportacao')
      const json = await r.json()
      if (!r.ok) throw new Error(json.error ?? `Erro HTTP ${r.status}`)
      setItems((json.regras ?? []) as Regra[])
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao carregar', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { carregar() }, [])

  function startNovo() {
    setEditId('__new')
    setDraft(DRAFT_VAZIO)
  }
  function startEditar(r: Regra) {
    setEditId(r.id)
    setDraft({
      nome: r.nome,
      descricao: r.descricao ?? '',
      ativa: r.ativa,
      condicao_campo:    r.condicao_campo,
      condicao_operador: r.condicao_operador,
      condicao_valor:    r.condicao_valor,
      acao_campo:        r.acao_campo,
      acao_valor:        r.acao_valor,
    })
  }
  function cancelar() {
    setEditId(null); setDraft(DRAFT_VAZIO)
  }

  async function salvar() {
    if (!draft.nome.trim())           { toast({ variant: 'destructive', title: 'Informe o nome' });    return }
    if (!draft.condicao_valor)        { toast({ variant: 'destructive', title: 'Informe o valor da condição' });     return }
    if (!draft.acao_valor.trim())     { toast({ variant: 'destructive', title: 'Informe o valor da ação' });          return }
    setSaving(true)
    try {
      const isNovo = editId === '__new'
      const url    = isNovo ? '/api/contabil/regras-exportacao' : `/api/contabil/regras-exportacao/${editId}`
      const method = isNovo ? 'POST' : 'PATCH'
      const r = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error ?? `Erro HTTP ${r.status}`)
      toast({ title: isNovo ? 'Regra criada' : 'Regra atualizada' })
      cancelar()
      await carregar()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  async function excluir(r: Regra) {
    if (!confirm(`Excluir a regra "${r.nome}"?`)) return
    try {
      const res = await fetch(`/api/contabil/regras-exportacao/${r.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `Erro HTTP ${res.status}`)
      toast({ title: 'Regra removida' })
      await carregar()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: e instanceof Error ? e.message : String(e) })
    }
  }

  async function toggleAtiva(r: Regra) {
    try {
      const res = await fetch(`/api/contabil/regras-exportacao/${r.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativa: !r.ativa }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Erro HTTP ${res.status}`)
      await carregar()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: e instanceof Error ? e.message : String(e) })
    }
  }

  async function mover(r: Regra, direcao: -1 | 1) {
    // Troca `ordem` com o vizinho — mantém ordens densas e estáveis
    const idx = items.findIndex(x => x.id === r.id)
    const vizinho = items[idx + direcao]
    if (!vizinho) return
    try {
      // Faz os dois PATCH em paralelo
      await Promise.all([
        fetch(`/api/contabil/regras-exportacao/${r.id}`,        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordem: vizinho.ordem }) }),
        fetch(`/api/contabil/regras-exportacao/${vizinho.id}`,  { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordem: r.ordem }) }),
      ])
      await carregar()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao mover', description: e instanceof Error ? e.message : String(e) })
    }
  }

  const total   = items.length
  const ativas  = items.filter(r => r.ativa).length

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-xl bg-white border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-gray-800">Regras de transformação</p>
              <p className="text-[11.5px] text-gray-500">
                Sobrescrevem o conteúdo do CSV quando uma condição bate.
                Avaliadas em ordem, <strong>após</strong> o mapeamento de/para.
              </p>
            </div>
          </div>
          <button onClick={startNovo} disabled={editId !== null}
            className="h-9 px-3 rounded-md bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white text-[12.5px] font-semibold flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Nova regra
          </button>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-[11.5px] text-gray-500">
          <span>Total: <strong className="text-gray-800 tabular-nums">{total}</strong></span>
          <span>Ativas: <strong className="text-emerald-700 tabular-nums">{ativas}</strong></span>
          {total - ativas > 0 && <span>Inativas: <strong className="text-gray-500 tabular-nums">{total - ativas}</strong></span>}
        </div>
      </div>

      {/* Form (novo) no topo, antes da lista */}
      {editId === '__new' && (
        <FormRegra
          draft={draft} setDraft={setDraft}
          saving={saving} onSave={salvar} onCancel={cancelar}
        />
      )}

      {/* Lista */}
      {loading ? (
        <div className="rounded-xl bg-white border border-gray-200 p-10 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
        </div>
      ) : items.length === 0 && editId !== '__new' ? (
        <div className="rounded-xl bg-white border border-gray-200 p-10 text-center">
          <Wand2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-[12.5px] text-gray-500 mb-1">Nenhuma regra cadastrada</p>
          <p className="text-[11.5px] text-gray-400 mb-3">
            Use regras para casos como: <em>"SE conta_debitar começa com 2.1.1, usar a conta de provisão"</em>
          </p>
          <button onClick={startNovo}
            className="h-8 px-3 rounded bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-semibold inline-flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Criar primeira regra
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((r, idx) => editId === r.id ? (
            <li key={r.id}>
              <FormRegra
                draft={draft} setDraft={setDraft}
                saving={saving} onSave={salvar} onCancel={cancelar}
              />
            </li>
          ) : (
            <li key={r.id} className={cn(
              'rounded-xl bg-white border border-gray-200 p-3 flex items-center gap-3',
              !r.ativa && 'opacity-60',
            )}>
              {/* Ordem + setas */}
              <div className="flex flex-col items-center justify-center flex-shrink-0">
                <button onClick={() => mover(r, -1)} disabled={idx === 0 || editId !== null}
                  className="h-5 w-5 rounded text-gray-400 hover:bg-gray-100 disabled:text-gray-200 disabled:cursor-default flex items-center justify-center">
                  <ChevronUp className="w-3 h-3" />
                </button>
                <span className="text-[10px] tabular-nums text-gray-400 font-mono">{idx + 1}</span>
                <button onClick={() => mover(r, 1)} disabled={idx === items.length - 1 || editId !== null}
                  className="h-5 w-5 rounded text-gray-400 hover:bg-gray-100 disabled:text-gray-200 disabled:cursor-default flex items-center justify-center">
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              {/* Conteúdo */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-[12.5px] font-semibold text-gray-800">{r.nome}</h4>
                  <button onClick={() => toggleAtiva(r)} disabled={editId !== null}
                    className={cn(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold uppercase tracking-wide',
                      r.ativa
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                      editId !== null && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <Power className="w-2.5 h-2.5" /> {r.ativa ? 'Ativa' : 'Inativa'}
                  </button>
                </div>
                {r.descricao && <p className="text-[11px] text-gray-500 mb-1.5">{r.descricao}</p>}

                <div className="flex items-center flex-wrap gap-1 text-[11.5px]">
                  <span className="text-gray-400 uppercase text-[9.5px] tracking-wide font-semibold">SE</span>
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-800 rounded font-medium">{CAMPOS_COND_LABEL[r.condicao_campo]}</span>
                  <span className="text-gray-500">{OPERADORES_LABEL[r.condicao_operador]}</span>
                  <code className="px-1.5 py-0.5 bg-gray-100 text-gray-800 rounded font-mono">"{r.condicao_valor}"</code>
                  <ArrowRight className="w-3 h-3 text-violet-500 mx-1" />
                  <span className="text-gray-400 uppercase text-[9.5px] tracking-wide font-semibold">ENTÃO</span>
                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 rounded font-medium">{CAMPOS_ACAO_LABEL[r.acao_campo]}</span>
                  <span className="text-gray-500">=</span>
                  <code className="px-1.5 py-0.5 bg-violet-50 text-violet-800 rounded font-mono font-semibold">"{r.acao_valor}"</code>
                </div>
              </div>

              {/* Ações */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => startEditar(r)} disabled={editId !== null}
                  className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-violet-50 text-violet-600 disabled:text-gray-300 disabled:hover:bg-transparent"
                  title="Editar">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => excluir(r)} disabled={editId !== null}
                  className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-red-50 text-red-500 disabled:text-gray-300 disabled:hover:bg-transparent"
                  title="Excluir">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Form ─────────────────────────────────────────────────────────────────────
function FormRegra(props: {
  draft: Draft
  setDraft: (d: Draft) => void
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const { draft, setDraft, saving, onSave, onCancel } = props

  const exemploInicial = useMemo(() => {
    if (draft.condicao_campo === 'conta_debitar')  return '2.1.1'
    if (draft.condicao_campo === 'conta_creditar') return '1.1.001'
    return ''
  }, [draft.condicao_campo])

  return (
    <div className="rounded-xl bg-violet-50/30 border-2 border-violet-300 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Wand2 className="w-3.5 h-3.5 text-violet-600" />
        <p className="text-[12px] font-semibold text-violet-800 uppercase tracking-wide">
          {draft.nome ? 'Editar regra' : 'Nova regra'}
        </p>
      </div>

      {/* Nome + descrição */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-1">
          <label className="block text-[10.5px] uppercase tracking-wide text-violet-700 font-semibold mb-1">Nome*</label>
          <input type="text" autoFocus value={draft.nome}
            onChange={e => setDraft({ ...draft, nome: e.target.value })}
            placeholder="Ex.: Provisão de fornecedores"
            className="w-full h-8 px-2 border border-violet-300 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-violet-500" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10.5px] uppercase tracking-wide text-violet-700 font-semibold mb-1">Descrição (opcional)</label>
          <input type="text" value={draft.descricao}
            onChange={e => setDraft({ ...draft, descricao: e.target.value })}
            placeholder="O que essa regra resolve?"
            className="w-full h-8 px-2 border border-violet-300 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-violet-500" />
        </div>
      </div>

      {/* SE */}
      <div className="rounded-lg bg-blue-50/60 border border-blue-200 p-3">
        <p className="text-[10.5px] uppercase tracking-wide text-blue-700 font-bold mb-2">SE (condição)</p>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
          <div className="md:col-span-5">
            <label className="block text-[10.5px] text-blue-700 font-semibold mb-1">Campo</label>
            <select value={draft.condicao_campo}
              onChange={e => setDraft({ ...draft, condicao_campo: e.target.value as RegraCampoCondicao })}
              className="w-full h-8 px-2 border border-blue-300 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              {CAMPOS_COND_ENTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-[10.5px] text-blue-700 font-semibold mb-1">Operador</label>
            <select value={draft.condicao_operador}
              onChange={e => setDraft({ ...draft, condicao_operador: e.target.value as RegraOperador })}
              className="w-full h-8 px-2 border border-blue-300 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              {OPERADORES_ENTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="md:col-span-4">
            <label className="block text-[10.5px] text-blue-700 font-semibold mb-1">Valor*</label>
            <input type="text" value={draft.condicao_valor}
              onChange={e => setDraft({ ...draft, condicao_valor: e.target.value })}
              placeholder={exemploInicial ? `Ex.: ${exemploInicial}` : ''}
              className="w-full h-8 px-2 border border-blue-300 rounded text-[12px] font-mono bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
        <p className="text-[10.5px] text-blue-700/70 mt-2">
          A condição é avaliada sobre o <strong>valor original do AUTOSYSTEM</strong>, antes do mapeamento.
        </p>
      </div>

      {/* ENTÃO */}
      <div className="rounded-lg bg-amber-50/60 border border-amber-200 p-3">
        <p className="text-[10.5px] uppercase tracking-wide text-amber-700 font-bold mb-2">ENTÃO (ação)</p>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
          <div className="md:col-span-5">
            <label className="block text-[10.5px] text-amber-700 font-semibold mb-1">Substituir</label>
            <select value={draft.acao_campo}
              onChange={e => setDraft({ ...draft, acao_campo: e.target.value as RegraCampoAcao })}
              className="w-full h-8 px-2 border border-amber-300 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-amber-500">
              {CAMPOS_ACAO_ENTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="md:col-span-7">
            <label className="block text-[10.5px] text-amber-700 font-semibold mb-1">Por*</label>
            <input type="text" value={draft.acao_valor}
              onChange={e => setDraft({ ...draft, acao_valor: e.target.value })}
              placeholder={draft.acao_campo === 'observacao' ? 'Novo texto do histórico' : 'Código contábil (vai direto pro CSV)'}
              className="w-full h-8 px-2 border border-amber-300 rounded text-[12px] font-mono bg-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
        </div>
        <p className="text-[10.5px] text-amber-700/70 mt-2">
          O valor da ação é gravado no CSV <strong>tal qual</strong> — não passa mais pelo mapeamento de/para.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-violet-200">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={draft.ativa}
            onChange={e => setDraft({ ...draft, ativa: e.target.checked })}
            className="accent-emerald-500 w-3.5 h-3.5" />
          <span className="text-[11.5px] text-gray-700">Regra ativa</span>
        </label>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} disabled={saving}
            className="h-8 px-3 rounded border border-gray-300 text-[12px] font-medium text-gray-700 hover:bg-white flex items-center gap-1">
            <X className="w-3 h-3" /> Cancelar
          </button>
          <button onClick={onSave} disabled={saving}
            className="h-8 px-3 rounded bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white text-[12px] font-semibold flex items-center gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

