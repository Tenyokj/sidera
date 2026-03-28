const http = require("node:http")
const fs = require("node:fs")
const path = require("node:path")
const { URL } = require("node:url")

const { createMessage, getDestinationPreview, listMessages } = require("./lib/messages.cjs")

const HOST = "127.0.0.1"
const PORT = Number(process.env.PORT || 4173)
const ROOT_DIR = __dirname

const STATIC_FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js",
  "/favicon.svg": "favicon.svg",
  "/favicon.ico": "favicon.svg",
  "/robots.txt": "robots.txt",
  "/sitemap.xml": "sitemap.xml"
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8"
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${PORT}`}`)

    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(request, response, requestUrl)
      return
    }

    await serveStaticFile(response, requestUrl.pathname)
  } catch (error) {
    console.error(error)
    respondJson(response, error.statusCode || 500, {
      error: error.message || "Internal server error"
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Sidera server listening on http://${HOST}:${PORT}`)
})

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

function shutdown() {
  server.close(() => {
    process.exit(0)
  })
}

async function handleApi(request, response, requestUrl) {
  if (request.method === "GET" && requestUrl.pathname === "/api/messages") {
    const messages = await listMessages({
      after: Number(requestUrl.searchParams.get("after") || "0")
    })
    respondJson(response, 200, { messages })
    return
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/destination-preview") {
    const destination = await getDestinationPreview()
    respondJson(response, 200, { destination })
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/messages") {
    let payload = {}

    try {
      payload = await readJsonBody(request)
    } catch {
      respondJson(response, 400, { error: "Body must be valid JSON." })
      return
    }

    const message = await createMessage(payload)
    respondJson(response, 201, { message })
    return
  }

  respondJson(response, 404, { error: "Not found" })
}

async function serveStaticFile(response, pathname) {
  const relativeFile = STATIC_FILES[pathname]

  if (!relativeFile) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
    response.end("Not found")
    return
  }

  const absoluteFile = path.join(ROOT_DIR, relativeFile)
  const extension = path.extname(absoluteFile)
  const content = await fs.promises.readFile(absoluteFile)

  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream"
  })
  response.end(content)
}

function respondJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": MIME_TYPES[".json"],
    "Cache-Control": "no-store"
  })
  response.end(JSON.stringify(data))
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = ""

    request.on("data", (chunk) => {
      rawBody += chunk

      if (rawBody.length > 1_000_000) {
        reject(new Error("Request body too large"))
        request.destroy()
      }
    })

    request.on("end", () => {
      if (!rawBody) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(rawBody))
      } catch (error) {
        reject(error)
      }
    })

    request.on("error", reject)
  })
}
