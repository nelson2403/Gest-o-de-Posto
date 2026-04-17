'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { DataTable } from '@/components/shared/DataTable'
import { AtivoInativoBadge } from '@/components/shared/StatusBadge'
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
import { formatDate, formatCNPJ } from '@/lib/utils/formatters'
import { Plus, Pencil, Trash2, ChevronRight, Loader2, MapPin } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Posto, Empresa, Role } from '@/types/database.types'

const EMPTY = { nome: '', cnpj: '', endereco: '', email: '', senha_email: '', empresa_id: '', ativo: true, codigo_empresa_externo: '' }

export default function PostosPage() {
  const { usuario } = useAuthContext()
  const router = useRouter()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined

  const [postos,   setPostos]   = useState<Posto[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<Posto | null>(null)
  const [form, setForm] = useState(EMPTY)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('postos')
      .select('*, empresa:empresas(id, nome)')
      .order('nome')
    if (!error) setPostos(data as Posto[])
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

  function openEdit(p: Posto) {
    setSelected(p)
    setForm({
      nome: p.nome, cnpj: p.cnpj ?? '', endereco: p.endereco ?? '',
      email: p.email ?? '', senha_email: p.senha_email ?? '',
      empresa_id: p.empresa_id, ativo: p.ativo,
      codigo_empresa_externo: (p as any).codigo_empresa_externo ?? '',
    })
    setOpenForm(true)
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast({ variant: 'destructive', title: 'Nome obrigatório' }); return }
    setSaving(true)
    const payload = {
      nome: form.nome,
      cnpj: form.cnpj || null,
      endereco: form.endereco || null,
      email: form.email || null,
      senha_email: form.senha_email || null,
      empresa_id: form.empresa_id || usuario?.empresa_id,
      ativo: form.ativo,
      codigo_empresa_externo: form.codigo_empresa_externo.trim() || null,
    }
    const { error } = selected
      ? await supabase.from('postos').update(payload).eq('id', selected.id)
      : await supabase.from('postos').insert(payload)

    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
    } else {
      toast({ title: selected ? 'Posto atualizado!' : 'Posto criado!' })
      setOpenForm(false)
      load()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('postos').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message })
    } else {
      toast({ title: 'Posto excluído!' })
      setOpenDelete(false)
      load()
    }
    setDeleting(false)
  }

  const columns: ColumnDef<Posto>[] = [
    {
      accessorKey: 'nome',
      header: 'Posto',
      cell: ({ row }) => (
        <button
          onClick={() => router.push(`/postos/${row.original.id}`)}
          className="flex items-center gap-2.5 group text-left"
        >
          <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-3.5 h-3.5 text-orange-600" />
          </div>
          <span className="font-medium text-gray-900 group-hover:text-orange-600 transition-colors">
            {row.original.nome}
          </span>
        </button>
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
      accessorKey: 'endereco',
      header: 'Endereço',
      cell: ({ row }) => (
        <span className="text-[13px] max-w-[200px] truncate block">{row.original.endereco ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => row.original.email ?? <span className="text-gray-400">—</span>,
    },
    ...(role === 'master' ? [{
      id: 'empresa',
      header: 'Empresa',
      accessorFn: (row: Posto) => (row as { empresa?: { nome: string } }).empresa?.nome ?? '—',
    } as ColumnDef<Posto>] : []),
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
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-gray-400 hover:text-orange-600 hover:bg-orange-50"
            onClick={() => router.push(`/postos/${row.original.id}`)}
            title="Ver detalhes"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          {can(role ?? null, 'postos.edit') && (
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
              onClick={() => openEdit(row.original)}
              title="Editar"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          {can(role ?? null, 'postos.delete') && (
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
        title="Postos de Combustível"
        description="Gerencie os postos da sua rede"
        actions={
          <PermissionGuard permission="postos.create">
            <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Novo Posto
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-3 md:p-6">
        <DataTable
          columns={columns}
          data={postos}
          loading={loading}
          searchPlaceholder="Buscar por nome, CNPJ, endereço..."
        />
      </div>

      {/* Modal criar/editar */}
      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar Posto' : 'Novo Posto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1 max-h-[65vh] overflow-y-auto pr-1 scrollbar-thin">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Nome *</Label>
              <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Nome do posto" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">CNPJ</Label>
                <Input value={form.cnpj} onChange={e => setForm(p => ({ ...p, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Endereço</Label>
              <Textarea
                rows={2}
                value={form.endereco}
                onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))}
                placeholder="Rua, número, bairro, cidade - UF"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Senha do Email</Label>
              <Input type="password" value={form.senha_email} onChange={e => setForm(p => ({ ...p, senha_email: e.target.value }))} placeholder="••••••••" />
            </div>
            {role === 'master' && (
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
            {role === 'master' && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">
                  Código Empresa AUTOSYSTEM
                  <span className="ml-1.5 text-[11px] font-normal text-gray-400">(para cruzamento de extrato)</span>
                </Label>
                <Input
                  value={form.codigo_empresa_externo}
                  onChange={e => setForm(p => ({ ...p, codigo_empresa_externo: e.target.value }))}
                  placeholder="Ex: 16866655"
                  className="font-mono text-[13px]"
                />
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
        title="Excluir posto"
        description={`Excluir "${selected?.nome}"? Todos os dados relacionados (maquininhas, acessos, servidores, etc.) serão removidos permanentemente.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
