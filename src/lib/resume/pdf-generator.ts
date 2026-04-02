import path from "path";
import fs from "fs";

interface ContactInfo {
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  location?: string;
  website?: string;
}

interface Experience {
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate?: string;
  current?: boolean;
  description: string; // HTML
}

interface Education {
  school: string;
  degree: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

interface SkillCategory {
  category: string;
  items: string[];
}

interface Project {
  name: string;
  url?: string;
  description: string; // HTML
  tech?: string[];
}

interface Certification {
  name: string;
  issuer?: string;
  date?: string;
  url?: string;
}

interface CustomSection {
  title: string;
  content: string; // HTML
}

export interface ResumeData {
  contactInfo: ContactInfo;
  summary?: string;
  experience: Experience[];
  education: Education[];
  skills: SkillCategory[];
  projects: Project[];
  certifications: Certification[];
  customSections: CustomSection[];
}

/**
 * Generate a clean, ATS-friendly HTML resume.
 * This HTML is then converted to PDF via Puppeteer.
 */
export function generateResumeHTML(data: ResumeData): string {
  const { contactInfo: c, summary, experience, education, skills, projects, certifications, customSections } = data;

  const contactLine = [
    c.email,
    c.phone,
    c.location,
    c.linkedin ? `<a href="${c.linkedin}">LinkedIn</a>` : null,
    c.github ? `<a href="${c.github}">GitHub</a>` : null,
    c.website ? `<a href="${c.website}">Portfolio</a>` : null,
  ].filter(Boolean).join("  &middot;  ");

  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 11pt;
    line-height: 1.45;
    color: #1a1a1a;
    padding: 0.6in 0.7in;
    max-width: 8.5in;
  }
  h1 { font-size: 22pt; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.5px; }
  .contact { font-size: 9.5pt; color: #444; margin-bottom: 16px; }
  .contact a { color: #2563eb; text-decoration: none; }
  h2 {
    font-size: 11pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;
    border-bottom: 1.5px solid #1a1a1a; padding-bottom: 3px; margin: 16px 0 10px;
    color: #1a1a1a;
  }
  .entry { margin-bottom: 12px; }
  .entry-header { display: flex; justify-content: space-between; align-items: baseline; }
  .entry-title { font-weight: 700; font-size: 11pt; }
  .entry-subtitle { font-style: italic; font-size: 10pt; color: #333; }
  .entry-date { font-size: 9.5pt; color: #555; white-space: nowrap; }
  .entry-body { margin-top: 4px; font-size: 10.5pt; }
  .entry-body ul { margin-left: 18px; }
  .entry-body li { margin-bottom: 2px; }
  .skills-grid { display: flex; flex-wrap: wrap; gap: 4px 20px; font-size: 10.5pt; }
  .skill-cat { font-weight: 600; }
  .skill-items { color: #333; }
  .projects .tech { font-size: 9pt; color: #555; font-style: italic; }
  p { margin-bottom: 4px; }
  a { color: #2563eb; text-decoration: none; }
</style>
</head>
<body>`;

  // Header
  html += `<h1>${c.name || "Your Name"}</h1>`;
  if (contactLine) html += `<div class="contact">${contactLine}</div>`;

  // Summary
  if (summary?.trim()) {
    html += `<h2>Summary</h2><div class="entry-body">${summary}</div>`;
  }

  // Experience
  if (experience.length > 0) {
    html += `<h2>Experience</h2>`;
    for (const exp of experience) {
      const dateRange = exp.current ? `${exp.startDate} - Present` : `${exp.startDate} - ${exp.endDate || ""}`;
      html += `<div class="entry">
        <div class="entry-header">
          <div><span class="entry-title">${exp.title}</span> &mdash; <span class="entry-subtitle">${exp.company}${exp.location ? `, ${exp.location}` : ""}</span></div>
          <div class="entry-date">${dateRange}</div>
        </div>
        <div class="entry-body">${exp.description}</div>
      </div>`;
    }
  }

  // Education
  if (education.length > 0) {
    html += `<h2>Education</h2>`;
    for (const edu of education) {
      const dateRange = edu.startDate ? `${edu.startDate} - ${edu.endDate || ""}` : edu.endDate || "";
      html += `<div class="entry">
        <div class="entry-header">
          <div><span class="entry-title">${edu.degree}${edu.field ? ` in ${edu.field}` : ""}</span> &mdash; <span class="entry-subtitle">${edu.school}</span></div>
          <div class="entry-date">${dateRange}</div>
        </div>
        ${edu.description ? `<div class="entry-body">${edu.description}</div>` : ""}
      </div>`;
    }
  }

  // Skills
  if (skills.length > 0) {
    html += `<h2>Skills</h2><div class="skills-grid">`;
    for (const cat of skills) {
      html += `<div><span class="skill-cat">${cat.category}:</span> <span class="skill-items">${cat.items.join(", ")}</span></div>`;
    }
    html += `</div>`;
  }

  // Projects
  if (projects.length > 0) {
    html += `<h2>Projects</h2>`;
    for (const proj of projects) {
      html += `<div class="entry">
        <div class="entry-title">${proj.name}${proj.url ? ` <a href="${proj.url}">[link]</a>` : ""}</div>
        <div class="entry-body">${proj.description}</div>
        ${proj.tech?.length ? `<div class="projects"><span class="tech">Tech: ${proj.tech.join(", ")}</span></div>` : ""}
      </div>`;
    }
  }

  // Certifications
  if (certifications.length > 0) {
    html += `<h2>Certifications</h2>`;
    for (const cert of certifications) {
      html += `<div class="entry">
        <span class="entry-title">${cert.name}</span>${cert.issuer ? ` &mdash; ${cert.issuer}` : ""}${cert.date ? ` (${cert.date})` : ""}
        ${cert.url ? ` <a href="${cert.url}">[verify]</a>` : ""}
      </div>`;
    }
  }

  // Custom sections
  for (const section of customSections) {
    if (section.content?.trim()) {
      html += `<h2>${section.title}</h2><div class="entry-body">${section.content}</div>`;
    }
  }

  html += `</body></html>`;
  return html;
}

/**
 * Generate PDF from HTML using Puppeteer.
 * Saves to uploads/ and returns the filename.
 */
export async function generateResumePDF(data: ResumeData, buildId: number): Promise<string> {
  const html = generateResumeHTML(data);

  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const fileName = `resume-${buildId}-${Date.now()}.pdf`;
  const filePath = path.join(uploadsDir, fileName);

  // Use Puppeteer for high-quality PDF
  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: filePath,
      format: "A4",
      margin: { top: "0", bottom: "0", left: "0", right: "0" }, // Margins are in the HTML
      printBackground: true,
    });
  } finally {
    await browser.close();
  }

  return fileName;
}
