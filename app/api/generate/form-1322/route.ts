import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "not_implemented", form: "1322", message: "טופס 1322 טרם נתמך" },
    { status: 501 },
  );
}
