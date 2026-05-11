'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { DataTable } from '@/components/shared/DataTable'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PermissionGuard } from '@/components/layout/PermissionGuard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { can } from '@/lib/utils/permissions'
import { formatPercent } from '@/lib/utils/formatters'
import { Plus, Pencil, Trash2, Loader2, Percent, Search, X } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Taxa, Posto, Adquirente, AdquirenteFormaPagamento, AbrangenciaTaxa, Role } from '@/types/database.types'

const ABRANGENCIA_LABELS: Record<AbrangenciaTaxa, string> = {
  posto_especifico: 'Posto Específico',
  todos_postos: 'Todos os Postos',
  multiplos_postos: 'Múltiplos Postos',
}

const ABRANGENCIA_COLORS: Record<AbrangenciaTaxa, string> = {
  posto_especifico: 'bg-blue-100 text-blue-700',
  todos_postos: 'bg-green-100 text-green-700',
  multiplos_postos: 'bg-purple-100 text-purple-700',
}

type TaxaRow = Taxa & {
  posto?: { id: string; nome: string }
  adquirente?: { id: string; nome: string }
  forma_pagamento?: { id: string; nome: string }
  taxa_postos?: { posto_id: string; posto?: { id: string; nome: string } }[]
}

const EMPTY_FORM = {
  adquirente_id: '',
  forma_pagamento_id: '',
  todos_postos: false,
  postos_ids: [] as string[],
  taxa_debito: '',
  taxa_credito: '',
  taxa_credito_parcelado: '',
  observacoes: '',
}

function calcAbrangencia(todos: boolean, ids: string[]): AbrangenciaTaxa {
  if (todos) return 'todos_postos'
  if (ids.length === 1) return 'posto_especifico'
  return 'multiplos_postos'
}

export default function TaxasPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined

  const [taxas,       setTaxas]       = useState<TaxaRow[]>([])
  const [postos,      setPostos]      = useState<Posto[]>([])
  const [adquirentes, setAdquirentes] = useState<Adquirente[]>([])
  const [formas,      setFormas]      = useState<AdquirenteFormaPagamento[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<TaxaRow | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [buscaPosto, setBuscaPosto] = useState('')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('taxas')
      .select(`
        *,
        posto:posto_id(id, nome),
        adquirente:adquirente_id(id, nome),
        forma_pagamento:forma_pagamento_id(id, nome),
        taxa_postos(posto_id, posto:posto_id(id, nome))
      `)
      .order('criado_em', { ascending: false })
    if (error) toast({ variant: 'destructive', title: 'Erro ao carregar taxas', description: error.message })
    setTaxas((data ?? []) as TaxaRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('postos').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setPostos(data as Posto[]) })
    supabase.from('adquirentes').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setAdquirentes(data as Adquirente[]) })
    supabase.from('adquirente_formas_pagamento').select('id, adquirente_id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setFormas(data as AdquirenteFormaPagamento[]) })
  }, [])

  const formasFiltradas = useMemo(
    () => formas.filter(f => f.adquirente_id === form.adquirente_id),
    [formas, form.adquirente_id]
  )

  function setField<K extends keyof typeof EMPTY_FORM>(key: K, value: typeof EMPTY_FORM[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleAdquirenteChange(id: string) {
    setForm(prev => ({ ...prev, adquirente_id: id, forma_pagamento_id: '' }))
  }

  function togglePostoId(postoId: string) {
    setForm(prev => {
      const already = prev.postos_ids.includes(postoId)
      return {
        ...prev,
        postos_ids: already
          ? prev.postos_ids.filter(id => id !== postoId)
          : [...prev.postos_ids, postoId],
      }
    })
  }

  function openCreate() {
    setSelected(null)
    setForm(EMPTY_FORM)
    setBuscaPosto('')
    setOpenForm(true)
  }

  function openEdit(t: TaxaRow) {
    setSelected(t)
    const isTodos = t.abrangencia === 'todos_postos'
    const postos_ids = isTodos
      ? []
      : t.abrangencia === 'posto_especifico'
        ? (t.posto_id ? [t.posto_id] : [])
        : (t.taxa_postos?.map(tp => tp.posto_id) ?? [])
    setForm({
      adquirente_id: t.adquirente_id,
      forma_pagamento_id: t.forma_pagamento_id ?? '',
      todos_postos: isTodos,
      postos_ids,
      taxa_debito: t.taxa_debito != null ? String(t.taxa_debito) : '',
      taxa_credito: t.taxa_credito != null ? String(t.taxa_credito) : '',
      taxa_credito_parcelado: t.taxa_credito_parcelado != null ? String(t.taxa_credito_parcelado) : '',
      observacoes: t.observacoes ?? '',
    })
    setBuscaPosto('')
    setOpenForm(true)
  }

  async function handleSave() {
    if (!form.adquirente_id) {
      toast({ variant: 'destructive', title: 'Adquirente é obrigatório' }); return
    }
    if (!form.forma_pagamento_id) {
      toast({ variant: 'destructive', title: 'Forma de pagamento é obrigatória' }); return
    }
    if (!form.todos_postos && form.postos_ids.length === 0) {
      toast({ variant: 'destructive', title: 'Selecione ao menos um posto' }); return
    }

    setSaving(true)

    const abrangencia = calcAbrangencia(form.todos_postos, form.postos_ids)
    const payload = {
      adquirente_id: form.adquirente_id,
      forma_pagamento_id: form.forma_pagamento_id || null,
      abrangencia,
      posto_id: abrangencia === 'posto_especifico' ? form.postos_ids[0] : null,
      taxa_debito: form.taxa_debito ? parseFloat(form.taxa_debito) : null,
      taxa_credito: form.taxa_credito ? parseFloat(form.taxa_credito) : null,
      taxa_credito_parcelado: form.taxa_credito_parcelado ? parseFloat(form.taxa_credito_parcelado) : null,
      observacoes: form.observacoes || null,
    }

    let taxaId: string | null = selected?.id ?? null

    if (selected) {
      const { error } = await supabase.from('taxas').update(payload).eq('id', selected.id)
      if (error) {
        toast({ variant: 'destructive', title: 'Erro', description: error.message })
        setSaving(false); return
      }
    } else {
      const { data, error } = await supabase.from('taxas').insert(payload).select('id').single()
      if (error || !data) {
        toast({ variant: 'destructive', title: 'Erro', description: error?.message })
        setSaving(false); return
      }
      taxaId = data.id
    }

    // Gerencia taxa_postos para abrangência múltipla
    if (taxaId) {
      await supabase.from('taxa_postos').delete().eq('taxa_id', taxaId)
      if (abrangencia === 'multiplos_postos' && form.postos_ids.length > 0) {
        await supabase.from('taxa_postos').insert(
          form.postos_ids.map(postoId => ({ taxa_id: taxaId!, posto_id: postoId }))
        )
      }
    }

    toast({ title: selected ? 'Taxa atualizada!' : 'Taxa criada!' })
    setOpenForm(false)
    load()
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('taxas').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message })
    } else {
      toast({ title: 'Taxa excluída!' }); setOpenDelete(false); load()
    }
    setDeleting(false)
  }

  function postoDisplay(t: TaxaRow): string {
    if (t.abrangencia === 'todos_postos') return 'Todos os postos'
    if (t.abrangencia === 'multiplos_postos') {
      const nomes = t.taxa_postos?.map(tp => tp.posto?.nome).filter(Boolean) ?? []
      return nomes.length > 0 ? nomes.join(', ') : '—'
    }
    return t.posto?.nome ?? '—'
  }

  const columns: ColumnDef<TaxaRow>[] = [
    {
      id: 'adquirente',
      header: 'Adquirente',
      accessorFn: row => row.adquirente?.nome ?? '—',
      cell: ({ getValue }) => <span className="font-medium text-[13px]">{getValue() as string}</span>,
    },
    {
      id: 'forma_pagamento',
      header: 'Forma de Pagamento',
      accessorFn: row => row.forma_pagamento?.nome ?? '—',
      cell: ({ getValue }) => <span className="text-[13px]">{getValue() as string}</span>,
    },
    {
      id: 'abrangencia',
      header: 'Abrangência',
      accessorFn: row => row.abrangencia ?? 'posto_especifico',
      cell: ({ row }) => {
        const abr = (row.original.abrangencia ?? 'posto_especifico') as AbrangenciaTaxa
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${ABRANGENCIA_COLORS[abr]}`}>
            {ABRANGENCIA_LABELS[abr]}
          </span>
        )
      },
    },
    {
      id: 'posto',
      header: 'Posto(s)',
      accessorFn: row => postoDisplay(row),
      cell: ({ getValue }) => (
        <span className="text-[12px] text-gray-600 max-w-[180px] truncate block" title={getValue() as string}>
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: 'taxa_debito',
      header: 'Débito',
      cell: ({ row }) => <span className="font-mono text-[13px] font-medium">{formatPercent(row.original.taxa_debito)}</span>,
    },
    {
      accessorKey: 'taxa_credito',
      header: 'Crédito',
      cell: ({ row }) => <span className="font-mono text-[13px] font-medium">{formatPercent(row.original.taxa_credito)}</span>,
    },
    {
      accessorKey: 'taxa_credito_parcelado',
      header: 'Créd. Parcelado',
      cell: ({ row }) => <span className="font-mono text-[13px] font-medium">{formatPercent(row.original.taxa_credito_parcelado)}</span>,
    },
    {
      id: 'acoes',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1 justify-end">
          {can(role ?? null, 'taxas.edit') && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => openEdit(row.original)} title="Editar">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          {can(role ?? null, 'taxas.delete') && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50" onClick={() => { setSelected(row.original); setOpenDelete(true) }} title="Excluir">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="animate-fade-in">
      <Header
        title="Taxas"
        description="Taxas por adquirente, forma de pagamento e abrangência"
        actions={
          <PermissionGuard permission="taxas.create">
            <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Nova Taxa
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-3 md:p-6">
        <DataTable
          columns={columns}
          data={taxas}
          loading={loading}
          searchPlaceholder="Buscar por adquirente, forma de pagamento..."
        />
      </div>

      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <Percent className="w-4 h-4 text-green-600" />
              </div>
              <DialogTitle>{selected ? 'Editar Taxa' : 'Nova Taxa'}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* Adquirente */}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Adquirente *</Label>
              <Select
                value={form.adquirente_id}
                onValueChange={handleAdquirenteChange}
                disabled={!!selected}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o adquirente" /></SelectTrigger>
                <SelectContent>
                  {adquirentes.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Forma de Pagamento */}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Forma de Pagamento *</Label>
              <Select
                value={form.forma_pagamento_id}
                onValueChange={v => setField('forma_pagamento_id', v)}
                disabled={!form.adquirente_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder={form.adquirente_id ? 'Selecione a forma de pagamento' : 'Selecione um adquirente primeiro'} />
                </SelectTrigger>
                <SelectContent>
                  {formasFiltradas.length === 0
                    ? <div className="px-3 py-2 text-[12px] text-gray-400">Nenhuma forma cadastrada para este adquirente</div>
                    : formasFiltradas.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>

            {/* Postos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[12px] font-medium text-gray-600">
                  Postos *
                  {!form.todos_postos && form.postos_ids.length > 0 && (
                    <span className="ml-1.5 font-normal text-orange-500">
                      {form.postos_ids.length} selecionado{form.postos_ids.length > 1 ? 's' : ''}
                    </span>
                  )}
                </Label>
                {/* Todos os postos toggle */}
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.todos_postos}
                    onChange={e => setForm(prev => ({ ...prev, todos_postos: e.target.checked, postos_ids: [] }))}
                    className="rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                  />
                  <span className="text-[12px] text-gray-500">Todos os postos</span>
                </label>
              </div>

              {!form.todos_postos && (
                <>
                  {/* Busca */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      value={buscaPosto}
                      onChange={e => setBuscaPosto(e.target.value)}
                      placeholder="Buscar posto..."
                      className="w-full h-8 pl-8 pr-8 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                    {buscaPosto && (
                      <button onClick={() => setBuscaPosto('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Lista com checkboxes */}
                  <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                    {postos
                      .filter(p => p.nome.toLowerCase().includes(buscaPosto.toLowerCase()))
                      .map(p => (
                        <label key={p.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-orange-50/40 transition-colors ${form.postos_ids.includes(p.id) ? 'bg-orange-50/60' : ''}`}>
                          <input
                            type="checkbox"
                            checked={form.postos_ids.includes(p.id)}
                            onChange={() => togglePostoId(p.id)}
                            className="rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                          />
                          <span className="text-[13px] text-gray-700">{p.nome}</span>
                        </label>
                      ))
                    }
                    {postos.filter(p => p.nome.toLowerCase().includes(buscaPosto.toLowerCase())).length === 0 && (
                      <p className="px-3 py-3 text-[12px] text-gray-400 text-center">Nenhum posto encontrado</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Taxas */}
            <div>
              <p className="text-[12px] font-medium text-gray-600 mb-2">Taxas (%)</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { field: 'taxa_debito' as const, label: 'Débito' },
                  { field: 'taxa_credito' as const, label: 'Crédito' },
                  { field: 'taxa_credito_parcelado' as const, label: 'Parcelado' },
                ].map(({ field, label }) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-[11px] text-gray-500">{label}</Label>
                    <div className="relative">
                      <Input
                        type="number" step="0.01" min="0" max="100"
                        value={form[field]}
                        onChange={e => setField(field, e.target.value)}
                        placeholder="0,00"
                        className="pr-6 font-mono text-[13px]"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={e => setField('observacoes', e.target.value)}
                rows={2}
                placeholder="Notas adicionais..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-orange-500 hover:bg-orange-600 min-w-[90px]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : selected ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={openDelete}
        onOpenChange={open => { if (!deleting) setOpenDelete(open) }}
        title="Excluir taxa"
        description={`Excluir a taxa de "${selected?.adquirente?.nome ?? '—'}" / "${selected?.forma_pagamento?.nome ?? '—'}"?`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
