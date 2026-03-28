import messagesLib from "../lib/messages.cjs"

const { createMessage, listMessages } = messagesLib

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const messages = await listMessages({
      after: Number(url.searchParams.get("after") || "0")
    })

    return Response.json({ messages }, { status: 200 })
  } catch (error) {
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: error.statusCode || 500 }
    )
  }
}

export async function POST(request) {
  let payload = {}

  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: "Body must be valid JSON." }, { status: 400 })
  }

  try {
    const message = await createMessage(payload)
    return Response.json({ message }, { status: 201 })
  } catch (error) {
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: error.statusCode || 500 }
    )
  }
}
