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
import { Plus, Pencil, Trash2, Server, Loader2 } from 'lucide-react'
import { CopyButton } from '@/components/shared/CopyButton'
import type { ColumnDef } from '@tanstack/react-table'
import type { ServidorPosto, Posto, Role } from '@/types/database.types'

type ServidorRow = ServidorPosto & { posto?: { nome: string } }

const EMPTY = { posto_id: '', nome_banco: '', ip: '', porta: '5432', usuario: '', senha: '', observacoes: '' }

export default function ServidoresPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined
  const canManage = can(role ?? null, 'servidores.edit')

  const [servidores, setServidores] = useState<ServidorRow[]>([])
  const [postos,     setPostos]     = useState<Posto[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState(false)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<ServidorRow | null>(null)
  const [form, setForm] = useState(EMPTY)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('servidores_postos')
      .select('*, posto:postos(id, nome)')
      .order('criado_em', { ascending: false })
    if (data) setServidores(data as ServidorRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('postos').select('id, nome').order('nome').then(({ data }) => { if (data) setPostos(data as Posto[]) })
  }, [])

  function openCreate() { setSelected(null); setForm(EMPTY); setOpenForm(true) }

  function openEdit(s: ServidorRow) {
    setSelected(s)
    setForm({
      posto_id: s.posto_id, nome_banco: s.nome_banco ?? '', ip: s.ip,
      porta: String(s.porta ?? 5432), usuario: s.usuario ?? '',
      senha: s.senha ?? '', observacoes: s.observacoes ?? '',
    })
    setOpenForm(true)
  }

  async function handleSave() {
    if (!form.posto_id || !form.ip.trim()) {
      toast({ variant: 'destructive', title: 'Posto e IP são obrigatórios' }); return
    }
    setSaving(true)
    const payload = {
      posto_id: form.posto_id, nome_banco: form.nome_banco || null,
      ip: form.ip, porta: form.porta ? parseInt(form.porta) : 5432,
      usuario: form.usuario || null, senha: form.senha || null,
      observacoes: form.observacoes || null,
    }
    const { error } = selected
      ? await supabase.from('servidores_postos').update(payload).eq('id', selected.id)
      : await supabase.from('servidores_postos').insert(payload)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
    } else {
      toast({ title: selected ? 'Servidor atualizado!' : 'Servidor criado!' })
      setOpenForm(false); load()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('servidores_postos').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message })
    } else {
      toast({ title: 'Servidor excluído!' }); setOpenDelete(false); load()
    }
    setDeleting(false)
  }

  const columns: ColumnDef<ServidorRow>[] = [
    {
      id: 'posto',
      header: 'Posto',
      accessorFn: (row: ServidorRow) => row.posto?.nome ?? '—',
      cell: ({ row }) => <span className="font-medium text-[13px]">{row.original.posto?.nome ?? '—'}</span>,
    },
    {
      accessorKey: 'nome_banco',
      header: 'Banco',
      cell: ({ row }) => row.original.nome_banco
        ? <span className="text-[12px] bg-gray-100 px-1.5 py-0.5 rounded font-mono">{row.original.nome_banco}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      accessorKey: 'ip',
      header: 'IP / Host',
      cell: ({ row }) => (
        <span className="font-mono text-[13px] font-medium text-gray-800">
          {row.original.ip}
          <span className="text-gray-400 font-normal">:{row.original.porta ?? 5432}</span>
        </span>
      ),
    },
    {
      accessorKey: 'usuario',
      header: 'Usuário',
      cell: ({ row }) => row.original.usuario
        ? <span className="font-mono text-[12px]">{row.original.usuario}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      accessorKey: 'senha',
      header: 'Senha',
      cell: ({ row }) => <PasswordReveal value={row.original.senha} canReveal={canManage} />,
    },
    {
      accessorKey: 'observacoes',
      header: 'Obs',
      cell: ({ row }) => row.original.observacoes
        ? <span className="text-[12px] text-gray-500 max-w-[140px] truncate block">{row.original.observacoes}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      id: 'acoes',
      header: '',
      cell: ({ row }) => {
        const r = row.original
        const parts = [
          `Posto: ${r.posto?.nome ?? '—'}`,
          ...(r.nome_banco ? [`Banco: ${r.nome_banco}`] : []),
          `IP: ${r.ip}:${r.porta ?? 5432}`,
          ...(r.usuario ? [`Usuário: ${r.usuario}`] : []),
          ...(canManage && r.senha ? [`Senha: ${r.senha}`] : []),
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
                {can(role ?? null, 'servidores.delete') && (
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
        title="Servidores dos Postos"
        description="Acesso a bancos de dados e servidores remotos"
        actions={
          <PermissionGuard permission="servidores.create">
            <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Novo Servidor
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-3 md:p-6">
        <DataTable
          columns={columns}
          data={servidores}
          loading={loading}
          searchPlaceholder="Buscar por posto, IP, banco..."
        />
      </div>

      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <Server className="w-4 h-4 text-gray-600" />
              </div>
              <DialogTitle>{selected ? 'Editar Servidor' : 'Novo Servidor'}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-1 max-h-[65vh] overflow-y-auto pr-1 scrollbar-thin">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Posto *</Label>
              <Select value={form.posto_id} onValueChange={v => setForm(p => ({ ...p, posto_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o posto" /></SelectTrigger>
                <SelectContent>{postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Nome do Banco</Label>
              <Input value={form.nome_banco} onChange={e => setForm(p => ({ ...p, nome_banco: e.target.value }))} placeholder="Ex: PostgreSQL, MySQL, SQL Server" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">IP / Host *</Label>
                <Input
                  value={form.ip}
                  onChange={e => setForm(p => ({ ...p, ip: e.target.value }))}
                  placeholder="192.168.1.100 ou host.exemplo.com"
                  className="font-mono text-[13px]"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Porta</Label>
                <Input
                  type="number"
                  value={form.porta}
                  onChange={e => setForm(p => ({ ...p, porta: e.target.value }))}
                  placeholder="5432"
                  className="font-mono text-[13px]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Usuário</Label>
                <Input value={form.usuario} onChange={e => setForm(p => ({ ...p, usuario: e.target.value }))} className="font-mono text-[13px]" placeholder="postgres" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Senha</Label>
                <Input type="password" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} placeholder="••••••••" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} placeholder="Notas sobre o servidor..." />
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
        title="Excluir servidor"
        description={`Excluir o servidor "${selected?.ip}" do posto "${selected?.posto?.nome}"?`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
