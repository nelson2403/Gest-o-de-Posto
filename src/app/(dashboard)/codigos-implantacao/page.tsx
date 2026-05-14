'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { DataTable } from '@/components/shared/DataTable'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PermissionGuard } from '@/components/layout/PermissionGuard'
import { CopyButton } from '@/components/shared/CopyButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { can } from '@/lib/utils/permissions'
import { Plus, Pencil, Trash2, Hash, Loader2, CreditCard } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { AdquirenteImplantacao, Adquirente, Posto, Role } from '@/types/database.types'

const ADQUIRENTE_COLORS: Record<string, string> = {
  Stone:     'bg-green-100 text-green-700',
  PagSeguro: 'bg-blue-100 text-blue-700',
  Cielo:     'bg-sky-100 text-sky-700',
  Rede:      'bg-red-100 text-red-700',
  Getnet:    'bg-purple-100 text-purple-700',
}

const EMPTY = { adquirente_id: '', posto_id: '', codigo: '', observacoes: '' }

export default function CodigosImplantacaoPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined

  const canManage = can(role ?? null, 'implantacao.edit')

  const [codigos,     setCodigos]     = useState<AdquirenteImplantacao[]>([])
  const [adquirentes, setAdquirentes] = useState<Adquirente[]>([])
  const [postos,      setPostos]      = useState<Posto[]>([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(false)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<AdquirenteImplantacao | null>(null)
  const [form, setForm] = useState(EMPTY)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('adquirentes_implantacao')
      .select('*, adquirente:adquirentes(id, nome), posto:postos(id, nome)')
      .order('adquirente_id')
    if (data) setCodigos(data as AdquirenteImplantacao[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('adquirentes').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setAdquirentes(data as Adquirente[]) })
    supabase.from('postos').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setPostos(data as Posto[]) })
  }, [])

  function openCreate() {
    setSelected(null)
    setForm(EMPTY)
    setOpenForm(true)
  }

  function openEdit(c: AdquirenteImplantacao) {
    setSelected(c)
    setForm({
      adquirente_id: c.adquirente_id,
      posto_id:      c.posto_id,
      codigo:        c.codigo,
      observacoes:   c.observacoes ?? '',
    })
    setOpenForm(true)
  }

  async function handleSave() {
    if (!form.adquirente_id) { toast({ variant: 'destructive', title: 'Selecione a adquirente' }); return }
    if (!form.posto_id)      { toast({ variant: 'destructive', title: 'Selecione o posto' }); return }
    if (!form.codigo.trim()) { toast({ variant: 'destructive', title: 'Código obrigatório' }); return }

    setSaving(true)
    const payload = {
      adquirente_id: form.adquirente_id,
      posto_id:      form.posto_id,
      codigo:        form.codigo.trim(),
      observacoes:   form.observacoes.trim() || null,
      empresa_id:    usuario?.empresa_id,
    }

    const { error } = selected
      ? await supabase.from('adquirentes_implantacao').update({
          codigo:      payload.codigo,
          observacoes: payload.observacoes,
        }).eq('id', selected.id)
      : await supabase.from('adquirentes_implantacao').insert(payload)

    if (error) {
      const msg = error.code === '23505'
        ? 'Já existe um código para esta adquirente neste posto.'
        : error.message
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: msg })
    } else {
      toast({ title: selected ? 'Código atualizado!' : 'Código criado!' })
      setOpenForm(false)
      load()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('adquirentes_implantacao').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message })
    } else {
      toast({ title: 'Código excluído!' })
      setOpenDelete(false)
      load()
    }
    setDeleting(false)
  }

  const columns: ColumnDef<AdquirenteImplantacao>[] = [
    {
      id: 'adquirente',
      header: 'Adquirente',
      accessorFn: (row) => row.adquirente?.nome ?? '—',
      cell: ({ row }) => {
        const nome = row.original.adquirente?.nome ?? '—'
        const cor  = ADQUIRENTE_COLORS[nome] ?? 'bg-gray-100 text-gray-600'
        return (
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${cor}`}>
              <CreditCard className="w-3.5 h-3.5" />
            </div>
            <span className="font-medium text-gray-900">{nome}</span>
          </div>
        )
      },
    },
    {
      id: 'posto',
      header: 'Posto',
      accessorFn: (row) => row.posto?.nome ?? '—',
      cell: ({ row }) => (
        <span className="text-[13px] text-gray-700">{row.original.posto?.nome ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'codigo',
      header: 'Código de Implantação',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <code className="text-[12px] font-mono bg-gray-100 text-gray-800 px-2 py-0.5 rounded">
            {row.original.codigo}
          </code>
          <CopyButton text={row.original.codigo} />
        </div>
      ),
    },
    {
      accessorKey: 'observacoes',
      header: 'Observações',
      cell: ({ row }) => (
        <span className="text-[12px] text-gray-500">{row.original.observacoes ?? '—'}</span>
      ),
    },
    {
      id: 'acoes',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1 justify-end">
          {canManage && (
            <>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                onClick={() => openEdit(row.original)}
                title="Editar"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                onClick={() => { setSelected(row.original); setOpenDelete(true) }}
                title="Excluir"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="animate-fade-in">
      <Header
        title="Códigos de Implantação"
        description="Código de implantação por adquirente e posto"
        actions={
          <PermissionGuard permission="implantacao.create">
            <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Novo Código
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-3 md:p-6">
        <DataTable
          columns={columns}
          data={codigos}
          loading={loading}
          searchPlaceholder="Buscar adquirente ou posto..."
        />
      </div>

      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-orange-500" />
              {selected ? 'Editar Código' : 'Novo Código de Implantação'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Adquirente *</Label>
              <Select
                value={form.adquirente_id}
                onValueChange={v => setForm(p => ({ ...p, adquirente_id: v }))}
                disabled={!!selected}
              >
                <SelectTrigger><SelectValue placeholder="Selecione a adquirente" /></SelectTrigger>
                <SelectContent>
                  {adquirentes.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Posto *</Label>
              <Select
                value={form.posto_id}
                onValueChange={v => setForm(p => ({ ...p, posto_id: v }))}
                disabled={!!selected}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o posto" /></SelectTrigger>
                <SelectContent>
                  {postos.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Código de Implantação *</Label>
              <Input
                value={form.codigo}
                onChange={e => setForm(p => ({ ...p, codigo: e.target.value }))}
                placeholder="Ex: 123456789"
                autoFocus={!!selected}
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                placeholder="Informações adicionais..."
                rows={2}
                className="resize-none"
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
        title="Excluir código de implantação"
        description={`Excluir o código "${selected?.codigo}" (${selected?.adquirente?.nome} — ${selected?.posto?.nome})?`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
