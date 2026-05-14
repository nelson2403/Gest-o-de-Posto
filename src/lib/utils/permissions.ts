import type { Role } from '@/types/database.types'

// Permissões efetivas do usuário atual (null = usar role padrão)
let _permissoesEfetivas: string[] | null = null

export function setPermissoesEfetivasGlobal(p: string[] | null) {
  _permissoesEfetivas = p
}

const ADM_ALL = ['master', 'adm_financeiro', 'adm_fiscal', 'adm_marketing', 'adm_transpombal', 'adm_contas_pagar'] as const
const ACESSO_ALL = [...ADM_ALL, 'operador_caixa', 'operador_conciliador'] as const

export const PERMISSIONS = {
  // Dashboard — somente master
  'dashboard.view':  ['master'],

  // Analítico — master vê tudo; ADMs veem o analítico da sua área
  'analitico.view':  ['master', 'adm_financeiro', 'adm_fiscal', 'adm_marketing', 'adm_transpombal', 'adm_contas_pagar'],

  // Empresas — master + ADMs fiscais/marketing/transpombal/contas a pagar
  'empresas.view':    ['master', 'adm_fiscal', 'adm_marketing', 'adm_transpombal', 'adm_contas_pagar'],
  'empresas.create':  ['master', 'adm_fiscal', 'adm_marketing', 'adm_transpombal', 'adm_contas_pagar'],
  'empresas.edit':    ['master', 'adm_fiscal', 'adm_marketing', 'adm_transpombal', 'adm_contas_pagar'],
  'empresas.delete':  ['master', 'adm_fiscal', 'adm_marketing', 'adm_transpombal', 'adm_contas_pagar'],

  // Usuários — somente master
  'usuarios.view':    ['master'],
  'usuarios.create':  ['master'],
  'usuarios.edit':    ['master'],
  'usuarios.delete':  ['master'],

  // Postos
  'postos.view':      [...ACESSO_ALL, 'gerente', 'rh'],
  'postos.create':    [...ADM_ALL],
  'postos.edit':      [...ADM_ALL],
  'postos.delete':    [...ADM_ALL],

  // Adquirentes — master + adm_financeiro
  'adquirentes.view':   ['master', 'adm_financeiro'],
  'adquirentes.create': ['master', 'adm_financeiro'],
  'adquirentes.edit':   ['master', 'adm_financeiro'],
  'adquirentes.delete': ['master', 'adm_financeiro'],

  // Maquininhas — somente master
  'maquininhas.view':   ['master'],
  'maquininhas.create': ['master'],
  'maquininhas.edit':   ['master'],
  'maquininhas.delete': ['master'],

  // Taxas — master + adm_financeiro
  'taxas.view':   ['master', 'adm_financeiro'],
  'taxas.create': ['master', 'adm_financeiro'],
  'taxas.edit':   ['master', 'adm_financeiro'],
  'taxas.delete': ['master', 'adm_financeiro'],

  // Formas de Pagamento — master + adm_financeiro
  'formas_pagamento.view':   ['master', 'adm_financeiro'],
  'formas_pagamento.create': ['master', 'adm_financeiro'],
  'formas_pagamento.edit':   ['master', 'adm_financeiro'],
  'formas_pagamento.delete': ['master', 'adm_financeiro'],

  // Portais
  'portais.view':   [...ACESSO_ALL],
  'portais.create': [...ADM_ALL],
  'portais.edit':   [...ADM_ALL],
  'portais.delete': [...ADM_ALL],

  // Acessos
  'acessos.view':       [...ACESSO_ALL],
  'acessos.create':     [...ADM_ALL],
  'acessos.edit':       [...ADM_ALL],
  'acessos.edit_senha': [...ADM_ALL, 'operador_conciliador'],
  'acessos.delete':     [...ADM_ALL],

  // Códigos de Implantação (adquirente + posto)
  'implantacao.view':   ['master', 'adm_financeiro'],
  'implantacao.create': ['master', 'adm_financeiro'],
  'implantacao.edit':   ['master', 'adm_financeiro'],
  'implantacao.delete': ['master', 'adm_financeiro'],

  // AnyDesk
  'anydesk.view':   [...ACESSO_ALL, 'rh'],
  'anydesk.create': [...ADM_ALL],
  'anydesk.edit':   [...ADM_ALL],
  'anydesk.delete': [...ADM_ALL],

  // Servidores — somente ADMs
  'servidores.view':   [...ADM_ALL],
  'servidores.create': [...ADM_ALL],
  'servidores.edit':   [...ADM_ALL],
  'servidores.delete': [...ADM_ALL],

  // Contas Bancárias — adm_financeiro + rh (somente leitura)
  'contas_bancarias.view':   ['master', 'adm_financeiro', 'rh'],
  'contas_bancarias.create': ['master', 'adm_financeiro'],
  'contas_bancarias.edit':   ['master', 'adm_financeiro'],
  'contas_bancarias.delete': ['master', 'adm_financeiro'],

  // Câmeras — ADMs + rh (somente leitura)
  'cameras.view':   [...ADM_ALL, 'rh'],
  'cameras.create': [...ADM_ALL],
  'cameras.edit':   [...ADM_ALL],
  'cameras.delete': [...ADM_ALL],

  // Tarefas
  'tarefas.view':   [...ACESSO_ALL, 'gerente', 'rh'],
  'tarefas.create': [...ACESSO_ALL],
  'tarefas.edit':   [...ADM_ALL, 'operador_conciliador'],
  'tarefas.delete': ['master'],

  // Tarefas recorrentes — somente master
  'tarefas_recorrentes.view':   ['master'],
  'tarefas_recorrentes.create': ['master'],
  'tarefas_recorrentes.edit':   ['master'],
  'tarefas_recorrentes.delete': ['master'],

  // Relatórios — todos os roles
  'relatorios.view': [...ACESSO_ALL, 'gerente'],

  // Fiscal — adm_fiscal gerencia; gerente e rh veem tarefas
  'fiscal.view':    ['master', 'adm_fiscal', 'gerente', 'rh'],
  'fiscal.geracao': ['master', 'adm_fiscal'],
  'fiscal.lancar':  ['master', 'adm_fiscal'],
  'fiscal.gerente': ['master', 'adm_fiscal', 'gerente'],

  // Solicitações de pagamento inter-setorial
  'solicitacoes_pagamento.view':   ['master', 'adm_fiscal', 'adm_marketing', 'adm_transpombal', 'adm_contas_pagar'],
  'solicitacoes_pagamento.create': ['master', 'adm_fiscal', 'adm_marketing', 'adm_transpombal'],
  'solicitacoes_pagamento.manage': ['master', 'adm_contas_pagar'],

  // Conciliação bancária
  'relatorios.conciliacao': ['master', 'adm_financeiro', 'operador_conciliador'],

  // Extrato bancário
  'extrato_painel.view': ['master', 'adm_financeiro'],

  // Contas a Receber — adm_financeiro
  'contas_receber.view': ['master', 'adm_financeiro'],

  // Senhas TEF — somente ADMs
  'senhas_tef.view':   [...ADM_ALL],
  'senhas_tef.create': [...ADM_ALL],
  'senhas_tef.edit':   [...ADM_ALL],
  'senhas_tef.delete': [...ADM_ALL],

  // Controle de Caixas
  'controle_caixas.view':       ['master', 'adm_financeiro', 'operador_caixa', 'operador_conciliador', 'rh'],
  'controle_caixas.configurar': ['master'],

  // Bobinas — somente master
  'bobinas.view':   ['master'],
  'bobinas.create': ['master'],
  'bobinas.delete': ['master'],

  // Audit
  'audit.view': ['master'],

  // Contas a Pagar
  'contas_pagar.view':        ['master', 'adm_contas_pagar'],
  'contas_pagar.lancar':      ['master', 'adm_contas_pagar'],
  'contas_pagar.reconciliar': ['master', 'adm_contas_pagar'],
  'contas_pagar.fixas.view':  ['master', 'adm_contas_pagar'],
  'contas_pagar.fixas.edit':  ['master', 'adm_contas_pagar'],
  'contas_pagar.gerar_mes':   ['master', 'adm_contas_pagar'],
  'contas_pagar.marcar_pago': ['master', 'adm_contas_pagar'],

  // Estoque — adm_transpombal (Compras)
  'estoque.view':         ['master', 'adm_transpombal'],
  'estoque.contagem':     ['master', 'adm_transpombal', 'operador_contagem'],
  'uso_consumo.view':     ['master', 'adm_financeiro', 'adm_transpombal'],
  'uso_consumo.lancar':   ['master', 'adm_financeiro'],
  'uso_consumo.produtos': ['master', 'adm_financeiro'],

  // Transpombal
  'transpombal.view': ['master', 'adm_transpombal'],
  'transpombal.edit': ['master', 'adm_transpombal'],

  // Medição de Tanques — gerentes registram o nível diário
  'tanques.view': ['master', 'adm_transpombal', 'adm_fiscal', 'gerente'],
  'tanques.edit': ['master', 'adm_transpombal', 'adm_fiscal', 'gerente'],

  // Máscaras (DRE / Fluxo de Caixa) — somente master
  'mascaras.view': ['master'],
  'mascaras.edit': ['master'],

  // Marketing — adm_marketing gerencia; gerente cria patrocínio e anexa docs
  'marketing.view':               ['master', 'adm_marketing', 'gerente'],
  'marketing.create_patrocinio':  ['master', 'adm_marketing', 'gerente'],
  'marketing.anexar_documento':   ['master', 'adm_marketing', 'gerente'],
  'marketing.ver_acoes':          ['master', 'adm_marketing', 'gerente'],
  'marketing.aprovar':            ['master', 'adm_marketing'],
  'marketing.create_acao':        ['master', 'adm_marketing'],
  'marketing.conciliacao':        ['master', 'adm_marketing'],
  'marketing.config':             ['master', 'adm_marketing'],
} as const

export type Permission = keyof typeof PERMISSIONS

export function can(role: Role | null | undefined, permission: Permission, permissoes?: string[] | null): boolean {
  if (role === 'master') return true
  const efetivas = permissoes !== undefined ? permissoes : _permissoesEfetivas
  if (efetivas != null) return efetivas.includes(permission)
  if (!role) return false
  return (PERMISSIONS[permission] as readonly string[]).includes(role)
}

const ROLE_LABELS_LEGADO: Record<string, string> = {
  admin: 'ADM Financeiro', operador: 'Operador', conciliador: 'Conciliador',
  fechador: 'Fechador de Caixa', marketing: 'Marketing',
  transpombal: 'Transpombal', fiscal: 'Fiscal',
}

const ROLE_COLORS_LEGADO: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-800', operador: 'bg-green-100 text-green-800',
  conciliador: 'bg-cyan-100 text-cyan-800', fechador: 'bg-orange-100 text-orange-800',
  marketing: 'bg-pink-100 text-pink-800', transpombal: 'bg-yellow-100 text-yellow-800',
  fiscal: 'bg-indigo-100 text-indigo-800',
}

export function getRoleLabel(role: string | null | undefined): string {
  if (!role) return '—'
  return (ROLE_LABELS as Record<string, string>)[role]
    ?? ROLE_LABELS_LEGADO[role]
    ?? role
}

export function getRoleColor(role: string | null | undefined): string {
  if (!role) return 'bg-gray-100 text-gray-600'
  return (ROLE_COLORS as Record<string, string>)[role]
    ?? ROLE_COLORS_LEGADO[role]
    ?? 'bg-gray-100 text-gray-600'
}

export const ROLE_LABELS: Record<Role, string> = {
  master:               'Perfil Master',
  adm_financeiro:       'Perfil ADM (Financeiro)',
  adm_fiscal:           'Perfil ADM (Fiscal)',
  adm_marketing:        'Perfil ADM (Marketing)',
  adm_transpombal:      'Perfil ADM (Transpombal)',
  adm_contas_pagar:     'Perfil ADM (Contas a Pagar)',
  operador_caixa:       'Operador (Fechador de Caixa)',
  operador_conciliador: 'Operador (Conciliador Bancário)',
  operador_contagem:    'Operador (Contagem de Estoque)',
  gerente:              'Gerente',
  rh:                   'RH',
}

export const ROLE_COLORS: Record<Role, string> = {
  master:               'bg-purple-100 text-purple-800',
  adm_financeiro:       'bg-blue-100 text-blue-800',
  adm_fiscal:           'bg-indigo-100 text-indigo-800',
  adm_marketing:        'bg-pink-100 text-pink-800',
  adm_transpombal:      'bg-yellow-100 text-yellow-800',
  adm_contas_pagar:     'bg-orange-100 text-orange-800',
  operador_caixa:       'bg-green-100 text-green-800',
  operador_conciliador: 'bg-cyan-100 text-cyan-800',
  operador_contagem:    'bg-lime-100 text-lime-800',
  gerente:              'bg-teal-100 text-teal-800',
  rh:                   'bg-rose-100 text-rose-800',
}
