import { Badge } from '@/components/ui/badge'
import type { StatusEmpresa, StatusMaquininha } from '@/types/database.types'

const STATUS_EMPRESA: Record<StatusEmpresa, { label: string; variant: 'success' | 'destructive' | 'warning' }> = {
  ativo:    { label: 'Ativo',     variant: 'success' },
  inativo:  { label: 'Inativo',  variant: 'destructive' },
  suspenso: { label: 'Suspenso', variant: 'warning' },
}

const STATUS_MAQUININHA: Record<StatusMaquininha, { label: string; variant: 'success' | 'destructive' | 'warning' | 'secondary' }> = {
  ativo:      { label: 'Ativa',       variant: 'success' },
  inativo:    { label: 'Inativa',     variant: 'destructive' },
  estoque:    { label: 'Estoque',     variant: 'secondary' },
  manutencao: { label: 'Manutenção',  variant: 'warning' },
  extraviada: { label: 'Extraviada',  variant: 'secondary' },
}

export function StatusEmpresaBadge({ status }: { status: StatusEmpresa }) {
  const s = STATUS_EMPRESA[status]
  return <Badge variant={s.variant}>{s.label}</Badge>
}

export function StatusMaquininhaBadge({ status }: { status: StatusMaquininha }) {
  const s = STATUS_MAQUININHA[status]
  return <Badge variant={s.variant as never}>{s.label}</Badge>
}

export function AtivoInativoBadge({ ativo }: { ativo: boolean }) {
  return <Badge variant={ativo ? 'success' : 'destructive'}>{ativo ? 'Ativo' : 'Inativo'}</Badge>
}
