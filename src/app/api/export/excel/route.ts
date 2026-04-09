import { NextResponse } from "next/server";
import { buildExcelWorkbook } from "@/lib/sheets/excel";

export async function GET() {
  try {
    const workbook = await buildExcelWorkbook();
    const buffer = await workbook.xlsx.writeBuffer();
    const date = new Date().toISOString().split("T")[0];

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="job-tracker-${date}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Excel export error:", error);
    return NextResponse.json({ error: "Failed to export Excel" }, { status: 500 });
  }
}
