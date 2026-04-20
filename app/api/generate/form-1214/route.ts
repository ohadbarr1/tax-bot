import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "not_implemented", form: "1214", message: "טופס 1214 טרם נתמך" },
    { status: 501 },
  );
}
