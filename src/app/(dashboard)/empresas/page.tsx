'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { DataTable } from '@/components/shared/DataTable'
import { StatusEmpresaBadge } from '@/components/shared/StatusBadge'
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
import { formatDate, formatCNPJ } from '@/lib/utils/formatters'
import { Plus, Pencil, Trash2, Loader2, Building2 } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Empresa, StatusEmpresa, Role } from '@/types/database.types'

const EMPTY_FORM = { nome: '', cnpj: '', email: '', status: 'ativo' as StatusEmpresa }

export default function EmpresasPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined

  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<Empresa | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('empresas').select('*').order('nome')
    if (!error) setEmpresas(data as Empresa[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setSelected(null)
    setForm(EMPTY_FORM)
    setOpenForm(true)
  }

  function openEdit(e: Empresa) {
    setSelected(e)
    setForm({ nome: e.nome, cnpj: e.cnpj ?? '', email: e.email ?? '', status: e.status })
    setOpenForm(true)
  }

  async function handleSave() {
    if (!form.nome.trim()) {
      toast({ variant: 'destructive', title: 'Nome obrigatório' })
      return
    }
    setSaving(true)
    const payload = {
      nome: form.nome.trim(),
      cnpj: form.cnpj || null,
      email: form.email || null,
      status: form.status,
    }
    const { error } = selected
      ? await supabase.from('empresas').update(payload).eq('id', selected.id)
      : await supabase.from('empresas').insert(payload)

    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
    } else {
      toast({ title: selected ? 'Empresa atualizada!' : 'Empresa criada!' })
      setOpenForm(false)
      load()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('empresas').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message })
    } else {
      toast({ title: 'Empresa excluída!' })
      setOpenDelete(false)
      load()
    }
    setDeleting(false)
  }

  const columns: ColumnDef<Empresa>[] = [
    {
      accessorKey: 'nome',
      header: 'Nome',
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-3.5 h-3.5 text-orange-600" />
          </div>
          <span className="font-medium text-gray-900">{row.original.nome}</span>
        </div>
      ),
    },
    {
      accessorKey: 'cnpj',
      header: 'CNPJ',
      cell: ({ row }) => row.original.cnpj
        ? <span className="font-mono text-[12px]">{formatCNPJ(row.original.cnpj)}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => row.original.email
        ? <span className="text-[13px]">{row.original.email}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusEmpresaBadge status={row.original.status} />,
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
          {can(role ?? null, 'empresas.edit') && (
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
              onClick={() => openEdit(row.original)}
              title="Editar"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          {can(role ?? null, 'empresas.delete') && (
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
              onClick={() => { setSelected(row.original); setOpenDelete(true) }}
              title="Excluir"
            >
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
        title="Empresas"
        description="Gerencie as empresas cadastradas no sistema"
        actions={
          <PermissionGuard permission="empresas.create">
            <Button
              onClick={openCreate}
              className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Empresa
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-6">
        <DataTable
          columns={columns}
          data={empresas}
          loading={loading}
          searchPlaceholder="Buscar por nome, CNPJ, email..."
        />
      </div>

      {/* Modal criar/editar */}
      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Nome *</Label>
              <Input
                value={form.nome}
                onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                placeholder="Nome da empresa"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">CNPJ</Label>
              <Input
                value={form.cnpj}
                onChange={e => setForm(p => ({ ...p, cnpj: e.target.value }))}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="empresa@exemplo.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as StatusEmpresa }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
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
        title="Excluir empresa"
        description={`Tem certeza que deseja excluir "${selected?.nome}"? Esta ação é irreversível e removerá todos os postos, usuários e dados associados.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
