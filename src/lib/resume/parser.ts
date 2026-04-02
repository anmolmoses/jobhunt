import fs from "fs";
import path from "path";
import mammoth from "mammoth";

// pdf-parse v1 uses CommonJS default export
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

export async function parseResume(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = fs.readFileSync(filePath);

  if (ext === ".pdf") {
    const data = await pdfParse(buffer);
    return data.text.trim();
  }

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  throw new Error(`Unsupported file type: ${ext}`);
}
