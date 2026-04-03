"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Save, Download, Plus, Trash2, GripVertical,
  User, Briefcase, GraduationCap, Wrench, FolderOpen, Award, FileText,
  Wand2, Search, Building2, MapPin, CheckCircle, Eye, EyeOff,
} from "lucide-react";

const RichEditor = dynamic(
  () => import("@/components/resume/rich-editor").then((m) => m.RichEditor),
  { ssr: false, loading: () => <div className="h-32 rounded-md border bg-muted animate-pulse" /> }
);

interface ContactInfo { name: string; email: string; phone: string; linkedin: string; github: string; location: string; website: string; }
interface Experience { company: string; title: string; location: string; startDate: string; endDate: string; current: boolean; description: string; }
interface Education { school: string; degree: string; field: string; startDate: string; endDate: string; description: string; }
interface SkillCategory { category: string; items: string[]; }
interface Project { name: string; url: string; description: string; tech: string[]; }
interface Certification { name: string; issuer: string; date: string; url: string; }

const emptyExperience: Experience = { company: "", title: "", location: "", startDate: "", endDate: "", current: false, description: "" };
const emptyEducation: Education = { school: "", degree: "", field: "", startDate: "", endDate: "", description: "" };
const emptySkill: SkillCategory = { category: "", items: [] };
const emptyProject: Project = { name: "", url: "", description: "", tech: [] };
const emptyCert: Certification = { name: "", issuer: "", date: "", url: "" };

export default function ResumeEditorPage() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);

  // Tailor for job
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [jobSearchQuery, setJobSearchQuery] = useState("");
  const [availableJobs, setAvailableJobs] = useState<{ id: number; title: string; company: string; location: string | null; description: string | null }[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [tailorResult, setTailorResult] = useState<{ changesExplanation: string; atsKeywordsAdded: string[] } | null>(null);

  // Resume source selection for tailoring
  const [uploadedResumes, setUploadedResumes] = useState<{ id: number; fileName: string; createdAt: string }[]>([]);
  const [tailorResumeSource, setTailorResumeSource] = useState<"build" | number>("build");

  // Preview
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const [name, setName] = useState("New Resume");
  const [contact, setContact] = useState<ContactInfo>({ name: "", email: "", phone: "", linkedin: "", github: "", location: "", website: "" });
  const [summary, setSummary] = useState("");
  const [experience, setExperience] = useState<Experience[]>([]);
  const [education, setEducation] = useState<Education[]>([]);
  const [skills, setSkills] = useState<SkillCategory[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [certifications, setCertifications] = useState<Certification[]>([]);

  useEffect(() => {
    fetch(`/api/resume-builder/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setName(d.name || "");
        setContact(d.contactInfo || {});
        setSummary(d.summary || "");
        setExperience(d.experience || []);
        setEducation(d.education || []);
        setSkills(d.skills || []);
        setProjects(d.projects || []);
        setCertifications(d.certifications || []);
        setPdfReady(!!d.pdfPath);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/resume-builder/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, contactInfo: contact, summary, experience, education, skills, projects, certifications,
        }),
      });
      toast("Resume saved!", "success");
    } catch {
      toast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = async () => {
    // Save first
    await handleSave();
    setExporting(true);
    try {
      const res = await fetch(`/api/resume-builder/${id}/pdf`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setPdfReady(true);
        toast("PDF generated! Click Download to get it.", "success");
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "PDF generation failed", "error");
    } finally {
      setExporting(false);
    }
  };

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/resume-builder/${id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactInfo: contact, summary, experience, education, skills, projects, certifications, customSections: [] }),
      });
      if (res.ok) {
        setPreviewHtml(await res.text());
      }
    } catch { /* ignore */ }
    setPreviewLoading(false);
  }, [id, contact, summary, experience, education, skills, projects, certifications]);

  const togglePreview = () => {
    if (!showPreview) {
      loadPreview();
    }
    setShowPreview((v) => !v);
  };

  // Refresh preview when data changes (debounced)
  useEffect(() => {
    if (!showPreview) return;
    const timer = setTimeout(loadPreview, 800);
    return () => clearTimeout(timer);
  }, [showPreview, contact, summary, experience, education, skills, projects, certifications, loadPreview]);

  const updateExp = (i: number, field: string, value: unknown) => {
    setExperience((prev) => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  };

  const updateEdu = (i: number, field: string, value: unknown) => {
    setEducation((prev) => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  };

  const openJobPicker = async () => {
    setShowJobPicker(true);
    setLoadingJobs(true);
    try {
      const [jobsRes, resumesRes] = await Promise.all([
        fetch("/api/jobs/all?limit=200"),
        fetch("/api/resume/all"),
      ]);
      const jobsData = await jobsRes.json();
      setAvailableJobs(
        (jobsData.jobs || [])
          .filter((j: { description: string | null }) => j.description)
          .map((j: { id: number; title: string; company: string; location: string | null; description: string | null }) => ({
            id: j.id,
            title: j.title,
            company: j.company,
            location: j.location,
            description: j.description,
          }))
      );
      if (resumesRes.ok) {
        const resumesData = await resumesRes.json();
        setUploadedResumes(
          (Array.isArray(resumesData) ? resumesData : []).map(
            (r: { id: number; fileName: string; createdAt: string }) => ({
              id: r.id, fileName: r.fileName, createdAt: r.createdAt,
            })
          )
        );
      }
    } catch {
      toast("Failed to load jobs", "error");
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleTailor = async (jobId: number) => {
    setShowJobPicker(false);
    setTailoring(true);
    setTailorResult(null);

    // Save current version first
    await handleSave();

    try {
      const res = await fetch("/api/resume-builder/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeBuildId: parseInt(id),
          jobResultId: jobId,
          ...(tailorResumeSource !== "build" && { resumeId: tailorResumeSource }),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Tailoring failed");
      }

      const data = await res.json();
      const t = data.tailored;

      // Apply tailored content
      if (t.summary) setSummary(t.summary);
      if (t.experience?.length) {
        setExperience((prev) => {
          // Match by company name, update descriptions
          return prev.map((exp) => {
            const match = t.experience.find((te: Experience) =>
              te.company?.toLowerCase() === exp.company.toLowerCase()
            );
            return match ? { ...exp, description: match.description || exp.description } : exp;
          });
        });
      }
      if (t.skills?.length) setSkills(t.skills);

      setTailorResult({
        changesExplanation: t.changesExplanation || "Resume tailored to match the job listing.",
        atsKeywordsAdded: t.atsKeywordsAdded || [],
      });

      toast(`Resume tailored for ${data.job?.title} at ${data.job?.company}!`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Tailoring failed", "error");
    } finally {
      setTailoring(false);
    }
  };

  const filteredJobs = jobSearchQuery
    ? availableJobs.filter(
        (j) =>
          j.title.toLowerCase().includes(jobSearchQuery.toLowerCase()) ||
          j.company.toLowerCase().includes(jobSearchQuery.toLowerCase())
      )
    : availableJobs;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex-1 mr-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-xl font-bold border-0 px-0 focus-visible:ring-0 h-auto"
            placeholder="Resume name..."
          />
          <p className="text-sm text-muted-foreground">Edit your resume below. Export to PDF when ready.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={togglePreview}>
            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showPreview ? "Hide Preview" : "Preview"}
          </Button>
          <Button variant="outline" onClick={openJobPicker} disabled={tailoring}>
            {tailoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {tailoring ? "Tailoring..." : "Tailor for Job"}
          </Button>
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
          <Button onClick={handleExportPDF} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {exporting ? "Generating..." : "Export PDF"}
          </Button>
          {pdfReady && (
            <a href={`/api/resume-builder/${id}/pdf`}>
              <Button variant="secondary">
                <Download className="h-4 w-4" /> Download PDF
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Main layout: editor + preview side by side */}
      <div className={showPreview ? "flex gap-6" : ""}>
      <div className={showPreview ? "flex-1 min-w-0 space-y-6" : "space-y-6"}>

      {/* Tailor result banner */}
      {tailorResult && (
        <Card className="border-foreground/20 bg-muted/50">
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Resume Tailored Successfully</p>
                <p className="text-xs text-muted-foreground mt-1">{tailorResult.changesExplanation}</p>
                {tailorResult.atsKeywordsAdded.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-xs text-foreground">Keywords added:</span>
                    {tailorResult.atsKeywordsAdded.map((kw, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tailoring in progress */}
      {tailoring && (
        <Card className="border-primary/30">
          <CardContent className="py-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">AI is tailoring your resume...</p>
              <p className="text-xs text-muted-foreground">Rewriting summary, optimizing bullet points, matching ATS keywords</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contact Info */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Contact Information</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Full Name</Label><Input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="John Doe" /></div>
            <div className="space-y-1"><Label>Email</Label><Input value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="john@example.com" /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="+91 98765 43210" /></div>
            <div className="space-y-1"><Label>Location</Label><Input value={contact.location} onChange={(e) => setContact({ ...contact, location: e.target.value })} placeholder="Bangalore, India" /></div>
            <div className="space-y-1"><Label>LinkedIn URL</Label><Input value={contact.linkedin} onChange={(e) => setContact({ ...contact, linkedin: e.target.value })} placeholder="https://linkedin.com/in/..." /></div>
            <div className="space-y-1"><Label>GitHub URL</Label><Input value={contact.github} onChange={(e) => setContact({ ...contact, github: e.target.value })} placeholder="https://github.com/..." /></div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader><CardTitle>Professional Summary</CardTitle></CardHeader>
        <CardContent>
          <RichEditor content={summary} onChange={setSummary} placeholder="Brief summary of your experience and what you're looking for..." minHeight="80px" />
        </CardContent>
      </Card>

      {/* Experience */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" /> Experience</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setExperience([...experience, { ...emptyExperience }])}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {experience.map((exp, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-4">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-muted-foreground">Position {i + 1}</span>
                <Button variant="ghost" size="sm" onClick={() => setExperience(experience.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1"><Label>Job Title</Label><Input value={exp.title} onChange={(e) => updateExp(i, "title", e.target.value)} placeholder="Senior Backend Engineer" /></div>
                <div className="space-y-1"><Label>Company</Label><Input value={exp.company} onChange={(e) => updateExp(i, "company", e.target.value)} placeholder="Google" /></div>
                <div className="space-y-1"><Label>Location</Label><Input value={exp.location} onChange={(e) => updateExp(i, "location", e.target.value)} placeholder="Bangalore, India" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>Start</Label><Input value={exp.startDate} onChange={(e) => updateExp(i, "startDate", e.target.value)} placeholder="Jan 2022" /></div>
                  <div className="space-y-1"><Label>End</Label><Input value={exp.endDate} onChange={(e) => updateExp(i, "endDate", e.target.value)} placeholder="Present" disabled={exp.current} /></div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={exp.current} onChange={(e) => updateExp(i, "current", e.target.checked)} />
                Currently working here
              </label>
              <div className="space-y-1">
                <Label>Description</Label>
                <RichEditor content={exp.description} onChange={(html) => updateExp(i, "description", html)} placeholder="Describe your responsibilities and achievements. Use bullet points." />
              </div>
            </div>
          ))}
          {experience.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No experience added yet</p>}
        </CardContent>
      </Card>

      {/* Education */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5" /> Education</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setEducation([...education, { ...emptyEducation }])}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {education.map((edu, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-4">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-muted-foreground">Education {i + 1}</span>
                <Button variant="ghost" size="sm" onClick={() => setEducation(education.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1"><Label>School</Label><Input value={edu.school} onChange={(e) => updateEdu(i, "school", e.target.value)} /></div>
                <div className="space-y-1"><Label>Degree</Label><Input value={edu.degree} onChange={(e) => updateEdu(i, "degree", e.target.value)} placeholder="B.Tech" /></div>
                <div className="space-y-1"><Label>Field of Study</Label><Input value={edu.field} onChange={(e) => updateEdu(i, "field", e.target.value)} placeholder="Computer Science" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>Start</Label><Input value={edu.startDate} onChange={(e) => updateEdu(i, "startDate", e.target.value)} placeholder="2016" /></div>
                  <div className="space-y-1"><Label>End</Label><Input value={edu.endDate} onChange={(e) => updateEdu(i, "endDate", e.target.value)} placeholder="2020" /></div>
                </div>
              </div>
            </div>
          ))}
          {education.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No education added yet</p>}
        </CardContent>
      </Card>

      {/* Skills */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" /> Skills</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setSkills([...skills, { ...emptySkill }])}>
            <Plus className="h-3 w-3" /> Add Category
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {skills.map((cat, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border p-3">
              <div className="flex-1 grid gap-2 md:grid-cols-[200px_1fr]">
                <Input value={cat.category} onChange={(e) => setSkills(skills.map((s, idx) => idx === i ? { ...s, category: e.target.value } : s))} placeholder="Category (e.g. Languages)" />
                <Input value={cat.items.join(", ")} onChange={(e) => setSkills(skills.map((s, idx) => idx === i ? { ...s, items: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) } : s))} placeholder="Python, Java, TypeScript (comma-separated)" />
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSkills(skills.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
          {skills.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No skills added yet</p>}
        </CardContent>
      </Card>

      {/* Projects */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><FolderOpen className="h-5 w-5" /> Projects</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setProjects([...projects, { ...emptyProject }])}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {projects.map((proj, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-4">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-muted-foreground">Project {i + 1}</span>
                <Button variant="ghost" size="sm" onClick={() => setProjects(projects.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1"><Label>Project Name</Label><Input value={proj.name} onChange={(e) => setProjects(projects.map((p, idx) => idx === i ? { ...p, name: e.target.value } : p))} /></div>
                <div className="space-y-1"><Label>URL</Label><Input value={proj.url} onChange={(e) => setProjects(projects.map((p, idx) => idx === i ? { ...p, url: e.target.value } : p))} placeholder="https://..." /></div>
              </div>
              <div className="space-y-1"><Label>Tech Stack</Label><Input value={proj.tech.join(", ")} onChange={(e) => setProjects(projects.map((p, idx) => idx === i ? { ...p, tech: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) } : p))} placeholder="React, Node.js, PostgreSQL (comma-separated)" /></div>
              <div className="space-y-1">
                <Label>Description</Label>
                <RichEditor content={proj.description} onChange={(html) => setProjects(projects.map((p, idx) => idx === i ? { ...p, description: html } : p))} placeholder="What does it do? What was your role?" minHeight="60px" />
              </div>
            </div>
          ))}
          {projects.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No projects added yet</p>}
        </CardContent>
      </Card>

      {/* Certifications */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Award className="h-5 w-5" /> Certifications</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setCertifications([...certifications, { ...emptyCert }])}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {certifications.map((cert, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border p-3">
              <div className="flex-1 grid gap-2 md:grid-cols-4">
                <Input value={cert.name} onChange={(e) => setCertifications(certifications.map((c, idx) => idx === i ? { ...c, name: e.target.value } : c))} placeholder="Certification name" />
                <Input value={cert.issuer} onChange={(e) => setCertifications(certifications.map((c, idx) => idx === i ? { ...c, issuer: e.target.value } : c))} placeholder="Issuer (e.g. AWS)" />
                <Input value={cert.date} onChange={(e) => setCertifications(certifications.map((c, idx) => idx === i ? { ...c, date: e.target.value } : c))} placeholder="Date" />
                <Input value={cert.url} onChange={(e) => setCertifications(certifications.map((c, idx) => idx === i ? { ...c, url: e.target.value } : c))} placeholder="Verify URL" />
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCertifications(certifications.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
          {certifications.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No certifications added yet</p>}
        </CardContent>
      </Card>

      </div>{/* end editor column */}

      {/* Preview panel */}
      {showPreview && (
        <div className="w-[520px] shrink-0 sticky top-4 self-start">
          <Card className="overflow-hidden">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Live Preview
              </CardTitle>
              {previewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-t bg-white" style={{ height: "calc(100vh - 160px)" }}>
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-full border-0"
                  title="Resume Preview"
                  style={{ transform: "scale(0.65)", transformOrigin: "top left", width: "154%", height: "154%" }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      </div>{/* end flex layout */}

      {/* Bottom save bar */}
      <div className="fixed bottom-0 left-64 right-0 z-50 border-t bg-background/95 backdrop-blur p-4">
        <div className="container max-w-6xl flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Remember to save before exporting</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
            <Button onClick={handleExportPDF} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Export PDF
            </Button>
            {pdfReady && (
              <a href={`/api/resume-builder/${id}/pdf`}>
                <Button variant="secondary"><Download className="h-4 w-4" /> Download</Button>
              </a>
            )}
          </div>
        </div>
      </div>
      {/* Job Picker Dialog for Tailoring */}
      <Dialog open={showJobPicker} onOpenChange={setShowJobPicker}>
        <DialogContent onClose={() => setShowJobPicker(false)} className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Tailor Resume for a Job
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Choose a base resume and a job listing. AI will rewrite the summary, optimize bullet points, and match ATS keywords.
          </p>

          {/* Resume Source Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Base Resume</Label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTailorResumeSource("build")}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  tailorResumeSource === "build" ? "bg-primary/5 border-foreground/20 font-medium" : "hover:bg-muted"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Current Build
              </button>
              {uploadedResumes.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setTailorResumeSource(r.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    tailorResumeSource === r.id ? "bg-primary/5 border-foreground/20 font-medium" : "hover:bg-muted"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {r.fileName}
                </button>
              ))}
            </div>
            {tailorResumeSource !== "build" && (
              <p className="text-xs text-muted-foreground">
                Using uploaded resume as the base content for tailoring.
              </p>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs by title or company..."
              value={jobSearchQuery}
              onChange={(e) => setJobSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="max-h-96 overflow-y-auto space-y-1">
            {loadingJobs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {availableJobs.length === 0
                  ? "No jobs with descriptions found. Run a job search first."
                  : "No jobs match your search."}
              </div>
            ) : (
              filteredJobs.slice(0, 30).map((job) => (
                <button
                  key={job.id}
                  onClick={() => handleTailor(job.id)}
                  className="w-full flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors text-left"
                >
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{job.title}</p>
                    <p className="text-xs text-muted-foreground">{job.company}</p>
                    {job.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-2.5 w-2.5" />{job.location}
                      </p>
                    )}
                  </div>
                  <Wand2 className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
