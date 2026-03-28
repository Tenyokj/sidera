import messagesLib from "../lib/messages.cjs"

const { getDestinationPreview } = messagesLib

export async function GET() {
  try {
    const destination = await getDestinationPreview()
    return Response.json({ destination }, { status: 200 })
  } catch (error) {
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: error.statusCode || 500 }
    )
  }
}
