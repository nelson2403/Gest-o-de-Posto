import { Pool, PoolClient } from 'pg'

// Cache do pool em globalThis para sobreviver a hot-reloads do Next.js em dev.
// Sem isso, cada reload cria um novo pool e os antigos ficam segurando conexões
// até serem coletadas pelo GC, eventualmente esgotando os slots do servidor.
declare global {
  // eslint-disable-next-line no-var
  var __autosystemPool: Pool | undefined
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
  valor:      number
  direcao:    'D' | 'C'  // D = entrada (caixa debitado); C = saída (caixa creditado)
  motivo:     string
  historico:  string
  documento:  string | null
  pessoa:     string
}

interface MovtoCaixaRaw extends Record<string, unknown> {
  data:        string
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
  const cols = await colunasExistentes('movto', ['pessoa', 'cliente', 'observacao', 'obs', 'historico'])
  const pessoaFkCol = cols.has('pessoa')    ? 'pessoa'
                    : cols.has('cliente')   ? 'cliente'
                    : null
  const histCol = cols.has('observacao') ? 'observacao'
              : cols.has('obs')         ? 'obs'
              : cols.has('historico')   ? 'historico'
              : null

  const histExpr = histCol ? `m.${histCol}::bytea` : 'NULL::bytea'
  const pessoaExpr = pessoaFkCol ? 'p.nome::bytea' : 'NULL::bytea'
  const joinPessoa = pessoaFkCol ? `LEFT JOIN pessoa p ON p.grid = m.${pessoaFkCol}` : ''

  const params: unknown[] = [empresaId, codigo]
  let dataFiltroD = ''
  let dataFiltroC = ''
  if (dataIni) { params.push(dataIni); dataFiltroD = ` AND m.data >= $${params.length}::date`; dataFiltroC = dataFiltroD }
  if (dataFim) { params.push(dataFim); dataFiltroD += ` AND m.data <= $${params.length}::date`; dataFiltroC += ` AND m.data <= $${params.length}::date` }
  params.push(limit)
  const limitParam = `$${params.length}`

  const rows = await query<MovtoCaixaRaw>(
    `SELECT to_char(m.data, 'YYYY-MM-DD') AS data,
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
     ORDER BY data ASC
     LIMIT ${limitParam}`,
    params,
  )

  return rows.map(r => ({
    data:      r.data,
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
  vencto:    string  // YYYY-MM-DD
  valor:     number
  documento: string | null
  motivo:    string  // decoded de bytea
  pessoa:    string  // decoded de bytea
  conta:     string  // codigo da conta (1.3.x ou 2.1.1.x)
  empresa:   number
}

interface BalancoTituloRaw extends Record<string, unknown> {
  vencto:       string
  valor:        number
  documento:    string | null
  motivo_b:     Buffer | null
  pessoa_b:     Buffer | null
  conta:        string
  empresa:      number
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
    vencto:    r.vencto,
    valor:     Number(r.valor),
    documento: r.documento,
    motivo:    decodeBytea(r.motivo_b).trim(),
    pessoa:    decodeBytea(r.pessoa_b).trim(),
    conta:     r.conta,
    empresa:   Number(r.empresa),
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

// Lista lançamentos individuais de uma conta no período (drill-down).
// Retorna `data` (YYYY-MM-DD) para bucketing por mês + `observacao` já
// formatada como "DD/MM/YYYY · DOCUMENTO · OBSERVAÇÃO" + valor.
export interface MovtoLancamento extends Record<string, unknown> {
  data:       string
  observacao: string | null
  valor:      number
}

// Helper: descobre quais colunas existem em uma tabela do AUTOSYSTEM.
// Usado para construir queries resilientes quando o schema varia entre instâncias.
async function colunasExistentes(tabela: string, candidatas: string[]): Promise<Set<string>> {
  if (!candidatas.length) return new Set()
  const rows = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2::text[])`,
    [tabela, candidatas],
  )
  return new Set(rows.map(r => r.column_name))
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
    doc_b?:    Buffer | null
    pessoa_b?: Buffer | null
    obs_b?:    Buffer | null
  }>(
    `SELECT to_char(m.data, 'YYYY-MM-DD') AS data,
            CASE WHEN m.conta_creditar = $4 THEN m.valor::float ELSE -m.valor::float END AS valor
            ${selectExtra}
     FROM movto m
     ${joinPessoa}
     WHERE m.empresa = ANY($1::bigint[])
       AND m.data BETWEEN $2::date AND $3::date
       AND (m.conta_debitar::text = $4 OR m.conta_creditar::text = $4)
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
    }
  })
}

// Lista lançamentos de venda de um grupo de produto no período (drill-down)
export interface LanctoGrupoLancamento extends Record<string, unknown> {
  data:       string
  observacao: string | null
  valor:      number
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
    doc_b?:    Buffer | null
    pessoa_b?: Buffer | null
    obs_b?:    Buffer | null
  }>(
    `SELECT to_char(l.data, 'YYYY-MM-DD')  AS data,
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
            p.nome::text AS produto_nome, p.unid_med::text, p.grupo::bigint, p.subgrupo::bigint,
            ABS(SUM(el.movimento))::float AS total_vendido,
            COUNT(DISTINCT el.data::date)::int AS dias_com_venda
     FROM estoque_lancto el
     JOIN produto p ON p.grid = el.produto
     WHERE el.empresa = ANY($1::bigint[])
       AND p.grupo = ANY($2::bigint[])
       AND el.operacao = 'V'
       AND el.data >= $3::date AND el.data <= $4::date
     GROUP BY el.empresa, el.produto, p.nome, p.unid_med, p.grupo, p.subgrupo`,
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
}

export async function buscarNfeManifestos(
  empresaGrids: number[],
): Promise<NfeResumoRow[]> {
  // Retorna apenas NFs com "Ciência da Operação" — ou seja:
  // • Existe registro em nfe_manifestacao (NF recebida)
  // • NÃO tem evento final: 210200 (Confirmação), 210220 (Desconhecimento), 210240 (Não Realizada)
  // Isso espelha exatamente a tela "Manifestação de Destinatário" do AUTOSYSTEM
  return query<NfeResumoRow>(
    `SELECT nr.grid::bigint, nr.empresa::bigint, nr.nfe::bigint,
            nr.emitente_nome::text, nr.emitente_cpf::text,
            to_char(nr.data_emissao, 'YYYY-MM-DD') AS data_emissao,
            nr.valor::float
     FROM nfe_resumo nr
     WHERE nr.empresa = ANY($1::bigint[])
       AND nr.data_emissao >= (NOW() - INTERVAL '90 days')::date
       AND EXISTS (SELECT 1 FROM nfe_manifestacao nm WHERE nm.nfe = nr.nfe)
       AND NOT EXISTS (
         SELECT 1 FROM nfe_manifestacao nm
         WHERE nm.nfe = nr.nfe
           AND nm.nfe_evento IN (210200, 210220, 210240)
       )
     ORDER BY nr.data_emissao DESC
     LIMIT 1000`,
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

// Detecta se uma NF já foi lançada no estoque via lmc_entrada.documento
export async function verificarLancamentoNfe(
  documentos: string[],
): Promise<{ documento: string; lancto: number; data_emissao: string }[]> {
  if (!documentos.length) return []
  return query(
    `SELECT documento::text, lancto::bigint,
            to_char(data_emissao, 'YYYY-MM-DD') AS data_emissao
     FROM lmc_entrada
     WHERE documento = ANY($1::text[])`,
    [documentos],
  )
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
