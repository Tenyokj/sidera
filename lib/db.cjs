const fs = require("node:fs")
const path = require("node:path")
const { createClient } = require("@libsql/client")
const { loadEnvFiles } = require("./env.cjs")

let client = null
let schemaPromise = null

function getClient() {
  loadEnvFiles()

  if (client) {
    return client
  }

  const url = getDatabaseUrl()
  const authToken = process.env.TURSO_AUTH_TOKEN

  client = createClient({
    url,
    authToken: authToken || undefined
  })

  return client
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = createSchema()
  }

  return schemaPromise
}

async function createSchema() {
  const db = getClient()

  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      message_text TEXT NOT NULL,
      destination_name TEXT NOT NULL,
      distance_ly REAL NOT NULL,
      bucket_key TEXT NOT NULL,
      sector_index INTEGER NOT NULL,
      slot_index INTEGER NOT NULL,
      x_ratio REAL NOT NULL,
      y_ratio REAL NOT NULL,
      size_px INTEGER NOT NULL,
      core TEXT NOT NULL,
      glow TEXT NOT NULL,
      halo TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_created_at
    ON messages(created_at)
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_sector
    ON messages(sector_index, slot_index)
  `)
}

function getDatabaseUrl() {
  if (process.env.TURSO_DATABASE_URL) {
    return process.env.TURSO_DATABASE_URL
  }

  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), "data")

  fs.mkdirSync(dataDir, { recursive: true })

  return `file:${path.join(dataDir, "sidera.db")}`
}

module.exports = {
  ensureSchema,
  getClient,
  getDatabaseUrl
}
