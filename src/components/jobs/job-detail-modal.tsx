"use client";

import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ExternalLink, MapPin, Building2, Calendar, DollarSign, Plus, BookmarkCheck,
  Users, Briefcase, TrendingUp, Loader2, Brain, Globe, UserPlus, Send, Link2, Mail,
} from "lucide-react";
import type { NormalizedJob } from "@/types/jobs";

interface CompanyData {
  companyName: string;
  salary: {
    median: number | null;
    min: number | null;
    max: number | null;
    currency?: string;
    jobTitle: string | null;
    location: string | null;
  };
  company: {
    companySize: string | null;
    companySizeCategory: string | null;
    companyType: string | null;
    industry: string | null;
    description: string | null;
    headquarters: string | null;
    aiInsights: string | null;
  };
  cached: boolean;
}

interface NetworkContact {
  id: number;
  personName: string;
  personTitle: string | null;
  personLinkedin: string | null;
  personEmail: string | null;
  personLocation: string | null;
  personBio: string | null;
  personImageUrl: string | null;
  connectionType: string | null;
  mutualConnections: string;
  introducerName: string | null;
  outreachSent?: boolean;
}

interface LinkedInMatch {
  id: number;
  fullName: string;
  profileUrl: string | null;
  email: string | null;
  company: string | null;
  position: string | null;
  connectedOn: string | null;
  hasMessages: boolean;
  messageCount: number;
}

interface JobDetailModalProps {
  job: (NormalizedJob & { dbId?: number }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSaved?: boolean;
  onSave?: () => void;
  onUnsave?: () => void;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", INR: "₹", GBP: "£", EUR: "€", JPY: "¥",
  CAD: "CA$", AUD: "A$", SGD: "S$",
};

function formatSalary(n: number, currency?: string): string {
  const symbol = CURRENCY_SYMBOLS[currency || "USD"] || currency || "$";
  return symbol + n.toLocaleString();
}

export function JobDetailModal({ job, open, onOpenChange, isSaved, onSave, onUnsave }: JobDetailModalProps) {
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [contacts, setContacts] = useState<NetworkContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactsSearched, setContactsSearched] = useState(false);
  const [linkedinMatches, setLinkedinMatches] = useState<LinkedInMatch[]>([]);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [happenstanceEnabled, setHappenstanceEnabled] = useState(false);

  // Fetch company enrichment + LinkedIn matches when modal opens
  useEffect(() => {
    if (!open || !job) {
      setCompanyData(null);
      setContacts([]);
      setContactsSearched(false);
      setContactsError(null);
      setLinkedinMatches([]);
      return;
    }

    // Fetch LinkedIn connections at this company
    setLinkedinLoading(true);
    fetch(`/api/linkedin/connections?company=${encodeURIComponent(job.company)}&limit=20`)
      .then((res) => res.json())
      .then((data) => setLinkedinMatches(data.connections || []))
      .catch(() => setLinkedinMatches([]))
      .finally(() => setLinkedinLoading(false));

    // Check if Happenstance is enabled
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => setHappenstanceEnabled(data.happenstance_enabled !== "false"))
      .catch(() => {});

    setEnrichLoading(true);
    fetch("/api/company/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: job.company,
        jobTitle: job.title,
        location: job.location,
        jobDescription: job.description?.slice(0, 3000),
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCompanyData(data))
      .catch(() => setCompanyData(null))
      .finally(() => setEnrichLoading(false));
  }, [open, job?.company, job?.title]);

  const handleFindContacts = async () => {
    if (!job) return;
    setContactsLoading(true);
    setContactsError(null);
    try {
      const res = await fetch("/api/company/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: job.company,
          jobTitle: job.title,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setContactsError(data.error);
      } else {
        setContacts(data.contacts || []);
        setContactsSearched(true);
      }
    } catch {
      setContactsError("Failed to search contacts");
    } finally {
      setContactsLoading(false);
    }
  };

  const handleTrackOutreach = async (contactId: number, channel: string) => {
    try {
      await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          channel,
          status: "sent",
        }),
      });
      // Mark in local state
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, outreachSent: true } : c))
      );
    } catch {
      // silent
    }
  };

  if (!job) return null;

  const hasSalary = companyData?.salary?.median || companyData?.salary?.min;
  const hasCompanyInfo = companyData?.company?.companySize || companyData?.company?.industry;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {job.companyLogo ? (
                <img src={job.companyLogo} alt={job.company} className="h-12 w-12 rounded-lg object-contain border" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div>
                <DialogTitle className="text-xl">{job.title}</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">{job.company}</p>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {job.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {job.location}
            </span>
          )}
          {job.salary && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              {job.salary}
            </span>
          )}
          {job.postedAt && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(job.postedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {job.isRemote && <Badge variant="success">Remote</Badge>}
          {job.jobType && (
            <Badge variant="secondary">
              {job.jobType === "full_time" ? "Full-time" : job.jobType === "contract" ? "Contract" : job.jobType}
            </Badge>
          )}
          <Badge variant="outline">{job.provider}</Badge>
          {job.tags.slice(0, 8).map((tag) => (
            <Badge key={tag} variant="secondary">{tag}</Badge>
          ))}
        </div>

        {/* Company Intelligence Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            {enrichLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing company &amp; fetching salary data...
              </div>
            ) : (hasSalary || hasCompanyInfo) ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Brain className="h-4 w-4 text-primary" />
                  Company Intelligence
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {/* Salary Breakdown */}
                  {hasSalary && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Market Salary Range
                        {companyData.salary.location && (
                          <span className="text-xs">({companyData.salary.location})</span>
                        )}
                      </div>
                      <div className="flex items-end gap-3">
                        {companyData.salary.min && (
                          <div>
                            <p className="text-xs text-muted-foreground">Low</p>
                            <p className="text-sm font-semibold">{formatSalary(companyData.salary.min, companyData.salary.currency)}</p>
                          </div>
                        )}
                        {companyData.salary.median && (
                          <div>
                            <p className="text-xs text-muted-foreground">Median</p>
                            <p className="text-lg font-bold text-primary">{formatSalary(companyData.salary.median, companyData.salary.currency)}</p>
                          </div>
                        )}
                        {companyData.salary.max && (
                          <div>
                            <p className="text-xs text-muted-foreground">High</p>
                            <p className="text-sm font-semibold">{formatSalary(companyData.salary.max, companyData.salary.currency)}</p>
                          </div>
                        )}
                      </div>
                      {/* Salary bar visualization */}
                      {companyData.salary.min && companyData.salary.max && (
                        <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-foreground/30 via-foreground/60 to-foreground/90"
                            style={{ width: "100%" }}
                          />
                          {companyData.salary.median && (
                            <div
                              className="absolute top-0 w-0.5 h-full bg-foreground"
                              style={{
                                left: `${((companyData.salary.median - companyData.salary.min) / (companyData.salary.max - companyData.salary.min)) * 100}%`,
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Company Info */}
                  {hasCompanyInfo && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        Company Profile
                      </div>
                      <div className="space-y-1">
                        {companyData!.company.companySize && (
                          <div className="flex items-center gap-2">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">{companyData!.company.companySize} employees</span>
                            {companyData!.company.companySizeCategory && (
                              <Badge variant="secondary" className="text-xs capitalize">
                                {companyData!.company.companySizeCategory}
                              </Badge>
                            )}
                          </div>
                        )}
                        {companyData!.company.industry && (
                          <div className="flex items-center gap-2">
                            <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">{companyData!.company.industry}</span>
                          </div>
                        )}
                        {companyData!.company.companyType && (
                          <div className="flex items-center gap-2">
                            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm capitalize">{companyData!.company.companyType}</span>
                            {companyData!.company.headquarters && companyData!.company.headquarters !== "Unknown" && (
                              <span className="text-xs text-muted-foreground">
                                &middot; {companyData!.company.headquarters}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Insights */}
                {companyData?.company?.aiInsights && (
                  <div className="rounded-lg bg-background/60 p-3 mt-1">
                    <p className="text-xs text-muted-foreground italic">
                      {companyData.company.aiInsights}
                    </p>
                  </div>
                )}

                {companyData?.cached && (
                  <p className="text-xs text-muted-foreground opacity-50">Cached result</p>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Company data unavailable
              </div>
            )}
          </CardContent>
        </Card>

        {/* Network Contacts */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" />
                Your Network at {job.company}
              </div>
              {happenstanceEnabled && !contactsSearched && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFindContacts}
                  disabled={contactsLoading}
                >
                  {contactsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  {contactsLoading ? "Searching..." : "Find Contacts"}
                </Button>
              )}
            </div>

            {/* LinkedIn Connections */}
            {linkedinLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking LinkedIn connections...
              </div>
            ) : linkedinMatches.length > 0 ? (
              <div className="space-y-2 mb-3">
                <p className="text-xs font-medium text-muted-foreground">
                  LinkedIn Connections ({linkedinMatches.length})
                </p>
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {linkedinMatches.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted shrink-0">
                          <Users className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{m.fullName}</p>
                          {m.position && (
                            <p className="text-xs text-muted-foreground truncate">{m.position}</p>
                          )}
                          <div className="flex gap-1 mt-0.5">
                            <Badge variant="secondary" className="text-xs">1st degree</Badge>
                            {m.hasMessages && (
                              <Badge variant="outline" className="text-xs">
                                {m.messageCount} msg{m.messageCount !== 1 ? "s" : ""}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {m.profileUrl && (
                          <a href={m.profileUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="View on LinkedIn">
                              <Link2 className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                        )}
                        {m.email && (
                          <a href={`mailto:${m.email}`} onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Send email">
                              <Mail className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : !linkedinLoading && !contactsSearched && contacts.length === 0 && !contactsError ? (
              <p className="text-sm text-muted-foreground mb-3">
                No LinkedIn connections at this company.
                {!happenstanceEnabled && " Import your LinkedIn data in the Networking tab to see connections here."}
              </p>
            ) : null}

            {/* Happenstance Contacts */}
            {contactsError && (
              <p className="text-sm text-destructive">{contactsError}</p>
            )}

            {contactsSearched && contacts.length === 0 && linkedinMatches.length === 0 && (
              <p className="text-sm text-muted-foreground">No connections found at this company.</p>
            )}

            {contacts.length > 0 && (
              <div className="space-y-2">
                {linkedinMatches.length > 0 && (
                  <p className="text-xs font-medium text-muted-foreground">Happenstance Results ({contacts.length})</p>
                )}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {contacts.map((contact) => {
                    const mutuals = (() => {
                      try { return JSON.parse(contact.mutualConnections || "[]"); }
                      catch { return []; }
                    })();
                    return (
                      <div key={contact.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                        <div className="flex items-start gap-2 min-w-0">
                          {contact.personImageUrl ? (
                            <img src={contact.personImageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                              <Users className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{contact.personName}</p>
                            {contact.personTitle && (
                              <p className="text-xs text-muted-foreground truncate">{contact.personTitle}</p>
                            )}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {contact.connectionType && (
                                <Badge variant="secondary" className="text-xs">
                                  {contact.connectionType === "direct" ? "1st" : "2nd"} degree
                                </Badge>
                              )}
                              {contact.introducerName && (
                                <Badge variant="outline" className="text-xs">
                                  via {contact.introducerName}
                                </Badge>
                              )}
                              {mutuals.length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  {mutuals.length} mutual{mutuals.length > 1 ? "s" : ""}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {contact.personLinkedin && (
                            <a
                              href={contact.personLinkedin}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="View on LinkedIn"
                              >
                                <Link2 className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          )}
                          {contact.personEmail && (
                            <a href={`mailto:${contact.personEmail}`} onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Send email">
                                <Mail className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          )}
                          {!contact.outreachSent ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTrackOutreach(
                                  contact.id,
                                  contact.personLinkedin ? "linkedin" : contact.personEmail ? "email" : "other"
                                );
                              }}
                            >
                              <Send className="h-3 w-3" />
                              Track
                            </Button>
                          ) : (
                            <Badge variant="success" className="text-xs h-8 flex items-center">
                              Tracked
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {job.description && (
          <div className="max-h-64 overflow-y-auto rounded-lg bg-muted/50 p-4">
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{
                __html: typeof window !== "undefined"
                  ? DOMPurify.sanitize(job.description, {
                      ALLOWED_TAGS: ["b", "i", "em", "strong", "p", "br", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "h5", "h6", "span", "div", "table", "tr", "td", "th", "thead", "tbody"],
                      ALLOWED_ATTR: ["href", "target", "rel", "class", "style"],
                    })
                  : job.description.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""),
              }}
            />
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button
            variant={isSaved ? "secondary" : "outline"}
            className={isSaved ? "text-primary" : ""}
            onClick={() => (isSaved ? onUnsave?.() : onSave?.())}
          >
            {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isSaved ? "Tracking" : "Track Job"}
          </Button>
          {job.applyUrl && (
            <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">
              <Button>
                <ExternalLink className="h-4 w-4" />
                Apply
              </Button>
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
