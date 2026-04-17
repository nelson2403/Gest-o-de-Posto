'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PermissionGuard } from '@/components/layout/PermissionGuard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { can } from '@/lib/utils/permissions'
import { Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronRight, CreditCard, Search } from 'lucide-react'
import type { Adquirente, AdquirenteFormaPagamento, Role } from '@/types/database.types'

type FormaRow = AdquirenteFormaPagamento & { adquirente?: { nome: string } }

export default function FormasPagamentoAdquirentePage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined
  const canEdit   = can(role ?? null, 'formas_pagamento.edit')
  const canDelete = can(role ?? null, 'formas_pagamento.delete')

  const [formas,      setFormas]      = useState<FormaRow[]>([])
  const [adquirentes, setAdquirentes] = useState<Adquirente[]>([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())
  const [busca,       setBusca]       = useState('')

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<FormaRow | null>(null)
  // adquirente_id fixo quando criando dentro de um bloco
  const [formAdqId,  setFormAdqId]  = useState<string | null>(null)
  const [formNome,   setFormNome]   = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('adquirente_formas_pagamento')
      .select('*, adquirente:adquirentes(id, nome)')
      .order('nome')
    if (data) {
      setFormas(data as FormaRow[])
      const ids = new Set((data as FormaRow[]).map(f => f.adquirente_id))
      setExpanded(ids)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('adquirentes').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setAdquirentes(data as Adquirente[]) })
  }, [])

  function toggleAdq(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openCreate(adquirenteId: string) {
    setSelected(null)
    setFormAdqId(adquirenteId)
    setFormNome('')
    setOpenForm(true)
  }

  function openEdit(f: FormaRow) {
    setSelected(f)
    setFormAdqId(f.adquirente_id)
    setFormNome(f.nome)
    setOpenForm(true)
  }

  async function handleSave() {
    if (!formNome.trim()) {
      toast({ variant: 'destructive', title: 'Nome é obrigatório' }); return
    }
    if (!formAdqId) return
    setSaving(true)

    const payload = { adquirente_id: formAdqId, nome: formNome.trim() }
    const { error } = selected
      ? await supabase.from('adquirente_formas_pagamento').update(payload).eq('id', selected.id)
      : await supabase.from('adquirente_formas_pagamento').insert(payload)

    if (error) {
      const msg = error.code === '23505'
        ? 'Já existe uma forma de pagamento com este nome para este adquirente'
        : error.message
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    } else {
      toast({ title: selected ? 'Forma de pagamento atualizada!' : 'Forma de pagamento criada!' })
      setOpenForm(false)
      load()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('adquirente_formas_pagamento').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message })
    } else {
      toast({ title: 'Forma de pagamento excluída!' })
      setOpenDelete(false)
      load()
    }
    setDeleting(false)
  }

  // Agrupa formas por adquirente
  const grouped = adquirentes.reduce<Record<string, { adq: Adquirente; items: FormaRow[] }>>((acc, adq) => {
    acc[adq.id] = { adq, items: [] }
    return acc
  }, {})
  for (const f of formas) {
    if (grouped[f.adquirente_id]) grouped[f.adquirente_id].items.push(f)
  }

  const sortedGroups = Object.values(grouped)
    .sort((a, b) => a.adq.nome.localeCompare(b.adq.nome))
    .filter(g => g.adq.nome.toLowerCase().includes(busca.toLowerCase()))

  const selectedAdqNome = adquirentes.find(a => a.id === formAdqId)?.nome ?? ''

  return (
    <div className="animate-fade-in">
      <Header
        title="Formas de Pagamento por Adquirente"
        description="Cadastre as bandeiras e modalidades de cada adquirente"
        actions={
          <PermissionGuard permission="formas_pagamento.create">
            <Button
              onClick={() => {
                setSelected(null)
                setFormAdqId(adquirentes[0]?.id ?? null)
                setFormNome('')
                setOpenForm(true)
              }}
              className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Forma
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-6 space-y-3">
        {/* Busca */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar adquirente..."
            className="pl-9 h-9 text-[13px]"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-[13px]">Carregando...</span>
          </div>
        ) : sortedGroups.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-[13px]">
            {busca ? `Nenhum adquirente encontrado para "${busca}".` : 'Nenhum adquirente cadastrado.'}
          </div>
        ) : (
          sortedGroups.map(({ adq, items }) => {
            const isOpen = expanded.has(adq.id)
            return (
              <div key={adq.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                {/* Header do adquirente */}
                <div className="flex items-center gap-3 px-5 py-4 bg-gray-50">
                  <button
                    onClick={() => toggleAdq(adq.id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                  >
                    <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-4 h-4 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-[14px] text-gray-800">{adq.nome}</span>
                      <span className="ml-2 text-[12px] text-gray-400">
                        {items.length} {items.length === 1 ? 'forma' : 'formas'}
                      </span>
                    </div>
                    {isOpen
                      ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                  </button>
                  <PermissionGuard permission="formas_pagamento.create">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-[12px] text-gray-500 hover:text-orange-600 hover:bg-orange-50 gap-1"
                      onClick={() => openCreate(adq.id)}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar
                    </Button>
                  </PermissionGuard>
                </div>

                {/* Lista de formas */}
                {isOpen && (
                  <div className="divide-y divide-gray-100">
                    {items.length === 0 ? (
                      <div className="px-5 py-6 text-center text-[13px] text-gray-400">
                        Nenhuma forma de pagamento cadastrada para este adquirente.
                      </div>
                    ) : (
                      items.map(f => (
                        <div key={f.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/50">
                          <div className="flex-1 min-w-0">
                            <span className="text-[13px] font-medium text-gray-800">{f.nome}</span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {canEdit && (
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                onClick={() => openEdit(f)}
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => { setSelected(f); setOpenDelete(true) }}
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Modal criar/editar */}
      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {!selected && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Adquirente</Label>
                <select
                  value={formAdqId ?? ''}
                  onChange={e => setFormAdqId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                >
                  {adquirentes.map(a => (
                    <option key={a.id} value={a.id}>{a.nome}</option>
                  ))}
                </select>
              </div>
            )}
            {selected && (
              <div className="px-3 py-2 bg-gray-50 rounded-lg text-[12px] text-gray-600">
                Adquirente: <strong>{selectedAdqNome}</strong>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Nome da Forma de Pagamento *</Label>
              <Input
                value={formNome}
                onChange={e => setFormNome(e.target.value)}
                placeholder="Ex: Visa, Mastercard, Elo, Alimentação..."
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              />
              <p className="text-[11px] text-gray-400">Ex: Visa Crédito, Master Débito, VR Alimentação</p>
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
        title="Excluir forma de pagamento"
        description={`Excluir "${selected?.nome}"? As taxas vinculadas a ela perderão a referência.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
