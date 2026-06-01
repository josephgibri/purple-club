import { NextResponse } from "next/server";
import { readPbtcSupply } from "@/lib/pbtc";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  try {
    const snapshot = await readPbtcSupply();
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("[pbtc/burned] failed:", error);
    return NextResponse.json(
      { error: "Could not read PBTC supply at this moment." },
      { status: 502 },
    );
  }
}
