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
import { Plus, Pencil, Trash2, ExternalLink, Loader2, Globe } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Portal, Empresa, Role } from '@/types/database.types'

const EMPTY = { nome: '', url: '', empresa_id: '', ativo: true }

export default function PortaisPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined

  const [portais,  setPortais]  = useState<Portal[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<Portal | null>(null)
  const [form, setForm] = useState(EMPTY)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('portais')
      .select('*, empresa:empresas(id, nome)')
      .order('nome')
    if (data) setPortais(data as Portal[])
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
    setForm({ ...EMPTY, empresa_id: usuario?.empresa_id ?? '' })
    setOpenForm(true)
  }

  function openEdit(p: Portal) {
    setSelected(p)
    setForm({ nome: p.nome, url: p.url ?? '', empresa_id: p.empresa_id, ativo: p.ativo })
    setOpenForm(true)
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast({ variant: 'destructive', title: 'Nome obrigatório' }); return }
    setSaving(true)
    const payload = {
      nome: form.nome.trim(),
      url: form.url || null,
      empresa_id: form.empresa_id || usuario?.empresa_id,
      ativo: form.ativo,
    }
    const { error } = selected
      ? await supabase.from('portais').update(payload).eq('id', selected.id)
      : await supabase.from('portais').insert(payload)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
    } else {
      toast({ title: selected ? 'Portal atualizado!' : 'Portal criado!' })
      setOpenForm(false); load()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('portais').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message })
    } else {
      toast({ title: 'Portal excluído!' }); setOpenDelete(false); load()
    }
    setDeleting(false)
  }

  const columns: ColumnDef<Portal>[] = [
    {
      accessorKey: 'nome',
      header: 'Portal',
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Globe className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <span className="font-medium text-gray-900">{row.original.nome}</span>
        </div>
      ),
    },
    {
      accessorKey: 'url',
      header: 'URL',
      cell: ({ row }) => row.original.url ? (
        <a
          href={row.original.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline text-[12px]"
          onClick={e => e.stopPropagation()}
        >
          <span className="max-w-[180px] truncate">{row.original.url.replace(/^https?:\/\//, '').split('/')[0]}</span>
          <ExternalLink className="w-3 h-3 flex-shrink-0" />
        </a>
      ) : <span className="text-gray-400">—</span>,
    },
    ...(role === 'master' ? [{
      id: 'empresa',
      header: 'Empresa',
      accessorFn: (row: Portal) => (row as Portal & { empresa?: { nome: string } }).empresa?.nome ?? '—',
    } as ColumnDef<Portal>] : []),
    {
      accessorKey: 'ativo',
      header: 'Status',
      cell: ({ row }) => <AtivoInativoBadge ativo={row.original.ativo} />,
    },
    {
      id: 'acoes',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1 justify-end">
          {can(role ?? null, 'portais.edit') && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => openEdit(row.original)} title="Editar">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          {can(role ?? null, 'portais.delete') && (
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
        title="Portais"
        description="Portais de acesso cadastrados"
        actions={
          <PermissionGuard permission="portais.create">
            <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Novo Portal
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-3 md:p-6">
        <DataTable
          columns={columns}
          data={portais}
          loading={loading}
          searchPlaceholder="Buscar por nome, URL..."
        />
      </div>

      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar Portal' : 'Novo Portal'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Nome *</Label>
              <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Nome do portal" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">URL</Label>
              <Input type="url" value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="https://..." />
            </div>
            {role === 'master' && !selected && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Empresa</Label>
                <Select value={form.empresa_id} onValueChange={v => setForm(p => ({ ...p, empresa_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                  <SelectContent>{empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Status</Label>
              <Select value={form.ativo ? 'ativo' : 'inativo'} onValueChange={v => setForm(p => ({ ...p, ativo: v === 'ativo' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
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
        title="Excluir portal"
        description={`Excluir "${selected?.nome}"? Os acessos vinculados a este portal também serão afetados.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
