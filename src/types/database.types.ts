export type Role = 'master' | 'admin' | 'operador' | 'conciliador' | 'fechador' | 'marketing' | 'gerente' | 'transpombal'
export type StatusEmpresa = 'ativo' | 'inativo' | 'suspenso'
export type StatusMaquininha = 'ativo' | 'inativo' | 'estoque' | 'manutencao' | 'extraviada' | 'devolvida'

export interface Empresa {
  id: string
  nome: string
  cnpj: string | null
  email: string | null
  status: StatusEmpresa
  criado_em: string
  atualizado_em: string
}

export interface PerfilPermissoes {
  id: string
  empresa_id: string | null
  nome: string
  descricao: string | null
  permissoes: string[]
  criado_em: string
  atualizado_em: string
}

export interface Usuario {
  id: string
  nome: string
  email: string
  empresa_id: string | null
  role: Role
  perfil_id: string | null
  posto_fechamento_id: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
  empresa?: Empresa
  perfil?: PerfilPermissoes | null
}

export interface Posto {
  id: string
  empresa_id: string
  nome: string
  cnpj: string | null
  endereco: string | null
  email: string | null
  senha_email: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
  empresa?: Empresa
}

export interface Adquirente {
  id: string
  empresa_id: string
  nome: string
  ativo: boolean
  criado_em: string
}

export interface Maquininha {
  id: string
  posto_id: string
  adquirente_id: string
  numero_serie: string | null
  modelo: string | null
  status: StatusMaquininha
  motivo_status: string | null
  valor_aluguel: number | null
  numero_logico: string | null
  criado_em: string
  atualizado_em: string
  posto?: Posto
  adquirente?: Adquirente
}

export type AbrangenciaTaxa = 'posto_especifico' | 'todos_postos' | 'multiplos_postos'

export interface AdquirenteFormaPagamento {
  id: string
  adquirente_id: string
  nome: string
  ativo: boolean
  criado_em: string
  atualizado_em: string
  adquirente?: Adquirente
}

export interface Taxa {
  id: string
  posto_id: string | null
  adquirente_id: string
  forma_pagamento_id: string | null
  abrangencia: AbrangenciaTaxa
  taxa_debito: number | null
  taxa_credito: number | null
  taxa_credito_parcelado: number | null
  observacoes: string | null
  criado_em: string
  atualizado_em: string
  posto?: Posto
  adquirente?: Adquirente
  forma_pagamento?: AdquirenteFormaPagamento
  taxa_postos?: { posto_id: string; posto?: Posto }[]
}

export interface Portal {
  id: string
  empresa_id: string
  nome: string
  url: string | null
  ativo: boolean
  criado_em: string
}

export interface AcessoAnydesk {
  id: string
  posto_id: string
  numero_anydesk: string
  senha: string | null
  observacoes: string | null
  criado_em: string
  atualizado_em: string
  posto?: Posto
}

export interface AcessoUnificado {
  id: string
  posto_id: string | null
  portal_id: string
  empresa_id: string | null
  login: string
  senha: string | null
  observacoes: string | null
  criado_em: string
  atualizado_em: string
  posto?: Posto
  portal?: Portal
  empresa?: Empresa
}

export interface AcessoPosto {
  id: string
  posto_id: string
  portal_id: string
  login: string
  senha: string | null
  observacoes: string | null
  criado_em: string
  atualizado_em: string
  posto?: Posto
  portal?: Portal
}

export interface ServidorPosto {
  id: string
  posto_id: string
  nome_banco: string | null
  ip: string
  porta: number | null
  usuario: string | null
  senha: string | null
  observacoes: string | null
  criado_em: string
  atualizado_em: string
  posto?: Posto
}

export interface PostoContato {
  id: string
  posto_id: string
  nome: string
  telefone: string | null
  cargo: string | null
  principal: boolean
  criado_em: string
}

export interface AuditLog {
  id: string
  tabela: string
  registro_id: string | null
  usuario_id: string | null
  acao: string
  dados_anteriores: Record<string, unknown> | null
  dados_novos: Record<string, unknown> | null
  criado_em: string
  usuario?: Usuario
}

export interface ContaBancaria {
  id: string
  posto_id: string | null
  empresa_id: string | null
  banco: string
  agencia: string
  conta: string
  observacoes: string | null
  codigo_conta_externo: string | null
  criado_em: string
  atualizado_em: string
  posto?: Posto
  empresa?: Empresa
}

export type TipoCamera = 'icloud' | 'ip'

export interface AcessoCamera {
  id: string
  posto_id: string | null
  empresa_id: string | null
  tipo: TipoCamera
  endereco: string
  usuario: string | null
  senha: string | null
  porta: number | null
  observacoes: string | null
  criado_em: string
  atualizado_em: string
  posto?: Posto
  empresa?: Empresa
}

export type StatusTarefa   = 'pendente' | 'em_andamento' | 'concluido' | 'cancelado'
export type PrioridadeTarefa = 'baixa' | 'media' | 'alta' | 'urgente'
export type CategoriaTarefa =
  | 'fechamento_caixa'
  | 'lancamento_notas'
  | 'faturamento'
  | 'conciliacao_bancaria'
  | 'apuracao_impostos'
  | 'folha_pagamento'
  | 'relatorio_gerencial'
  | 'auditoria'
  | 'outros'

export interface Tarefa {
  id: string
  empresa_id: string
  usuario_id: string
  posto_id: string | null
  titulo: string
  descricao: string | null
  status: StatusTarefa
  prioridade: PrioridadeTarefa
  categoria: CategoriaTarefa | null
  data_inicio: string | null
  data_conclusao_prevista: string | null
  data_conclusao_real: string | null
  observacoes: string | null
  // Extrato bancário
  extrato_arquivo_path: string | null
  extrato_arquivo_nome: string | null
  extrato_data: string | null
  extrato_saldo_dia: number | null
  extrato_saldo_anterior: number | null
  extrato_movimento: number | null
  extrato_saldo_externo: number | null
  extrato_diferenca: number | null
  extrato_status: 'ok' | 'divergente' | null
  extrato_validado_em: string | null
  criado_em: string
  atualizado_em: string
  usuario?: Pick<Usuario, 'id' | 'nome' | 'email'>
  empresa?: Pick<Empresa, 'id' | 'nome'>
}

export interface TarefaRecorrente {
  id: string
  empresa_id: string
  usuario_id: string
  posto_id: string | null
  titulo: string
  descricao: string | null
  categoria: CategoriaTarefa | null
  prioridade: PrioridadeTarefa
  carencia_dias: number
  tolerancia_dias: number
  ativo: boolean
  criado_em: string
  atualizado_em: string
  usuario?: Pick<Usuario, 'id' | 'nome' | 'email'>
  posto?: Pick<Posto, 'id' | 'nome'>
  empresa?: Pick<Empresa, 'id' | 'nome'>
}

export interface SenhaTef {
  id: string
  empresa_id: string
  posto_id: string
  senha: string
  criado_em: string
  atualizado_em: string
  posto?: Pick<Posto, 'id' | 'nome' | 'cnpj'>
}

export type TipoMascara     = 'dre' | 'fluxo_caixa'
export type TipoLinhaMascara = 'grupo' | 'subtotal'

export interface Mascara {
  id: string
  tipo: TipoMascara
  nome: string
  descricao: string | null
  criado_em: string
  atualizado_em: string
  total_linhas?: number
}

export interface MascaraLinha {
  id: string
  mascara_id: string
  parent_id: string | null
  ordem: number
  nome: string
  tipo_linha: TipoLinhaMascara
  criado_em: string
  atualizado_em: string
}

export interface DashboardEmpresa {
  empresa_id: string
  empresa_nome: string
  total_postos: number
  total_maquininhas: number
  maquininhas_ativas: number
  maquininhas_inativas: number
  maquininhas_manutencao: number
  total_usuarios: number
  total_adquirentes: number
}
