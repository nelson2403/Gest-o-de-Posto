'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { DataTable } from '@/components/shared/DataTable'
import { PasswordReveal } from '@/components/shared/PasswordReveal'
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
import { Plus, Pencil, Trash2, Monitor, Loader2 } from 'lucide-react'
import { CopyButton } from '@/components/shared/CopyButton'
import type { ColumnDef } from '@tanstack/react-table'
import type { AcessoAnydesk, Posto, Role } from '@/types/database.types'

const EMPTY = { posto_id: '', numero_anydesk: '', senha: '', observacoes: '' }

export default function AcessosAnyDeskPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined
  const canManage  = can(role ?? null, 'anydesk.edit')
  const canReveal  = can(role ?? null, 'anydesk.view')

  const [acessos,  setAcessos]  = useState<AcessoAnydesk[]>([])
  const [postos,   setPostos]   = useState<Posto[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<AcessoAnydesk | null>(null)
  const [form, setForm] = useState(EMPTY)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('acessos_anydesk')
      .select('*, posto:postos(id, nome)')
      .order('criado_em', { ascending: false })
    if (data) setAcessos(data as AcessoAnydesk[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('postos').select('id, nome').order('nome').then(({ data }) => { if (data) setPostos(data as Posto[]) })
  }, [])

  function openCreate() { setSelected(null); setForm(EMPTY); setOpenForm(true) }

  function openEdit(a: AcessoAnydesk) {
    setSelected(a)
    setForm({ posto_id: a.posto_id, numero_anydesk: a.numero_anydesk, senha: a.senha ?? '', observacoes: a.observacoes ?? '' })
    setOpenForm(true)
  }

  async function handleSave() {
    if (!form.posto_id || !form.numero_anydesk.trim()) {
      toast({ variant: 'destructive', title: 'Posto e número AnyDesk são obrigatórios' }); return
    }
    setSaving(true)
    const payload = { posto_id: form.posto_id, numero_anydesk: form.numero_anydesk, senha: form.senha || null, observacoes: form.observacoes || null }
    const { error } = selected
      ? await supabase.from('acessos_anydesk').update(payload).eq('id', selected.id)
      : await supabase.from('acessos_anydesk').insert(payload)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
    } else {
      toast({ title: selected ? 'AnyDesk atualizado!' : 'AnyDesk criado!' })
      setOpenForm(false); load()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('acessos_anydesk').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message })
    } else {
      toast({ title: 'AnyDesk excluído!' }); setOpenDelete(false); load()
    }
    setDeleting(false)
  }

  type Row = AcessoAnydesk & { posto?: { nome: string } }

  const columns: ColumnDef<Row>[] = [
    {
      id: 'posto',
      header: 'Posto',
      accessorFn: (row: Row) => row.posto?.nome ?? '—',
      cell: ({ row }) => <span className="font-medium text-[13px]">{row.original.posto?.nome ?? '—'}</span>,
    },
    {
      accessorKey: 'numero_anydesk',
      header: 'Número AnyDesk',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Monitor className="w-3 h-3 text-blue-600" />
          </div>
          <span className="font-mono text-[15px] font-bold tracking-widest text-gray-800">
            {row.original.numero_anydesk}
          </span>
          <CopyButton text={row.original.numero_anydesk} title="Copiar número AnyDesk" />
        </div>
      ),
    },
    {
      accessorKey: 'senha',
      header: 'Senha',
      cell: ({ row }) => <PasswordReveal value={row.original.senha} canReveal={canReveal} />,
    },
    {
      accessorKey: 'observacoes',
      header: 'Observações',
      cell: ({ row }) => row.original.observacoes
        ? <span className="text-[12px] text-gray-500 max-w-[180px] truncate block">{row.original.observacoes}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      id: 'acoes',
      header: '',
      cell: ({ row }) => {
        const r = row.original
        const parts = [
          `Posto: ${r.posto?.nome ?? '—'}`,
          `AnyDesk: ${r.numero_anydesk}`,
          ...(canReveal && r.senha ? [`Senha: ${r.senha}`] : []),
          ...(r.observacoes ? [`Obs: ${r.observacoes}`] : []),
        ]
        return (
          <div className="flex items-center gap-1 justify-end">
            <CopyButton text={parts.join('\n')} title="Copiar todas as informações" size="default" />
            {canManage && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => openEdit(row.original)} title="Editar">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                {can(role ?? null, 'anydesk.delete') && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50" onClick={() => { setSelected(row.original); setOpenDelete(true) }} title="Excluir">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="animate-fade-in">
      <Header
        title="Acessos AnyDesk"
        description="Acesso remoto via AnyDesk por posto"
        actions={
          <PermissionGuard permission="anydesk.create">
            <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Novo AnyDesk
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-3 md:p-6">
        <DataTable
          columns={columns}
          data={acessos}
          loading={loading}
          searchPlaceholder="Buscar por posto, número AnyDesk..."
        />
      </div>

      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Monitor className="w-4 h-4 text-indigo-600" />
              </div>
              <DialogTitle>{selected ? 'Editar AnyDesk' : 'Novo AnyDesk'}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Posto *</Label>
              <Select value={form.posto_id} onValueChange={v => setForm(p => ({ ...p, posto_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o posto" /></SelectTrigger>
                <SelectContent>{postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Número AnyDesk *</Label>
              <Input
                value={form.numero_anydesk}
                onChange={e => setForm(p => ({ ...p, numero_anydesk: e.target.value }))}
                placeholder="Ex: 123 456 789"
                className="font-mono text-[16px] tracking-widest"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Senha</Label>
              <Input type="password" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} placeholder="Notas opcionais..." />
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
        title="Excluir AnyDesk"
        description={`Excluir o AnyDesk "${selected?.numero_anydesk}"?`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
