import { NextResponse } from "next/server";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

export function appJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

export function appOptions() {
  return new NextResponse(null, { status: 204, headers });
}
