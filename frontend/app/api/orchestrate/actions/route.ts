import { NextResponse } from "next/server";

import { buildActionQueueResponse } from "@/lib/dashboard-data";

export async function GET() {
  const payload = await buildActionQueueResponse();
  return NextResponse.json(payload);
}
