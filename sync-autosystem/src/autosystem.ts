import { Pool, PoolClient } from 'pg'
import { config } from './config'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      ...config.autosystem,
      max:                10,
      idleTimeoutMillis:  30000,
      connectionTimeoutMillis: 10000,
    })
    pool.on('connect', client => {
      client.query("SET client_encoding = 'WIN1252'")
    })
    pool.on('error', err => {
      console.error('[autosystem] pool error:', err.message)
    })
  }
  return pool
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

// Busca os grids de todas as empresas ativas no AUTOSYSTEM
export async function buscarEmpresasAtivas(gridsFixos: number[]): Promise<number[]> {
  if (gridsFixos.length > 0) return gridsFixos
  return withClient(async client => {
    const res = await client.query<{ grid: string }>(
      `SELECT grid::text FROM empresa ORDER BY grid`
    )
    return res.rows.map(r => Number(r.grid))
  })
}
