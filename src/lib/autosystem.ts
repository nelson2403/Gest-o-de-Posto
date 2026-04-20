import { Pool, PoolClient } from 'pg'

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host:     process.env.EXT_DB_HOST     ?? '192.168.2.200',
      port:     Number(process.env.EXT_DB_PORT ?? 5432),
      database: process.env.EXT_DB_NAME     ?? 'matriz',
      user:     process.env.EXT_DB_USER     ?? 'app_readonly',
      password: process.env.EXT_DB_PASSWORD ?? '',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
    pool.on('connect', (client: PoolClient) => {
      client.query("SET client_encoding = 'WIN1252'")
    })
  }
  return pool
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
      AND child = -1
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
  let sql = `
    SELECT conta_debitar::text, empresa::bigint, pessoa::bigint, vencto::text, valor::float, child::float
    FROM movto
    WHERE empresa = ANY($1::bigint[])
      AND conta_debitar LIKE '1.3.%'
      AND child >= 0
      AND vencto >= $2::date`

  if (venctoFim) { params.push(venctoFim); sql += ` AND vencto <= $${params.length}::date` }
  sql += ` LIMIT 100000`
  return query(sql, params)
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

export async function buscarMovtosDetalhe(
  empresaIds: number[],
  contaCod: string,
  opts: { venctoIni?: string; venctoFim?: string | null; pessoa?: string | null },
): Promise<Record<string, unknown>[]> {
  const { venctoIni = '2026-01-01', venctoFim, pessoa } = opts
  const params: unknown[] = [empresaIds, contaCod, venctoIni]
  let sql = `
    SELECT grid::bigint, mlid::bigint, data::text, vencto::text, documento::text,
           tipo_doc::text, valor::float, empresa::bigint, conta_debitar::text,
           pessoa::bigint, child::float, obs::text
    FROM movto
    WHERE empresa = ANY($1::bigint[])
      AND conta_debitar = $2
      AND child >= 0
      AND vencto >= $3::date`

  if (venctoFim) { params.push(venctoFim); sql += ` AND vencto <= $${params.length}::date` }
  if (pessoa)    { params.push(Number(pessoa)); sql += ` AND pessoa = $${params.length}` }
  sql += ` ORDER BY vencto ASC LIMIT 2000`
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
): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT data::text, documento::text, tipo_doc::text, valor::float,
            empresa::bigint, child::float, motivo::bigint
     FROM movto
     WHERE empresa = ANY($1::bigint[])
       AND motivo = $2
       AND data >= $3::date AND data <= $4::date
     ORDER BY data ASC LIMIT 5000`,
    [empresaIds, motivoGrid, dataIni, dataFim],
  )
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
