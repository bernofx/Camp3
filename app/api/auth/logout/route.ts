import { deleteSession, json } from "../../../../lib/auth";

export async function POST(request: Request) {
  return json({ ok: true }, 200, { "set-cookie": await deleteSession(request) });
}
