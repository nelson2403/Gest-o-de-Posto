import { Pool } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host:     process.env.EXT_DB_HOST,
      port:     Number(process.env.EXT_DB_PORT ?? 5432),
      database: process.env.EXT_DB_NAME,
      user:     process.env.EXT_DB_USER,
      password: process.env.EXT_DB_PASSWORD,
      max: 5,
      idleTimeoutMillis: 30000,
    })

    pool.on('connect', (client) => {
      client.query("SET client_encoding = 'WIN1252'")
    })
  }
  return pool
}
