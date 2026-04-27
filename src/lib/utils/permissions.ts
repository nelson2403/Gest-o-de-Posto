import type { Role } from '@/types/database.types'

// Permissões efetivas do usuário atual (null = usar role padrão)
// Atualizado pelo AuthContext — permite que can() funcione corretamente em todo o app
let _permissoesEfetivas: string[] | null = null

export function setPermissoesEfetivasGlobal(p: string[] | null) {
  _permissoesEfetivas = p
}

export const PERMISSIONS = {
  // Dashboard — somente master
  'dashboard.view':  ['master'],
  'analitico.view':  ['master'],

  // Empresas — somente master
  'empresas.view':    ['master'],
  'empresas.create':  ['master'],
  'empresas.edit':    ['master'],
  'empresas.delete':  ['master'],

  // Usuários — somente master (admin removido)
  'usuarios.view':    ['master'],
  'usuarios.create':  ['master'],
  'usuarios.edit':    ['master'],
  'usuarios.delete':  ['master'],

  // Postos — admin pode visualizar mas não configura (create/edit/delete somente master)
  'postos.view':      ['master', 'admin', 'operador', 'conciliador'],
  'postos.create':    ['master'],
  'postos.edit':      ['master'],
  'postos.delete':    ['master'],

  // Adquirentes — somente master
  'adquirentes.view':   ['master'],
  'adquirentes.create': ['master'],
  'adquirentes.edit':   ['master'],
  'adquirentes.delete': ['master'],

  // Maquininhas — somente master (admin removido)
  'maquininhas.view':   ['master'],
  'maquininhas.create': ['master'],
  'maquininhas.edit':   ['master'],
  'maquininhas.delete': ['master'],

  // Taxas — somente master
  'taxas.view':   ['master'],
  'taxas.create': ['master'],
  'taxas.edit':   ['master'],
  'taxas.delete': ['master'],

  // Formas de Pagamento por Adquirente — somente master
  'formas_pagamento.view':   ['master'],
  'formas_pagamento.create': ['master'],
  'formas_pagamento.edit':   ['master'],
  'formas_pagamento.delete': ['master'],

  // Portais — operador/conciliador visualiza apenas
  'portais.view':   ['master', 'admin', 'operador', 'conciliador'],
  'portais.create': ['master', 'admin'],
  'portais.edit':   ['master', 'admin'],
  'portais.delete': ['master', 'admin'],

  // Acessos — operador pode criar, editar e excluir; conciliador só visualiza
  'acessos.view':        ['master', 'admin', 'operador', 'conciliador'],
  'acessos.create':      ['master', 'admin', 'operador'],
  'acessos.edit':        ['master', 'admin', 'operador'],
  'acessos.edit_senha':  ['master', 'admin', 'operador', 'conciliador'],
  'acessos.delete':      ['master', 'admin', 'operador'],

  // AnyDesk — operador/conciliador visualiza apenas
  'anydesk.view':   ['master', 'admin', 'operador', 'conciliador'],
  'anydesk.create': ['master', 'admin'],
  'anydesk.edit':   ['master', 'admin'],
  'anydesk.delete': ['master', 'admin'],

  // Servidores — somente master (admin removido)
  'servidores.view':   ['master'],
  'servidores.create': ['master'],
  'servidores.edit':   ['master'],
  'servidores.delete': ['master'],

  // Contas Bancárias — admin mantém acesso
  'contas_bancarias.view':   ['master', 'admin'],
  'contas_bancarias.create': ['master', 'admin'],
  'contas_bancarias.edit':   ['master', 'admin'],
  'contas_bancarias.delete': ['master', 'admin'],

  // Câmeras — admin mantém acesso
  'cameras.view':   ['master', 'admin'],
  'cameras.create': ['master', 'admin'],
  'cameras.edit':   ['master', 'admin'],
  'cameras.delete': ['master', 'admin'],

  // Tarefas — admin pode ver e criar, mas não editar nem excluir
  'tarefas.view':   ['master', 'admin', 'operador', 'conciliador'],
  'tarefas.create': ['master', 'admin', 'operador'],
  'tarefas.edit':   ['master', 'operador', 'conciliador'],
  'tarefas.delete': ['master'],

  // Tarefas recorrentes — somente master
  'tarefas_recorrentes.view':   ['master'],
  'tarefas_recorrentes.create': ['master'],
  'tarefas_recorrentes.edit':   ['master'],
  'tarefas_recorrentes.delete': ['master'],

  // Relatórios — todos os roles (conteúdo filtrado por permissão)
  'relatorios.view':          ['master', 'admin', 'operador', 'conciliador'],

  // Fiscal — master e admin veem tudo; fiscal lança; gerente anexa documentos
  'fiscal.view':    ['master', 'admin', 'fiscal', 'gerente', 'conciliador'],
  'fiscal.geracao': ['master', 'admin', 'fiscal'],
  'fiscal.lancar':  ['master', 'admin', 'fiscal'],
  'fiscal.gerente': ['master', 'admin', 'fiscal', 'gerente'],
  'relatorios.conciliacao':   ['master', 'admin', 'conciliador'],

  // Painel de Extrato Bancário — somente master
  'extrato_painel.view': ['master'],

  // Contas a Receber AUTOSYSTEM — master e admin
  'contas_receber.view': ['master', 'admin'],

  // Senhas TEF — somente master (admin removido)
  'senhas_tef.view':   ['master'],
  'senhas_tef.create': ['master'],
  'senhas_tef.edit':   ['master'],
  'senhas_tef.delete': ['master'],

  // Controle de Caixas — admin, conciliador e fechador podem ver; somente master configura
  'controle_caixas.view':       ['master', 'admin', 'conciliador', 'fechador'],
  'controle_caixas.configurar': ['master'],

  // Bobinas — somente master (admin removido)
  'bobinas.view':   ['master'],
  'bobinas.create': ['master'],
  'bobinas.delete': ['master'],

  // Audit
  'audit.view': ['master', 'admin'],

  // Contas a Pagar
  'contas_pagar.view':        ['master', 'admin', 'fechador', 'operador'],
  'contas_pagar.lancar':      ['master', 'admin', 'fechador', 'operador'],
  'contas_pagar.reconciliar': ['master', 'admin'],
  'contas_pagar.fixas.view':  ['master', 'admin'],
  'contas_pagar.fixas.edit':  ['master', 'admin'],
  'contas_pagar.gerar_mes':   ['master', 'admin'],
  'contas_pagar.marcar_pago': ['master', 'admin', 'fechador'],

  // Estoque — master, admin e operador
  'estoque.view': ['master', 'admin', 'operador'],

  // Transpombal — logística de abastecimento
  'transpombal.view': ['master', 'admin', 'transpombal'],
  'transpombal.edit': ['master', 'admin', 'transpombal'],

  // Medição de Tanques — gerentes registram o nível diário
  'tanques.view': ['master', 'admin', 'operador', 'gerente', 'transpombal'],
  'tanques.edit': ['master', 'admin', 'gerente'],

  // Máscaras (DRE / Fluxo de Caixa) — somente master
  'mascaras.view': ['master'],
  'mascaras.edit': ['master'],

  // Marketing
  // gerente: só cria patrocínio e anexa documentos do seu posto
  // operador: mesmo acesso que gerente
  // marketing: gestão completa (aprovar, criar ações, conciliação)
  'marketing.view':               ['master', 'admin', 'marketing', 'operador', 'gerente'],
  'marketing.create_patrocinio':  ['master', 'admin', 'marketing', 'operador', 'gerente'],
  'marketing.anexar_documento':   ['master', 'admin', 'marketing', 'operador', 'gerente'],
  'marketing.ver_acoes':          ['master', 'admin', 'marketing', 'operador', 'gerente'],
  'marketing.aprovar':            ['master', 'admin', 'marketing'],
  'marketing.create_acao':        ['master', 'admin', 'marketing'],
  'marketing.conciliacao':        ['master', 'admin', 'marketing'],
  'marketing.config':             ['master', 'admin', 'marketing'],
} as const

export type Permission = keyof typeof PERMISSIONS

export function can(role: Role | null | undefined, permission: Permission, permissoes?: string[] | null): boolean {
  // Prioridade: argumento explícito > global do AuthContext > role padrão
  const efetivas = permissoes !== undefined ? permissoes : _permissoesEfetivas
  if (efetivas != null) return efetivas.includes(permission)
  if (!role) return false
  return (PERMISSIONS[permission] as readonly string[]).includes(role)
}

export const ROLE_LABELS: Record<Role, string> = {
  master:       'Master',
  admin:        'Administrador',
  operador:     'Operador',
  conciliador:  'Conciliador',
  fechador:     'Fechador de Caixa',
  marketing:    'Marketing',
  gerente:      'Gerente de Posto',
  transpombal:  'Transpombal',
}

export const ROLE_COLORS: Record<Role, string> = {
  master:       'bg-purple-100 text-purple-800',
  admin:        'bg-blue-100 text-blue-800',
  operador:     'bg-green-100 text-green-800',
  conciliador:  'bg-cyan-100 text-cyan-800',
  fechador:     'bg-orange-100 text-orange-800',
  marketing:    'bg-pink-100 text-pink-800',
  gerente:      'bg-teal-100 text-teal-800',
  transpombal:  'bg-yellow-100 text-yellow-800',
}
