import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { pool } from "../database";

type RoomPayload = { code?: unknown; state?: unknown };
const roomCodePattern = /^(GOLF|PHASE)-[A-Z0-9]{4}$/;

function json(status: number, body: unknown): HttpResponseInit {
  return { status, jsonBody: body, headers: { "content-type": "application/json" } };
}

function getCode(request: HttpRequest): string {
  return (request.params.code || "").trim().toUpperCase();
}

async function readPayload(request: HttpRequest): Promise<RoomPayload> {
  try {
    return await request.json() as RoomPayload;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

async function rooms(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const code = getCode(request);
  if (!roomCodePattern.test(code)) return json(400, { error: "Invalid room code." });

  if (request.method === "GET") {
    const result = await pool.query("SELECT state FROM golf_rooms WHERE code = $1", [code]);
    if (!result.rowCount) return json(404, { error: "Room not found." });
    return json(200, { code, state: result.rows[0].state });
  }

  const payload = await readPayload(request);
  if (payload.code !== undefined && String(payload.code).toUpperCase() !== code) return json(400, { error: "Room code mismatch." });
  if (payload.state === undefined || payload.state === null || typeof payload.state !== "object") return json(400, { error: "A room state is required." });

  if (request.method === "POST") {
    try {
      const result = await pool.query(
        "INSERT INTO golf_rooms (code, state) VALUES ($1, $2::jsonb) RETURNING code, state, updated_at",
        [code, JSON.stringify(payload.state)],
      );
      return json(201, result.rows[0]);
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") return json(409, { error: "That room code is already in use." });
      throw error;
    }
  }

  const result = await pool.query(
    "UPDATE golf_rooms SET state = $2::jsonb, updated_at = now() WHERE code = $1 RETURNING code, state, updated_at",
    [code, JSON.stringify(payload.state)],
  );
  if (!result.rowCount) return json(404, { error: "Room not found." });
  context.log(`Updated room ${code}`);
  return json(200, result.rows[0]);
}

app.http("rooms-get", { methods: ["GET"], authLevel: "anonymous", route: "rooms/{code}", handler: rooms });
app.http("rooms-create", { methods: ["POST"], authLevel: "anonymous", route: "rooms/{code}", handler: rooms });
app.http("rooms-update", { methods: ["PUT"], authLevel: "anonymous", route: "rooms/{code}", handler: rooms });
