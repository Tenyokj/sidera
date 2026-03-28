const fs = require("node:fs")
const path = require("node:path")

let loaded = false

function loadEnvFiles() {
  if (loaded) {
    return
  }

  loaded = true

  const candidates = [".env.local", ".env"]

  for (const filename of candidates) {
    const absolutePath = path.join(process.cwd(), filename)

    if (!fs.existsSync(absolutePath)) {
      continue
    }

    const content = fs.readFileSync(absolutePath, "utf8")
    applyEnvContent(content)
  }
}

function applyEnvContent(content) {
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith("#")) {
      continue
    }

    const separatorIndex = trimmed.indexOf("=")

    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

module.exports = {
  loadEnvFiles
}
