import { NextResponse } from "next/server";

type PredictionResult = {
  wafer_id: string;
  image_path: string;
  predicted_defect: string;
  confidence: number;
  defect_found: boolean;
  risk_level: string;
  recommended_actions: string[];
  timestamp: string;
};

const BACKEND_BASE_URL =
  process.env.WAFER_BACKEND_BASE_URL ??
  process.env.NEXT_PUBLIC_WAFER_BACKEND_BASE_URL ??
  "http://127.0.0.1:8000";

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/predictions?limit=24`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Backend returned ${response.status}` },
        { status: response.status },
      );
    }

    const payload = (await response.json()) as { predictions: PredictionResult[] };
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown dashboard fetch failure";
    return NextResponse.json({ error: message, predictions: [] satisfies PredictionResult[] }, { status: 200 });
  }
}
