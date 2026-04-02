export interface ParsedResume {
  text: string;
  fileName: string;
  fileType: "pdf" | "docx";
  fileSize: number;
}
