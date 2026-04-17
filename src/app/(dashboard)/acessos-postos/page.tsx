'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
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
import { Plus, Pencil, Trash2, KeyRound, Loader2, ChevronDown, ChevronRight, Building2, Search } from 'lucide-react'
import { CopyButton } from '@/components/shared/CopyButton'
import type { AcessoPosto, Posto, Portal, Role } from '@/types/database.types'

type AcessoRow = AcessoPosto & { posto?: { nome: string }; portal?: { nome: string } }

const EMPTY = { posto_id: '', portal_id: '', login: '', senha: '', observacoes: '' }

export default function AcessosPostosPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined
  const canEdit      = can(role ?? null, 'acessos.edit')
  const canReveal    = can(role ?? null, 'acessos.view')
  const canEditSenha = can(role ?? null, 'acessos.edit_senha')

  const [acessos,  setAcessos]  = useState<AcessoRow[]>([])
  const [postos,   setPostos]   = useState<Posto[]>([])
  const [portais,  setPortais]  = useState<Portal[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [openSenha,  setOpenSenha]  = useState(false)
  const [selected,   setSelected]   = useState<AcessoRow | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [novaSenha, setNovaSenha] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('acessos_postos')
      .select('*, posto:postos(id, nome), portal:portais(id, nome)')
      .order('criado_em', { ascending: false })
    if (data) {
      const rows = data as AcessoRow[]
      setAcessos(rows)
      // Expand all postos by default
      const ids = new Set(rows.map(r => r.posto_id))
      setExpanded(ids)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('postos').select('id, nome').order('nome').then(({ data }) => { if (data) setPostos(data as Posto[]) })
    supabase.from('portais').select('id, nome').order('nome').then(({ data }) => { if (data) setPortais(data as Portal[]) })
  }, [])

  function togglePosto(postoId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(postoId)) next.delete(postoId)
      else next.add(postoId)
      return next
    })
  }

  function openCreate() { setSelected(null); setForm(EMPTY); setOpenForm(true) }

  function openEditFull(a: AcessoRow) {
    setSelected(a)
    setForm({ posto_id: a.posto_id, portal_id: a.portal_id, login: a.login, senha: a.senha ?? '', observacoes: a.observacoes ?? '' })
    setOpenForm(true)
  }

  function openEditSenha(a: AcessoRow) {
    setSelected(a); setNovaSenha(''); setOpenSenha(true)
  }

  async function handleSave() {
    if (!form.posto_id || !form.portal_id || !form.login.trim()) {
      toast({ variant: 'destructive', title: 'Posto, portal e login são obrigatórios' }); return
    }
    setSaving(true)
    const payload = { posto_id: form.posto_id, portal_id: form.portal_id, login: form.login, senha: form.senha || null, observacoes: form.observacoes || null }
    const { error } = selected
      ? await supabase.from('acessos_postos').update(payload).eq('id', selected.id)
      : await supabase.from('acessos_postos').insert(payload)
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
    const { error } = await supabase.from('acessos_postos').update({ senha: novaSenha || null }).eq('id', selected.id)
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
    const { error } = await supabase.from('acessos_postos').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message })
    } else {
      toast({ title: 'Acesso excluído!' }); setOpenDelete(false); load()
    }
    setDeleting(false)
  }

  // Group acessos by posto
  const grouped = acessos.reduce<Record<string, { nome: string; items: AcessoRow[] }>>((acc, a) => {
    const id = a.posto_id
    const nome = a.posto?.nome ?? 'Sem posto'
    if (!acc[id]) acc[id] = { nome, items: [] }
    acc[id].items.push(a)
    return acc
  }, {})

  const sortedGroups = Object.entries(grouped)
    .sort(([, a], [, b]) => a.nome.localeCompare(b.nome))
    .filter(([, { nome }]) => nome.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="animate-fade-in">
      <Header
        title="Acessos dos Postos"
        description="Acessos individuais por posto em cada portal"
        actions={
          <PermissionGuard permission="acessos.create">
            <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Novo Acesso
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-3 md:p-6 space-y-3">
        {(role === 'operador' || role === 'conciliador') && (
          <div className="mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-700 flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Você pode visualizar os acessos e alterar senhas. Para editar outros campos, contate o administrador.</span>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar posto..."
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
            {search ? `Nenhum posto encontrado para "${search}".` : 'Nenhum acesso cadastrado.'}
          </div>
        ) : (
          sortedGroups.map(([postoId, { nome, items }]) => {
            const isOpen = expanded.has(postoId)
            return (
              <div key={postoId} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                {/* Header do posto */}
                <button
                  onClick={() => togglePosto(postoId)}
                  className="w-full flex items-center gap-3 px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-[14px] text-gray-800">{nome}</span>
                    <span className="ml-2 text-[12px] text-gray-400">{items.length} {items.length === 1 ? 'acesso' : 'acessos'}</span>
                  </div>
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  }
                </button>

                {/* Lista de acessos */}
                {isOpen && (
                  <div className="divide-y divide-gray-100">
                    {items.map(a => {
                      const parts = [
                        `Posto: ${a.posto?.nome ?? '—'}`,
                        `Portal: ${a.portal?.nome ?? '—'}`,
                        `Login: ${a.login}`,
                        ...(canReveal && a.senha ? [`Senha: ${a.senha}`] : []),
                        ...(a.observacoes ? [`Obs: ${a.observacoes}`] : []),
                      ]
                      return (
                        <div key={a.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-gray-50/50">
                          {/* Portal */}
                          <div className="w-36 flex-shrink-0">
                            <div className="text-[11px] text-gray-400 mb-0.5">Portal</div>
                            <span className="text-[13px] font-medium text-gray-700">{a.portal?.nome ?? '—'}</span>
                          </div>

                          {/* Login */}
                          <div className="w-48 flex-shrink-0">
                            <div className="text-[11px] text-gray-400 mb-0.5">Login</div>
                            <span className="font-mono text-[12px] bg-gray-100 px-1.5 py-0.5 rounded">{a.login}</span>
                          </div>

                          {/* Senha */}
                          <div className="w-36 flex-shrink-0">
                            <div className="text-[11px] text-gray-400 mb-0.5">Senha</div>
                            <PasswordReveal value={a.senha} canReveal={canReveal} />
                          </div>

                          {/* Observações */}
                          <div className="flex-1 min-w-0">
                            {a.observacoes && (
                              <>
                                <div className="text-[11px] text-gray-400 mb-0.5">Obs</div>
                                <span className="text-[12px] text-gray-500 truncate block">{a.observacoes}</span>
                              </>
                            )}
                          </div>

                          {/* Ações */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <CopyButton text={parts.join('\n')} title="Copiar todas as informações" size="default" />
                            {role === 'operador' || role === 'conciliador' ? (
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-orange-600 hover:bg-orange-50"
                                onClick={() => openEditSenha(a)}
                                title="Alterar senha"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <>
                                {canEdit && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => openEditFull(a)} title="Editar">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {can(role ?? null, 'acessos.delete') && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50" onClick={() => { setSelected(a); setOpenDelete(true) }} title="Excluir">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Modal criar/editar */}
      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar Acesso do Posto' : 'Novo Acesso do Posto'}</DialogTitle>
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
              <Label className="text-[12px] font-medium text-gray-600">Portal *</Label>
              <Select value={form.portal_id} onValueChange={v => setForm(p => ({ ...p, portal_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o portal" /></SelectTrigger>
                <SelectContent>{portais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Login *</Label>
              <Input value={form.login} onChange={e => setForm(p => ({ ...p, login: e.target.value }))} placeholder="Usuário ou email" className="font-mono" />
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
              Posto: <strong>{selected?.posto?.nome}</strong> · Portal: <strong>{selected?.portal?.nome}</strong>
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
        description={`Excluir o acesso de "${selected?.portal?.nome}" no posto "${selected?.posto?.nome}"?`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
