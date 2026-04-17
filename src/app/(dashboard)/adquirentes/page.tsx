'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { DataTable } from '@/components/shared/DataTable'
import { AtivoInativoBadge } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PermissionGuard } from '@/components/layout/PermissionGuard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { can } from '@/lib/utils/permissions'
import { formatDate } from '@/lib/utils/formatters'
import { Plus, Pencil, Trash2, Zap, Loader2, CreditCard } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Adquirente, Empresa, Role } from '@/types/database.types'

const ADQUIRENTES_PADRAO = ['Stone', 'PagSeguro', 'Cielo', 'Rede', 'Getnet']

const ADQUIRENTE_COLORS: Record<string, string> = {
  Stone:     'bg-green-100 text-green-700',
  PagSeguro: 'bg-blue-100 text-blue-700',
  Cielo:     'bg-sky-100 text-sky-700',
  Rede:      'bg-red-100 text-red-700',
  Getnet:    'bg-purple-100 text-purple-700',
}

export default function AdquirentesPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined

  const [adquirentes,  setAdquirentes]  = useState<Adquirente[]>([])
  const [empresas,     setEmpresas]     = useState<Empresa[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState(false)
  const [addingPadrao, setAddingPadrao] = useState(false)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<Adquirente | null>(null)
  const [form, setForm] = useState({ nome: '', empresa_id: '' })

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('adquirentes')
      .select('*, empresa:empresas(id, nome)')
      .order('nome')
    if (data) setAdquirentes(data as Adquirente[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    if (role === 'master') {
      supabase.from('empresas').select('id, nome').order('nome').then(({ data }) => {
        if (data) setEmpresas(data as Empresa[])
      })
    }
  }, [role])

  function openCreate() {
    setSelected(null)
    setForm({ nome: '', empresa_id: usuario?.empresa_id ?? '' })
    setOpenForm(true)
  }

  function openEdit(a: Adquirente) {
    setSelected(a)
    setForm({ nome: a.nome, empresa_id: a.empresa_id })
    setOpenForm(true)
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast({ variant: 'destructive', title: 'Nome obrigatório' }); return }
    setSaving(true)
    const { error } = selected
      ? await supabase.from('adquirentes').update({ nome: form.nome.trim() }).eq('id', selected.id)
      : await supabase.from('adquirentes').insert({
          nome: form.nome.trim(),
          empresa_id: form.empresa_id || usuario?.empresa_id,
        })
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
    } else {
      toast({ title: selected ? 'Adquirente atualizada!' : 'Adquirente criada!' })
      setOpenForm(false)
      load()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('adquirentes').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message })
    } else {
      toast({ title: 'Adquirente excluída!' })
      setOpenDelete(false)
      load()
    }
    setDeleting(false)
  }

  async function handleAddPadrao() {
    const empresaId = usuario?.empresa_id
    if (!empresaId) { toast({ variant: 'destructive', title: 'Empresa não identificada' }); return }
    setAddingPadrao(true)
    const { error } = await supabase
      .from('adquirentes')
      .upsert(
        ADQUIRENTES_PADRAO.map(nome => ({ nome, empresa_id: empresaId })),
        { onConflict: 'empresa_id,nome', ignoreDuplicates: true }
      )
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message })
    } else {
      toast({ title: 'Adquirentes padrão adicionadas!' })
      load()
    }
    setAddingPadrao(false)
  }

  const columns: ColumnDef<Adquirente>[] = [
    {
      accessorKey: 'nome',
      header: 'Adquirente',
      cell: ({ row }) => {
        const cor = ADQUIRENTE_COLORS[row.original.nome] ?? 'bg-gray-100 text-gray-600'
        return (
          <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${cor}`}>
              <CreditCard className="w-3.5 h-3.5" />
            </div>
            <span className="font-medium text-gray-900">{row.original.nome}</span>
          </div>
        )
      },
    },
    ...(role === 'master' ? [{
      id: 'empresa',
      header: 'Empresa',
      accessorFn: (row: Adquirente) => (row as { empresa?: { nome: string } }).empresa?.nome ?? '—',
    } as ColumnDef<Adquirente>] : []),
    {
      accessorKey: 'ativo',
      header: 'Status',
      cell: ({ row }) => <AtivoInativoBadge ativo={row.original.ativo} />,
    },
    {
      accessorKey: 'criado_em',
      header: 'Criado em',
      cell: ({ row }) => <span className="text-[12px] text-gray-500">{formatDate(row.original.criado_em)}</span>,
    },
    {
      id: 'acoes',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1 justify-end">
          {can(role ?? null, 'adquirentes.edit') && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => openEdit(row.original)} title="Editar">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          {can(role ?? null, 'adquirentes.delete') && (
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
        title="Adquirentes"
        description="Gerencie as adquirentes de cartão cadastradas"
        actions={
          <PermissionGuard permission="adquirentes.create">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-9 text-[13px] gap-1.5 border-dashed"
                onClick={handleAddPadrao}
                disabled={addingPadrao}
              >
                {addingPadrao ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Adicionar padrão
              </Button>
              <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Nova Adquirente
              </Button>
            </div>
          </PermissionGuard>
        }
      />

      <div className="p-3 md:p-6">
        <DataTable
          columns={columns}
          data={adquirentes}
          loading={loading}
          searchPlaceholder="Buscar adquirente..."
        />
      </div>

      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar Adquirente' : 'Nova Adquirente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Nome *</Label>
              <Input
                value={form.nome}
                onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Stone, PagSeguro, Cielo..."
                autoFocus
              />
              {!selected && (
                <p className="text-[11px] text-gray-400">Sugestões: {ADQUIRENTES_PADRAO.join(', ')}</p>
              )}
            </div>
            {role === 'master' && !selected && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Empresa</Label>
                <Select value={form.empresa_id} onValueChange={v => setForm(p => ({ ...p, empresa_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                  <SelectContent>
                    {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
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
        title="Excluir adquirente"
        description={`Excluir "${selected?.nome}"? As maquininhas e taxas vinculadas a esta adquirente também serão afetadas.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
