const { ensureSchema, getClient } = require("./db.cjs")
const { createSignalRecord, generateDestination, normalizeDestination } = require("./destinations.cjs")

async function listMessages(options = {}) {
  await ensureSchema()
  const db = getClient()
  const after = Number(options.after || 0)

  const result =
    after > 0
      ? await db.execute({
          sql: `
            SELECT
              id,
              message_text,
              destination_name,
              distance_ly,
              bucket_key,
              sector_index,
              slot_index,
              x_ratio,
              y_ratio,
              size_px,
              core,
              glow,
              halo,
              created_at
            FROM messages
            WHERE created_at > ?
            ORDER BY created_at ASC
          `,
          args: [after]
        })
      : await db.execute(`
          SELECT
            id,
            message_text,
            destination_name,
            distance_ly,
            bucket_key,
            sector_index,
            slot_index,
            x_ratio,
            y_ratio,
            size_px,
            core,
            glow,
            halo,
            created_at
          FROM messages
          ORDER BY sector_index ASC, slot_index ASC, created_at ASC
        `)

  return result.rows.map(mapMessageRow)
}

async function getDestinationPreview() {
  await ensureSchema()
  return generateDestination()
}

async function createMessage(input) {
  await ensureSchema()
  const db = getClient()
  const message = typeof input.message === "string" ? input.message.trim() : ""

  if (!message || message.length > 280) {
    const error = new Error("Message must be between 1 and 280 characters.")
    error.statusCode = 400
    throw error
  }

  const destination = normalizeDestination(input.destination)

  const countResult = await db.execute("SELECT COUNT(*) AS count FROM messages")
  const totalCount = Number(countResult.rows[0]?.count || 0)
  const record = createSignalRecord({
    message,
    destination,
    totalCount
  })

  await db.execute({
    sql: `
      INSERT INTO messages (
        id,
        message_text,
        destination_name,
        distance_ly,
        bucket_key,
        sector_index,
        slot_index,
        x_ratio,
        y_ratio,
        size_px,
        core,
        glow,
        halo,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      record.id,
      record.message,
      record.destination,
      record.distance,
      record.bucketKey,
      record.sectorIndex,
      record.slotIndex,
      record.xRatio,
      record.yRatio,
      record.size,
      record.core,
      record.glow,
      record.halo,
      record.createdAt
    ]
  })

  return record
}

function mapMessageRow(row) {
  return {
    id: row.id,
    message: row.message_text,
    destination: row.destination_name,
    distance: Number(row.distance_ly),
    bucketKey: row.bucket_key,
    sectorIndex: Number(row.sector_index),
    slotIndex: Number(row.slot_index),
    xRatio: Number(row.x_ratio),
    yRatio: Number(row.y_ratio),
    size: Number(row.size_px),
    core: row.core,
    glow: row.glow,
    halo: row.halo,
    createdAt: Number(row.created_at)
  }
}

module.exports = {
  createMessage,
  getDestinationPreview,
  listMessages
}
