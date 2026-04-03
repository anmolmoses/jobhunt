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

function esc(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Generate a professional, ATS-optimized resume HTML.
 * Designed to fit on one A4/Letter page with tight spacing.
 */
export function generateResumeHTML(data: ResumeData): string {
  const { contactInfo: c, summary, experience, education, skills, projects, certifications, customSections } = data;

  // Build contact line — plain text URLs for ATS compatibility
  const contactParts: string[] = [];
  if (c.email) contactParts.push(esc(c.email));
  if (c.phone) contactParts.push(esc(c.phone));
  if (c.location) contactParts.push(esc(c.location));
  if (c.linkedin) {
    const display = c.linkedin.replace(/^https?:\/\/(www\.)?/, "");
    contactParts.push(`<a href="${esc(c.linkedin)}">${esc(display)}</a>`);
  }
  if (c.github) {
    const display = c.github.replace(/^https?:\/\/(www\.)?/, "");
    contactParts.push(`<a href="${esc(c.github)}">${esc(display)}</a>`);
  }
  if (c.website) {
    const display = c.website.replace(/^https?:\/\/(www\.)?/, "");
    contactParts.push(`<a href="${esc(c.website)}">${esc(display)}</a>`);
  }
  const contactLine = contactParts.join("  |  ");

  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Calibri', 'Helvetica Neue', 'Arial', sans-serif;
    font-size: 10pt;
    line-height: 1.32;
    color: #1a1a1a;
    padding: 0.45in 0.55in;
    max-width: 8.5in;
    -webkit-print-color-adjust: exact;
  }

  /* Header */
  .header { margin-bottom: 10px; }
  h1 {
    font-size: 20pt;
    font-weight: 700;
    letter-spacing: 0.3px;
    margin-bottom: 4px;
    color: #111;
  }
  .contact {
    font-size: 9pt;
    color: #444;
    line-height: 1.4;
  }
  .contact a { color: #444; text-decoration: none; }

  /* Section headers */
  h2 {
    font-size: 10pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #111;
    border-bottom: 1.5px solid #111;
    padding-bottom: 2px;
    margin: 12px 0 6px;
  }

  /* Entry blocks */
  .entry { margin-bottom: 8px; }
  .entry-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .entry-left { flex: 1; min-width: 0; }
  .entry-title { font-weight: 700; font-size: 10pt; }
  .entry-org { font-style: italic; font-size: 9.5pt; color: #333; }
  .entry-date {
    font-size: 9pt;
    color: #555;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .entry-body {
    margin-top: 2px;
    font-size: 9.5pt;
    line-height: 1.35;
  }
  .entry-body ul {
    margin: 1px 0 0 14px;
    padding: 0;
  }
  .entry-body li {
    margin-bottom: 1px;
    padding-left: 2px;
  }
  .entry-body p { margin-bottom: 2px; }

  /* Skills */
  .skills-list {
    font-size: 9.5pt;
    line-height: 1.5;
  }
  .skill-row { margin-bottom: 1px; }
  .skill-cat { font-weight: 700; }

  /* Projects */
  .proj-title { font-weight: 700; font-size: 10pt; }
  .proj-link { font-size: 8.5pt; color: #555; font-style: italic; }
  .proj-tech { font-size: 8.5pt; color: #555; font-style: italic; margin-top: 1px; }

  /* Certifications */
  .cert-entry { margin-bottom: 3px; font-size: 9.5pt; }
  .cert-name { font-weight: 700; }
  .cert-meta { color: #555; }
</style>
</head>
<body>`;

  // ── Header ──
  html += `<div class="header">`;
  html += `<h1>${esc(c.name) || "Your Name"}</h1>`;
  if (contactLine) html += `<div class="contact">${contactLine}</div>`;
  html += `</div>`;

  // ── Summary ──
  if (summary?.trim()) {
    html += `<h2>Summary</h2>`;
    html += `<div class="entry-body">${summary}</div>`;
  }

  // ── Experience ──
  if (experience.length > 0) {
    html += `<h2>Experience</h2>`;
    for (const exp of experience) {
      const dateRange = exp.current
        ? `${esc(exp.startDate)} – Present`
        : `${esc(exp.startDate)} – ${esc(exp.endDate || "")}`;
      html += `<div class="entry">
        <div class="entry-header">
          <div class="entry-left">
            <span class="entry-title">${esc(exp.title)}</span>
            <span class="entry-org"> — ${esc(exp.company)}${exp.location ? `, ${esc(exp.location)}` : ""}</span>
          </div>
          <div class="entry-date">${dateRange}</div>
        </div>
        <div class="entry-body">${exp.description}</div>
      </div>`;
    }
  }

  // ── Education ──
  if (education.length > 0) {
    html += `<h2>Education</h2>`;
    for (const edu of education) {
      const dateRange = edu.startDate
        ? `${esc(edu.startDate)} – ${esc(edu.endDate || "")}`
        : esc(edu.endDate || "");
      html += `<div class="entry">
        <div class="entry-header">
          <div class="entry-left">
            <span class="entry-title">${esc(edu.degree)}${edu.field ? ` in ${esc(edu.field)}` : ""}</span>
            <span class="entry-org"> — ${esc(edu.school)}</span>
          </div>
          ${dateRange ? `<div class="entry-date">${dateRange}</div>` : ""}
        </div>
        ${edu.description ? `<div class="entry-body">${edu.description}</div>` : ""}
      </div>`;
    }
  }

  // ── Skills ──
  if (skills.length > 0) {
    html += `<h2>Skills</h2>`;
    html += `<div class="skills-list">`;
    for (const cat of skills) {
      if (cat.items.length > 0) {
        html += `<div class="skill-row"><span class="skill-cat">${esc(cat.category)}:</span> ${cat.items.map(esc).join(", ")}</div>`;
      }
    }
    html += `</div>`;
  }

  // ── Projects ──
  if (projects.length > 0) {
    html += `<h2>Projects</h2>`;
    for (const proj of projects) {
      html += `<div class="entry">
        <span class="proj-title">${esc(proj.name)}</span>`;
      if (proj.url) html += ` <span class="proj-link">${esc(proj.url)}</span>`;
      html += `<div class="entry-body">${proj.description}</div>`;
      if (proj.tech?.length) html += `<div class="proj-tech">Tech: ${proj.tech.map(esc).join(", ")}</div>`;
      html += `</div>`;
    }
  }

  // ── Certifications ──
  if (certifications.length > 0) {
    html += `<h2>Certifications</h2>`;
    for (const cert of certifications) {
      html += `<div class="cert-entry">`;
      html += `<span class="cert-name">${esc(cert.name)}</span>`;
      if (cert.issuer) html += ` <span class="cert-meta">— ${esc(cert.issuer)}</span>`;
      if (cert.date) html += ` <span class="cert-meta">(${esc(cert.date)})</span>`;
      html += `</div>`;
    }
  }

  // ── Custom Sections ──
  for (const section of customSections) {
    if (section.content?.trim()) {
      html += `<h2>${esc(section.title)}</h2>`;
      html += `<div class="entry-body">${section.content}</div>`;
    }
  }

  html += `</body></html>`;
  return html;
}

/**
 * Generate PDF from structured resume data using Puppeteer.
 * Saves to uploads/ and returns the filename.
 */
export async function generateResumePDF(data: ResumeData, buildId: number): Promise<string> {
  const html = generateResumeHTML(data);

  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const fileName = `resume-${buildId}-${Date.now()}.pdf`;
  const filePath = path.join(uploadsDir, fileName);

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
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }

  return fileName;
}
