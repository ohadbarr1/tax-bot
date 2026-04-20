import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "not_implemented", form: "867", message: "טופס 867 טרם נתמך" },
    { status: 501 },
  );
}
