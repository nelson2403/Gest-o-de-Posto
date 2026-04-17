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
import { Plus, Pencil, Trash2, Loader2, Camera } from 'lucide-react'
import { CopyButton } from '@/components/shared/CopyButton'
import type { ColumnDef } from '@tanstack/react-table'
import type { AcessoCamera, Posto, Empresa, Role, TipoCamera } from '@/types/database.types'

type Row = AcessoCamera & { posto?: { nome: string }; empresa?: { nome: string } }

const EMPTY = { posto_id: '', empresa_id: '', tipo: 'ip' as TipoCamera, endereco: '', usuario: '', senha: '', porta: '', observacoes: '' }

const TIPO_LABEL: Record<TipoCamera, string> = { icloud: 'iCloud', ip: 'IP / DDNS' }

export default function AcessosCamerasPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined
  const isMaster  = role === 'master'
  const canManage = can(role ?? null, 'cameras.edit')
  const canReveal = can(role ?? null, 'cameras.view')

  const [acessos,  setAcessos]  = useState<Row[]>([])
  const [postos,   setPostos]   = useState<Posto[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<Row | null>(null)
  const [form, setForm] = useState(EMPTY)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('acessos_cameras')
      .select('*, posto:postos(id, nome), empresa:empresas(id, nome)')
      .order('criado_em', { ascending: false })
    if (data) setAcessos(data as Row[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('postos').select('id, nome').order('nome').then(({ data }) => { if (data) setPostos(data as Posto[]) })
    if (isMaster) {
      supabase.from('empresas').select('id, nome').order('nome').then(({ data }) => { if (data) setEmpresas(data as Empresa[]) })
    }
  }, [])

  function openCreate() { setSelected(null); setForm(EMPTY); setOpenForm(true) }

  function openEdit(r: Row) {
    setSelected(r)
    setForm({
      posto_id:    r.posto_id   ?? '',
      empresa_id:  r.empresa_id ?? '',
      tipo:        r.tipo,
      endereco:    r.endereco,
      usuario:     r.usuario    ?? '',
      senha:       r.senha      ?? '',
      porta:       r.porta      !== null && r.porta !== undefined ? String(r.porta) : '',
      observacoes: r.observacoes ?? '',
    })
    setOpenForm(true)
  }

  async function handleSave() {
    if (!form.endereco.trim()) {
      toast({ variant: 'destructive', title: 'Endereço / iCloud é obrigatório' }); return
    }
    setSaving(true)
    const payload = {
      posto_id:    form.posto_id   || null,
      empresa_id:  form.empresa_id || null,
      tipo:        form.tipo,
      endereco:    form.endereco,
      usuario:     form.usuario    || null,
      senha:       form.senha      || null,
      porta:       form.porta !== '' ? parseInt(form.porta) : null,
      observacoes: form.observacoes || null,
    }
    const { error } = selected
      ? await supabase.from('acessos_cameras').update(payload).eq('id', selected.id)
      : await supabase.from('acessos_cameras').insert(payload)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
    } else {
      toast({ title: selected ? 'Acesso atualizado!' : 'Acesso criado!' })
      setOpenForm(false); load()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('acessos_cameras').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message })
    } else {
      toast({ title: 'Acesso excluído!' }); setOpenDelete(false); load()
    }
    setDeleting(false)
  }

  const columns: ColumnDef<Row>[] = [
    ...(isMaster ? [{
      id: 'empresa',
      header: 'Empresa',
      accessorFn: (row: Row) => row.empresa?.nome ?? '—',
      cell: ({ row }: { row: { original: Row } }) => <span className="text-[12px] text-gray-500">{row.original.empresa?.nome ?? '—'}</span>,
    } as ColumnDef<Row>] : []),
    {
      id: 'posto',
      header: 'Posto',
      accessorFn: (row: Row) => row.posto?.nome ?? '—',
      cell: ({ row }) => <span className="font-medium text-[13px]">{row.original.posto?.nome ?? '—'}</span>,
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ row }) => (
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide ${row.original.tipo === 'icloud' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
          {TIPO_LABEL[row.original.tipo]}
        </span>
      ),
    },
    {
      accessorKey: 'endereco',
      header: 'Endereço / iCloud',
      cell: ({ row }) => <span className="font-mono text-[12px] bg-gray-100 px-1.5 py-0.5 rounded">{row.original.endereco}</span>,
    },
    {
      accessorKey: 'usuario',
      header: 'Usuário',
      cell: ({ row }) => row.original.usuario
        ? <span className="text-[12px] font-mono">{row.original.usuario}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      accessorKey: 'senha',
      header: 'Senha',
      cell: ({ row }) => <PasswordReveal value={row.original.senha} canReveal={canReveal} />,
    },
    {
      accessorKey: 'porta',
      header: 'Porta',
      cell: ({ row }) => row.original.porta !== null && row.original.porta !== undefined
        ? <span className="font-mono text-[12px]">{row.original.porta}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      id: 'acoes',
      header: '',
      cell: ({ row }) => {
        const r = row.original
        const parts = [
          ...(r.posto?.nome ? [`Posto: ${r.posto.nome}`] : []),
          `Tipo: ${TIPO_LABEL[r.tipo]}`,
          `Endereço: ${r.endereco}`,
          ...(r.usuario ? [`Usuário: ${r.usuario}`] : []),
          ...(canReveal && r.senha ? [`Senha: ${r.senha}`] : []),
          ...(r.porta !== null && r.porta !== undefined ? [`Porta: ${r.porta}`] : []),
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
                {can(role ?? null, 'cameras.delete') && (
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
        title="Câmeras"
        description="Acessos de câmeras de segurança por posto"
        actions={
          <PermissionGuard permission="cameras.create">
            <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Novo Acesso
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-3 md:p-6">
        <DataTable
          columns={columns}
          data={acessos}
          loading={loading}
          searchPlaceholder="Buscar por posto, endereço, usuário..."
        />
      </div>

      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Camera className="w-4 h-4 text-indigo-600" />
              </div>
              <DialogTitle>{selected ? 'Editar Câmera' : 'Novo Acesso de Câmera'}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {isMaster && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Empresa</Label>
                <Select value={form.empresa_id} onValueChange={v => setForm(p => ({ ...p, empresa_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                  <SelectContent>{empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Posto</Label>
              <Select value={form.posto_id} onValueChange={v => setForm(p => ({ ...p, posto_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o posto" /></SelectTrigger>
                <SelectContent>{postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Tipo *</Label>
              <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v as TipoCamera }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ip">IP / DDNS</SelectItem>
                  <SelectItem value="icloud">iCloud</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">
                {form.tipo === 'icloud' ? 'Email iCloud *' : 'IP / Endereço *'}
              </Label>
              <Input
                value={form.endereco}
                onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))}
                placeholder={form.tipo === 'icloud' ? 'exemplo@icloud.com' : 'Ex: 192.168.1.100 ou ddns.exemplo.com'}
                className="font-mono"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Usuário</Label>
                <Input value={form.usuario} onChange={e => setForm(p => ({ ...p, usuario: e.target.value }))} placeholder="admin" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Porta</Label>
                <Input
                  value={form.porta}
                  onChange={e => setForm(p => ({ ...p, porta: e.target.value }))}
                  placeholder="Ex: 8080"
                  type="number"
                  min="1"
                  max="65535"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Senha</Label>
              <Input type="password" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} />
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
        title="Excluir acesso de câmera"
        description={`Excluir o acesso ${selected?.tipo === 'icloud' ? 'iCloud' : 'IP'} "${selected?.endereco}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
