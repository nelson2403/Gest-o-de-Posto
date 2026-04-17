'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { DataTable } from '@/components/shared/DataTable'
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
import { Plus, Pencil, Trash2, Loader2, Landmark, Copy, Check } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { ContaBancaria, Posto, Empresa, Role } from '@/types/database.types'

type Row = ContaBancaria & { posto?: { nome: string; cnpj?: string }; empresa?: { nome: string } }

const EMPTY = { posto_id: '', empresa_id: '', banco: '', agencia: '', conta: '', observacoes: '', codigo_conta_externo: '' }

export default function ContasBancariasPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined
  const isMaster = role === 'master'

    const [contas,   setContas]   = useState<Row[]>([])
  const [postos,   setPostos]   = useState<Posto[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<Row | null>(null)
  const [form, setForm] = useState(EMPTY)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('contas_bancarias')
      .select('*, posto:postos(id, nome, cnpj), empresa:empresas(id, nome)')
      .order('criado_em', { ascending: false })
    if (data) setContas(data as Row[])
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
      posto_id:             r.posto_id ?? '',
      empresa_id:           r.empresa_id ?? '',
      banco:                r.banco,
      agencia:              r.agencia,
      conta:                r.conta,
      observacoes:          r.observacoes ?? '',
      codigo_conta_externo: r.codigo_conta_externo ?? '',
    })
    setOpenForm(true)
  }

  async function handleSave() {
    if (!form.banco.trim() || !form.agencia.trim() || !form.conta.trim()) {
      toast({ variant: 'destructive', title: 'Banco, agência e conta são obrigatórios' }); return
    }
    setSaving(true)
    const payload = {
      posto_id:             form.posto_id   || null,
      empresa_id:           form.empresa_id || null,
      banco:                form.banco,
      agencia:              form.agencia,
      conta:                form.conta,
      observacoes:          form.observacoes || null,
      codigo_conta_externo: form.codigo_conta_externo.trim() || null,
    }
    const { error } = selected
      ? await supabase.from('contas_bancarias').update(payload).eq('id', selected.id)
      : await supabase.from('contas_bancarias').insert(payload)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
    } else {
      toast({ title: selected ? 'Conta atualizada!' : 'Conta criada!' })
      setOpenForm(false); load()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('contas_bancarias').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message })
    } else {
      toast({ title: 'Conta excluída!' }); setOpenDelete(false); load()
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
      cell: ({ row }) => (
        <div>
          <span className="font-medium text-[13px] block">{row.original.posto?.nome ?? '—'}</span>
          {row.original.posto?.cnpj && (
            <span className="text-[11px] text-gray-400 font-mono">{row.original.posto.cnpj}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'banco',
      header: 'Banco',
      cell: ({ row }) => <span className="font-medium text-[13px]">{row.original.banco}</span>,
    },
    {
      accessorKey: 'agencia',
      header: 'Agência',
      cell: ({ row }) => <span className="font-mono text-[12px] bg-gray-100 px-1.5 py-0.5 rounded">{row.original.agencia}</span>,
    },
    {
      accessorKey: 'conta',
      header: 'Conta',
      cell: ({ row }) => <span className="font-mono text-[12px] bg-gray-100 px-1.5 py-0.5 rounded">{row.original.conta}</span>,
    },
    {
      id: 'acoes',
      header: '',
      cell: ({ row }) => {
        const r = row.original
        const copied = copiedId === r.id
        function handleCopy() {
          const lines = [
            r.posto?.nome ? `Posto: ${r.posto.nome}` : null,
            r.posto?.cnpj ? `CNPJ: ${r.posto.cnpj}` : null,
            `Banco: ${r.banco}`,
            `Agência: ${r.agencia}`,
            `Conta: ${r.conta}`,
          ].filter(Boolean).join('\n')
          if (window.isSecureContext && navigator.clipboard) {
            navigator.clipboard.writeText(lines)
          } else {
            const el = document.createElement('textarea')
            el.value = lines
            el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
            document.body.appendChild(el)
            el.focus()
            el.select()
            document.execCommand('copy')
            document.body.removeChild(el)
          }
          setCopiedId(r.id)
          setTimeout(() => setCopiedId(null), 2000)
        }
        return (
          <div className="flex items-center gap-1 justify-end">
            <Button variant="ghost" size="icon" className={`h-8 w-8 ${copied ? 'text-green-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`} onClick={handleCopy} title="Copiar dados">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
            {can(role ?? null, 'contas_bancarias.edit') && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => openEdit(r)} title="Editar">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
            {can(role ?? null, 'contas_bancarias.delete') && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50" onClick={() => { setSelected(r); setOpenDelete(true) }} title="Excluir">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="animate-fade-in">
      <Header
        title="Contas Bancárias"
        description="Contas bancárias cadastradas por posto"
        actions={
          <PermissionGuard permission="contas_bancarias.create">
            <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Nova Conta
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-6">
        <DataTable
          columns={columns}
          data={contas}
          loading={loading}
          searchPlaceholder="Buscar por banco, agência, conta, posto..."
        />
      </div>

      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Landmark className="w-4 h-4 text-emerald-600" />
              </div>
              <DialogTitle>{selected ? 'Editar Conta' : 'Nova Conta Bancária'}</DialogTitle>
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
              <Label className="text-[12px] font-medium text-gray-600">Banco *</Label>
              <Input value={form.banco} onChange={e => setForm(p => ({ ...p, banco: e.target.value }))} placeholder="Ex: Bradesco, Itaú, Caixa..." autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Agência *</Label>
                <Input value={form.agencia} onChange={e => setForm(p => ({ ...p, agencia: e.target.value }))} placeholder="Ex: 1234-5" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Conta (com dígito) *</Label>
                <Input value={form.conta} onChange={e => setForm(p => ({ ...p, conta: e.target.value }))} placeholder="Ex: 12345-6" className="font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">
                Código AUTOSYSTEM
                <span className="ml-1.5 text-[11px] font-normal text-gray-400">(para cruzamento de extrato)</span>
              </Label>
              <Input
                value={form.codigo_conta_externo}
                onChange={e => setForm(p => ({ ...p, codigo_conta_externo: e.target.value }))}
                placeholder="Ex: 1.2.139"
                className="font-mono text-[13px]"
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
        title="Excluir conta bancária"
        description={`Excluir a conta ${selected?.banco ? `do ${selected.banco}` : ''} (ag. ${selected?.agencia} / cc ${selected?.conta})? Esta ação não pode ser desfeita.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
