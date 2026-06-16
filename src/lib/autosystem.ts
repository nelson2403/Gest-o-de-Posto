import { Pool, PoolClient } from 'pg'

// Cache do pool em globalThis para sobreviver a hot-reloads do Next.js em dev.
// Sem isso, cada reload cria um novo pool e os antigos ficam segurando conexões
// até serem coletadas pelo GC, eventualmente esgotando os slots do servidor.
declare global {
  // eslint-disable-next-line no-var
  var __autosystemPool: Pool | undefined
  // eslint-disable-next-line no-var
  var __asSchemaCache: Map<string, Set<string>> | undefined
}

function getSchemaCache(): Map<string, Set<string>> {
  if (!global.__asSchemaCache) global.__asSchemaCache = new Map()
  return global.__asSchemaCache
}

function getPool(): Pool {
  if (!global.__autosystemPool) {
    const pool = new Pool({
      host:     process.env.EXT_DB_HOST     ?? '192.168.2.200',
      port:     Number(process.env.EXT_DB_PORT ?? 5432),
      database: process.env.EXT_DB_NAME     ?? 'matriz',
      user:     process.env.EXT_DB_USER     ?? 'app_readonly',
      password: process.env.EXT_DB_PASSWORD ?? '',
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    })
    // O banco do AUTOSYSTEM tem dados gravados em WIN1252 mesmo quando server_encoding
    // diz UTF-8 — isso causa "invalid byte sequence" se pedirmos UTF-8 ao servidor.
    // Mantemos client_encoding=WIN1252 (passa bytes crus) e fazemos cast para bytea
    // nas colunas com texto acentuado, decodificando no JS via Buffer.toString('latin1').
    pool.on('connect', (client: PoolClient) => {
      client.query("SET client_encoding = 'WIN1252'")
    })
    // Sem este handler, um erro idle no pg pode virar unhandled rejection
    pool.on('error', (err) => {
      console.error('[autosystem pool] erro idle:', err.message)
    })
    global.__autosystemPool = pool
  }
  return global.__autosystemPool
}

// Decodifica bytea (Buffer) que vem do AUTOSYSTEM como bytes WIN1252.
// node-pg decodifica strings como UTF-8 por default e isso garbla acentos
// quando o banco tem WIN1252. Usar `col::bytea` no SQL e decodificar aqui
// (`latin1` compartilha a mesma codepage com WIN1252 para 0xC0-0xFF, suficiente
// para acentos do PT-BR). Para chars Windows-específicos em 0x80-0x9F seria
// preciso uma tabela de tradução, mas nomes de fornecedores raramente os têm.
function decodeBytea(b: Buffer | null | undefined): string {
  if (!b) return ''
  return b.toString('latin1')
}

export async function queryAS<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return query<T>(sql, params)
}

async function query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = await getPool().connect()
  try {
    const { rows } = await client.query<T>(sql, params)
    return rows
  } finally {
    client.release()
  }
}

// ── movto ────────────────────────────────────────────────────────────────────

export interface MovtoResumo extends Record<string, unknown> {
  conta_debitar:  string | null
  conta_creditar: string | null
  valor:          number
  data?:          string | null
}

export async function buscarMovtosAutosystem(empresaId: number, datas: string[]): Promise<MovtoResumo[]> {
  return query<MovtoResumo>(
    `SELECT conta_debitar::text, conta_creditar::text, valor::float,
            to_char(data, 'YYYY-MM-DD') AS data
     FROM movto WHERE empresa = $1 AND data = ANY($2::date[])`,
    [empresaId, datas],
  )
}

// Movimento de uma CONTA bancária somando TODAS as empresas do grupo.
// Contas bancárias podem ser compartilhadas entre matriz e filiais (mesmo código
// de conta), e o extrato reflete o total do banco — então a conciliação precisa
// consolidar o grupo, não só a empresa do posto.
export async function buscarMovimentoContaGrupo(
  contaCodigo: string,
  empresaGrids: number[],
  datas: string[],
): Promise<{ entradas: number; saidas: number; movimento: number }> {
  if (!empresaGrids.length || !datas.length) return { entradas: 0, saidas: 0, movimento: 0 }
  const rows = await query<{ entradas: number; saidas: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN conta_debitar  = $1 THEN valor ELSE 0 END), 0)::float AS entradas,
       COALESCE(SUM(CASE WHEN conta_creditar = $1 THEN valor ELSE 0 END), 0)::float AS saidas
     FROM movto
     WHERE empresa = ANY($2::bigint[])
       AND data = ANY($3::date[])
       AND (conta_debitar = $1 OR conta_creditar = $1)`,
    [contaCodigo, empresaGrids, datas],
  )
  const entradas = parseFloat((Number(rows[0]?.entradas ?? 0)).toFixed(2))
  const saidas   = parseFloat((Number(rows[0]?.saidas   ?? 0)).toFixed(2))
  return { entradas, saidas, movimento: parseFloat((entradas - saidas).toFixed(2)) }
}

export async function buscarMovtosContasReceber(
  empresaIds: number[],
  opts: { contaCod?: string | null; dataIni?: string | null; dataFim?: string | null; venctoIni?: string; venctoFim?: string | null; limit?: number },
): Promise<Record<string, unknown>[]> {
  const { contaCod, dataIni, dataFim, venctoIni = '2026-01-01', venctoFim, limit = 2000 } = opts
  const params: unknown[] = [empresaIds, venctoIni]
  let sql = `
    SELECT grid::bigint, data::text, vencto::text, documento::text, tipo_doc::text,
           valor::float, empresa::bigint, conta_debitar::text, pessoa::bigint, child::float
    FROM movto
    WHERE empresa = ANY($1::bigint[])
      AND conta_debitar LIKE '1.3.%'
      AND child = 0
      AND vencto >= $2::date`

  if (contaCod)  { params.push(contaCod);  sql += ` AND conta_debitar = $${params.length}` }
  if (dataIni)   { params.push(dataIni);   sql += ` AND data >= $${params.length}::date` }
  if (dataFim)   { params.push(dataFim);   sql += ` AND data <= $${params.length}::date` }
  if (venctoFim) { params.push(venctoFim); sql += ` AND vencto <= $${params.length}::date` }

  params.push(limit)
  sql += ` ORDER BY vencto ASC LIMIT $${params.length}`

  return query(sql, params)
}

export async function buscarMovtosFormas(
  empresaIds: number[],
  opts: { venctoIni?: string; venctoFim?: string | null },
): Promise<Record<string, unknown>[]> {
  const { venctoIni = '2026-01-01', venctoFim } = opts
  const params: unknown[] = [empresaIds, venctoIni]
  let filtroFim = ''
  if (venctoFim) { params.push(venctoFim); filtroFim = ` AND m.vencto <= $${params.length}::date` }

  // Self-join via EXISTS sobre o conjunto pré-filtrado: marca `tem_baixa = true`
  // quando há outro movto cujo `child` aponta para o grid do original.
  // Mais eficiente que duas queries separadas (evita transferir array de 100k grids).
  const sql = `
    WITH originais AS (
      SELECT m.grid, m.conta_debitar, m.empresa, m.pessoa, m.data, m.vencto, m.valor, m.child, m.mlid
      FROM movto m
      WHERE m.empresa = ANY($1::bigint[])
        AND m.conta_debitar LIKE '1.3.%'
        AND m.vencto >= $2::date
        ${filtroFim}
      LIMIT 100000
    )
    SELECT o.grid::bigint,
           o.conta_debitar::text,
           o.empresa::bigint,
           o.pessoa::bigint,
           o.data::text,
           o.vencto::text,
           o.valor::float,
           o.child::float,
           o.mlid::bigint,
           EXISTS (
             SELECT 1 FROM movto b
             WHERE b.child = o.grid AND b.child > 0
           ) AS tem_baixa
    FROM originais o`
  return query(sql, params)
}

// Recebe grids de movtos originais e retorna quais possuem entrada de baixa apontando para eles.
// Detecta o baixe via child = grid_original, que cobre cofre, Stone e qualquer forma de baixa.
export async function buscarGridsBaixados(grids: number[]): Promise<number[]> {
  if (!grids.length) return []
  const rows = await query<{ grid: number }>(
    `SELECT DISTINCT child::bigint AS grid FROM movto WHERE child = ANY($1::bigint[]) AND child > 0`,
    [grids],
  )
  return rows.map(r => Number(r.grid))
}

// Para uma lista de grids ORIGINAIS, devolve a primeira data de baixa de cada um.
// (Quando um título tem múltiplas baixas parciais, usa a mais antiga.)
export interface BaixaInfo extends Record<string, unknown> {
  grid_original: number   // o grid do título de origem
  data_baixa:    string   // YYYY-MM-DD
}

export async function buscarBaixasPorGrids(grids: number[]): Promise<BaixaInfo[]> {
  if (!grids.length) return []
  return query<BaixaInfo>(
    `SELECT child::bigint                    AS grid_original,
            MIN(to_char(data, 'YYYY-MM-DD')) AS data_baixa
     FROM movto
     WHERE child = ANY($1::bigint[]) AND child > 0
     GROUP BY child`,
    [grids],
  )
}

export async function buscarMovtosMotivoFormas(
  empresaIds: number[],
  motivoGrids: number[],
  opts: { dataIni?: string; dataFim?: string | null },
): Promise<Record<string, unknown>[]> {
  if (!motivoGrids.length) return []
  const { dataIni = '2026-01-01', dataFim } = opts
  const params: unknown[] = [empresaIds, motivoGrids, dataIni]
  let sql = `
    SELECT motivo::bigint, empresa::bigint, data::text, child::float, valor::float
    FROM movto
    WHERE empresa = ANY($1::bigint[])
      AND motivo = ANY($2::bigint[])
      AND data >= $3::date`

  if (dataFim) { params.push(dataFim); sql += ` AND data <= $${params.length}::date` }
  return query(sql, params)
}

// Busca movtos por motivos no período — usado pelo painel de Contas a Receber → Formas.
// `soChild0 = true` filtra apenas títulos ainda em aberto (originais não baixados).
// Filtro de período usa `data` (data de emissão) — não `vencto`.
export async function buscarMovtosCRPorMotivos(
  empresaIds: number[],
  motivoGrids: number[],
  opts: { dataIni: string; dataFim?: string | null; soChild0?: boolean },
): Promise<Record<string, unknown>[]> {
  if (!motivoGrids.length || !empresaIds.length) return []
  const params: unknown[] = [empresaIds, motivoGrids, opts.dataIni]
  let sql = `
    SELECT grid::bigint,
           motivo::bigint,
           empresa::bigint,
           pessoa::bigint,
           data::text,
           vencto::text,
           documento::text,
           tipo_doc::text,
           valor::float,
           child::float,
           mlid::bigint,
           conta_debitar::text
    FROM movto
    WHERE empresa = ANY($1::bigint[])
      AND motivo = ANY($2::bigint[])
      AND data >= $3::date`
  if (opts.dataFim)  { params.push(opts.dataFim); sql += ` AND data <= $${params.length}::date` }
  if (opts.soChild0) { sql += ` AND child = 0` }
  sql += ` ORDER BY data ASC`
  return query(sql, params)
}

// Para uma lista de contas configuradas (cr_contas_grupo conta-based), descobre os
// motivos de movimentação que originam lançamentos nessas contas. Retorna pares
// motivo → conta_debitar para preservar o mapeamento original conta → grupo.
export async function buscarMotivosUsadosEmContas(
  empresaIds: number[],
  contas: string[],
): Promise<{ motivo: number; conta_debitar: string }[]> {
  if (!contas.length || !empresaIds.length) return []
  return query(
    `SELECT DISTINCT motivo::bigint AS motivo, conta_debitar::text
     FROM movto
     WHERE empresa = ANY($1::bigint[])
       AND conta_debitar = ANY($2::text[])
       AND motivo IS NOT NULL
       AND motivo > 0`,
    [empresaIds, contas],
  )
}

export async function buscarMovtosDetalhe(
  empresaIds: number[],
  contaCod: string,
  opts: { dataIni?: string; dataFim?: string | null; pessoa?: string | null },
): Promise<Record<string, unknown>[]> {
  const { dataIni = '2026-01-01', dataFim, pessoa } = opts
  const params: unknown[] = [empresaIds, contaCod, dataIni]
  let filtros = ''
  if (dataFim) { params.push(dataFim);          filtros += ` AND m.data <= $${params.length}::date` }
  if (pessoa)  { params.push(Number(pessoa));   filtros += ` AND m.pessoa = $${params.length}` }

  // Inclui flag `tem_baixa` e `data_baixa` (primeira baixa) via subquery LATERAL.
  // Útil para mostrar o status correto no painel de detalhe.
  const sql = `
    SELECT m.grid::bigint,
           m.mlid::bigint,
           m.data::text,
           m.vencto::text,
           m.documento::text,
           m.tipo_doc::text,
           m.valor::float,
           m.empresa::bigint,
           m.conta_debitar::text,
           m.pessoa::bigint,
           m.child::float,
           m.obs::text,
           bx.data_baixa
    FROM movto m
    LEFT JOIN LATERAL (
      SELECT to_char(MIN(data), 'YYYY-MM-DD') AS data_baixa
      FROM movto b
      WHERE b.child = m.grid AND b.child > 0
    ) bx ON TRUE
    WHERE m.empresa = ANY($1::bigint[])
      AND m.conta_debitar = $2
      AND m.data >= $3::date
      ${filtros}
    ORDER BY m.data ASC
    LIMIT 2000`
  return query(sql, params)
}

export async function buscarMovtosContrapartida(mlids: number[]): Promise<Record<string, unknown>[]> {
  if (!mlids.length) return []
  return query(
    `SELECT grid::bigint, mlid::bigint, data::text, documento::text, valor::float,
            conta_debitar::text, conta_creditar::text, child::float
     FROM movto WHERE mlid = ANY($1::bigint[]) LIMIT 5000`,
    [mlids],
  )
}

// Returns mlids that have a corresponding settlement credit entry (conta_creditar LIKE '1.3.%').
// Used to detect Stone/card entries (child=0) that were settled via automatic batch baixa.
export async function buscarMlidsLiquidados(mlids: number[]): Promise<number[]> {
  if (!mlids.length) return []
  const rows = await query<{ mlid: number }>(
    `SELECT DISTINCT mlid::bigint AS mlid FROM movto
     WHERE mlid = ANY($1::bigint[]) AND conta_creditar LIKE '1.3.%'`,
    [mlids],
  )
  return rows.map(r => Number(r.mlid))
}

export async function buscarMovtosPagar(
  empresaIds: number[],
  contaCod: string | null,
  venctoIni: string,
  venctoFim: string,
): Promise<Record<string, unknown>[]> {
  const params: unknown[] = [empresaIds, venctoIni, venctoFim]
  let sql = `
    SELECT grid::bigint, data::text, vencto::text, documento::text, tipo_doc::text,
           valor::float, empresa::bigint, conta_creditar::text, pessoa::bigint, child::float, obs::text
    FROM movto
    WHERE empresa = ANY($1::bigint[])
      AND conta_creditar LIKE '2.%'
      AND child = -1
      AND vencto >= $2::date
      AND vencto <= $3::date`

  if (contaCod) { params.push(contaCod); sql += ` AND conta_creditar = $${params.length}` }
  sql += ` ORDER BY vencto ASC LIMIT 2000`
  return query(sql, params)
}

export async function buscarMovtosByGrid(grids: number[]): Promise<Record<string, unknown>[]> {
  if (!grids.length) return []
  return query(
    `SELECT grid::bigint, mlid::bigint, data::text, vencto::text, documento::text,
            tipo_doc::text, valor::float, empresa::bigint, conta_debitar::text,
            conta_creditar::text, child::float, motivo::bigint, pessoa::bigint, obs::text
     FROM movto WHERE grid = ANY($1::bigint[])`,
    [grids],
  )
}

// ── empresa ──────────────────────────────────────────────────────────────────

export async function buscarEmpresas(): Promise<{ grid: number; codigo: string; nome: string }[]> {
  return query(`SELECT grid::bigint AS grid, codigo::text, nome::text FROM empresa ORDER BY nome`)
}

export interface EmpresaCompleta extends Record<string, unknown> {
  grid:         number
  codigo:       string
  nome:         string
  razao_social: string | null
  cnpj:         string | null  // Autosystem: coluna 'cpf' (armazena CNPJ para PJ)
  ie:           string | null  // Autosystem: coluna 'inscr_est'
  im:           string | null  // Autosystem: coluna 'inscr_municipal'
  cep:          string | null
  logradouro:   string | null
  numero:       string | null
  bairro:       string | null
  cidade:       string | null
  uf:           string | null
  telefone:     string | null  // Autosystem: coluna 'fone'
  celular:      string | null
  fax:          string | null
  email:        string | null
  contato:      string | null
  ult_alteracao: string | null
}

// Mapeamento: nome interno → nome real no Autosystem
const AS_COL_MAP: Record<string, string> = {
  razao_social:  'razao_social',
  cnpj:          'cpf',           // CNPJ/CPF no mesmo campo
  ie:            'inscr_est',     // Inscrição Estadual
  im:            'inscr_municipal',
  cep:           'cep',
  logradouro:    'logradouro',
  numero:        'numero',
  bairro:        'bairro',
  cidade:        'cidade',
  uf:            'uf',
  telefone:      'fone',
  celular:       'celular',
  fax:           'fax',
  email:         'email',
  contato:       'contato',
  ult_alteracao: 'ult_alteracao',
}

export async function buscarEmpresasCompleto(): Promise<EmpresaCompleta[]> {
  const asCols = Object.values(AS_COL_MAP)
  const colRows = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'empresa'
       AND column_name = ANY($1::text[])`,
    [asCols],
  )
  const existentes = new Set(colRows.map(r => r.column_name))

  // Monta SELECT com aliases: inscr_est AS ie, fone AS telefone, etc.
  const extraSql = Object.entries(AS_COL_MAP)
    .filter(([, asCol]) => existentes.has(asCol))
    .map(([alias, asCol]) => `${asCol}::text AS ${alias}`)
    .join(', ')

  const rows = await query<Record<string, unknown>>(
    `SELECT grid::bigint AS grid, codigo::text AS codigo, nome::text AS nome
     ${extraSql ? ', ' + extraSql : ''}
     FROM empresa ORDER BY nome`,
  )

  const str = (v: unknown) => (v as string | null | undefined) ?? null

  return rows.map(r => ({
    grid:          r.grid as number,
    codigo:        r.codigo as string,
    nome:          r.nome as string,
    razao_social:  str(r.razao_social),
    cnpj:          str(r.cnpj),
    ie:            str(r.ie),
    im:            str(r.im),
    cep:           str(r.cep),
    logradouro:    str(r.logradouro),
    numero:        str(r.numero),
    bairro:        str(r.bairro),
    cidade:        str(r.cidade),
    uf:            str(r.uf),
    telefone:      str(r.telefone),
    celular:       str(r.celular),
    fax:           str(r.fax),
    email:         str(r.email),
    contato:       str(r.contato),
    ult_alteracao: str(r.ult_alteracao),
  }))
}

// Igual a buscarEmpresas, mas tenta trazer o nome reduzido/fantasia quando o
// AUTOSYSTEM tem essa coluna (varia entre versões — alguns chamam de
// `nome_reduzido`, outros de `apelido` ou `nome_fantasia`). Cai no nome cheio
// quando nenhuma das colunas existir.
export async function buscarEmpresasComNomeReduzido(): Promise<{
  grid: number
  codigo: string
  nome: string
  nome_reduzido: string
}[]> {
  const cols = await colunasExistentes('empresa', [
    'nome_reduzido', 'apelido', 'nome_fantasia', 'fantasia',
  ])
  const reduzidoCol =
    cols.has('nome_reduzido')   ? 'nome_reduzido'
  : cols.has('apelido')         ? 'apelido'
  : cols.has('nome_fantasia')   ? 'nome_fantasia'
  : cols.has('fantasia')        ? 'fantasia'
  : null

  const reduzidoExpr = reduzidoCol
    ? `COALESCE(NULLIF(trim(${reduzidoCol}::text), ''), nome::text)`
    : `nome::text`

  return query(
    `SELECT grid::bigint    AS grid,
            codigo::text    AS codigo,
            nome::text      AS nome,
            ${reduzidoExpr} AS nome_reduzido
     FROM empresa
     ORDER BY nome`,
  )
}

// ── conta ────────────────────────────────────────────────────────────────────

export async function buscarContas(like: string): Promise<{ codigo: string; nome: string }[]> {
  return query(
    `SELECT codigo::text, nome::text FROM conta WHERE codigo LIKE $1 ORDER BY codigo`,
    [like],
  )
}

// Plano de contas completo — usado para mapeamento de máscaras (DRE / Fluxo de Caixa)
export interface PlanoContaRow extends Record<string, unknown> {
  hierarquia: string
  nome:       string
  // pg serializa bigint como string por padrão (preserva precisão de int64)
  grid:       string
  natureza:   'Débito' | 'Crédito'
}

export async function buscarPlanoContas(): Promise<PlanoContaRow[]> {
  const rows = await query<{
    hierarquia: string
    nome_b:     Buffer | null
    grid:       string
    natureza:   'Débito' | 'Crédito'
  }>(
    `SELECT codigo::text   AS hierarquia,
            nome::bytea    AS nome_b,
            grid::bigint   AS grid,
            CASE WHEN credor = false THEN 'Débito' ELSE 'Crédito' END AS natureza
     FROM conta
     ORDER BY codigo`,
  )
  return rows.map(r => ({
    hierarquia: r.hierarquia,
    nome:       decodeBytea(r.nome_b),
    grid:       String(r.grid),
    natureza:   r.natureza,
  }))
}

// Grupos de produtos — usado para mapeamento de vendas/custos nas máscaras
export interface GrupoProdutoRow extends Record<string, unknown> {
  // bigint serializado como string pelo pg
  id:     string
  codigo: number
  nome:   string
}

export async function buscarGruposProduto(): Promise<GrupoProdutoRow[]> {
  const rows = await query<{ id: string; codigo: number; nome_b: Buffer | null }>(
    `SELECT grid::bigint AS id,
            codigo::int  AS codigo,
            nome::bytea  AS nome_b
     FROM grupo_produto
     ORDER BY codigo`,
  )
  return rows.map(r => ({
    id:     String(r.id),
    codigo: r.codigo,
    nome:   decodeBytea(r.nome_b),
  }))
}

// Detalhes das contas pelos grids (usado no relatório de DRE)
export interface ContaDetalhe extends Record<string, unknown> {
  grid:     string
  codigo:   string
  nome:     string
  natureza: 'Débito' | 'Crédito'
}

// Para uma lista de códigos pais (sintéticos OU analíticos), retorna todos os
// códigos da tabela `conta` que sejam o próprio pai OU descendentes (`pai.x.y`).
// Cada linha vem com o `parent` mais específico (mais longo) que casou — usado
// pela DRE para agregar os movtos analíticos de volta na conta-pai mapeada.
export async function buscarCodigosComDescendentes(
  parentCodigos: string[],
): Promise<{ codigo: string; parent: string }[]> {
  if (!parentCodigos.length) return []
  const params: unknown[] = []
  const conds: string[] = []
  for (const p of parentCodigos) {
    params.push(p)
    const idxEq = params.length
    params.push(p + '.%')
    const idxLike = params.length
    conds.push(`(codigo = $${idxEq}::text OR codigo LIKE $${idxLike}::text)`)
  }
  const rows = await query<{ codigo: string }>(
    `SELECT DISTINCT codigo::text FROM conta WHERE ${conds.join(' OR ')}`,
    params,
  )
  return rows.map(r => {
    const codigo = r.codigo
    // Pai mais específico = match mais longo (codigo === pai OR codigo começa com pai + '.')
    const parent = parentCodigos
      .filter(p => codigo === p || codigo.startsWith(p + '.'))
      .sort((a, b) => b.length - a.length)[0]
    return { codigo, parent: parent ?? codigo }
  })
}

export async function buscarContasPorGrid(grids: string[]): Promise<ContaDetalhe[]> {
  if (!grids.length) return []
  const rows = await query<{
    grid:     string
    codigo:   string
    nome_b:   Buffer | null
    natureza: 'Débito' | 'Crédito'
  }>(
    `SELECT grid::bigint   AS grid,
            codigo::text   AS codigo,
            nome::bytea    AS nome_b,
            CASE WHEN credor = false THEN 'Débito' ELSE 'Crédito' END AS natureza
     FROM conta
     WHERE grid = ANY($1::bigint[])`,
    [grids],
  )
  return rows.map(r => ({
    grid:     String(r.grid),
    codigo:   r.codigo,
    nome:     decodeBytea(r.nome_b),
    natureza: r.natureza,
  }))
}

// Agrega movto por (conta, mês) no período — soma debitar e creditar separadamente.
// Para DRE: balance da conta = total_creditar - total_debitar
//   - Receitas (credit nature)  → positivo quando há receita
//   - Despesas (debit nature)   → negativo quando há gasto
// Sinal natural permite somar tudo direto no DRE.
export interface MovtoAgregadoContaMes extends Record<string, unknown> {
  codigo:         string
  mes:            string  // 'YYYY-MM'
  total_debitar:  number
  total_creditar: number
}

export async function aggregarMovtoPorContaPorMes(
  empresaIds: number[],
  dataIni:    string,
  dataFim:    string,
  contaCodigos: string[],
): Promise<MovtoAgregadoContaMes[]> {
  if (!empresaIds.length || !contaCodigos.length) return []
  return query<MovtoAgregadoContaMes>(
    `SELECT codigo::text                                          AS codigo,
            to_char(data, 'YYYY-MM')                              AS mes,
            COALESCE(SUM(CASE WHEN dir = 'D' THEN valor END), 0)::float AS total_debitar,
            COALESCE(SUM(CASE WHEN dir = 'C' THEN valor END), 0)::float AS total_creditar
     FROM (
       SELECT conta_debitar  AS codigo, 'D' AS dir, valor, data
       FROM movto
       WHERE empresa = ANY($1::bigint[])
         AND data BETWEEN $2::date AND $3::date
         AND conta_debitar = ANY($4::text[])
       UNION ALL
       SELECT conta_creditar AS codigo, 'C' AS dir, valor, data
       FROM movto
       WHERE empresa = ANY($1::bigint[])
         AND data BETWEEN $2::date AND $3::date
         AND conta_creditar = ANY($4::text[])
     ) t
     GROUP BY codigo, to_char(data, 'YYYY-MM')`,
    [empresaIds, dataIni, dataFim, contaCodigos],
  )
}

// Agrega vendas e custos por (grupo de produto, mês). valor_custo vem com sinal natural.
export interface VendasCustosGrupoMes extends Record<string, unknown> {
  grupo_grid:  string
  mes:         string
  total_venda: number
  total_custo: number
}

export async function aggregarVendasCustosPorGrupoPorMes(
  empresaIds: number[],
  dataIni:    string,
  dataFim:    string,
  grupoGrids: string[],
): Promise<VendasCustosGrupoMes[]> {
  if (!empresaIds.length || !grupoGrids.length) return []
  return query<VendasCustosGrupoMes>(
    `SELECT
       p.grupo::bigint                          AS grupo_grid,
       to_char(l.data, 'YYYY-MM')               AS mes,
       COALESCE(SUM(l.valor), 0)::float          AS total_venda,
       COALESCE(SUM(
         CASE WHEN pc.produto IS NOT NULL THEN -ev.ult_custo_medio * l.quantidade
              ELSE el.custo_medio * el.movimento
         END
       ), 0)::float                              AS total_custo
     FROM lancto l
       LEFT JOIN estoque_lancto el ON el.lancto = l.grid
       LEFT JOIN produto p         ON l.produto = p.grid
       JOIN estoque_valor ev       ON l.empresa = ev.empresa
                                  AND l.data    = ev.data
                                  AND l.produto = ev.produto
       LEFT JOIN (SELECT DISTINCT produto FROM produto_composicao) pc
                                   ON pc.produto = l.produto
     WHERE l.data BETWEEN $1::date AND $2::date
       AND l.operacao = 'V'
       AND l.empresa = ANY($3::bigint[])
       AND p.grupo   = ANY($4::bigint[])
     GROUP BY p.grupo, to_char(l.data, 'YYYY-MM')`,
    [dataIni, dataFim, empresaIds, grupoGrids],
  )
}

// Variantes "por empresa" — usadas para apurar o resultado de cada empresa
// individualmente (Análise Vertical / participação no resultado líquido).
export interface MovtoAgregadoContaEmpresa extends Record<string, unknown> {
  codigo:         string
  empresa:        number
  total_debitar:  number
  total_creditar: number
}

export async function aggregarMovtoPorContaPorEmpresa(
  empresaIds: number[],
  dataIni:    string,
  dataFim:    string,
  contaCodigos: string[],
): Promise<MovtoAgregadoContaEmpresa[]> {
  if (!empresaIds.length || !contaCodigos.length) return []
  return query<MovtoAgregadoContaEmpresa>(
    `SELECT codigo::text                            AS codigo,
            empresa::bigint                         AS empresa,
            COALESCE(SUM(CASE WHEN dir='D' THEN valor END), 0)::float AS total_debitar,
            COALESCE(SUM(CASE WHEN dir='C' THEN valor END), 0)::float AS total_creditar
     FROM (
       SELECT conta_debitar  AS codigo, 'D' AS dir, valor, empresa
       FROM movto
       WHERE empresa = ANY($1::bigint[])
         AND data BETWEEN $2::date AND $3::date
         AND conta_debitar = ANY($4::text[])
       UNION ALL
       SELECT conta_creditar AS codigo, 'C' AS dir, valor, empresa
       FROM movto
       WHERE empresa = ANY($1::bigint[])
         AND data BETWEEN $2::date AND $3::date
         AND conta_creditar = ANY($4::text[])
     ) t
     GROUP BY codigo, empresa`,
    [empresaIds, dataIni, dataFim, contaCodigos],
  )
}

export interface VendasCustosGrupoEmpresa extends Record<string, unknown> {
  grupo_grid:  string
  empresa:     number
  total_venda: number
  total_custo: number
}

export async function aggregarVendasCustosPorGrupoPorEmpresa(
  empresaIds: number[],
  dataIni:    string,
  dataFim:    string,
  grupoGrids: string[],
): Promise<VendasCustosGrupoEmpresa[]> {
  if (!empresaIds.length || !grupoGrids.length) return []
  return query<VendasCustosGrupoEmpresa>(
    `SELECT
       p.grupo::bigint                          AS grupo_grid,
       l.empresa::bigint                        AS empresa,
       COALESCE(SUM(l.valor), 0)::float          AS total_venda,
       COALESCE(SUM(
         CASE WHEN pc.produto IS NOT NULL THEN -ev.ult_custo_medio * l.quantidade
              ELSE el.custo_medio * el.movimento
         END
       ), 0)::float                              AS total_custo
     FROM lancto l
       LEFT JOIN estoque_lancto el ON el.lancto = l.grid
       LEFT JOIN produto p         ON l.produto = p.grid
       JOIN estoque_valor ev       ON l.empresa = ev.empresa
                                  AND l.data    = ev.data
                                  AND l.produto = ev.produto
       LEFT JOIN (SELECT DISTINCT produto FROM produto_composicao) pc
                                   ON pc.produto = l.produto
     WHERE l.data BETWEEN $1::date AND $2::date
       AND l.operacao = 'V'
       AND l.empresa = ANY($3::bigint[])
       AND p.grupo   = ANY($4::bigint[])
     GROUP BY p.grupo, l.empresa`,
    [dataIni, dataFim, empresaIds, grupoGrids],
  )
}

// ── Controle de dinheiro / saldo por (empresa, conta) ───────
// Soma todos os movtos por (empresa, codigo_conta) — sem filtro de data,
// para retornar o saldo acumulado da conta. Para CAIXA / contas de natureza
// débito, saldo = total_debitar - total_creditar.
export interface SaldoEmpresaConta extends Record<string, unknown> {
  empresa:        number
  codigo:         string
  total_debitar:  number
  total_creditar: number
}

// Saldo de implantação (vindo de migração de sistemas anteriores) gravado na
// própria tabela `conta`. Algumas instâncias do AUTOSYSTEM têm a coluna
// `empresa` em conta (saldo por empresa); outras não (plano global).
//
// O retorno usa um Map com chave `${empresa}:${codigo}` quando a coluna
// existe, ou `:${codigo}` (escopo global) quando não — basta a rota
// consultar nesta ordem para obter o valor correto.
export async function buscarSaldosIniciaisConta(
  empresaIds: number[],
  codigos:    string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (!codigos.length) return result

  const cols = await colunasExistentes('conta', ['empresa', 'saldo_inicial'])
  if (!cols.has('saldo_inicial')) return result

  if (cols.has('empresa') && empresaIds.length) {
    const rows = await query<{ empresa: number; codigo: string; saldo_inicial: number }>(
      `SELECT empresa::bigint                          AS empresa,
              codigo::text                             AS codigo,
              COALESCE(saldo_inicial, 0)::float        AS saldo_inicial
       FROM conta
       WHERE codigo  = ANY($1::text[])
         AND empresa = ANY($2::bigint[])`,
      [codigos, empresaIds],
    )
    for (const r of rows) {
      const v = Number(r.saldo_inicial) || 0
      if (v !== 0) result.set(`${r.empresa}:${r.codigo}`, v)
    }
  } else {
    const rows = await query<{ codigo: string; saldo_inicial: number }>(
      `SELECT codigo::text                             AS codigo,
              COALESCE(saldo_inicial, 0)::float        AS saldo_inicial
       FROM conta
       WHERE codigo = ANY($1::text[])`,
      [codigos],
    )
    for (const r of rows) {
      const v = Number(r.saldo_inicial) || 0
      if (v !== 0) result.set(`:${r.codigo}`, v)
    }
  }
  return result
}

export async function aggregarSaldoPorEmpresaConta(
  empresaIds:   number[],
  contaCodigos: string[],
  dataIni?:     string | null,
  dataFim?:     string | null,
): Promise<SaldoEmpresaConta[]> {
  if (!empresaIds.length || !contaCodigos.length) return []
  // Todos os movimentos (sem filtro de `child`). Filtro de período opcional por `data`.
  const params: unknown[] = [empresaIds, contaCodigos]
  let filtroData = ''
  if (dataIni) { params.push(dataIni); filtroData += ` AND data >= $${params.length}::date` }
  if (dataFim) { params.push(dataFim); filtroData += ` AND data <= $${params.length}::date` }

  return query<SaldoEmpresaConta>(
    `SELECT empresa::bigint                                                       AS empresa,
            codigo::text                                                          AS codigo,
            COALESCE(SUM(CASE WHEN dir = 'D' THEN valor END), 0)::float           AS total_debitar,
            COALESCE(SUM(CASE WHEN dir = 'C' THEN valor END), 0)::float           AS total_creditar
     FROM (
       SELECT empresa, conta_debitar  AS codigo, 'D' AS dir, valor
       FROM movto
       WHERE empresa = ANY($1::bigint[])
         AND conta_debitar = ANY($2::text[])
         ${filtroData}
       UNION ALL
       SELECT empresa, conta_creditar AS codigo, 'C' AS dir, valor
       FROM movto
       WHERE empresa = ANY($1::bigint[])
         AND conta_creditar = ANY($2::text[])
         ${filtroData}
     ) t
     GROUP BY empresa, codigo`,
    params,
  )
}

// ── Controle de dinheiro: lançamentos individuais por (empresa, conta) ──
//
// Lista os movtos com `child = 0` para uma única conta de caixa em uma
// empresa, no período. Inclui motivo, histórico, documento e pessoa.
export interface MovtoCaixaLancamento {
  data:       string  // YYYY-MM-DD
  hora:       string | null  // HH:MM (quando o AUTOSYSTEM tem coluna de hora)
  valor:      number
  direcao:    'D' | 'C'  // D = entrada (caixa debitado); C = saída (caixa creditado)
  motivo:     string
  historico:  string
  documento:  string | null
  pessoa:     string
}

interface MovtoCaixaRaw extends Record<string, unknown> {
  data:        string
  hora:        string | null
  valor:       number
  direcao:     'D' | 'C'
  motivo_b:    Buffer | null
  historico_b: Buffer | null
  documento:   string | null
  pessoa_b:    Buffer | null
}

export async function listarMovtosCaixaPorPeriodo(
  empresaId:  number,
  codigo:     string,
  dataIni?:   string | null,
  dataFim?:   string | null,
  limit = 5000,
): Promise<MovtoCaixaLancamento[]> {
  // Detecta a coluna de FK de pessoa em movto (varia entre instâncias do AUTOSYSTEM).
  const cols = await colunasExistentes('movto', [
    'pessoa', 'cliente',
    'observacao', 'obs', 'historico',
    'hora', 'horario', 'data_hora', 'data_lancamento',
  ])
  const pessoaFkCol = cols.has('pessoa')    ? 'pessoa'
                    : cols.has('cliente')   ? 'cliente'
                    : null
  const histCol = cols.has('observacao') ? 'observacao'
              : cols.has('obs')         ? 'obs'
              : cols.has('historico')   ? 'historico'
              : null
  // `hora` pode ser TIME, TIMESTAMP ou texto — to_char lida com qualquer caso.
  const horaCol = cols.has('hora')             ? 'hora'
                : cols.has('horario')          ? 'horario'
                : cols.has('data_hora')        ? 'data_hora'
                : cols.has('data_lancamento')  ? 'data_lancamento'
                : null

  const histExpr   = histCol   ? `m.${histCol}::bytea` : 'NULL::bytea'
  const pessoaExpr = pessoaFkCol ? 'p.nome::bytea'      : 'NULL::bytea'
  const joinPessoa = pessoaFkCol ? `LEFT JOIN pessoa p ON p.grid = m.${pessoaFkCol}` : ''
  const horaExpr   = horaCol   ? `to_char(m.${horaCol}, 'HH24:MI')` : 'NULL::text'

  const params: unknown[] = [empresaId, codigo]
  let dataFiltroD = ''
  let dataFiltroC = ''
  if (dataIni) { params.push(dataIni); dataFiltroD = ` AND m.data >= $${params.length}::date`; dataFiltroC = dataFiltroD }
  if (dataFim) { params.push(dataFim); dataFiltroD += ` AND m.data <= $${params.length}::date`; dataFiltroC += ` AND m.data <= $${params.length}::date` }
  params.push(limit)
  const limitParam = `$${params.length}`

  const rows = await query<MovtoCaixaRaw>(
    `SELECT to_char(m.data, 'YYYY-MM-DD') AS data,
            ${horaExpr}                   AS hora,
            m.valor::float                AS valor,
            'D'::text                     AS direcao,
            mv.nome::bytea                AS motivo_b,
            ${histExpr}                   AS historico_b,
            m.documento::text             AS documento,
            ${pessoaExpr}                 AS pessoa_b
     FROM movto m
       LEFT JOIN motivo_movto mv ON mv.grid = m.motivo
       ${joinPessoa}
     WHERE m.empresa = $1::bigint
       AND m.conta_debitar = $2::text
       ${dataFiltroD}
     UNION ALL
     SELECT to_char(m.data, 'YYYY-MM-DD') AS data,
            ${horaExpr}                   AS hora,
            m.valor::float                AS valor,
            'C'::text                     AS direcao,
            mv.nome::bytea                AS motivo_b,
            ${histExpr}                   AS historico_b,
            m.documento::text             AS documento,
            ${pessoaExpr}                 AS pessoa_b
     FROM movto m
       LEFT JOIN motivo_movto mv ON mv.grid = m.motivo
       ${joinPessoa}
     WHERE m.empresa = $1::bigint
       AND m.conta_creditar = $2::text
       ${dataFiltroC}
     ORDER BY data ASC, hora ASC NULLS LAST
     LIMIT ${limitParam}`,
    params,
  )

  return rows.map(r => ({
    data:      r.data,
    hora:      r.hora,
    valor:     Number(r.valor),
    direcao:   r.direcao,
    motivo:    decodeBytea(r.motivo_b).trim(),
    historico: decodeBytea(r.historico_b).trim(),
    documento: r.documento,
    pessoa:    decodeBytea(r.pessoa_b).trim(),
  }))
}

// ── Balanço Financeiro ───────────────────────────────────────
// Lista todos os títulos em aberto (child = 0) — a receber (1.3.x) e a pagar (2.1.1.x)
// — com vencimento a partir de hoje.

export interface BalancoTitulo extends Record<string, unknown> {
  vencto:     string         // YYYY-MM-DD
  valor:      number
  documento:  string | null
  motivo:     string         // decoded de bytea
  pessoa:     string         // decoded de bytea
  conta:      string         // codigo da conta (1.3.x ou 2.1.1.x)
  conta_nome: string         // nome da conta (decoded de bytea); '' quando sem JOIN
  empresa:    number
}

interface BalancoTituloRaw extends Record<string, unknown> {
  vencto:        string
  valor:         number
  documento:     string | null
  motivo_b:      Buffer | null
  pessoa_b:      Buffer | null
  conta:         string
  conta_nome_b:  Buffer | null
  empresa:       number
}

async function listarTitulosAbertos(
  empresaIds:   number[],
  contaPrefix:  string,           // '1.3' | '2.1.1'
  contaCol:     'conta_debitar' | 'conta_creditar',
  limit:        number = 5000,
): Promise<BalancoTitulo[]> {
  if (!empresaIds.length) return []
  const rows = await query<BalancoTituloRaw>(
    `SELECT to_char(m.vencto, 'YYYY-MM-DD') AS vencto,
            m.valor::float                  AS valor,
            m.documento::text               AS documento,
            mv.nome::bytea                  AS motivo_b,
            p.nome::bytea                   AS pessoa_b,
            m.${contaCol}::text             AS conta,
            NULL::bytea                     AS conta_nome_b,
            m.empresa::bigint               AS empresa
     FROM movto m
       LEFT JOIN motivo_movto mv ON mv.grid = m.motivo
       LEFT JOIN pessoa p        ON p.grid  = m.pessoa
     WHERE m.empresa = ANY($1::bigint[])
       AND m.${contaCol} LIKE $2
       AND m.child = 0
       AND m.vencto >= CURRENT_DATE
     ORDER BY m.vencto ASC, m.grid ASC
     LIMIT $3`,
    [empresaIds, `${contaPrefix}%`, limit],
  )
  return rows.map(r => ({
    vencto:     r.vencto,
    valor:      Number(r.valor),
    documento:  r.documento,
    motivo:     decodeBytea(r.motivo_b).trim(),
    pessoa:     decodeBytea(r.pessoa_b).trim(),
    conta:      r.conta,
    conta_nome: decodeBytea(r.conta_nome_b).trim(),
    empresa:    Number(r.empresa),
  }))
}

export async function buscarBalancoFinanceiro(empresaIds: number[]): Promise<{
  receber: BalancoTitulo[]
  pagar:   BalancoTitulo[]
}> {
  // Usa o ponto final no prefixo para pegar APENAS descendentes (1.3.x e 2.1.1.x),
  // evitando matches acidentais como 1.30, 1.31, 2.1.10, etc.
  const [receber, pagar] = await Promise.all([
    listarTitulosAbertos(empresaIds, '1.3.',   'conta_debitar', 5000),
    listarTitulosAbertos(empresaIds, '2.1.1.', 'conta_creditar', 5000),
  ])
  return { receber, pagar }
}

// ── Balanço Financeiro · A Pagar (via query custom do usuário) ─────────
// Busca títulos a pagar olhando para o conta_debitar (despesa/passivo) com
// conta_creditar em '2.1.1%' OR '2.1.2%', excluindo movtos cuja contrapartida
// vai para caixa/banco (1.1.1%/1.1.2%) — ou seja, baixas. Retorna data de
// emissão + vencimento + conta + valor + child para a UI montar a árvore
// Empresa → Conta → Lançamentos.
export interface BalancoPagarTitulo extends Record<string, unknown> {
  empresa:          number
  vencimento:       string         // YYYY-MM-DD (m.vencto)
  conta_codigo:     string         // m.conta_debitar
  conta_nome:       string         // c.nome (decoded)
  motivo:           number
  motivo_descricao: string         // mm.nome (decoded)
  pessoa:           string         // p.nome (decoded)
  documento:        string | null
  valor:            number
  situacao_baixa:   number         // m.child (0 = aberto, ≠0 = baixado)
}

interface BalancoPagarRaw extends Record<string, unknown> {
  empresa:            number
  vencimento:         string
  conta_codigo:       string
  conta_nome_b:       Buffer | null
  motivo:             number
  motivo_descricao_b: Buffer | null
  pessoa_b:           Buffer | null
  documento:          string | null
  valor:              number
  situacao_baixa:     number
}

// ── Balanço Financeiro · A Receber (via query custom do usuário) ────────
// Busca títulos a receber (`conta_debitar LIKE '1.3.03%' OR = '1.3.04'`) com
// `vencto >= CURRENT_DATE` e `child = 0` (apenas em aberto). Mantém shape
// compatível com `BalancoTitulo` para o tree atual da UI continuar
// funcionando sem alterações.
export async function buscarTitulosReceberBalanco(
  empresaIds: number[],
): Promise<BalancoTitulo[]> {
  if (!empresaIds.length) return []
  const rows = await query<BalancoTituloRaw>(
    `SELECT to_char(m.vencto, 'YYYY-MM-DD') AS vencto,
            m.valor::float                  AS valor,
            m.documento::text               AS documento,
            mm.nome::bytea                  AS motivo_b,
            p.nome::bytea                   AS pessoa_b,
            m.conta_debitar::text           AS conta,
            c.nome::bytea                   AS conta_nome_b,
            m.empresa::bigint               AS empresa
     FROM movto m
       JOIN motivo_movto mm ON mm.grid  = m.motivo
       LEFT JOIN conta c    ON c.codigo = m.conta_debitar
       LEFT JOIN pessoa p   ON p.grid   = m.pessoa
     WHERE m.empresa = ANY($1::bigint[])
       AND (m.conta_debitar LIKE '1.3.03%' OR m.conta_debitar = '1.3.04')
       AND m.child = 0
       AND m.vencto >= CURRENT_DATE
     ORDER BY m.vencto ASC, m.grid ASC`,
    [empresaIds],
  )
  return rows.map(r => ({
    vencto:     r.vencto,
    valor:      Number(r.valor),
    documento:  r.documento,
    motivo:     decodeBytea(r.motivo_b).trim(),
    pessoa:     decodeBytea(r.pessoa_b).trim(),
    conta:      r.conta,
    conta_nome: decodeBytea(r.conta_nome_b).trim(),
    empresa:    Number(r.empresa),
  }))
}

export async function buscarTitulosPagarBalanco(
  empresaIds: number[],
): Promise<BalancoPagarTitulo[]> {
  if (!empresaIds.length) return []
  const rows = await query<BalancoPagarRaw>(
    `SELECT m.empresa::bigint                AS empresa,
            to_char(m.vencto, 'YYYY-MM-DD')  AS vencimento,
            m.conta_debitar::text            AS conta_codigo,
            c.nome::bytea                    AS conta_nome_b,
            m.motivo::bigint                 AS motivo,
            mm.nome::bytea                   AS motivo_descricao_b,
            p.nome::bytea                    AS pessoa_b,
            m.documento::text                AS documento,
            m.valor::float                   AS valor,
            COALESCE(m.child, 0)::float      AS situacao_baixa
     FROM movto m
       JOIN motivo_movto mm ON mm.grid   = m.motivo
       JOIN conta c         ON c.codigo  = m.conta_debitar
       LEFT JOIN pessoa p   ON p.grid    = m.pessoa
     WHERE m.empresa = ANY($1::bigint[])
       AND (m.conta_creditar LIKE '2.1.1%' OR m.conta_creditar LIKE '2.1.2%')
       AND m.conta_debitar NOT LIKE '1.1.2%'
       AND m.conta_debitar NOT LIKE '1.1.1%'
       AND m.vencto >= CURRENT_DATE
       AND m.child = 0
     ORDER BY m.vencto ASC, m.grid ASC`,
    [empresaIds],
  )
  return rows.map(r => ({
    empresa:          Number(r.empresa),
    vencimento:       r.vencimento,
    conta_codigo:     r.conta_codigo,
    conta_nome:       decodeBytea(r.conta_nome_b).trim(),
    motivo:           Number(r.motivo),
    motivo_descricao: decodeBytea(r.motivo_descricao_b).trim(),
    pessoa:           decodeBytea(r.pessoa_b).trim(),
    documento:        r.documento,
    valor:            Number(r.valor),
    situacao_baixa:   Number(r.situacao_baixa),
  }))
}

// Lista lançamentos individuais de uma conta no período (drill-down).
// Retorna `data` (YYYY-MM-DD) para bucketing por mês + `observacao` já
// formatada como "DD/MM/YYYY · DOCUMENTO · OBSERVAÇÃO" + valor.
export interface MovtoLancamento extends Record<string, unknown> {
  data:       string
  observacao: string | null
  valor:      number
  empresa:    number   // grid da empresa no AUTOSYSTEM
}

// Helper: descobre quais colunas existem em uma tabela do AUTOSYSTEM.
// Carrega todas as colunas da tabela na primeira chamada e armazena em globalThis.
// Chamadas seguintes (mesma tabela) apenas filtram localmente — sem round-trip ao DB.
async function colunasExistentes(tabela: string, candidatas: string[]): Promise<Set<string>> {
  if (!candidatas.length) return new Set()
  const cache = getSchemaCache()
  if (!cache.has(tabela)) {
    const rows = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [tabela],
    )
    cache.set(tabela, new Set(rows.map(r => r.column_name)))
  }
  const todas = cache.get(tabela)!
  return new Set(candidatas.filter(c => todas.has(c)))
}

export async function listarMovtoConta(
  empresaIds: number[],
  dataIni:    string,
  dataFim:    string,
  codigo:     string,
  limit = 500,
): Promise<MovtoLancamento[]> {
  if (!empresaIds.length) return []

  // Detecta colunas opcionais que variam entre versões do AUTOSYSTEM
  const cols = await colunasExistentes('movto', [
    'documento', 'observacao', 'obs', 'historico', 'pessoa', 'cliente',
  ])
  const obsCol      = cols.has('observacao') ? 'observacao'
                    : cols.has('obs')         ? 'obs'
                    : cols.has('historico')   ? 'historico'
                    : null
  const docCol      = cols.has('documento') ? 'documento' : null
  const pessoaFkCol = cols.has('pessoa')    ? 'pessoa'
                    : cols.has('cliente')   ? 'cliente'
                    : null

  const selectExtras: string[] = []
  if (docCol)      selectExtras.push(`m.${docCol}::bytea AS doc_b`)
  if (pessoaFkCol) selectExtras.push(`p.nome::bytea       AS pessoa_b`)
  if (obsCol)      selectExtras.push(`m.${obsCol}::bytea  AS obs_b`)
  const selectExtra = selectExtras.length ? `, ${selectExtras.join(', ')}` : ''

  const joinPessoa = pessoaFkCol ? `LEFT JOIN pessoa p ON p.grid = m.${pessoaFkCol}` : ''

  const rows = await query<{
    data:     string
    valor:    number
    empresa:  number
    doc_b?:    Buffer | null
    pessoa_b?: Buffer | null
    obs_b?:    Buffer | null
  }>(
    `SELECT to_char(m.data, 'YYYY-MM-DD') AS data,
            m.empresa::bigint             AS empresa,
            CASE WHEN m.conta_creditar::text = $4 OR m.conta_creditar::text LIKE $4 || '.%'
                 THEN m.valor::float
                 ELSE -m.valor::float
            END AS valor
            ${selectExtra}
     FROM movto m
     ${joinPessoa}
     WHERE m.empresa = ANY($1::bigint[])
       AND m.data BETWEEN $2::date AND $3::date
       AND ( m.conta_debitar::text  = $4 OR m.conta_debitar::text  LIKE $4 || '.%'
          OR m.conta_creditar::text = $4 OR m.conta_creditar::text LIKE $4 || '.%' )
     ORDER BY m.data DESC, m.grid DESC
     LIMIT $5`,
    [empresaIds, dataIni, dataFim, codigo, limit],
  )

  return rows.map(r => {
    const [y, mo, d] = r.data.split('-')
    const partes: string[] = [`${d}/${mo}/${y}`]
    const doc    = decodeBytea(r.doc_b).trim()
    const pessoa = decodeBytea(r.pessoa_b).trim()
    const obs    = decodeBytea(r.obs_b).trim()
    if (doc)    partes.push(doc)
    if (pessoa) partes.push(pessoa)
    if (obs)    partes.push(obs)
    return {
      data:       r.data,
      observacao: partes.join(' · '),
      valor:      Number(r.valor),
      empresa:    Number(r.empresa),
    }
  })
}

// Lista lançamentos de venda de um grupo de produto no período (drill-down)
export interface LanctoGrupoLancamento extends Record<string, unknown> {
  data:       string
  observacao: string | null
  valor:      number
  empresa:    number   // grid da empresa no AUTOSYSTEM
}

export async function listarLanctoGrupo(
  empresaIds: number[],
  dataIni:    string,
  dataFim:    string,
  grupoGrid:  string,
  tipo:       'venda' | 'custo',
  limit = 500,
): Promise<LanctoGrupoLancamento[]> {
  if (!empresaIds.length) return []

  const cols = await colunasExistentes('lancto', [
    'documento', 'observacao', 'obs', 'historico', 'pessoa', 'cliente',
  ])
  const obsCol      = cols.has('observacao') ? 'observacao'
                    : cols.has('obs')         ? 'obs'
                    : cols.has('historico')   ? 'historico'
                    : null
  const docCol      = cols.has('documento') ? 'documento' : null
  const pessoaFkCol = cols.has('pessoa')    ? 'pessoa'
                    : cols.has('cliente')   ? 'cliente'
                    : null

  const selectExtras: string[] = []
  if (docCol)      selectExtras.push(`l.${docCol}::bytea AS doc_b`)
  if (pessoaFkCol) selectExtras.push(`pe.nome::bytea       AS pessoa_b`)
  if (obsCol)      selectExtras.push(`l.${obsCol}::bytea  AS obs_b`)
  const selectExtra = selectExtras.length ? `, ${selectExtras.join(', ')}` : ''

  const joinPessoa = pessoaFkCol ? `LEFT JOIN pessoa pe ON pe.grid = l.${pessoaFkCol}` : ''

  const valorExpr = tipo === 'venda'
    ? 'l.valor::float'
    : `(CASE WHEN pc.produto IS NOT NULL THEN -ev.ult_custo_medio * l.quantidade
            ELSE el.custo_medio * el.movimento
       END)::float`

  const rows = await query<{
    data:     string
    valor:    number
    empresa:  number
    doc_b?:    Buffer | null
    pessoa_b?: Buffer | null
    obs_b?:    Buffer | null
  }>(
    `SELECT to_char(l.data, 'YYYY-MM-DD')  AS data,
            l.empresa::bigint              AS empresa,
            ${valorExpr}                   AS valor
            ${selectExtra}
     FROM lancto l
       LEFT JOIN estoque_lancto el ON el.lancto = l.grid
       LEFT JOIN produto p         ON l.produto = p.grid
       JOIN estoque_valor ev       ON l.empresa = ev.empresa
                                  AND l.data    = ev.data
                                  AND l.produto = ev.produto
       LEFT JOIN (SELECT DISTINCT produto FROM produto_composicao) pc
                                   ON pc.produto = l.produto
       ${joinPessoa}
     WHERE l.data BETWEEN $1::date AND $2::date
       AND l.operacao = 'V'
       AND l.empresa = ANY($3::bigint[])
       AND p.grupo   = $4::bigint
     ORDER BY l.data DESC, l.grid DESC
     LIMIT $5`,
    [dataIni, dataFim, empresaIds, grupoGrid, limit],
  )

  return rows.map(r => {
    const [y, mo, d] = r.data.split('-')
    const partes: string[] = [`${d}/${mo}/${y}`]
    const doc    = decodeBytea(r.doc_b).trim()
    const pessoa = decodeBytea(r.pessoa_b).trim()
    const obs    = decodeBytea(r.obs_b).trim()
    if (doc)    partes.push(doc)
    if (pessoa) partes.push(pessoa)
    if (obs)    partes.push(obs)
    return {
      data:       r.data,
      observacao: partes.join(' · '),
      valor:      Number(r.valor),
      empresa:    Number(r.empresa),
    }
  })
}

// ── pessoa ───────────────────────────────────────────────────────────────────

export async function buscarPessoas(grids: number[]): Promise<{ grid: number; nome: string }[]> {
  if (!grids.length) return []
  return query(
    `SELECT grid::bigint AS grid, nome::text FROM pessoa WHERE grid = ANY($1::bigint[])`,
    [grids],
  )
}

// ── Funcionários (pessoa) por empresa — usado pelo módulo de Comissionamento.
//
// A tabela `pessoa` do AUTOSYSTEM varia entre instâncias — pode ter colunas
// `empresa`, `cargo`, `codigo`, `email`, `cpf`, `funcionario`, `ativo`. Esta
// função detecta dinamicamente quais existem e:
//   • Filtra pela empresa quando há coluna `empresa`
//   • Tenta restringir a funcionários (cargo IS NOT NULL, OU funcionario = 't')
//   • Retorna nome/cargo/codigo/email decodificados
export interface PessoaFuncionario {
  grid:   number
  codigo: string | null
  nome:   string
  cargo:  string | null
  email:  string | null
}

interface PessoaFuncRaw extends Record<string, unknown> {
  grid:      number
  codigo:    string | null
  nome_b:    Buffer | null
  cargo_b:   Buffer | null
  email_b:   Buffer | null
}

// Lista produtos do AUTOSYSTEM — usado pelo construtor de condições do
// comissionamento (campo `Produto` na regra). Filtra por nome opcionalmente.
//
// Detecta colunas opcionais (`codigo`, `ativo`, `grupo`, `subgrupo`) e ignora
// inativos quando há a coluna. Retorna até `limit` linhas ordenadas por nome.
export interface ProdutoAS {
  grid:   number
  codigo: string | null
  nome:   string
}

interface ProdutoASRaw extends Record<string, unknown> {
  grid:    number
  codigo:  string | null
  nome_b:  Buffer | null
}

export async function buscarProdutosAs(
  busca?: string,
  limit:  number = 200,
): Promise<ProdutoAS[]> {
  const cols = await colunasExistentes('produto', ['codigo'])
  const codigoExpr = cols.has('codigo') ? 'codigo::text' : 'NULL::text'

  // Sem filtro por `ativo` — diferentes instâncias do AUTOSYSTEM usam
  // representações distintas (bool/int/'S'/'N') e isso já estava deixando a
  // lista vazia. Se necessário, o front pode esconder inativos depois.
  const params: unknown[] = []
  const conds:  string[]  = []
  if (busca && busca.trim()) {
    params.push(`%${busca.trim().toLowerCase()}%`)
    conds.push(`lower(nome::text) LIKE $${params.length}::text`)
  }
  params.push(limit)
  const limitParam = `$${params.length}`

  const sql = `
    SELECT grid::bigint  AS grid,
           ${codigoExpr} AS codigo,
           nome::bytea   AS nome_b
    FROM produto
    ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
    ORDER BY nome
    LIMIT ${limitParam}
  `
  const rows = await query<ProdutoASRaw>(sql, params)
  return rows.map(r => ({
    grid:   Number(r.grid),
    codigo: r.codigo,
    nome:   decodeBytea(r.nome_b).trim(),
  }))
}

export async function buscarPessoasFuncionariosPorEmpresa(
  empresaId: number,
  busca?:    string,
  limit:     number = 500,
): Promise<PessoaFuncionario[]> {
  const cols = await colunasExistentes('pessoa', [
    'empresa', 'cargo', 'codigo', 'email', 'funcionario', 'ativo',
  ])

  const hasEmpresa     = cols.has('empresa')
  const hasCargo       = cols.has('cargo')
  const hasCodigo      = cols.has('codigo')
  const hasEmail       = cols.has('email')
  const hasFuncionario = cols.has('funcionario')
  const hasAtivo       = cols.has('ativo')

  const cargoExpr  = hasCargo  ? 'cargo::bytea' : 'NULL::bytea'
  const codigoExpr = hasCodigo ? 'codigo::text' : 'NULL::text'
  const emailExpr  = hasEmail  ? 'email::bytea' : 'NULL::bytea'

  const params: unknown[] = []
  const conds:  string[]  = []

  if (hasEmpresa) {
    params.push(empresaId)
    conds.push(`empresa = $${params.length}::bigint`)
  }
  // Restringe a funcionários quando há uma coluna que permita inferir.
  // Se houver `funcionario` bool, usa-o; senão, se houver `cargo`, exige cargo não nulo.
  if (hasFuncionario) {
    conds.push(`COALESCE(funcionario::text, 'f') IN ('t','true','1','Y','S')`)
  } else if (hasCargo) {
    conds.push(`cargo IS NOT NULL AND trim(cargo::text) <> ''`)
  }
  if (hasAtivo) {
    conds.push(`COALESCE(ativo::text, 't') IN ('t','true','1','Y','S')`)
  }
  if (busca && busca.trim()) {
    params.push(`%${busca.trim().toLowerCase()}%`)
    conds.push(`lower(nome::text) LIKE $${params.length}::text`)
  }
  params.push(limit)
  const limitParam = `$${params.length}`

  const sql = `
    SELECT grid::bigint     AS grid,
           ${codigoExpr}    AS codigo,
           nome::bytea      AS nome_b,
           ${cargoExpr}     AS cargo_b,
           ${emailExpr}     AS email_b
    FROM pessoa
    ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
    ORDER BY nome
    LIMIT ${limitParam}
  `
  const rows = await query<PessoaFuncRaw>(sql, params)
  return rows.map(r => ({
    grid:   Number(r.grid),
    codigo: r.codigo,
    nome:   decodeBytea(r.nome_b).trim(),
    cargo:  decodeBytea(r.cargo_b).trim() || null,
    email:  decodeBytea(r.email_b).trim() || null,
  }))
}

// ── motivo_movto ─────────────────────────────────────────────────────────────

export async function buscarMotivos(grids: number[]): Promise<{ grid: number; nome: string }[]> {
  if (!grids.length) return []
  return query(
    `SELECT grid::bigint AS grid, nome::text FROM motivo_movto WHERE grid = ANY($1::bigint[])`,
    [grids],
  )
}

// ── caixa ────────────────────────────────────────────────────────────────────

export async function buscarCaixas(opts: {
  empresaIds?: number[]
  dataIni?: string
  dataFim?: string
  soFechados?: boolean
}): Promise<Record<string, unknown>[]> {
  const { empresaIds, dataIni, dataFim, soFechados } = opts
  const params: unknown[] = []
  let sql = `
    SELECT grid::bigint, empresa::bigint, data::text, turno::int,
           codigo::int, abertura::text, fechamento::text, conferencia::text, pessoa_confere::bigint
    FROM caixa WHERE 1=1`

  if (empresaIds?.length) { params.push(empresaIds); sql += ` AND empresa = ANY($${params.length}::bigint[])` }
  if (dataIni)  { params.push(dataIni);  sql += ` AND data >= $${params.length}::date` }
  if (dataFim)  { params.push(dataFim);  sql += ` AND data <= $${params.length}::date` }
  if (soFechados) sql += ` AND conferencia IS NOT NULL`

  sql += ` ORDER BY data DESC LIMIT 5000`
  return query(sql, params)
}

// ── estoque ──────────────────────────────────────────────────────────────────

export async function buscarEstoque(empresaIds: number[]): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT ep.empresa::bigint, ep.deposito::bigint, ep.produto::bigint,
            ep.data::text, ep.estoque::float, ep.custo_medio::float,
            p.codigo::text AS produto_codigo, p.nome::text AS produto_nome,
            p.tipo_combustivel::int, p.flag::text, p.unid_med::text,
            p.grupo::bigint, p.subgrupo::bigint
     FROM estoque_produto ep
     JOIN produto p ON p.grid = ep.produto
     WHERE ep.empresa = ANY($1::bigint[])`,
    [empresaIds],
  )
}

// ── tef_transacao ────────────────────────────────────────────────────────────

export async function buscarTefTransacoes(caixaGrids: number[]): Promise<Record<string, unknown>[]> {
  if (!caixaGrids.length) return []
  return query(
    `SELECT grid::bigint, caixa::bigint, valor::float, nsu::text, autorizacao::text,
            operadora::int, operadora_nome::text, bandeira::text, status::text, ts_local::text
     FROM tef_transacao WHERE caixa = ANY($1::bigint[]) LIMIT 10000`,
    [caixaGrids],
  )
}

// ── cartao_concilia_extrato ──────────────────────────────────────────────────

export async function buscarCartaoConciliaExtrato(
  empresaIds: number[],
  dataIni: string,
  dataFim: string,
): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT empresa::bigint, data::text, produto::bigint, extrato::text, autorizadora::int
     FROM cartao_concilia_extrato
     WHERE empresa = ANY($1::bigint[]) AND data >= $2::date AND data <= $3::date`,
    [empresaIds, dataIni, dataFim],
  )
}

// ── estoque por grupos ───────────────────────────────────────────────────────

export async function buscarEstoqueByGrupos(
  empresaIds: number[],
  grupos: number[],
): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT ep.empresa::bigint, ep.deposito::bigint, ep.produto::bigint,
            ep.data::text, ep.estoque::float, ep.custo_medio::float,
            p.codigo::text AS produto_codigo, p.nome::text AS produto_nome,
            p.tipo_combustivel::int, p.flag::text, p.unid_med::text,
            p.grupo::bigint, p.subgrupo::bigint
     FROM estoque_produto ep
     JOIN produto p ON p.grid = ep.produto
     WHERE ep.empresa = ANY($1::bigint[]) AND p.grupo = ANY($2::bigint[])`,
    [empresaIds, grupos],
  )
}

// ── vendas por produto (últimos N dias) ──────────────────────────────────────

export async function buscarVendasProdutos(
  empresaIds: number[],
  grupos: number[],
  dataIni: string,
  dataFim: string,
): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT el.empresa::bigint, el.produto::bigint,
            p.codigo::text AS produto_codigo,
            p.nome::text AS produto_nome, p.unid_med::text, p.grupo::bigint, p.subgrupo::bigint,
            ABS(SUM(el.movimento))::float AS total_vendido,
            COUNT(DISTINCT el.data::date)::int AS dias_com_venda
     FROM estoque_lancto el
     JOIN produto p ON p.grid = el.produto
     WHERE el.empresa = ANY($1::bigint[])
       AND p.grupo = ANY($2::bigint[])
       AND el.operacao = 'V'
       AND el.data >= $3::date AND el.data <= $4::date
     GROUP BY el.empresa, el.produto, p.codigo, p.nome, p.unid_med, p.grupo, p.subgrupo`,
    [empresaIds, grupos, dataIni, dataFim],
  )
}

// ── grupo / subgrupo ─────────────────────────────────────────────────────────

export async function buscarGrupos(): Promise<{ grid: number; codigo: number; nome: string }[]> {
  return query(`SELECT grid::bigint AS grid, codigo::int, nome::text FROM grupo_produto ORDER BY nome`)
}

export async function buscarSubgrupos(): Promise<{ grid: number; codigo: number; nome: string; grupo: number }[]> {
  return query(`SELECT grid::bigint AS grid, codigo::int, nome::text, grupo::bigint AS grupo FROM subgrupo_produto ORDER BY nome`)
}

// ── cartao_concilia_produto ──────────────────────────────────────────────────

export async function buscarCartaoConciliaProduto(): Promise<{ grid: number; descricao: string; taxa_perc: number | null }[]> {
  return query(`SELECT grid::bigint AS grid, descricao::text, taxa_perc::float FROM cartao_concilia_produto`)
}

// ── vendas de combustível em litros por produto (para validação de medições) ──

// Mapeamento: palavra-chave do grupo AUTOSYSTEM → código do produto nos tanques
const GRUPO_PARA_PRODUTO: Array<{ keys: string[]; produto: string }> = [
  { keys: ['RACING', 'PODIUM', 'V-POWER', 'SHELL V'],   produto: 'G.R'    },
  { keys: ['ADITIVAD', 'FORMULA', 'ADBL'],               produto: 'G.A'    },
  { keys: ['GASOLINA'],                                   produto: 'G.C'    },
  { keys: ['ETANOL', 'ALCOOL', 'ÁLCOOL'],                produto: 'ETANOL' },
  { keys: ['S-10', 'S10', 'S 10'],                       produto: 'D.S-10' },
  { keys: ['DIESEL'],                                     produto: 'D.C'    },
]

function mapGrupoToProduto(nomeGrupo: string): string {
  const upper = nomeGrupo.toUpperCase()
  for (const { keys, produto } of GRUPO_PARA_PRODUTO) {
    if (keys.some(k => upper.includes(k))) return produto
  }
  return ''
}

export async function buscarVendasCombustivel(
  empresaId: number,
  data: string,  // YYYY-MM-DD
): Promise<{ produto: string; litros: number; grupo_nome: string }[]> {
  const rows = await query<{ grupo_nome: Buffer | null; litros: number }>(
    `SELECT
       gp.nome::bytea   AS grupo_nome,
       SUM(l.quantidade)::float AS litros
     FROM lancto l
     JOIN produto p        ON l.produto = p.grid
     JOIN grupo_produto gp ON p.grupo   = gp.grid
     WHERE l.empresa  = $1
       AND l.data     = $2::date
       AND l.operacao = 'V'
       AND l.quantidade > 0
     GROUP BY gp.grid, gp.nome`,
    [empresaId, data],
  )

  const map: Record<string, { litros: number; grupo_nome: string }> = {}
  for (const r of rows) {
    const nome    = decodeBytea(r.grupo_nome).trim()
    const produto = mapGrupoToProduto(nome)
    if (!produto) continue
    if (!map[produto]) map[produto] = { litros: 0, grupo_nome: nome }
    map[produto].litros += Number(r.litros)
  }
  return Object.entries(map).map(([produto, { litros, grupo_nome }]) => ({ produto, litros, grupo_nome }))
}

// ── movto por motivo ─────────────────────────────────────────────────────────

export async function buscarMovtosPorMotivo(
  empresaIds: number[],
  motivoGrids: number[],
  dataIni: string,
  dataFim: string,
): Promise<Record<string, unknown>[]> {
  if (!motivoGrids.length) return []
  return query(
    `SELECT grid::bigint, mlid::bigint, empresa::bigint, valor::float,
            motivo::bigint, data::text, vencto::text, documento::text, child::float
     FROM movto
     WHERE empresa = ANY($1::bigint[])
       AND motivo = ANY($2::bigint[])
       AND data >= $3::date AND data <= $4::date
     ORDER BY data DESC LIMIT 5000`,
    [empresaIds, motivoGrids, dataIni, dataFim],
  )
}

// ── movto contas a pagar ─────────────────────────────────────────────────────

export async function buscarTitulosPagar(
  empresaGrid: number,
  ini: string,
  fim: string,
  situacao: string,
): Promise<Record<string, unknown>[]> {
  const hoje = new Date().toISOString().slice(0, 10)
  const params: unknown[] = [empresaGrid, ini, fim]
  let sql = `
    SELECT mlid::bigint, vencto::text, documento::text, valor::float,
           obs::text, child::float, motivo::bigint, pessoa::bigint
    FROM movto
    WHERE empresa = $1
      AND conta_creditar = '2.1.1'
      AND vencto >= $2::date AND vencto <= $3::date`

  if (situacao === 'a_vencer')  { params.push(hoje); sql += ` AND child = 0 AND vencto >= $${params.length}::date` }
  if (situacao === 'em_atraso') { params.push(hoje); sql += ` AND child = 0 AND vencto < $${params.length}::date` }
  if (situacao === 'pago')    sql += ` AND child > 0`
  if (situacao === 'aberto')  sql += ` AND child = 0`

  sql += ` ORDER BY vencto ASC LIMIT 2000`
  return query(sql, params)
}

// Versão multi-empresa do buscarTitulosPagar — usada pela conferência diária
// (treeview com todas as empresas em uma única chamada). Retorna empresa e data
// adicionalmente, para permitir agrupar por empresa e mostrar emissão.
export async function buscarTitulosPagarMulti(
  empresaGrids: number[],
  ini: string,
  fim: string,
  situacao: string,
): Promise<Record<string, unknown>[]> {
  if (!empresaGrids.length) return []
  const hoje = new Date().toISOString().slice(0, 10)
  const params: unknown[] = [empresaGrids, ini, fim]
  let sql = `
    SELECT mlid::bigint, empresa::bigint, data::text, vencto::text, documento::text,
           valor::float, obs::text, child::float, motivo::bigint, pessoa::bigint
    FROM movto
    WHERE empresa = ANY($1::bigint[])
      AND conta_creditar = '2.1.1'
      AND vencto >= $2::date AND vencto <= $3::date`

  if (situacao === 'a_vencer')  { params.push(hoje); sql += ` AND child = 0 AND vencto >= $${params.length}::date` }
  if (situacao === 'em_atraso') { params.push(hoje); sql += ` AND child = 0 AND vencto < $${params.length}::date` }
  if (situacao === 'pago')    sql += ` AND child > 0`
  if (situacao === 'aberto')  sql += ` AND child = 0`

  sql += ` ORDER BY vencto ASC LIMIT 10000`
  return query(sql, params)
}

// ── motivo_movto (todos) ─────────────────────────────────────────────────────

export async function buscarTodosMotivos(): Promise<{ grid: number; nome: string }[]> {
  return query(`SELECT grid::bigint AS grid, nome::text FROM motivo_movto ORDER BY nome`)
}

// ── movto por empresa+dia ────────────────────────────────────────────────────

export async function buscarMovtosEmpresaDia(
  empresaGrid: number,
  data: string,
): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT mlid::bigint, valor::float, motivo::bigint, data::text,
            documento::text, obs::text, child::float
     FROM movto WHERE empresa = $1 AND data = $2::date LIMIT 5000`,
    [empresaGrid, data],
  )
}

// ── movto detalhado por motivo ───────────────────────────────────────────────

export async function buscarMovtosMotivoDetalhe(
  empresaIds: number[],
  motivoGrid: number,
  dataIni: string,
  dataFim: string,
  opts: { soChild0?: boolean } = {},
): Promise<Record<string, unknown>[]> {
  let sql = `SELECT grid::bigint, mlid::bigint,
                    data::text, vencto::text, documento::text, tipo_doc::text, valor::float,
                    empresa::bigint, pessoa::bigint, child::float, motivo::bigint,
                    conta_debitar::text
             FROM movto
             WHERE empresa = ANY($1::bigint[])
               AND motivo = $2
               AND data >= $3::date
               AND data <= $4::date`
  if (opts.soChild0) sql += ` AND child = 0`
  sql += ` ORDER BY data ASC LIMIT 5000`
  return query(sql, [empresaIds, motivoGrid, dataIni, dataFim])
}

// ── contas a receber — contas distintas ──────────────────────────────────────

export async function buscarContasReceberDistinct(
  empresaIds: number[],
  venctoIni: string,
): Promise<{ conta_debitar: string }[]> {
  return query(
    `SELECT DISTINCT conta_debitar::text
     FROM movto
     WHERE empresa = ANY($1::bigint[])
       AND conta_debitar LIKE '1.3.%'
       AND vencto >= $2::date
     ORDER BY conta_debitar`,
    [empresaIds, venctoIni],
  )
}

// ── fiscal — nfe_resumo (manifestos de NF recebidas) ────────────────────────

export interface NfeResumoRow extends Record<string, unknown> {
  grid:           number
  empresa:        number
  nfe:            number
  emitente_nome:  string
  emitente_cpf:   string
  data_emissao:   string
  valor:          number
  nf_numero:      number | null   // número da NF (nNF), extraído da chave de acesso
}

export async function buscarNfeManifestos(
  empresaGrids: number[],
): Promise<NfeResumoRow[]> {
  // Espelha a tela "Manifestação de Destinatário" do AUTOSYSTEM:
  // NFs recebidas (destinatário = empresa) sem evento final de manifestação.
  // Removidas condições que filtravam NFs válidas (EXISTS obrigatório + situacao_nfe=3).
  return query<NfeResumoRow>(
    `SELECT nr.grid::bigint, nr.empresa::bigint, nr.nfe::bigint,
            nr.emitente_nome::text, nr.emitente_cpf::text,
            to_char(nr.data_emissao, 'YYYY-MM-DD') AS data_emissao,
            nr.valor::float,
            -- nNF: dígitos 26-34 da chave de acesso (44 dígitos) da NF baixada
            NULLIF(SUBSTRING(n.chave_acesso FROM 26 FOR 9), '')::bigint AS nf_numero
     FROM nfe_resumo nr
     LEFT JOIN nfe n ON n.grid = nr.nfe
     WHERE nr.empresa = ANY($1::bigint[])
       AND nr.data_emissao >= (NOW() - INTERVAL '90 days')::date
       AND NOT EXISTS (
         SELECT 1 FROM nfe_manifestacao nm
         WHERE nm.nfe = nr.nfe
           AND nm.nfe_evento IN (210200, 210220, 210240)
       )
     ORDER BY nr.data_emissao ASC
     LIMIT 5000`,
    [empresaGrids],
  )
}

export async function buscarNfeManifestosPorGrids(
  grids: number[],
): Promise<NfeResumoRow[]> {
  if (!grids.length) return []
  return query<NfeResumoRow>(
    `SELECT nr.grid::bigint, nr.empresa::bigint, nr.nfe::bigint,
            nr.emitente_nome::text, nr.emitente_cpf::text,
            to_char(nr.data_emissao, 'YYYY-MM-DD') AS data_emissao,
            nr.valor::float
     FROM nfe_resumo nr
     WHERE nr.grid = ANY($1::bigint[])`,
    [grids],
  )
}

// Itens de uma NF-e lida do XML armazenado em nfe_xml.fonte_xml
export interface ItemNfe {
  numero:          number
  codigo_produto:  string
  descricao:       string
  quantidade:      number
  unidade:         string
  preco_unitario:  number
  valor:           number
}

function parseItensNfe(xml: string): ItemNfe[] {
  const itens: ItemNfe[] = []
  // Aceita tanto <det ...> quanto <nfe:det ...> (NF-e com prefixo de namespace)
  const detRegex = /<(?:\w+:)?det[^>]*nItem="(\d+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?det>/g
  let match: RegExpExecArray | null
  while ((match = detRegex.exec(xml)) !== null) {
    const numero = parseInt(match[1])
    const det = match[2]
    const get = (tag: string) => {
      // Aceita <tag>, <ns:tag>, <tag attr=...>
      const m = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)</(?:\\w+:)?${tag}>`).exec(det)
      return m ? m[1].trim() : ''
    }
    itens.push({
      numero,
      codigo_produto: get('cProd'),
      descricao:      get('xProd'),
      quantidade:     parseFloat(get('qCom') || get('qTrib') || '0'),
      unidade:        get('uCom') || get('uTrib'),
      preco_unitario: parseFloat(get('vUnCom') || get('vUnTrib') || '0'),
      valor:          parseFloat(get('vProd') || '0'),
    })
  }
  return itens
}

// Busca os itens de uma NF pelo grid de nfe_resumo, lendo o XML do AS
export async function buscarItensNfe(nfeGrid: number): Promise<ItemNfe[]> {
  const rows = await query<{ fonte_xml: Buffer | string | null }>(
    `SELECT nx.fonte_xml
     FROM nfe_xml nx
     JOIN nfe_resumo nr ON nr.nfe = nx.nfe
     WHERE nr.grid = $1
     LIMIT 1`,
    [nfeGrid],
  )
  if (!rows.length) {
    console.log(`[buscarItensNfe] grid=${nfeGrid} sem registro em nfe_xml`)
    return []
  }
  const raw = rows[0].fonte_xml
  if (!raw) {
    console.log(`[buscarItensNfe] grid=${nfeGrid} fonte_xml vazio`)
    return []
  }
  // fonte_xml pode vir como Buffer (coluna bytea) ou string (coluna text)
  const xmlStr = Buffer.isBuffer(raw) ? decodeBytea(raw as Buffer) : (raw as string)
  const itens = parseItensNfe(xmlStr)
  console.log(`[buscarItensNfe] grid=${nfeGrid} xml=${xmlStr.length}chars itens=${itens.length}`)
  return itens
}

// Verifica se NFs (por grid de nfe_resumo) já foram manifestadas externamente no SEFAZ.
// Retorna para cada grid o último evento de manifestação:
//   210200 = Confirmação da Operação
//   210210 = Ciência da Operação (intermediário — goods recebidos mas não confirmados formalmente)
//   210220 = Desconhecimento da Operação
//   210240 = Operação não Realizada
export async function verificarManifestacaoExterna(
  grids: number[],
): Promise<{ grid: string; nfe_evento: number }[]> {
  if (!grids.length) return []
  return query(
    `SELECT nr.grid::text, nm_last.nfe_evento::int
     FROM nfe_resumo nr
     JOIN LATERAL (
       SELECT nfe_evento
       FROM nfe_manifestacao nm2
       WHERE nm2.nfe = nr.nfe
         AND nm2.nfe_evento IN (210200, 210210, 210220, 210240)
       ORDER BY nm2.grid DESC
       LIMIT 1
     ) nm_last ON true
     WHERE nr.grid = ANY($1::bigint[])`,
    [grids],
  )
}

// Detecta se NFs (por grid de nfe_resumo) já foram lançadas no estoque via lmc_entrada.
//
// Caminhos tentados em ordem:
//   1. lmc_entrada.nfe = nfe_resumo.nfe (FK direta — quando a coluna existe)
//   2. lmc_entrada.documento = nfe.nota_fiscal (número da NF via tabela nfe)
// Retorna os grids confirmados como strings para comparação com o Set no sync.
export async function verificarLancamentoNfe(
  nfeResumoGrids: number[],
): Promise<{ grid: string }[]> {
  if (!nfeResumoGrids.length) return []

  const cols = await colunasExistentes('lmc_entrada', ['nfe'])

  if (cols.has('nfe')) {
    // Caminho preferencial: join direto pelo FK nfe (mais confiável)
    return query<{ grid: string }>(
      `SELECT DISTINCT nr.grid::text
       FROM nfe_resumo nr
       JOIN lmc_entrada le ON le.nfe = nr.nfe
       WHERE nr.grid = ANY($1::bigint[])`,
      [nfeResumoGrids],
    )
  }

  // Fallback: join via nfe.nota_fiscal = lmc_entrada.documento
  // (nfe_resumo não tem coluna numero; o número da NF fica em nfe.nota_fiscal)
  try {
    return await query<{ grid: string }>(
      `SELECT DISTINCT nr.grid::text
       FROM nfe_resumo nr
       JOIN nfe n ON n.grid = nr.nfe
       JOIN lmc_entrada le ON le.documento::text = n.nota_fiscal::text
       WHERE nr.grid = ANY($1::bigint[])`,
      [nfeResumoGrids],
    )
  } catch {
    return []
  }
}

// ── Análise de Vendas & Precificação ─────────────────────────────────────────

// Campos confirmados no AutoSystem via information_schema:
//   lancto.preco_unit          = preço praticado na venda
//   lancto.preco_unit_orig     = preço original antes do desconto
//   lancto.valor_desconto      = desconto por unidade (campo direto)
//   produto.preco_unit         = preço tabela cadastrado
//   produto.preco_custo        = custo cadastrado no produto
//   estoque_lancto.custo_medio = custo médio unitário no momento da venda

export interface VendaAnaliseProduto extends Record<string, unknown> {
  produto:        number
  produto_nome:   string
  // `tipo` da tabela `produto` no AUTOSYSTEM. Pra postos, 'C' = combustível.
  // null quando a coluna não existe naquela instância.
  tipo:           string | null
  grupo:          number
  grupo_nome:     string | null  // grupo_produto.nome (decoded)
  subgrupo:       number | null  // null quando a coluna não existe
  subgrupo_nome:  string | null  // subgrupo_produto.nome (decoded)
  // Quando `breakdownEmpresa=true` no caller, cada linha vem quebrada por
  // empresa (id externo do AUTOSYSTEM); caso contrário fica null (o resultado
  // está agregado entre todas as empresas).
  empresa_id:     number | null
  qtd:            number
  venda:          number
  custo:          number
  preco_medio:    number
  custo_unitario: number
  preco_tabela:   number | null
  total_desconto: number
}

export interface VendaDesconto extends Record<string, unknown> {
  grid:          number
  empresa:       number
  data:          string
  produto_nome:  string
  quantidade:    number
  preco_unit:    number
  preco_orig:    number
  preco_tabela:  number
  desconto_unit: number
  desconto_perc: number
}

export async function buscarAnaliseVendasPorProduto(
  empresaIds:       number[],
  dataIni:          string,
  dataFim:          string,
  grupoIds?:        number[],
  breakdownEmpresa: boolean = false,
): Promise<{ produtos: VendaAnaliseProduto[]; temPrecoTabela: boolean }> {
  if (!empresaIds.length) return { produtos: [], temPrecoTabela: false }

  // Detecta colunas opcionais defensivamente — `tipo` ('C' = combustível,
  // 'M' = mercadoria…) e `subgrupo` (FK pra subgrupo_produto) podem não
  // existir em todas as instâncias do AUTOSYSTEM.
  const cols          = await colunasExistentes('produto', ['tipo', 'subgrupo'])
  const tipoSel       = cols.has('tipo')     ? 'p.tipo::text'           : 'NULL::text'
  const tipoGroup     = cols.has('tipo')     ? ', p.tipo'               : ''
  const temSub        = cols.has('subgrupo')
  const subgrupoSel   = temSub ? 'p.subgrupo::bigint' : 'NULL::bigint'
  const subgrupoJoin  = temSub ? 'LEFT JOIN subgrupo_produto sgp ON sgp.grid = p.subgrupo' : ''
  const subgrupoNome  = temSub ? 'sgp.nome::bytea'    : 'NULL::bytea'
  const subgrupoGroup = temSub ? ', p.subgrupo, sgp.nome' : ''

  // Breakdown por empresa — usado quando o consumidor (UI) quer quebrar a
  // agregação produto×empresa em vez de somar entre todas as empresas
  // selecionadas. Aumenta a cardinalidade das linhas, por isso o LIMIT é
  // ampliado quando ligado.
  const empresaSel   = breakdownEmpresa ? 'l.empresa::bigint' : 'NULL::bigint'
  const empresaGroup = breakdownEmpresa ? ', l.empresa'       : ''
  const rowLimit     = breakdownEmpresa ? 5000                : 500

  const params: unknown[] = [empresaIds, dataIni, dataFim]
  const grupoFlt = grupoIds && grupoIds.length > 0
    ? (params.push(grupoIds), `AND p.grupo = ANY($${params.length}::bigint[])`)
    : ''

  const rows = await query<{
    produto:         number
    nome_b:          Buffer | null
    tipo:            string | null
    grupo:           number
    grupo_nome_b:    Buffer | null
    subgrupo:        number | null
    subgrupo_nome_b: Buffer | null
    empresa_id:      number | null
    qtd:             number
    venda:           number
    custo:           number
    preco_medio:     number
    custo_unitario:  number
    preco_tabela:    number | null
    total_desconto:  number
  }>(
    `SELECT
       l.produto::bigint AS produto,
       p.nome::bytea     AS nome_b,
       ${tipoSel}        AS tipo,
       p.grupo::bigint   AS grupo,
       gp.nome::bytea    AS grupo_nome_b,
       ${subgrupoSel}    AS subgrupo,
       ${subgrupoNome}   AS subgrupo_nome_b,
       ${empresaSel}     AS empresa_id,
       SUM(l.quantidade)::float                                                         AS qtd,
       SUM(l.valor)::float                                                              AS venda,
       SUM(ABS(el.custo_medio * el.movimento))::float                                   AS custo,
       (SUM(l.valor) / NULLIF(SUM(l.quantidade), 0))::float                            AS preco_medio,
       (SUM(ABS(el.custo_medio * el.movimento)) / NULLIF(SUM(l.quantidade), 0))::float AS custo_unitario,
       MAX(p.preco_unit)::float                                                          AS preco_tabela,
       COALESCE(SUM(l.valor_desconto * l.quantidade), 0)::float                         AS total_desconto
     FROM lancto l
       LEFT JOIN estoque_lancto el ON el.lancto = l.grid
       LEFT JOIN produto p         ON l.produto = p.grid
       LEFT JOIN grupo_produto gp  ON gp.grid = p.grupo
       ${subgrupoJoin}
     WHERE l.empresa = ANY($1::bigint[])
       AND l.operacao = 'V'
       AND l.data BETWEEN $2::date AND $3::date
       ${grupoFlt}
     GROUP BY l.produto, p.nome, p.grupo, gp.nome${tipoGroup}${subgrupoGroup}${empresaGroup}
     ORDER BY venda DESC
     LIMIT ${rowLimit}`,
    params,
  )

  return {
    produtos: rows.map(r => ({
      produto:        Number(r.produto),
      produto_nome:   decodeBytea(r.nome_b).trim(),
      tipo:           r.tipo ? r.tipo.trim() : null,
      grupo:          Number(r.grupo),
      grupo_nome:     decodeBytea(r.grupo_nome_b).trim() || null,
      subgrupo:       r.subgrupo != null ? Number(r.subgrupo) : null,
      subgrupo_nome:  decodeBytea(r.subgrupo_nome_b).trim() || null,
      empresa_id:     r.empresa_id != null ? Number(r.empresa_id) : null,
      qtd:            Number(r.qtd),
      venda:          Number(r.venda),
      custo:          Number(r.custo),
      preco_medio:    Number(r.preco_medio),
      custo_unitario: Number(r.custo_unitario),
      preco_tabela:   r.preco_tabela != null ? Number(r.preco_tabela) : null,
      total_desconto: Number(r.total_desconto),
    })),
    temPrecoTabela: true,
  }
}

export async function buscarAnaliseVendasPorMes(
  empresaIds: number[],
  dataIni:    string,
  dataFim:    string,
  grupoIds?:  number[],
): Promise<{ mes: string; venda: number; custo: number }[]> {
  if (!empresaIds.length) return []
  const params: unknown[] = [empresaIds, dataIni, dataFim]
  const grupoFlt = grupoIds && grupoIds.length > 0
    ? (params.push(grupoIds), `AND p.grupo = ANY($${params.length}::bigint[])`)
    : ''

  return query<{ mes: string; venda: number; custo: number }>(
    `SELECT
       to_char(l.data, 'YYYY-MM') AS mes,
       SUM(l.valor)::float                              AS venda,
       SUM(ABS(el.custo_medio * el.movimento))::float   AS custo
     FROM lancto l
       LEFT JOIN estoque_lancto el ON el.lancto = l.grid
       LEFT JOIN produto p         ON l.produto = p.grid
     WHERE l.empresa = ANY($1::bigint[])
       AND l.operacao = 'V'
       AND l.data BETWEEN $2::date AND $3::date
       ${grupoFlt}
     GROUP BY to_char(l.data, 'YYYY-MM')
     ORDER BY mes ASC`,
    params,
  )
}

// Histórico mensal de combustíveis (`produto.tipo = 'C'`) — usado pelo
// gráfico de evolução na aba Combustíveis. Retorna por mês: litros vendidos
// (sum quantidade), venda em R$ e custo. Quando `produtoId` é informado,
// restringe a um único combustível; senão agrega todos os 'C'.
export interface VendaCombustivelMes extends Record<string, unknown> {
  mes:    string  // YYYY-MM
  litros: number
  venda:  number
  custo:  number
}

export async function buscarVendasCombustiveisPorMes(
  empresaIds: number[],
  dataIni:    string,
  dataFim:    string,
  produtoId?: number,
): Promise<VendaCombustivelMes[]> {
  if (!empresaIds.length) return []

  // Defensivo: a coluna `tipo` pode não existir em todas as instâncias.
  // Se não existir, retornamos vazio — a aba Combustíveis só faz sentido
  // quando há a tipagem do AUTOSYSTEM.
  const cols = await colunasExistentes('produto', ['tipo'])
  if (!cols.has('tipo')) return []

  const params: unknown[] = [empresaIds, dataIni, dataFim]
  let prodFlt = ''
  if (produtoId && produtoId > 0) {
    params.push(produtoId)
    prodFlt = `AND l.produto = $${params.length}::bigint`
  }

  return query<VendaCombustivelMes>(
    `SELECT
       to_char(l.data, 'YYYY-MM')                       AS mes,
       SUM(l.quantidade)::float                         AS litros,
       SUM(l.valor)::float                              AS venda,
       SUM(ABS(el.custo_medio * el.movimento))::float   AS custo
     FROM lancto l
       LEFT JOIN estoque_lancto el ON el.lancto = l.grid
       LEFT JOIN produto p         ON l.produto = p.grid
     WHERE l.empresa = ANY($1::bigint[])
       AND l.operacao = 'V'
       AND l.data BETWEEN $2::date AND $3::date
       AND p.tipo = 'C'
       ${prodFlt}
     GROUP BY to_char(l.data, 'YYYY-MM')
     ORDER BY mes ASC`,
    params,
  )
}

export async function buscarVendasComDesconto(
  empresaIds: number[],
  dataIni:    string,
  dataFim:    string,
  grupoIds?:  number[],
): Promise<{ rows: VendaDesconto[]; temPrecoTabela: boolean }> {
  if (!empresaIds.length) return { rows: [], temPrecoTabela: false }
  const params: unknown[] = [empresaIds, dataIni, dataFim]
  const grupoFlt = grupoIds && grupoIds.length > 0
    ? (params.push(grupoIds), `AND p.grupo = ANY($${params.length}::bigint[])`)
    : ''

  const raw = await query<{
    grid:          number
    empresa:       number
    data:          string
    nome_b:        Buffer | null
    quantidade:    number
    preco_unit:    number
    preco_orig:    number
    preco_tabela:  number
    desconto_unit: number
    desconto_perc: number
  }>(
    `SELECT
       l.grid::bigint                                                                          AS grid,
       l.empresa::bigint                                                                       AS empresa,
       to_char(l.data, 'YYYY-MM-DD')                                                          AS data,
       p.nome::bytea                                                                           AS nome_b,
       l.quantidade::float                                                                     AS quantidade,
       l.preco_unit::float                                                                     AS preco_unit,
       COALESCE(NULLIF(l.preco_unit_orig, 0), l.preco_unit)::float                            AS preco_orig,
       p.preco_unit::float                                                                     AS preco_tabela,
       l.valor_desconto::float                                                                 AS desconto_unit,
       (l.valor_desconto / NULLIF(COALESCE(NULLIF(l.preco_unit_orig,0), l.preco_unit), 0) * 100)::float AS desconto_perc
     FROM lancto l
       JOIN produto p ON p.grid = l.produto
     WHERE l.empresa = ANY($1::bigint[])
       AND l.operacao = 'V'
       AND l.data BETWEEN $2::date AND $3::date
       ${grupoFlt}
       AND l.valor_desconto > 0
     ORDER BY (l.valor_desconto * l.quantidade) DESC, l.data DESC
     LIMIT 2000`,
    params,
  )

  return {
    rows: raw.map(r => ({
      grid:          Number(r.grid),
      empresa:       Number(r.empresa),
      data:          String(r.data),
      produto_nome:  decodeBytea(r.nome_b).trim(),
      quantidade:    Number(r.quantidade),
      preco_unit:    Number(r.preco_unit),
      preco_orig:    Number(r.preco_orig),
      preco_tabela:  Number(r.preco_tabela),
      desconto_unit: Number(r.desconto_unit),
      desconto_perc: Number(r.desconto_perc),
    })),
    temPrecoTabela: true,
  }
}

// ── Estoque por empresa + grupo (contagem física) ────────────────────────────

export interface EstoqueProdutoContagem extends Record<string, unknown> {
  produto:       number
  produto_nome:  string
  unid_med:      string
  estoque:       number
  custo_medio:   number
  valor_total:   number
}

export async function buscarEstoquePorGrupo(
  empresaId: number,
  grupoId:   number,
): Promise<EstoqueProdutoContagem[]> {
  const rows = await query<{
    produto:     number
    nome_b:      Buffer | null
    unid_med:    string
    estoque:     number
    custo_medio: number
  }>(
    `SELECT ep.produto::bigint,
            p.nome::bytea     AS nome_b,
            p.unid_med::text,
            SUM(ep.estoque)::float                              AS estoque,
            COALESCE(AVG(NULLIF(ep.custo_medio,0)),0)::float   AS custo_medio
     FROM estoque_produto ep
     JOIN produto p ON p.grid = ep.produto
     WHERE ep.empresa = $1
       AND p.grupo    = $2
     GROUP BY ep.produto, p.nome, p.unid_med
     ORDER BY p.nome::text`,
    [empresaId, grupoId],
  )
  return rows.map(r => ({
    produto:      Number(r.produto),
    produto_nome: decodeBytea(r.nome_b).trim(),
    unid_med:     String(r.unid_med || 'UN'),
    estoque:      Number(r.estoque),
    custo_medio:  Number(r.custo_medio),
    valor_total:  Number(r.estoque) * Number(r.custo_medio),
  }))
}

// ── Fechamento de Caixa por Frentista ────────────────────────────────────────

export interface DadosCaixaFrentista {
  cartoes:            number
  cartoes_frotas:     number
  pix_tef:            number
  pix_cnpj:           number
  dinheiro:           number
  deposito_cofre:     number
  a_prazo:            number
  cheque:             number
  notas_promissorias: number
  total_entradas:     number   // entrada: tudo que entra no caixa (AUTOSYSTEM)
  total_formas:       number   // saída: soma das formas de pagamento (AUTOSYSTEM)
  lancto_por_conta:   Record<string, number>   // breakdown por conta AS (lancto)
  lancto_por_motivo:  Record<number, number>   // breakdown por motivo_grid AS
  movto_por_forma:    Record<string, number>   // conta.nome → total (formas de pagamento do movto)
  caixas_encontrados: number
  estrategia:         string
}

// Retorna motivos distintos usados em lanctos de venda (para tela de configuração)
export async function buscarMotivosLanctoFrentista(
  empresaGrids: number[],
  dataIni = '2026-01-01',
): Promise<{ grid: number; nome: string }[]> {
  if (!empresaGrids.length) return []
  // Verifica se lancto tem coluna motivo nesta instância do AUTOSYSTEM
  const cols = await colunasExistentes('lancto', ['motivo'])
  if (!cols.has('motivo')) return []
  return query(
    `SELECT DISTINCT mm.grid::bigint AS grid, mm.nome::text AS nome
     FROM lancto l
     JOIN motivo_movto mm ON mm.grid = l.motivo
     WHERE l.empresa = ANY($1::bigint[])
       AND l.data >= $2::date
       AND l.operacao = 'V'
       AND l.motivo IS NOT NULL
     ORDER BY mm.nome
     LIMIT 300`,
    [empresaGrids, dataIni],
  )
}

// Retorna as formas de pagamento distintas a partir de movto.conta_debitar → conta.nome
// Esses são os nomes exatos que aparecem no AUTOSYSTEM (Financeiro > Saídas)
// e servem como chave para o mapeamento admin → grupo do fechamento
export async function buscarTefOperadorasDistinct(
  empresaGrids: number[],
  dataIni = '2026-01-01',
): Promise<{ chave: string }[]> {
  if (!empresaGrids.length) return []
  try {
    const rows = await query<{ nome_b: Buffer | null }>(
      `SELECT DISTINCT c.nome::bytea AS nome_b
       FROM movto m
       LEFT JOIN conta c ON c.codigo = m.conta_debitar
       WHERE m.empresa = ANY($1::bigint[])
         AND m.data >= $2::date
         AND m.conta_debitar NOT LIKE '4.%'
         AND c.nome IS NOT NULL
       ORDER BY 1
       LIMIT 500`,
      [empresaGrids, dataIni],
    )
    return rows
      .map(r => decodeBytea(r.nome_b).trim())
      .filter(c => c.length > 0)
      .sort((a, b) => a.localeCompare(b))
      .map(chave => ({ chave }))
  } catch {
    return []
  }
}

// Constrói candidatos de login AUTOSYSTEM a partir do nome do funcionário.
// O AUTOSYSTEM usa vários formatos: só primeiro nome, primeiro+último, nome completo sem espaço, etc.
// IMPORTANTE: o AUTOSYSTEM costuma PULAR preposições (DE, DA, DOS...) ao montar o
// login — ex.: "CLEIDIANE DE JESUS DAMASCENO" → CLEIDIANEJESUS (primeiro + JESUS).
function nomeParaCandidatos(nome: string): string[] {
  const PREP = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'DI', 'DU'])
  const partes = nome.trim().toUpperCase().replace(/\s+/g, ' ').split(' ').filter(Boolean)
  const signif = partes.filter(p => !PREP.has(p))   // partes "de verdade" (sem preposição)
  const s = new Set<string>()
  s.add(partes[0])                                                // só primeiro nome (BRUNA)
  s.add(partes.join(''))                                          // tudo junto com preposições
  s.add(signif.join(''))                                          // tudo junto sem preposições
  if (partes.length >= 2) s.add(partes[0] + partes[partes.length - 1])  // primeiro + último (cru)
  if (signif.length >= 2) s.add(signif[0] + signif[signif.length - 1])  // primeiro + último significativo
  if (partes.length >= 3) s.add(partes[0] + partes[1])           // primeiro + segundo (cru)
  if (signif.length >= 2) s.add(signif[0] + signif[1])           // primeiro + segundo significativo (CLEIDIANEJESUS)
  if (partes.length >= 2) s.add(partes[0] + ' ' + partes[partes.length - 1])  // com espaço
  return [...s].filter(c => c.length >= 2)
}

export async function buscarDadosCaixaFrentista(
  empresaGrid:    number,
  data:           string,     // YYYY-MM-DD
  codigoOperador: string,     // funcionario.codigo do frentista
  motivoGrupos:   Record<number, string> = {},  // motivo_grid → grupo
  tefGrupos:      Record<string, string> = {},   // "PROFROTA" / "STONE - PIX" → grupo
): Promise<DadosCaixaFrentista> {

  // Pré-carrega schemas (colunasExistentes usa cache global)
  await Promise.all([
    colunasExistentes('lancto',  ['motivo', 'caixa']),
    colunasExistentes('movto',   ['caixa', 'hora']),
    colunasExistentes('exchange_linxpay_qr_transacao', [
      'amount', 'valor', 'valor_transacao',
      'payment_status', 'status', 'situacao',
      'movto', 'data', 'data_transacao', 'hora',
    ]),
  ])

  // ── 1. Resolve o login AUTOSYSTEM pelo código do funcionário ────────────
  // Fluxo: funcionario.codigo → funcionario.nome → gera candidatos de login
  //        → confirma qual candidato existe em caixa.usuario para empresa+data
  let usuarioAS = ''
  let funcNome  = ''

  try {
    const funcRows = await query<{ nome: string }>(
      `SELECT nome::text FROM funcionario WHERE codigo::text = $1 LIMIT 1`,
      [codigoOperador],
    )
    funcNome = funcRows[0] ? String(funcRows[0].nome ?? '').trim() : ''
    console.log(`[caixa-frentista] codigo=${codigoOperador} → funcNome="${funcNome}"`)
  } catch (e: any) { console.log(`[caixa-frentista] funcionario lookup erro: ${e.message}`) }

  if (funcNome) {
    const candidatos = nomeParaCandidatos(funcNome)
    console.log(`[caixa-frentista] candidatos=${JSON.stringify(candidatos)}`)

    // Confirma qual candidato existe como caixa.usuario para essa empresa+data
    // Mais confiável que checar a tabela usuario (que pode não existir)
    try {
      const rows = await query<{ usuario: string }>(
        `SELECT DISTINCT usuario::text FROM caixa
         WHERE empresa = $1 AND data = $2::date
           AND usuario = ANY($3::text[])
         LIMIT 1`,
        [empresaGrid, data, candidatos],
      )
      if (rows.length) usuarioAS = String(rows[0].usuario ?? '').trim()
    } catch (e: any) { console.log(`[caixa-frentista] caixa usuario check erro: ${e.message}`) }

    // Fallback: confirma pelo movto.usuario. O caixa pode ter sido aberto sob um
    // login genérico (ex.: "PDV") enquanto as transações ficam sob o nome do
    // operador — nesse caso o caixa.usuario não bate, mas o movto.usuario sim.
    if (!usuarioAS) {
      try {
        const rows = await query<{ usuario: string }>(
          `SELECT usuario::text AS usuario, COUNT(*) AS n FROM movto
           WHERE empresa = $1 AND data = $2::date AND usuario = ANY($3::text[])
           GROUP BY usuario ORDER BY n DESC LIMIT 1`,
          [empresaGrid, data, candidatos],
        )
        if (rows.length) usuarioAS = String(rows[0].usuario ?? '').trim()
      } catch (e: any) { console.log(`[caixa-frentista] movto usuario check erro: ${e.message}`) }
    }

    // Fallback: testa na tabela usuario (quando existe) para dias sem caixa aberto
    if (!usuarioAS) {
      for (const cand of candidatos) {
        if (usuarioAS) break
        try {
          const rows = await query<{ nome: string }>(
            `SELECT nome::text FROM usuario WHERE nome = $1 LIMIT 1`, [cand],
          )
          if (rows.length) usuarioAS = String(rows[0].nome ?? '').trim()
        } catch { /* tabela pode não existir */ }
      }
    }
    console.log(`[caixa-frentista] usuarioAS="${usuarioAS}"`)
  }

  const lancto_por_conta: Record<string, number>  = {}
  const lancto_por_motivo: Record<number, number> = {}
  const movto_por_forma: Record<string, number>   = {}
  let total_entradas = 0 // entrada: tudo que entra no caixa (vendas + recebimentos)
  let total_formas = 0   // saída: soma das formas de pagamento lançadas
  let caixaGrids: number[] = []
  let estrategia = 'nenhuma'
  let pdvContaCode: string | null = null

  if (!usuarioAS) {
    console.log(`[caixa-frentista] usuario AS não encontrado para codigo=${codigoOperador}`)
    return {
      cartoes: 0, cartoes_frotas: 0, pix_tef: 0, pix_cnpj: 0,
      dinheiro: 0, deposito_cofre: 0, a_prazo: 0, cheque: 0, notas_promissorias: 0,
      total_entradas: 0, total_formas: 0,
      lancto_por_conta, lancto_por_motivo, movto_por_forma,
      caixas_encontrados: 0, estrategia,
    }
  }

  // ── 2. Caixas do frentista pelo login ────────────────────────────────────
  try {
    const rows = await query<{ grid: number }>(
      `SELECT grid::bigint FROM caixa WHERE empresa=$1 AND data=$2::date AND usuario=$3`,
      [empresaGrid, data, usuarioAS],
    )
    caixaGrids = rows.map(r => Number(r.grid))
    estrategia = `caixa.usuario(${usuarioAS})`
    console.log(`[caixa-frentista] caixas=[${caixaGrids.join(',')}]`)
  } catch (e: any) { console.log(`[caixa-frentista] caixa lookup erro: ${e.message}`) }

  // ── 3. Formas de pagamento via movto (filtrado por usuario) ─────────────
  // movto NÃO tem coluna caixa — filtra por empresa+data+usuario
  try {
    const formaRows = await query<{ conta_debitar: string; nome_b: Buffer | null; total: number }>(
      `SELECT m.conta_debitar::text,
              c.nome::bytea AS nome_b,
              COALESCE(SUM(m.valor), 0)::float AS total
       FROM movto m
       LEFT JOIN conta c ON c.codigo = m.conta_debitar
       WHERE m.empresa = $1 AND m.data = $2::date AND m.usuario = $3
         AND m.conta_debitar NOT LIKE '4.%'
       GROUP BY m.conta_debitar, c.nome
       ORDER BY total DESC`,
      [empresaGrid, data, usuarioAS],
    )
    console.log(`[caixa-frentista] movto usuario(${usuarioAS}) → ${formaRows.length} forma(s)`)
    for (const r of formaRows) {
      const nome = decodeBytea(r.nome_b).trim() || r.conta_debitar
      movto_por_forma[nome] = (movto_por_forma[nome] ?? 0) + Number(r.total)
    }
    const pdvRow = formaRows.find(r => r.conta_debitar.startsWith('1.1.2.') || r.conta_debitar.startsWith('1.1.1.'))
    pdvContaCode = pdvRow?.conta_debitar ?? null
    // Total de ENTRADAS = consolidação do caixa/PDV (1.1.2.x): soma tudo que entra
    // (venda de produtos + recebimento de faturas + outras entradas)
    total_entradas = formaRows
      .filter(r => r.conta_debitar.startsWith('1.1.2.'))
      .reduce((s, r) => s + Number(r.total), 0)
    console.log(`[caixa-frentista] formas=[${Object.keys(movto_por_forma).join('|')}] pdv=${pdvContaCode ?? 'null'} total_entradas=${total_entradas.toFixed(2)}`)
  } catch (e: any) { console.log(`[caixa-frentista] movto forma erro: ${e.message}`) }

  // ── 4. Lançamentos por conta (lancto) filtrado por usuario ───────────────
  // lancto NÃO tem coluna caixa nem motivo nesta instância — filtra por empresa+data+usuario
  try {
    const lancCols  = await colunasExistentes('lancto', ['motivo', 'caixa'])
    const temMotivo = lancCols.has('motivo')
    const temCaixa  = lancCols.has('caixa')

    if (temCaixa && caixaGrids.length) {
      // Instâncias com lancto.caixa: filtra pelo caixa (mais preciso)
      const selectMotivo = temMotivo ? `COALESCE(motivo::bigint, 0) AS motivo_grid,` : `0 AS motivo_grid,`
      const groupBy = temMotivo ? 'conta, motivo' : 'conta'
      const rows = await query<{ motivo_grid: number | null; conta: string; total: number }>(
        `SELECT ${selectMotivo} conta::text, COALESCE(SUM(valor), 0)::float AS total
         FROM lancto WHERE caixa = ANY($1::bigint[]) AND operacao = 'V'
         GROUP BY ${groupBy}`,
        [caixaGrids],
      )
      console.log(`[caixa-frentista] lancto via caixa → ${rows.length} linha(s)`)
      for (const r of rows) {
        lancto_por_conta[r.conta] = (lancto_por_conta[r.conta] ?? 0) + Number(r.total)
        const mg = Number(r.motivo_grid)
        if (mg > 0) lancto_por_motivo[mg] = (lancto_por_motivo[mg] ?? 0) + Number(r.total)
      }
    } else {
      // Sem lancto.caixa: filtra por empresa+data+usuario+operacao (padrão desta instância)
      const selectMotivo = temMotivo ? `COALESCE(motivo::bigint, 0) AS motivo_grid,` : `0 AS motivo_grid,`
      const groupBy = temMotivo ? 'conta, motivo' : 'conta'
      const rows = await query<{ motivo_grid: number | null; conta: string; total: number }>(
        `SELECT ${selectMotivo} conta::text, COALESCE(SUM(valor), 0)::float AS total
         FROM lancto
         WHERE empresa = $1 AND data = $2::date AND usuario = $3 AND operacao = 'V'
         GROUP BY ${groupBy}`,
        [empresaGrid, data, usuarioAS],
      )
      console.log(`[caixa-frentista] lancto via usuario(${usuarioAS}) → ${rows.length} linha(s)`)
      for (const r of rows) {
        lancto_por_conta[r.conta] = (lancto_por_conta[r.conta] ?? 0) + Number(r.total)
        const mg = Number(r.motivo_grid)
        if (mg > 0) lancto_por_motivo[mg] = (lancto_por_motivo[mg] ?? 0) + Number(r.total)
      }
    }
  } catch (e: any) { console.log(`[caixa-frentista] lancto query erro: ${e.message}`) }

  // ── 5. TEF automático via tef_transacao (filtrado pelos caixas) ──────────
  if (caixaGrids.length) {
    try {
      const tefRows = await query<{ op_b: Buffer | null; bnd_b: Buffer | null; total: number }>(
        `SELECT operadora_nome::bytea AS op_b, bandeira::bytea AS bnd_b,
                COALESCE(SUM(valor), 0)::float AS total
         FROM tef_transacao WHERE caixa = ANY($1::bigint[])
         GROUP BY operadora_nome, bandeira ORDER BY total DESC`,
        [caixaGrids],
      )
      console.log(`[caixa-frentista] tef_transacao → ${tefRows.length} linha(s)`)
      for (const r of tefRows) {
        const op = decodeBytea(r.op_b).trim(); const bnd = decodeBytea(r.bnd_b).trim()
        if (!op) continue
        const chave = bnd ? `${op} - ${bnd}` : op
        const jaExiste = Object.keys(movto_por_forma).some(k => {
          const kl = k.toLowerCase(); const cl = chave.toLowerCase()
          return kl === cl || kl.startsWith(cl + ' ') || kl.startsWith(cl + '-')
        })
        if (!jaExiste) movto_por_forma[`TEF ${chave}`] = (movto_por_forma[`TEF ${chave}`] ?? 0) + Number(r.total)
      }
    } catch (e: any) { console.log(`[caixa-frentista] tef_transacao erro: ${e.message}`) }
  }

  // ── 6. QRLINX-PIX via exchange_linxpay_qr_transacao ─────────────────────
  // Filtra pelos movtos do frentista (empresa+data+usuario) — movto.caixa não existe
  try {
    const qrCols = await colunasExistentes('exchange_linxpay_qr_transacao', [
      'amount', 'valor', 'valor_transacao',
      'payment_status', 'status', 'situacao',
      'movto', 'data', 'data_transacao', 'hora',
    ])
    if (qrCols.size > 0) {
      const colValor  = qrCols.has('amount')         ? 'amount'         : qrCols.has('valor')         ? 'valor'         : qrCols.has('valor_transacao') ? 'valor_transacao' : null
      const colStatus = qrCols.has('payment_status') ? 'payment_status' : qrCols.has('status')        ? 'status'        : qrCols.has('situacao')        ? 'situacao'        : null
      const colMovto  = qrCols.has('movto')          ? 'movto'          : null
      const colData   = qrCols.has('data')           ? 'data'           : qrCols.has('data_transacao') ? 'data_transacao': null

      if (colValor && colData && colMovto) {
        const statusCond = colStatus
          ? `AND UPPER(${colStatus}::text) IN ('5', 'APPROVED', 'PAID', 'APROVADO', 'PAGO', '1', 'OK', 'S')`
          : ''

        // Filtra pelos movtos do frentista (empresa+data+usuario)
        const r1 = await query<{ total: number }>(
          `SELECT COALESCE(SUM(qr.${colValor}::float), 0) AS total
           FROM exchange_linxpay_qr_transacao qr
           WHERE qr.${colData}::date = $2::date
             ${statusCond}
             AND qr.${colMovto} IN (
               SELECT grid FROM movto
               WHERE empresa = $1 AND data = $2::date AND usuario = $3
             )`,
          [empresaGrid, data, usuarioAS],
        )
        let qrTotal = Number(r1[0]?.total ?? 0)
        console.log(`[qr-linxpay] via usuario(${usuarioAS}) total=${qrTotal}`)

        // Verifica se QRLINX já está contabilizado no movto para evitar duplicação
        if (qrTotal > 0) {
          const chkRows = await query<{ cnt: number }>(
            `SELECT COUNT(*)::int AS cnt
             FROM exchange_linxpay_qr_transacao qr
             JOIN movto m ON m.grid = qr.${colMovto}
             WHERE qr.${colData}::date = $1::date ${statusCond}
               AND m.empresa = $2 AND m.data = $1::date AND m.usuario = $3`,
            [data, empresaGrid, usuarioAS],
          ).catch(() => [{ cnt: 0 }])
          if (Number(chkRows[0]?.cnt ?? 0) > 0) {
            console.log(`[qr-linxpay] QRLINX já em movto — não duplica`)
            qrTotal = 0
          }
        }

        if (qrTotal > 0) movto_por_forma['QRLINX - PIX'] = qrTotal
      }
    }
  } catch (e: any) { console.log(`[qr-linxpay] erro: ${e.message}`) }

  // 6. Agrega totais por grupo usando movto_por_forma (principal) + config tefGrupos (nome → grupo)
  let cartoes            = 0
  let dinheiro           = 0
  let deposito_cofre     = 0
  let cartoes_frotas     = 0
  let pix_tef            = 0
  let pix_cnpj           = 0
  let a_prazo            = 0
  let cheque             = 0
  let notas_promissorias = 0

  const temFormaGrupos  = Object.keys(tefGrupos).length > 0
  const temMotivoGrupos = Object.keys(motivoGrupos).length > 0 && Object.keys(lancto_por_motivo).length > 0

  // Resolve o grupo de uma forma: tenta match exato, depois substring (ignora variações de nome)
  function resolverGrupo(nome: string): string | undefined {
    if (tefGrupos[nome]) return tefGrupos[nome]
    // Substring match: configKey ⊂ nome  ou  nome ⊂ configKey (mín. 4 chars)
    const lower = nome.toLowerCase()
    let bestLen = 3
    let bestGrupo: string | undefined
    for (const [configKey, grupo] of Object.entries(tefGrupos)) {
      if (!grupo) continue
      const lk = configKey.toLowerCase()
      if (lk.length >= 4 && (lower.includes(lk) || lk.includes(lower))) {
        if (configKey.length > bestLen) { bestLen = configKey.length; bestGrupo = grupo }
      }
    }
    return bestGrupo
  }

  // Keyword fallback — usado para formas sem entrada na config (ex.: TEF automáticas)
  // Regras: elo/mastercard/visa → CARTÕES; pix (não cnpj) → PIX; resto → FROTAS
  const EXCLUIR_KW = ['pdv - ', 'cheques em transito', 'cheque pdv', 'juros pend', 'transferencia', 'deposito em transito']
  function applyKeyword(nome: string, total: number): boolean {
    const c = nome.toLowerCase()
    if (EXCLUIR_KW.some(ex => c.startsWith(ex) || c.includes(ex))) return true // excluído
    // Depósitos (cofre, brinks, depósito em dinheiro) → DEP. COFRE
    if (c.includes('cofre') || c.includes('brink') || c.includes('deposito') || c.includes('depósito')) {
      deposito_cofre += total
    } else if (c.startsWith('caixa adm') || c === 'dinheiro' || c.includes('sangria')) {
      dinheiro += total
    } else if ((c.includes('pix') || c.includes('qrlinx')) && c.includes('cnpj')) {
      pix_cnpj += total
    } else if (c.includes('pix') || c.includes('qrlinx')) {
      pix_tef += total
    } else if ((c.includes('nota') && c.includes('prazo')) || c.includes('a prazo') || c.startsWith('prazo') || c.includes('promissor')) {
      notas_promissorias += total
    } else if (c.includes('cheque')) {
      cheque += total
    } else if (c.includes('elo') || c.includes('mastercard') || c.includes('visa')) {
      cartoes += total  // só Elo, Mastercard e Visa entram em CARTÕES
    } else {
      cartoes_frotas += total  // todo o resto (Stone, Cielo, frotas, etc.) vai para FROTAS
    }
    return true
  }

  // Verifica se a config cobre pelo menos uma das formas encontradas (exato ou substring)
  const configCoberta = temFormaGrupos &&
    Object.keys(movto_por_forma).some(nome => resolverGrupo(nome) != null)

  if (configCoberta) {
    // Usa mapeamento conta.nome → grupo; formas sem config recebem keyword fallback
    const mapeamentos: string[] = []
    for (const [nome, total] of Object.entries(movto_por_forma)) {
      const grupo = resolverGrupo(nome)
      if (grupo) {
        if (grupo === 'cartoes')            cartoes            += total
        if (grupo === 'frotas')             cartoes_frotas     += total
        if (grupo === 'pix')                pix_tef            += total
        if (grupo === 'pix_cnpj')           pix_cnpj           += total
        if (grupo === 'dinheiro')           dinheiro           += total
        if (grupo === 'deposito_cofre')     deposito_cofre     += total
        if (grupo === 'a_prazo')            notas_promissorias += total
        if (grupo === 'cheque')             cheque             += total
        if (grupo === 'notas_promissorias') notas_promissorias += total
        mapeamentos.push(`${nome}→${grupo}(${total.toFixed(2)})`)
      } else {
        // Não está na config → keyword fallback (ex.: TEF automáticas recém-adicionadas)
        const ok = applyKeyword(nome, total)
        if (ok) mapeamentos.push(`${nome}→kw(${total.toFixed(2)})`)
      }
    }
    console.log(`[caixa-frentista] mapeamento: ${mapeamentos.join(' | ')}`)
  } else if (temMotivoGrupos) {
    // Usa mapeamento motivo → grupo (instalações que têm lancto.motivo)
    for (const [mgStr, total] of Object.entries(lancto_por_motivo)) {
      const grupo = motivoGrupos[Number(mgStr)]
      if (grupo === 'cartoes')        cartoes        += total
      if (grupo === 'dinheiro')       dinheiro       += total
      if (grupo === 'deposito_cofre') deposito_cofre += total
      if (grupo === 'frotas')         cartoes_frotas += total
      if (grupo === 'pix')            pix_tef        += total
    }
  } else {
    // Fallback puro: keyword matching sobre conta.nome
    for (const [nome, total] of Object.entries(movto_por_forma)) {
      applyKeyword(nome, total)
    }
    // Se dinheiro ainda não foi encontrado, tenta 1.1.1.x do lancto
    if (dinheiro === 0) {
      for (const [conta, total] of Object.entries(lancto_por_conta)) {
        if (conta.startsWith('1.1.1.')) dinheiro += total
      }
    }
  }

  // Saída total (formas) = soma dos grupos — já exclui o PDV consolidado e keywords excluídas,
  // batendo com o "Total de saídas" da Conferência de Caixa do AUTOSYSTEM
  total_formas = parseFloat(
    (cartoes + cartoes_frotas + pix_tef + pix_cnpj + dinheiro + deposito_cofre + a_prazo + cheque + notas_promissorias).toFixed(2)
  )

  console.log(`[caixa-frentista] result cartoes=${cartoes.toFixed(2)} frotas=${cartoes_frotas.toFixed(2)} pix=${pix_tef.toFixed(2)} pix_cnpj=${pix_cnpj.toFixed(2)} din=${dinheiro.toFixed(2)} dep_cofre=${deposito_cofre.toFixed(2)} total_formas=${total_formas.toFixed(2)} total_entradas=${total_entradas.toFixed(2)} configCoberta=${configCoberta}`)

  return {
    cartoes,
    cartoes_frotas,
    pix_tef,
    pix_cnpj,
    dinheiro,
    deposito_cofre,
    a_prazo,
    cheque,
    notas_promissorias,
    total_entradas,
    total_formas,
    lancto_por_conta,
    lancto_por_motivo,
    movto_por_forma,
    caixas_encontrados: caixaGrids.length,
    estrategia,
  }
}

// ── calcularMovimento ────────────────────────────────────────────────────────

export function calcularMovimento(
  movtos: MovtoResumo[],
  contaCodigo: string | null,
): number {
  if (contaCodigo) {
    const debito  = movtos.filter(m => m.conta_debitar  === contaCodigo).reduce((s, m) => s + m.valor, 0)
    const credito = movtos.filter(m => m.conta_creditar === contaCodigo).reduce((s, m) => s + m.valor, 0)
    return parseFloat((debito - credito).toFixed(2))
  }
  const debito  = movtos.filter(m => m.conta_debitar?.startsWith('1.2.')  && !m.conta_creditar?.startsWith('1.2.')).reduce((s, m) => s + m.valor, 0)
  const credito = movtos.filter(m => m.conta_creditar?.startsWith('1.2.') && !m.conta_debitar?.startsWith('1.2.')).reduce((s, m) => s + m.valor, 0)
  return parseFloat((debito - credito).toFixed(2))
}
