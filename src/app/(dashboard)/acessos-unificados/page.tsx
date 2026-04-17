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
import { Plus, Pencil, Trash2, KeyRound, Loader2 } from 'lucide-react'
import { CopyButton } from '@/components/shared/CopyButton'
import type { ColumnDef } from '@tanstack/react-table'
import type { AcessoUnificado, Portal, Empresa, Role } from '@/types/database.types'

type AcessoRow = AcessoUnificado & { portal?: { nome: string }; empresa?: { nome: string } }

const EMPTY = { empresa_id: '', portal_id: '', login: '', senha: '', observacoes: '' }

export default function AcessosUnificadosPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined
  const canEdit     = can(role ?? null, 'acessos.edit')
  const canReveal   = can(role ?? null, 'acessos.view')
  const canEditSenha = can(role ?? null, 'acessos.edit_senha')

  const [acessos,  setAcessos]  = useState<AcessoRow[]>([])
  const [portais,  setPortais]  = useState<Portal[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [openSenha,  setOpenSenha]  = useState(false)
  const [selected,   setSelected]   = useState<AcessoRow | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [novaSenha, setNovaSenha] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('acessos_unificados')
      .select('*, portal:portais(id, nome), empresa:empresas(id, nome)')
      .order('criado_em', { ascending: false })
    if (data) setAcessos(data as AcessoRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('portais').select('id, nome').order('nome').then(({ data }) => { if (data) setPortais(data as Portal[]) })
    supabase.from('empresas').select('id, nome').order('nome').then(({ data }) => { if (data) setEmpresas(data as Empresa[]) })
  }, [])

  function openCreate() { setSelected(null); setForm(EMPTY); setOpenForm(true) }

  function openEditFull(a: AcessoRow) {
    setSelected(a)
    setForm({
      empresa_id: a.empresa_id ?? '',
      portal_id: a.portal_id,
      login: a.login,
      senha: a.senha ?? '',
      observacoes: a.observacoes ?? '',
    })
    setOpenForm(true)
  }

  function openEditSenha(a: AcessoRow) {
    setSelected(a); setNovaSenha(''); setOpenSenha(true)
  }

  async function handleSave() {
    if (!form.portal_id || !form.login.trim()) {
      toast({ variant: 'destructive', title: 'Portal e login são obrigatórios' }); return
    }
    setSaving(true)
    const payload = {
      empresa_id: form.empresa_id || null,
      portal_id: form.portal_id,
      login: form.login,
      senha: form.senha || null,
      observacoes: form.observacoes || null,
    }
    const { error } = selected
      ? await supabase.from('acessos_unificados').update(payload).eq('id', selected.id)
      : await supabase.from('acessos_unificados').insert(payload)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message })
    } else {
      toast({ title: selected ? 'Acesso atualizado!' : 'Acesso criado!' })
      setOpenForm(false); load()
    }
    setSaving(false)
  }

  async function handleSaveSenha() {
    if (!selected) return
    setSaving(true)
    const { error } = await supabase.from('acessos_unificados').update({ senha: novaSenha || null }).eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message })
    } else {
      toast({ title: 'Senha atualizada!' }); setOpenSenha(false); load()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('acessos_unificados').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message })
    } else {
      toast({ title: 'Acesso excluído!' }); setOpenDelete(false); load()
    }
    setDeleting(false)
  }

  const columns: ColumnDef<AcessoRow>[] = [
    {
      id: 'empresa',
      header: 'Empresa',
      accessorFn: (row: AcessoRow) => row.empresa?.nome ?? '—',
      cell: ({ row }) => <span className="text-[12px] text-gray-500">{row.original.empresa?.nome ?? <span className="text-gray-300">—</span>}</span>,
    },
    {
      id: 'portal',
      header: 'Portal',
      accessorFn: (row: AcessoRow) => row.portal?.nome ?? '—',
      cell: ({ row }) => <span className="font-medium text-[13px]">{row.original.portal?.nome ?? '—'}</span>,
    },
    {
      accessorKey: 'login',
      header: 'Login',
      cell: ({ row }) => <span className="font-mono text-[12px] bg-gray-100 px-1.5 py-0.5 rounded">{row.original.login}</span>,
    },
    {
      accessorKey: 'senha',
      header: 'Senha',
      cell: ({ row }) => <PasswordReveal value={row.original.senha} canReveal={canReveal} />,
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
          ...(r.empresa?.nome ? [`Empresa: ${r.empresa.nome}`] : []),
          `Portal: ${r.portal?.nome ?? '—'}`,
          `Login: ${r.login}`,
          ...(canReveal && r.senha ? [`Senha: ${r.senha}`] : []),
          ...(r.observacoes ? [`Obs: ${r.observacoes}`] : []),
        ]
        return (
          <div className="flex items-center gap-1 justify-end">
            <CopyButton text={parts.join('\n')} title="Copiar todas as informações" size="default" />
            {role === 'operador' || role === 'conciliador' ? (
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-gray-400 hover:text-orange-600 hover:bg-orange-50"
                onClick={() => openEditSenha(row.original)}
                title="Alterar senha"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <>
                {canEdit && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => openEditFull(row.original)} title="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
                {can(role ?? null, 'acessos.delete') && (
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
        title="Acessos Unificados"
        description="Acessos gerais por portal — válidos para todos os postos"
        actions={
          <PermissionGuard permission="acessos.create">
            <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Novo Acesso
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-6">
        {(role === 'operador' || role === 'conciliador') && (
          <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-700 flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Você pode visualizar os acessos e alterar senhas. Para editar outros campos, contate o administrador.</span>
          </div>
        )}
        <DataTable
          columns={columns}
          data={acessos}
          loading={loading}
          searchPlaceholder="Buscar por empresa, portal, login..."
        />
      </div>

      {/* Modal criar/editar completo */}
      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar Acesso' : 'Novo Acesso Unificado'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Empresa</Label>
              <Select value={form.empresa_id} onValueChange={v => setForm(p => ({ ...p, empresa_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a empresa (opcional)" /></SelectTrigger>
                <SelectContent>{empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Portal *</Label>
              <Select value={form.portal_id} onValueChange={v => setForm(p => ({ ...p, portal_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o portal" /></SelectTrigger>
                <SelectContent>{portais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Login *</Label>
              <Input value={form.login} onChange={e => setForm(p => ({ ...p, login: e.target.value }))} placeholder="Usuário ou email de acesso" className="font-mono" />
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

      {/* Modal alterar senha (operador) */}
      <Dialog open={openSenha} onOpenChange={open => { if (!saving) setOpenSenha(open) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                <KeyRound className="w-4 h-4 text-orange-600" />
              </div>
              <DialogTitle>Alterar Senha</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="px-3 py-2 bg-gray-50 rounded-lg text-[12px] text-gray-600">
              {selected?.empresa?.nome && <span>Empresa: <strong>{selected.empresa.nome}</strong> · </span>}
              Portal: <strong>{selected?.portal?.nome}</strong>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Nova Senha</Label>
              <Input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="••••••••" autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSenha(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSaveSenha} disabled={saving} className="bg-orange-500 hover:bg-orange-600 min-w-[90px]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Senha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={openDelete}
        onOpenChange={open => { if (!deleting) setOpenDelete(open) }}
        title="Excluir acesso"
        description={`Excluir o acesso do portal "${selected?.portal?.nome}"${selected?.empresa?.nome ? ` (${selected.empresa.nome})` : ''}? Esta ação não pode ser desfeita.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
