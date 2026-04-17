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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { can } from '@/lib/utils/permissions'
import { formatCNPJ } from '@/lib/utils/formatters'
import { Plus, Pencil, Trash2, ShieldCheck, Loader2 } from 'lucide-react'
import { CopyButton } from '@/components/shared/CopyButton'
import type { ColumnDef } from '@tanstack/react-table'
import type { SenhaTef, Posto, Role } from '@/types/database.types'

const EMPTY = { posto_id: '', senha: '' }

export default function SenhasTefPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined
  const canManage = can(role ?? null, 'senhas_tef.edit')
  const canReveal = can(role ?? null, 'senhas_tef.view')

  const [senhas,   setSenhas]   = useState<SenhaTef[]>([])
  const [postos,   setPostos]   = useState<Posto[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [openForm,   setOpenForm]   = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selected,   setSelected]   = useState<SenhaTef | null>(null)
  const [form, setForm] = useState(EMPTY)

  const postosDisponiveis = postos.filter(p =>
    !senhas.some(s => s.posto_id === p.id) || selected?.posto_id === p.id
  )

  const postoSelecionado = postos.find(p => p.id === form.posto_id)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('senhas_tef')
      .select('*, posto:postos(id, nome, cnpj)')
      .order('criado_em', { ascending: false })
    if (data) setSenhas(data as SenhaTef[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('postos').select('id, nome, cnpj, empresa_id').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setPostos(data as Posto[]) })
  }, [])

  function openCreate() { setSelected(null); setForm(EMPTY); setOpenForm(true) }

  function openEdit(s: SenhaTef) {
    setSelected(s)
    setForm({ posto_id: s.posto_id, senha: s.senha })
    setOpenForm(true)
  }

  async function handleSave() {
    if (!form.posto_id) {
      toast({ variant: 'destructive', title: 'Selecione um posto' }); return
    }
    if (!form.senha.trim()) {
      toast({ variant: 'destructive', title: 'A senha é obrigatória' }); return
    }
    setSaving(true)
    const payload = {
      posto_id:   form.posto_id,
      senha:      form.senha.trim(),
      empresa_id: postoSelecionado?.empresa_id ?? usuario?.empresa_id,
    }
    const { error } = selected
      ? await supabase.from('senhas_tef').update(payload).eq('id', selected.id)
      : await supabase.from('senhas_tef').insert(payload)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
    } else {
      toast({ title: selected ? 'Senha TEF atualizada!' : 'Senha TEF cadastrada!' })
      setOpenForm(false); load()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const { error } = await supabase.from('senhas_tef').delete().eq('id', selected.id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message })
    } else {
      toast({ title: 'Senha TEF excluída!' }); setOpenDelete(false); load()
    }
    setDeleting(false)
  }

  type Row = SenhaTef & { posto?: { id: string; nome: string; cnpj: string | null } }

  const columns: ColumnDef<Row>[] = [
    {
      id: 'posto',
      header: 'Posto',
      accessorFn: (row) => row.posto?.nome ?? '—',
      cell: ({ row }) => (
        <span className="font-medium text-[13px] text-gray-800">
          {row.original.posto?.nome ?? '—'}
        </span>
      ),
    },
    {
      id: 'cnpj',
      header: 'CNPJ',
      accessorFn: (row) => row.posto?.cnpj ?? '—',
      cell: ({ row }) => (
        <span className="font-mono text-[13px] text-gray-600">
          {row.original.posto?.cnpj ? formatCNPJ(row.original.posto.cnpj) : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'senha',
      header: 'Senha TEF',
      cell: ({ row }) => <PasswordReveal value={row.original.senha} canReveal={canReveal} />,
    },
    {
      id: 'acoes',
      header: '',
      cell: ({ row }) => {
        const r = row.original as Row
        const parts = [
          `Posto: ${r.posto?.nome ?? '—'}`,
          ...(r.posto?.cnpj ? [`CNPJ: ${r.posto.cnpj}`] : []),
          ...(canReveal ? [`Senha TEF: ${r.senha}`] : []),
        ]
        return (
          <div className="flex items-center gap-1 justify-end">
            <CopyButton text={parts.join('\n')} title="Copiar todas as informações" size="default" />
            {canManage && (
              <>
                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                  onClick={() => openEdit(row.original)}
                  title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                {can(role ?? null, 'senhas_tef.delete') && (
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => { setSelected(row.original); setOpenDelete(true) }}
                    title="Excluir"
                  >
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
        title="Senhas TEF"
        description="Senhas de implantação dos TEFs por posto"
        actions={
          <PermissionGuard permission="senhas_tef.create">
            <Button onClick={openCreate} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Nova Senha TEF
            </Button>
          </PermissionGuard>
        }
      />

      <div className="p-3 md:p-6">
        <DataTable
          columns={columns}
          data={senhas}
          loading={loading}
          searchPlaceholder="Buscar por posto ou CNPJ..."
        />
      </div>

      <Dialog open={openForm} onOpenChange={open => { if (!saving) setOpenForm(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-orange-600" />
              </div>
              <DialogTitle>{selected ? 'Editar Senha TEF' : 'Nova Senha TEF'}</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Posto *</Label>
              <Select
                value={form.posto_id}
                onValueChange={v => setForm(p => ({ ...p, posto_id: v }))}
                disabled={!!selected}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o posto" />
                </SelectTrigger>
                <SelectContent>
                  {postosDisponiveis.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {postoSelecionado && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">CNPJ</Label>
                <Input
                  value={postoSelecionado.cnpj ? formatCNPJ(postoSelecionado.cnpj) : '—'}
                  readOnly
                  className="bg-gray-50 text-gray-500 font-mono text-[13px] cursor-default"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Senha TEF *</Label>
              <Input
                value={form.senha}
                onChange={e => setForm(p => ({ ...p, senha: e.target.value }))}
                placeholder="Digite a senha de implantação"
                autoFocus={!!selected}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-orange-500 hover:bg-orange-600 min-w-[90px]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : selected ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={openDelete}
        onOpenChange={open => { if (!deleting) setOpenDelete(open) }}
        title="Excluir Senha TEF"
        description={`Excluir a senha TEF do posto "${selected?.posto?.nome}"?`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
