import type { ElementType } from 'react'
import {
  LayoutDashboard, Building2, Users, MapPin, CreditCard,
  Smartphone, Percent, Globe, Link2, KeyRound, Monitor,
  Server, Fuel, FileText,
  Landmark, Camera, BarChart2, ClipboardList, ShieldCheck,
  Archive, Layers, CheckSquare, ScanSearch, ReceiptText, Lock,
  TrendingUp, Wallet, Receipt, Settings, Megaphone, Gift, Database,
  PackageSearch, Truck, CalendarDays, ShoppingCart,
  Banknote, Hash, Target, Calculator, AlertTriangle, Croissant, Wheat, Factory,
  Scale,
} from 'lucide-react'
import type { Role } from '@/types/database.types'
import type { Permission } from '@/lib/utils/permissions'

// ─── Nav types ────────────────────────────────────────────────────────────────

export type NavChild = { href: string; label: string; icon: ElementType; permission: Permission | null; hideForRoles?: Role[] }
export type NavItem  = { href?: string; label: string; icon: ElementType; permission: Permission | null; children?: NavChild[]; divider?: boolean; hideForRoles?: Role[] }
export type NavGroup = { label: string; items: NavItem[]; onlyForRoles?: Role[] }

// Apenas o master mantém a subbar do topo; todos os outros navegam pela home de cards.
// Perfis de baixo acesso (poucas páginas) veem os cards em lista única (flat);
// os ADMs veem agrupado por seção.
export const ROLES_BAIXO_ACESSO: Role[] = ['gerente', 'operador_caixa', 'operador_conciliador', 'operador_contagem']

// ─── Nav structure (fonte única: subbar + cards da home) ────────────────────────

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Cadastros',
    items: [
      { href: '/empresas',                   label: 'Empresas',           icon: Building2,  permission: 'empresas.view' as Permission },
      { href: '/postos',                      label: 'Postos',             icon: MapPin,     permission: 'postos.view' as Permission },
      { href: '/usuarios',                    label: 'Usuários',           icon: Users,      permission: 'usuarios.view' as Permission },
      { href: '/formas-pagamento-adquirente', label: 'Formas de Pgto.',   icon: Wallet,     permission: 'formas_pagamento.view' as Permission },
      { href: '/maquininhas',                 label: 'Maquininhas',        icon: Smartphone, permission: 'maquininhas.view' as Permission },
      { href: '/taxas',                       label: 'Taxas',              icon: Percent,    permission: 'taxas.view' as Permission },
      { href: '/adquirentes',                 label: 'Adquirentes',        icon: CreditCard, permission: 'adquirentes.view' as Permission },
      { href: '/codigos-implantacao',         label: 'Cód. de Implantação', icon: Hash,       permission: 'implantacao.view' as Permission },
      { href: '/contas-bancarias',            label: 'Contas Bancárias',   icon: Landmark,   permission: 'contas_bancarias.view' as Permission },
      {
        label: 'Máscaras', icon: Layers, permission: 'mascaras.view' as Permission, divider: true,
        children: [
          { href: '/mascaras/dre',         label: 'DRE',            icon: BarChart2,  permission: 'mascaras.view' as Permission },
          { href: '/mascaras/fluxo-caixa', label: 'Fluxo de Caixa', icon: TrendingUp, permission: 'mascaras.view' as Permission },
        ],
      },
      {
        label: 'Configurações', icon: Settings, permission: null,
        children: [
          { href: '/perfis',                        label: 'Perfis de Acesso',         icon: ShieldCheck, permission: 'usuarios.edit' as Permission },
          { href: '/controle-caixas/configuracoes', label: 'Config. de Caixas',        icon: Settings,    permission: 'controle_caixas.configurar' as Permission },
          { href: '/fechamento-frentista',           label: 'Fechamento Frentista',     icon: Banknote,    permission: 'controle_caixas.configurar' as Permission },
          { href: '/contas-receber/configuracao',   label: 'Config. Contas a Receber', icon: ReceiptText, permission: 'contas_receber.view' as Permission },
        ],
      },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { href: '/contas-receber', label: 'Contas a Receber', icon: ReceiptText, permission: 'contas_receber.view' as Permission },
      {
        label: 'Contas a Pagar', icon: Receipt, permission: 'contas_pagar.view' as Permission,
        children: [
          { href: '/contas-pagar/conferencia', label: 'Conferência Diária',    icon: ClipboardList, permission: 'contas_pagar.lancar' as Permission },
          { href: '/contas-pagar/fixas',       label: 'Despesas Fixas',        icon: Wallet,        permission: 'contas_pagar.fixas.view' as Permission },
          { href: '/contas-pagar/titulos',     label: 'Títulos a Pagar',       icon: Database,      permission: 'contas_pagar.view' as Permission },
          { href: '/contas-pagar/boletos',     label: 'Boletos e Solicitações', icon: Receipt,       permission: 'contas_pagar.view' as Permission },
        ],
      },
      {
        label: 'Conciliação Bancária', icon: ScanSearch, permission: 'relatorios.conciliacao' as Permission,
        children: [
          { href: '/tarefas',                       label: 'Gestão de Tarefas',    icon: CheckSquare,   permission: 'tarefas.view' as Permission },
          { href: '/conciliadores/divergencias',    label: '🔴 Divergências',      icon: AlertTriangle, permission: 'tarefas.view' as Permission },
          { href: '/relatorios/demonstrativo',     label: 'Demonstrativo',        icon: FileText,      permission: 'contas_bancarias.view' as Permission },
          { href: '/extrato-painel',                label: 'Extrato Bancário',     icon: ScanSearch,    permission: 'extrato_painel.view' as Permission },
          { href: '/tarefas/conciliacao',          label: 'Geração de Tarefas',   icon: ClipboardList, permission: 'contas_bancarias.view' as Permission },
          { href: '/conciliadores',                label: 'Conciliadores',        icon: Users,         permission: 'usuarios.edit' as Permission },
        ],
      },
      { href: '/controle-caixas',     label: 'Controle de Caixas',   icon: CheckSquare, permission: 'controle_caixas.view' as Permission },
      { href: '/controle-dinheiro',   label: 'Controle de Dinheiro', icon: Banknote,    permission: 'controle_caixas.view' as Permission },
      { href: '/financeiro/fechamento-caixa-eletronico', label: 'Fechamento de Caixa', icon: Receipt, permission: 'controle_caixas.view' as Permission },
    ],
  },
  {
    label: 'Fiscal',
    items: [
      { href: '/fiscal',         label: 'Painel Fiscal',      icon: Scale,         permission: 'fiscal.view' as Permission, hideForRoles: ['gerente', 'rh'] },
      { href: '/fiscal/tarefas', label: 'Tarefas Fiscal',     icon: ClipboardList, permission: 'fiscal.view' as Permission },
      { href: '/fiscal/geracao', label: 'Geração de Tarefas', icon: FileText,      permission: 'fiscal.geracao' as Permission },
    ],
  },
  {
    label: 'Compras',
    items: [
      { href: '/estoque',             label: 'Estoque',            icon: PackageSearch, permission: 'estoque.view' as Permission },
      { href: '/estoque/contagem',    label: 'Contagem',           icon: ClipboardList, permission: 'estoque.contagem' as Permission },
      { href: '/estoque/uso-consumo', label: 'Uso e Consumo',      icon: Archive,       permission: 'uso_consumo.view' as Permission },
      { href: '/sugestao-pedido',     label: 'Sugestão de Pedido', icon: ShoppingCart,  permission: 'estoque.view' as Permission },
      { href: '/fornecedores',        label: 'Fornecedores',       icon: Truck,         permission: 'estoque.view' as Permission },
      { href: '/rotina-fornecedores', label: 'Rotina de Visitas',  icon: CalendarDays,  permission: 'estoque.view' as Permission },
    ],
  },
  {
    label: 'Pombal Massas',
    onlyForRoles: ['master'],
    items: [
      { href: '/pombal-massas',           label: 'Painel',          icon: LayoutDashboard, permission: null, hideForRoles: ['gerente'] },
      { href: '/pombal-massas/salgados',  label: 'Salgados',        icon: Croissant,       permission: null, hideForRoles: ['gerente'] },
      { href: '/pombal-massas/insumos',   label: 'Matérias-primas', icon: Wheat,           permission: null, hideForRoles: ['gerente'] },
      { href: '/pombal-massas/producao',  label: 'Produção',        icon: Factory,         permission: null, hideForRoles: ['gerente'] },
      { href: '/pombal-massas/pedidos',   label: 'Pedidos',         icon: ClipboardList,   permission: null },
      { href: '/pombal-massas/relatorios', label: 'Relatórios',     icon: FileText,        permission: null, hideForRoles: ['gerente'] },
    ],
  },
  {
    label: 'Tarefas',
    items: [
      { href: '/tarefas/avulsas', label: 'Gestão de Tarefas', icon: ClipboardList, permission: 'tarefas.view' as Permission },
    ],
  },
  {
    label: 'Comissionamento',
    onlyForRoles: ['master'],
    items: [
      { href: '/comissionamento',            label: 'Dashboard',  icon: LayoutDashboard, permission: null },
      { href: '/comissionamento/membros',    label: 'Membros',    icon: Users,           permission: null },
      { href: '/comissionamento/metas',      label: 'Metas',      icon: Target,          permission: null },
      { href: '/comissionamento/esquemas',   label: 'Esquemas',   icon: ClipboardList,   permission: null },
      { href: '/comissionamento/simulacao',  label: 'Simulação',  icon: Calculator,      permission: null },
      { href: '/comissionamento/relatorios', label: 'Relatórios', icon: FileText,        permission: null },
    ],
  },
  {
    label: 'Controle Geral',
    items: [
      {
        label: 'Máquinas', icon: Layers, permission: 'bobinas.view' as Permission,
        children: [
          { href: '/controle-geral/maquininhas', label: 'Painel Maquininhas',   icon: Smartphone, permission: 'maquininhas.view' as Permission },
          { href: '/bobinas/solicitacoes',        label: 'Troca de Maquininhas', icon: Receipt,    permission: 'bobinas.view' as Permission },
          { href: '/bobinas/trocas',              label: 'Trocas',               icon: Archive,    permission: 'bobinas.view' as Permission },
          { href: '/bobinas/estoque',             label: 'Estoque de Bobinas',   icon: Archive,    permission: 'bobinas.view' as Permission },
        ],
      },
      { href: '/controle-geral/precos-frotas', label: 'Preços Frotas', icon: Fuel, permission: 'portais.view' as Permission, hideForRoles: ['adm_financeiro', 'adm_fiscal', 'adm_marketing', 'adm_transpombal', 'adm_contas_pagar', 'operador_caixa', 'operador_conciliador', 'gerente'] },
      { href: '/controle-geral/uso-consumo', label: 'Uso e Consumo', icon: ShoppingCart, permission: null, hideForRoles: ['operador_caixa', 'operador_conciliador', 'gerente'] },
      {
        label: 'Acessos', icon: KeyRound, permission: null,
        children: [
          { href: '/portais',            label: 'Portais',            icon: Globe,    permission: 'portais.view' as Permission,    hideForRoles: ['adm_fiscal'] },
          { href: '/acessos-unificados', label: 'Acessos Unificados', icon: Link2,    permission: 'acessos.view' as Permission,    hideForRoles: ['adm_fiscal'] },
          { href: '/acessos-postos',     label: 'Acessos dos Postos', icon: KeyRound, permission: 'acessos.view' as Permission,    hideForRoles: ['adm_fiscal'] },
          { href: '/acessos-anydesk',    label: 'AnyDesk',            icon: Monitor,  permission: 'anydesk.view' as Permission },
          { href: '/servidores',         label: 'Servidores',         icon: Server,   permission: 'servidores.view' as Permission, hideForRoles: ['adm_contas_pagar', 'adm_fiscal'] },
          { href: '/acessos-cameras',    label: 'Câmeras',            icon: Camera,   permission: 'cameras.view' as Permission,   hideForRoles: ['adm_contas_pagar', 'adm_fiscal'] },
          { href: '/senhas-tef',         label: 'Senhas TEF',         icon: Lock,     permission: 'senhas_tef.view' as Permission, hideForRoles: ['adm_contas_pagar', 'adm_fiscal'] },
        ],
      },
      { href: '/relatorios', label: 'Relatórios', icon: FileText, permission: 'relatorios.view' as Permission },
    ],
  },
  {
    label: 'Analítico',
    items: [
      { href: '/analitico',        label: 'Analítico',          icon: BarChart2,  permission: 'analitico.view' as Permission },
      { href: '/analise-vendas',   label: 'Análise de Vendas',  icon: TrendingUp, permission: 'analitico.view' as Permission },
    ],
  },
  {
    label: 'Outros',
    items: [
      { href: '/transpombal', label: 'Transpombal — Frota', icon: Truck, permission: 'transpombal.view' as Permission },
      { href: '/tanques',     label: 'Medição de Tanques',  icon: Fuel,  permission: 'tanques.view' as Permission },
      {
        label: 'Marketing', icon: Megaphone, permission: 'marketing.view' as Permission,
        children: [
          { href: '/marketing/patrocinio',  label: 'Patrocínios', icon: Gift,       permission: 'marketing.create_patrocinio' as Permission },
          { href: '/marketing/acoes',       label: 'Ações',       icon: TrendingUp, permission: 'marketing.ver_acoes' as Permission },
          { href: '/marketing/conciliacao', label: 'Conciliação', icon: Link2,      permission: 'marketing.conciliacao' as Permission },
        ],
      },
    ],
  },
]
