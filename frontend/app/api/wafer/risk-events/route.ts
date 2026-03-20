import { NextResponse } from "next/server";

import { buildRiskEventsResponse } from "@/lib/dashboard-data";

export async function GET() {
  const payload = await buildRiskEventsResponse();
  return NextResponse.json(payload);
}
