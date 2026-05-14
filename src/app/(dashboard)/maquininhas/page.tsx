'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { StatusMaquininhaBadge } from '@/components/shared/StatusBadge'
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
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/formatters'
import { Plus, Pencil, Trash2, Loader2, Smartphone, MapPin, Search, Power, PowerOff, Package, PackageX } from 'lucide-react'
import type { Maquininha, Posto, Adquirente, StatusMaquininha, Role } from '@/types/database.types'

const STATUS_OPTS: { value: StatusMaquininha; label: string; pill: string }[] = [
  { value: 'ativo',      label: 'Ativa',                   pill: 'bg-emerald-100 text-emerald-700' },
  { value: 'inativo',    label: 'Inativa',                 pill: 'bg-red-100 text-red-700' },
  { value: 'estoque',    label: 'Estoque',                 pill: 'bg-blue-100 text-blue-700' },
  { value: 'manutencao', label: 'Manutenção',              pill: 'bg-amber-100 text-amber-700' },
  { value: 'extraviada', label: 'Extraviada',              pill: 'bg-gray-100 text-gray-600' },
  { value: 'devolvida',  label: 'Devolvida ao Adquirente', pill: 'bg-purple-100 text-purple-700' },
]

const EMPTY = { posto_id: '', adquirente_id: '', numero_serie: '', modelo: '', status: 'ativo' as StatusMaquininha, motivo_status: '', valor_aluguel: '' }

type MaquininhaRow = Maquininha & { posto?: { id: string; nome: string }; adquirente?: { id: string; nome: string } }

export default function MaquininhasPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined

  const [maquininhas, setMaquininhas] = useState<MaquininhaRow[]>([])
  const [postos,      setPostos]      = useState<Posto[]>([])
  const [adquirentes, setAdquirentes] = useState<Adquirente[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [search, setSearch] = useState('')

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<MaquininhaRow | null>(null)
  const [form, setForm] = useState(EMPTY)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('maquininhas')
      .select('*, posto:postos(id, nome), adquirente:adquirentes(id, nome)')
      .order('criado_em', { ascending: false })
    if (data) setMaquininhas(data as MaquininhaRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('postos').select('id, nome').order('nome').then(({ data }) => { if (data) setPostos(data as Posto[]) })
    supabase.from('adquirentes').select('id, nome').order('nome').then(({ data }) => { if (data) setAdquirentes(data as Adquirente[]) })
  }, [])

  function openCreate() { setSelected(null); setForm(EMPTY); setOpenForm(true) }

  function openEdit(m: MaquininhaRow) {
    setSelected(m)
    setForm({
      posto_id: m.posto_id, adquirente_id: m.adquirente_id,
      numero_serie: m.numero_serie ?? '', modelo: m.modelo ?? '',
      status: m.status, motivo_status: m.motivo_status ?? '',
      valor_aluguel: m.valor_aluguel !== null && m.valor_aluguel !== undefined ? String(m.valor_aluguel) : '',
    })
    setOpenForm(true)
  }

  async function handleSave() {
    if (!form.posto_id || !form.adquirente_id) {
      toast({ variant: 'destructive', title: 'Posto e adquirente são obrigatórios' }); return
    }
    setSaving(true)
    const payload = {
      posto_id: form.posto_id, adquirente_id: form.adquirente_id,
      numero_serie: form.numero_serie || null, modelo: form.modelo || null,
      status: form.status,
      motivo_status: form.status !== 'ativo' ? form.motivo_status || null : null,
      valor_aluguel: form.valor_aluguel !== '' ? parseFloat(form.valor_aluguel.replace(',', '.')) : null,
    }
    const { error } = selected
      ? await supabase.from('maquininhas').update(payload).eq('id', selected.id)
      : await supabase.from('maquininhas').insert(payload)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
    } else {
      toast({ title: selected ? 'Maquininha atualizada!' : 'Maquininha criada!' })
      setOpenForm(false); load()
    }
    setSaving(false)
  }

  const [quickSaving, setQuickSaving] = useState<string | null>(null)

  async function handleQuickStatus(m: MaquininhaRow, novoStatus: StatusMaquininha) {
    setQuickSaving(m.id)
    const { error } = await supabase.from('maquininhas').update({ status: novoStatus }).eq('id', m.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar status', description: error.message })
    } else {
      toast({ title: `Maquininha ${novoStatus === 'ativo' ? 'ativada' : novoStatus === 'inativo' ? 'inativada' : novoStatus === 'estoque' ? 'movida para estoque' : 'removida do estoque'}!` })
      load()
    }
    setQuickSaving(null)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('maquininhas').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message })
    } else {
      toast({ title: 'Maquininha excluída!' }); setOpenDelete(false); load()
    }
    setDeleting(false)
  }

  // Filtra e agrupa por posto
  const grupos = useMemo(() => {
    const filtered = maquininhas.filter(m => {
      if (filterStatus !== 'all' && m.status !== filterStatus) return false
      if (search) {
        const q = search.toLowerCase()
        const inPosto = m.posto?.nome?.toLowerCase().includes(q) ?? false
        const inAdq   = m.adquirente?.nome?.toLowerCase().includes(q) ?? false
        const inSerie = m.numero_serie?.toLowerCase().includes(q) ?? false
        const inModelo = m.modelo?.toLowerCase().includes(q) ?? false
        if (!inPosto && !inAdq && !inSerie && !inModelo) return false
      }
      return true
    })

    const map = new Map<string, { postoNome: string; items: MaquininhaRow[] }>()
    for (const m of filtered) {
      const key = m.posto_id ?? 'sem-posto'
      const nome = m.posto?.nome ?? 'Sem Posto'
      if (!map.has(key)) map.set(key, { postoNome: nome, items: [] })
      map.get(key)!.items.push(m)
    }
    return Array.from(map.entries())
      .map(([key, val]) => ({ postoId: key, ...val }))
      .sort((a, b) => a.postoNome.localeCompare(b.postoNome))
  }, [maquininhas, filterStatus, search])

  const totalFiltrado = grupos.reduce((acc, g) => acc + g.items.length, 0)

  return (
    <div className="animate-fade-in">
      <Header
        title="Maquininhas"
        description="Terminais de pagamento agrupados por posto"
        actions={
          <PermissionGuard permission="maquininhas.create">
            <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span className="btn-text">Nova Maquininha</span>
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-3 md:p-6 space-y-4">

        {/* Filtros */}
        <div className="flex flex-col gap-2">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              placeholder="Buscar posto, adquirente, série..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-[13px] w-full"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilterStatus('all')}
              className={cn(
                'px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors whitespace-nowrap',
                filterStatus === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              Todas ({maquininhas.length})
            </button>
            {STATUS_OPTS.map(s => (
              <button
                key={s.value}
                onClick={() => setFilterStatus(s.value)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors whitespace-nowrap',
                  filterStatus === s.value ? `${s.pill} ring-2 ring-offset-1 ring-current` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {s.label} ({maquininhas.filter(m => m.status === s.value).length})
              </button>
            ))}
          </div>
        </div>

        {/* Blocos por posto */}
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : grupos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <Smartphone className="w-8 h-8 opacity-30" />
            <p className="text-[13px]">Nenhuma maquininha encontrada.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {grupos.map(grupo => (
              <div key={grupo.postoId} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                {/* Cabeçalho do posto */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-3.5 h-3.5 text-orange-600" />
                    </div>
                    <span className="font-semibold text-[13px] text-gray-800">{grupo.postoNome}</span>
                    <span className="text-[11px] text-gray-400 font-medium">
                      {grupo.items.length} {grupo.items.length === 1 ? 'maquininha' : 'maquininhas'}
                    </span>
                  </div>
                  {/* Mini resumo de status */}
                  <div className="flex items-center gap-1.5">
                    {STATUS_OPTS.map(s => {
                      const count = grupo.items.filter(m => m.status === s.value).length
                      if (!count) return null
                      return (
                        <span key={s.value} className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', s.pill)}>
                          {count} {s.label}
                        </span>
                      )
                    })}
                  </div>
                </div>

                {/* Tabela de maquininhas do posto */}
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Adquirente</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Nº Série</th>
                        <th className="hidden sm:table-cell text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Modelo</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                        <th className="hidden md:table-cell text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Motivo</th>
                        <th className="hidden sm:table-cell text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Aluguel</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {grupo.items.map(m => (
                        <tr key={m.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-gray-700">
                            {m.adquirente?.nome ?? <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            {m.numero_serie
                              ? <span className="font-mono text-[12px] bg-gray-100 px-1.5 py-0.5 rounded">{m.numero_serie}</span>
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="hidden sm:table-cell px-4 py-2.5 text-gray-600">
                            {m.modelo ?? <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusMaquininhaBadge status={m.status} />
                          </td>
                          <td className="hidden md:table-cell px-4 py-2.5">
                            {m.motivo_status
                              ? <span className="text-[12px] text-gray-500 max-w-[140px] truncate block" title={m.motivo_status}>{m.motivo_status}</span>
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="hidden sm:table-cell px-4 py-2.5">
                            {m.valor_aluguel !== null && m.valor_aluguel !== undefined
                              ? <span className="text-[12px] font-medium text-emerald-700">{formatCurrency(m.valor_aluguel)}</span>
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1 justify-end">
                              {can(role ?? null, 'maquininhas.edit') && (<>
                                {/* Ativar / Inativar */}
                                {m.status !== 'ativo' ? (
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-7 w-7 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"
                                    onClick={() => handleQuickStatus(m, 'ativo')}
                                    disabled={quickSaving === m.id}
                                    title="Ativar"
                                  >
                                    {quickSaving === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => handleQuickStatus(m, 'inativo')}
                                    disabled={quickSaving === m.id}
                                    title="Inativar"
                                  >
                                    {quickSaving === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PowerOff className="w-3.5 h-3.5" />}
                                  </Button>
                                )}
                                {/* Entrar / Sair do estoque */}
                                {m.status !== 'estoque' ? (
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                    onClick={() => handleQuickStatus(m, 'estoque')}
                                    disabled={quickSaving === m.id}
                                    title="Mover para Estoque"
                                  >
                                    <Package className="w-3.5 h-3.5" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-7 w-7 text-blue-500 hover:text-gray-600 hover:bg-gray-100"
                                    onClick={() => handleQuickStatus(m, 'ativo')}
                                    disabled={quickSaving === m.id}
                                    title="Remover do Estoque (Ativar)"
                                  >
                                    <PackageX className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => openEdit(m)} title="Editar">
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                              </>)}
                              {can(role ?? null, 'maquininhas.delete') && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50" onClick={() => { setSelected(m); setOpenDelete(true) }} title="Excluir">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-gray-400 text-right">
              {totalFiltrado} maquininha{totalFiltrado !== 1 ? 's' : ''} em {grupos.length} posto{grupos.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Modal criar/editar */}
      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Smartphone className="w-4 h-4 text-blue-600" />
              </div>
              <DialogTitle>{selected ? 'Editar Maquininha' : 'Nova Maquininha'}</DialogTitle>
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
              <Label className="text-[12px] font-medium text-gray-600">Adquirente *</Label>
              <Select value={form.adquirente_id} onValueChange={v => setForm(p => ({ ...p, adquirente_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a adquirente" /></SelectTrigger>
                <SelectContent>{adquirentes.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Número de Série</Label>
                <Input value={form.numero_serie} onChange={e => setForm(p => ({ ...p, numero_serie: e.target.value }))} placeholder="Ex: SN12345" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Modelo</Label>
                <Input value={form.modelo} onChange={e => setForm(p => ({ ...p, modelo: e.target.value }))} placeholder="Ex: Move 2500" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Valor do Aluguel (R$)</Label>
              <Input
                value={form.valor_aluguel}
                onChange={e => setForm(p => ({ ...p, valor_aluguel: e.target.value }))}
                placeholder="Ex: 49,90"
                type="number"
                min="0"
                step="0.01"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as StatusMaquininha }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.status !== 'ativo' && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Motivo</Label>
                <Textarea
                  value={form.motivo_status}
                  onChange={e => setForm(p => ({ ...p, motivo_status: e.target.value }))}
                  placeholder="Descreva o motivo..."
                  rows={2}
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
        title="Excluir maquininha"
        description={`Excluir a maquininha${selected?.modelo ? ` "${selected.modelo}"` : ''}${selected?.numero_serie ? ` (série: ${selected.numero_serie})` : ''}? Esta ação não pode ser desfeita.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
