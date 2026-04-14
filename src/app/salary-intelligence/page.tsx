"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import {
  Loader2, DollarSign, TrendingUp, TrendingDown, Building2,
  Search, ArrowRight, BarChart3, Target, Briefcase,
  IndianRupee, CircleDollarSign, ChevronDown, ChevronUp,
  RefreshCw, Save, Edit3, Check, X, Info, Minus,
} from "lucide-react";

// --- Types ---
interface SalaryProfile {
  id: number;
  currentCtc: number | null;
  currentInHand: number | null;
  currentBase: number | null;
  currentBonus: number | null;
  currentStocks: number | null;
  currentOther: number | null;
  currency: string;
  salaryBreakdown: Record<string, number>;
  currentTitle: string | null;
  currentCompany: string | null;
  totalExperience: number | null;
  relevantExperience: number | null;
  location: string | null;
  skills: string[];
  noticePeriod: string | null;
  expectedMinCtc: number | null;
  expectedMaxCtc: number | null;
}

interface SalaryBenchmark {
  jobTitle: string;
  company: string | null;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryMedian: number | null;
  salaryP25: number | null;
  salaryP75: number | null;
  salaryP90: number | null;
  baseSalaryMin: number | null;
  baseSalaryMax: number | null;
  bonusMin: number | null;
  bonusMax: number | null;
  stocksMin: number | null;
  stocksMax: number | null;
  currency: string;
  source: string;
  sourceUrl: string | null;
  sampleSize: number | null;
  confidence: string;
  experienceMin: number | null;
  experienceMax: number | null;
}

interface CompanyComparison {
  company: string;
  status: string;
  jobTitle: string;
  listingSalaryMin: number | null;
  listingSalaryMax: number | null;
  listingSalary: string | null;
  enrichedSalaryMin: number | null;
  enrichedSalaryMax: number | null;
  enrichedSalaryMedian: number | null;
  expectedSalary: number | null;
  expectedSalaryNotes: string | null;
  companyType: string | null;
  companySize: string | null;
  industry: string | null;
  glassdoorRating: string | null;
  savedJobId: number;
}

interface Positioning {
  percentile: number | null;
  positioning: string;
  userCtc: number | null;
  marketMin: number | null;
  marketMax: number | null;
  marketMedian: number | null;
  marketP75: number | null;
  marketP90: number | null;
  hikeRecommendation: {
    min: number;
    max: number;
    recommended: number;
  } | null;
}

interface CompareData {
  profile: SalaryProfile;
  market: {
    benchmarks: SalaryBenchmark[];
    aggregate: SalaryBenchmark | null;
    sources: string[];
    fromCache: boolean;
  };
  companies: CompanyComparison[];
  positioning: Positioning;
}

// --- Helpers ---
function formatSalary(amount: number | null | undefined, currency: string = "INR"): string {
  if (amount == null) return "N/A";
  if (currency === "INR") {
    if (amount >= 10000000) return `${(amount / 10000000).toFixed(1)} Cr`;
    if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`;
    return `${(amount / 1000).toFixed(0)}K`;
  }
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toFixed(0);
}

function currencySymbol(currency: string): string {
  const map: Record<string, string> = { INR: "₹", USD: "$", GBP: "£", EUR: "€", JPY: "¥", CAD: "CA$", AUD: "A$", SGD: "S$" };
  return map[currency] || "$";
}

function formatFullSalary(amount: number | null | undefined, currency: string = "INR"): string {
  if (amount == null) return "N/A";
  const sym = currencySymbol(currency);
  return `${sym}${amount.toLocaleString("en-IN")}`;
}

function positioningLabel(pos: string): { text: string; color: string } {
  switch (pos) {
    case "below_market": return { text: "Below Market", color: "text-red-500" };
    case "at_market_low": return { text: "Lower Market Range", color: "text-amber-500" };
    case "at_market": return { text: "At Market Rate", color: "text-green-500" };
    case "above_market": return { text: "Above Market", color: "text-blue-500" };
    case "top_market": return { text: "Top of Market", color: "text-purple-500" };
    default: return { text: "Unknown", color: "text-muted-foreground" };
  }
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    ambitionbox: "AmbitionBox", ambitionbox_deep: "AmbitionBox (detailed)",
    glassdoor: "Glassdoor", glassdoor_deep: "Glassdoor (detailed)",
    levels_fyi: "Levels.fyi", levels_fyi_deep: "Levels.fyi (detailed)",
    payscale: "Payscale", aggregate: "Aggregate",
    linkedin: "LinkedIn", indeed: "Indeed", naukri: "Naukri",
  };
  return map[source] || source;
}

function confidenceBadge(confidence: string | null) {
  switch (confidence) {
    case "high": return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">High Confidence</Badge>;
    case "medium": return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Medium</Badge>;
    case "low": return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Low</Badge>;
    default: return null;
  }
}

// =======================================
// Main Page Component
// =======================================
export default function SalaryIntelligencePage() {
  const { toast } = useToast();

  // State
  const [profile, setProfile] = useState<SalaryProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<Partial<SalaryProfile>>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  const [searchTitle, setSearchTitle] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [searchCompany, setSearchCompany] = useState("");
  const [searchResults, setSearchResults] = useState<{ benchmarks: SalaryBenchmark[]; aggregate: SalaryBenchmark | null; sources: string[] } | null>(null);
  const [searching, setSearching] = useState(false);

  const [editingExpected, setEditingExpected] = useState<number | null>(null);
  const [expectedValue, setExpectedValue] = useState("");
  const [expectedNotes, setExpectedNotes] = useState("");

  const [expandedBreakdown, setExpandedBreakdown] = useState(false);

  // --- Load profile on mount ---
  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/salary/profile");
        const data = await res.json();
        if (data.profile) {
          setProfile(data.profile);
          setProfileForm(data.profile);
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
      } finally {
        setLoadingProfile(false);
      }
    }
    loadProfile();
  }, []);

  // --- Save profile ---
  const saveProfile = useCallback(async () => {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/salary/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      if (res.ok) {
        const reloadRes = await fetch("/api/salary/profile");
        const data = await reloadRes.json();
        setProfile(data.profile);
        setEditingProfile(false);
        toast("Salary profile saved", "success");
      }
    } catch (error) {
      toast("Failed to save profile", "error");
    } finally {
      setSavingProfile(false);
    }
  }, [profileForm, toast]);

  // --- Run comparison ---
  const runComparison = useCallback(async () => {
    setLoadingCompare(true);
    try {
      const res = await fetch("/api/salary/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: profile?.currentTitle,
          location: profile?.location,
        }),
      });
      const data = await res.json();
      if (data.error && data.needsProfile) {
        toast("Set up your salary profile first", "error");
        setEditingProfile(true);
      } else if (data.error) {
        toast(data.error, "error");
      } else {
        setCompareData(data);
      }
    } catch (error) {
      toast("Failed to run comparison", "error");
    } finally {
      setLoadingCompare(false);
    }
  }, [profile, toast]);

  // --- Search market data ---
  const searchMarket = useCallback(async () => {
    if (!searchTitle.trim()) {
      toast("Enter a job title to search", "error");
      return;
    }
    setSearching(true);
    try {
      const res = await fetch("/api/salary/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: searchTitle,
          location: searchLocation || null,
          company: searchCompany || null,
        }),
      });
      const data = await res.json();
      setSearchResults(data);
    } catch (error) {
      toast("Market search failed", "error");
    } finally {
      setSearching(false);
    }
  }, [searchTitle, searchLocation, searchCompany, toast]);

  // --- Save expected salary for a company ---
  const saveExpectedSalary = useCallback(async (savedJobId: number) => {
    try {
      const res = await fetch("/api/salary/expected", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savedJobId,
          expectedSalary: expectedValue ? parseFloat(expectedValue) : null,
          expectedSalaryNotes: expectedNotes || null,
        }),
      });
      if (res.ok) {
        toast("Expected salary saved", "success");
        setEditingExpected(null);
        // Refresh comparison data
        if (compareData) runComparison();
      }
    } catch {
      toast("Failed to save", "error");
    }
  }, [expectedValue, expectedNotes, toast, compareData, runComparison]);

  // Auto-fill search from profile
  useEffect(() => {
    if (profile && !searchTitle) {
      setSearchTitle(profile.currentTitle || "");
      setSearchLocation(profile.location || "");
    }
  }, [profile, searchTitle]);

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <IndianRupee className="h-8 w-8 text-primary" />
            Salary Intelligence
          </h1>
          <p className="text-muted-foreground mt-1">
            Compare your compensation against market data and optimize your salary negotiation
          </p>
        </div>
        {profile && !editingProfile && (
          <Button onClick={runComparison} disabled={loadingCompare}>
            {loadingCompare ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing...</>
            ) : (
              <><BarChart3 className="mr-2 h-4 w-4" />Run Full Comparison</>
            )}
          </Button>
        )}
      </div>

      {/* Salary Profile Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Your Salary Profile
          </CardTitle>
          {!editingProfile ? (
            <Button variant="outline" size="sm" onClick={() => { setEditingProfile(true); setProfileForm(profile || {}); }}>
              <Edit3 className="mr-1 h-3 w-3" />{profile ? "Edit" : "Set Up"}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                Save
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditingProfile(false)}>
                <X className="mr-1 h-3 w-3" />Cancel
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {editingProfile ? (
            <ProfileForm form={profileForm} setForm={setProfileForm} />
          ) : profile ? (
            <ProfileDisplay profile={profile} expanded={expandedBreakdown} setExpanded={setExpandedBreakdown} />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No salary profile set up yet.</p>
              <p className="text-sm mt-1">Click &ldquo;Set Up&rdquo; to add your current compensation details.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Market Positioning (from comparison) */}
      {compareData && (
        <PositioningCard positioning={compareData.positioning} currency={profile?.currency || "INR"} />
      )}

      {/* Quick Market Search */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" />
            Market Salary Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Job Title</Label>
              <Input
                placeholder="e.g. Senior Software Engineer"
                value={searchTitle}
                onChange={(e) => setSearchTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchMarket()}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Location</Label>
              <Input
                placeholder="e.g. Bangalore, India"
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Company (optional)</Label>
              <Input
                placeholder="e.g. Google"
                value={searchCompany}
                onChange={(e) => setSearchCompany(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={searchMarket} disabled={searching} className="w-full">
                {searching ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scraping...</>
                ) : (
                  <><Search className="mr-2 h-4 w-4" />Search</>
                )}
              </Button>
            </div>
          </div>

          {searchResults && (
            <MarketResults
              results={searchResults}
              currency={profile?.currency || "INR"}
              userCtc={profile?.currentCtc || null}
            />
          )}
        </CardContent>
      </Card>

      {/* Company Comparison Table (from comparison) */}
      {compareData && compareData.companies.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Your Tracked Companies — Salary Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CompanyTable
              companies={compareData.companies}
              currency={profile?.currency || "INR"}
              userCtc={profile?.currentCtc || null}
              editingExpected={editingExpected}
              setEditingExpected={setEditingExpected}
              expectedValue={expectedValue}
              setExpectedValue={setExpectedValue}
              expectedNotes={expectedNotes}
              setExpectedNotes={setExpectedNotes}
              saveExpectedSalary={saveExpectedSalary}
            />
          </CardContent>
        </Card>
      )}

      {/* Per-source benchmark details (from comparison) */}
      {compareData && compareData.market.benchmarks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Data Sources Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BenchmarkDetails benchmarks={compareData.market.benchmarks} currency={profile?.currency || "INR"} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ProfileForm({ form, setForm }: { form: Partial<SalaryProfile>; setForm: (f: Partial<SalaryProfile>) => void }) {
  const update = (field: string, value: unknown) => setForm({ ...form, [field]: value });
  const currency = form.currency || "INR";
  const sym = currencySymbol(currency);

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Current Title</Label>
          <Input placeholder="e.g. Senior Software Engineer" value={form.currentTitle || ""} onChange={(e) => update("currentTitle", e.target.value)} />
        </div>
        <div>
          <Label>Current Company</Label>
          <Input placeholder="e.g. Infosys" value={form.currentCompany || ""} onChange={(e) => update("currentCompany", e.target.value)} />
        </div>
        <div>
          <Label>Location</Label>
          <Input placeholder="e.g. Bangalore, India" value={form.location || ""} onChange={(e) => update("location", e.target.value)} />
        </div>
      </div>

      {/* Experience */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label>Total Experience (years)</Label>
          <Input type="number" step="0.5" placeholder="e.g. 8" value={form.totalExperience ?? ""} onChange={(e) => update("totalExperience", e.target.value ? parseFloat(e.target.value) : null)} />
        </div>
        <div>
          <Label>Relevant Experience (years)</Label>
          <Input type="number" step="0.5" placeholder="e.g. 6" value={form.relevantExperience ?? ""} onChange={(e) => update("relevantExperience", e.target.value ? parseFloat(e.target.value) : null)} />
        </div>
        <div>
          <Label>Currency</Label>
          <Select value={currency} onChange={(e) => update("currency", e.target.value)}>
            <option value="INR">INR (₹)</option>
            <option value="USD">USD ($)</option>
            <option value="GBP">GBP (£)</option>
            <option value="EUR">EUR (€)</option>
            <option value="CAD">CAD (CA$)</option>
            <option value="AUD">AUD (A$)</option>
            <option value="SGD">SGD (S$)</option>
          </Select>
        </div>
        <div>
          <Label>Notice Period</Label>
          <Select value={form.noticePeriod || ""} onChange={(e) => update("noticePeriod", e.target.value)}>
            <option value="">Select...</option>
            <option value="immediate">Immediate</option>
            <option value="15 days">15 Days</option>
            <option value="30 days">30 Days</option>
            <option value="60 days">60 Days</option>
            <option value="90 days">90 Days</option>
          </Select>
        </div>
      </div>

      {/* Compensation */}
      <div>
        <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Current Compensation (Annual)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Total CTC ({sym}/year)</Label>
            <Input type="number" placeholder="e.g. 2500000" value={form.currentCtc ?? ""} onChange={(e) => update("currentCtc", e.target.value ? parseFloat(e.target.value) : null)} />
          </div>
          <div>
            <Label>In-Hand Monthly ({sym}/month)</Label>
            <Input type="number" placeholder="e.g. 150000" value={form.currentInHand ?? ""} onChange={(e) => update("currentInHand", e.target.value ? parseFloat(e.target.value) : null)} />
          </div>
          <div>
            <Label>Base Salary ({sym}/year)</Label>
            <Input type="number" placeholder="e.g. 2000000" value={form.currentBase ?? ""} onChange={(e) => update("currentBase", e.target.value ? parseFloat(e.target.value) : null)} />
          </div>
          <div>
            <Label>Annual Bonus ({sym})</Label>
            <Input type="number" placeholder="e.g. 200000" value={form.currentBonus ?? ""} onChange={(e) => update("currentBonus", e.target.value ? parseFloat(e.target.value) : null)} />
          </div>
          <div>
            <Label>Stocks/ESOPs ({sym}/year)</Label>
            <Input type="number" placeholder="e.g. 300000" value={form.currentStocks ?? ""} onChange={(e) => update("currentStocks", e.target.value ? parseFloat(e.target.value) : null)} />
          </div>
          <div>
            <Label>Other Benefits ({sym}/year)</Label>
            <Input type="number" placeholder="e.g. 50000" value={form.currentOther ?? ""} onChange={(e) => update("currentOther", e.target.value ? parseFloat(e.target.value) : null)} />
          </div>
        </div>
      </div>

      {/* CTC Breakdown */}
      <div>
        <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">CTC Breakdown (Monthly components)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {["basicSalary", "hra", "specialAllowance", "conveyance", "medical", "pf", "gratuity", "insurance"].map((key) => (
            <div key={key}>
              <Label className="text-xs capitalize">{key.replace(/([A-Z])/g, " $1")}</Label>
              <Input
                type="number"
                placeholder="0"
                value={(form.salaryBreakdown as Record<string, number>)?.[key] ?? ""}
                onChange={(e) => update("salaryBreakdown", { ...(form.salaryBreakdown || {}), [key]: e.target.value ? parseFloat(e.target.value) : undefined })}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Expected Salary */}
      <div>
        <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Target Salary Range</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Minimum Expected CTC ({sym}/year)</Label>
            <Input type="number" placeholder="e.g. 3000000" value={form.expectedMinCtc ?? ""} onChange={(e) => update("expectedMinCtc", e.target.value ? parseFloat(e.target.value) : null)} />
          </div>
          <div>
            <Label>Maximum Expected CTC ({sym}/year)</Label>
            <Input type="number" placeholder="e.g. 4000000" value={form.expectedMaxCtc ?? ""} onChange={(e) => update("expectedMaxCtc", e.target.value ? parseFloat(e.target.value) : null)} />
          </div>
        </div>
      </div>

      {/* Skills */}
      <div>
        <Label>Key Skills (comma-separated)</Label>
        <Input
          placeholder="e.g. React, Node.js, TypeScript, AWS, System Design"
          value={(form.skills || []).join(", ")}
          onChange={(e) => update("skills", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        />
      </div>
    </div>
  );
}

function ProfileDisplay({ profile, expanded, setExpanded }: { profile: SalaryProfile; expanded: boolean; setExpanded: (v: boolean) => void }) {
  const sym = currencySymbol(profile.currency);
  const breakdown = profile.salaryBreakdown || {};
  const hasBreakdown = Object.values(breakdown).some((v) => v > 0);

  return (
    <div className="space-y-4">
      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Current CTC</p>
          <p className="text-2xl font-bold">{sym}{formatSalary(profile.currentCtc, profile.currency)}</p>
          <p className="text-xs text-muted-foreground">{formatFullSalary(profile.currentCtc, profile.currency)}/yr</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">In-Hand (Monthly)</p>
          <p className="text-2xl font-bold">{sym}{formatSalary(profile.currentInHand, profile.currency)}</p>
          <p className="text-xs text-muted-foreground">{formatFullSalary(profile.currentInHand, profile.currency)}/mo</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Title</p>
          <p className="text-lg font-semibold">{profile.currentTitle || "Not set"}</p>
          <p className="text-xs text-muted-foreground">{profile.currentCompany || ""}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Experience</p>
          <p className="text-lg font-semibold">{profile.totalExperience || "?"} years</p>
          <p className="text-xs text-muted-foreground">{profile.location || "No location"}</p>
        </div>
      </div>

      {/* Compensation Bars */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Base", value: profile.currentBase, color: "bg-blue-500" },
          { label: "Bonus", value: profile.currentBonus, color: "bg-green-500" },
          { label: "Stocks", value: profile.currentStocks, color: "bg-purple-500" },
          { label: "Other", value: profile.currentOther, color: "bg-amber-500" },
        ].map((item) => (
          <div key={item.label} className="text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium">{sym}{formatSalary(item.value, profile.currency)}</span>
            </div>
            <Progress
              value={item.value && profile.currentCtc ? (item.value / profile.currentCtc) * 100 : 0}
              className="h-2"
              indicatorClassName={item.color}
            />
          </div>
        ))}
      </div>

      {/* Expected Range */}
      {(profile.expectedMinCtc || profile.expectedMaxCtc) && (
        <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-primary/5 border border-primary/10">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Target Range:</span>
          <span className="text-sm">
            {sym}{formatSalary(profile.expectedMinCtc, profile.currency)} — {sym}{formatSalary(profile.expectedMaxCtc, profile.currency)}
          </span>
          {profile.currentCtc && profile.expectedMinCtc && (
            <Badge className="ml-auto bg-green-500/10 text-green-500 border-green-500/20">
              +{Math.round(((profile.expectedMinCtc - profile.currentCtc) / profile.currentCtc) * 100)}% min hike
            </Badge>
          )}
        </div>
      )}

      {/* Expandable CTC Breakdown */}
      {hasBreakdown && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            CTC Breakdown
          </button>
          {expanded && (
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(breakdown).filter(([, v]) => v > 0).map(([key, value]) => (
                <div key={key} className="flex justify-between py-1 px-2 rounded bg-muted/50 text-xs">
                  <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                  <span className="font-medium">{sym}{(value as number).toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PositioningCard({ positioning, currency }: { positioning: Positioning; currency: string }) {
  const sym = currencySymbol(currency);
  const pos = positioningLabel(positioning.positioning);
  const hike = positioning.hikeRecommendation;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Your Market Position
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Positioning Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Market Min: {sym}{formatSalary(positioning.marketMin, currency)}</span>
            <span className={`font-bold ${pos.color}`}>{pos.text}</span>
            <span>Market Max: {sym}{formatSalary(positioning.marketMax, currency)}</span>
          </div>
          <div className="relative">
            <Progress value={positioning.percentile || 0} className="h-6" />
            {/* Marker for user position */}
            {positioning.percentile != null && (
              <div
                className="absolute top-0 h-6 w-0.5 bg-primary"
                style={{ left: `${positioning.percentile}%` }}
              >
                <div className="absolute -top-5 -translate-x-1/2 text-[10px] font-bold text-primary whitespace-nowrap">
                  You: {sym}{formatSalary(positioning.userCtc, currency)}
                </div>
              </div>
            )}
            {/* P25/P50/P75 markers */}
            <div className="absolute top-full mt-1 left-[25%] -translate-x-1/2 text-[9px] text-muted-foreground">P25</div>
            <div className="absolute top-full mt-1 left-[50%] -translate-x-1/2 text-[9px] text-muted-foreground">P50 ({sym}{formatSalary(positioning.marketMedian, currency)})</div>
            <div className="absolute top-full mt-1 left-[75%] -translate-x-1/2 text-[9px] text-muted-foreground">P75</div>
          </div>
        </div>

        {/* Hike Recommendation */}
        {hike && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">Safe Ask</p>
              <p className="text-xl font-bold text-green-500">{sym}{formatSalary(hike.min, currency)}</p>
              {positioning.userCtc && (
                <p className="text-xs text-muted-foreground">+{Math.round(((hike.min - positioning.userCtc) / positioning.userCtc) * 100)}% hike</p>
              )}
            </div>
            <div className="rounded-lg border-2 border-primary bg-card p-3 text-center">
              <p className="text-xs text-primary font-semibold">Recommended Ask</p>
              <p className="text-xl font-bold text-primary">{sym}{formatSalary(hike.recommended, currency)}</p>
              {positioning.userCtc && (
                <p className="text-xs text-muted-foreground">+{Math.round(((hike.recommended - positioning.userCtc) / positioning.userCtc) * 100)}% hike</p>
              )}
            </div>
            <div className="rounded-lg border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">Stretch Goal</p>
              <p className="text-xl font-bold text-purple-500">{sym}{formatSalary(hike.max, currency)}</p>
              {positioning.userCtc && (
                <p className="text-xs text-muted-foreground">+{Math.round(((hike.max - positioning.userCtc) / positioning.userCtc) * 100)}% hike</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MarketResults({ results, currency, userCtc }: {
  results: { benchmarks: SalaryBenchmark[]; aggregate: SalaryBenchmark | null; sources: string[] };
  currency: string;
  userCtc: number | null;
}) {
  const sym = currencySymbol(currency);

  if (results.benchmarks.length === 0) {
    return (
      <div className="mt-4 text-center py-6 text-muted-foreground">
        <Info className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p>No salary data found. Make sure Firecrawl is configured in Settings.</p>
      </div>
    );
  }

  const agg = results.aggregate;

  return (
    <div className="mt-4 space-y-4">
      {/* Aggregate Summary */}
      {agg && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm">Market Summary for &ldquo;{agg.jobTitle}&rdquo;</h4>
            <div className="flex gap-1">
              {results.sources.map((s) => (
                <Badge key={s} variant="outline" className="text-[10px]">{sourceLabel(s)}</Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Min</p>
              <p className="text-lg font-bold">{sym}{formatSalary(agg.salaryMin, currency)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">P25</p>
              <p className="text-lg font-bold">{sym}{formatSalary(agg.salaryP25, currency)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Median</p>
              <p className="text-lg font-bold text-primary">{sym}{formatSalary(agg.salaryMedian, currency)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">P75</p>
              <p className="text-lg font-bold">{sym}{formatSalary(agg.salaryP75, currency)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Max</p>
              <p className="text-lg font-bold">{sym}{formatSalary(agg.salaryMax, currency)}</p>
            </div>
          </div>
          {/* Position comparison */}
          {userCtc && agg.salaryMedian && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              {userCtc < agg.salaryMedian ? (
                <><TrendingDown className="h-4 w-4 text-red-500" /><span>Your CTC is <span className="font-bold text-red-500">{Math.round(((agg.salaryMedian - userCtc) / agg.salaryMedian) * 100)}% below</span> the market median</span></>
              ) : (
                <><TrendingUp className="h-4 w-4 text-green-500" /><span>Your CTC is <span className="font-bold text-green-500">{Math.round(((userCtc - agg.salaryMedian) / agg.salaryMedian) * 100)}% above</span> the market median</span></>
              )}
            </div>
          )}
        </div>
      )}

      {/* Per-source breakdown */}
      <BenchmarkDetails benchmarks={results.benchmarks} currency={currency} />
    </div>
  );
}

function BenchmarkDetails({ benchmarks, currency }: { benchmarks: SalaryBenchmark[]; currency: string }) {
  const sym = currencySymbol(currency);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {benchmarks.map((b, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-[10px]">{sourceLabel(b.source)}</Badge>
            {confidenceBadge(b.confidence)}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold">{sym}{formatSalary(b.salaryMin, currency)}</span>
            <Minus className="h-3 w-3 text-muted-foreground" />
            <span className="text-lg font-bold">{sym}{formatSalary(b.salaryMax, currency)}</span>
          </div>
          {b.salaryMedian && (
            <p className="text-xs text-muted-foreground">Median: {sym}{formatSalary(b.salaryMedian, currency)}</p>
          )}
          <div className="flex gap-3 text-[10px] text-muted-foreground">
            {b.company && <span>{b.company}</span>}
            {b.location && <span>{b.location}</span>}
            {b.sampleSize && <span>{b.sampleSize} salaries</span>}
            {b.experienceMin != null && <span>{b.experienceMin}-{b.experienceMax} yrs</span>}
          </div>
          {/* Breakdown if available */}
          {(b.baseSalaryMin || b.bonusMin || b.stocksMin) && (
            <div className="flex gap-3 text-[10px]">
              {b.baseSalaryMin && <span className="text-blue-500">Base: {sym}{formatSalary(b.baseSalaryMin, currency)}</span>}
              {b.bonusMin && <span className="text-green-500">Bonus: {sym}{formatSalary(b.bonusMin, currency)}</span>}
              {b.stocksMin && <span className="text-purple-500">Stocks: {sym}{formatSalary(b.stocksMin, currency)}</span>}
            </div>
          )}
          {b.sourceUrl && (
            <a
              href={b.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary hover:underline"
            >
              View source
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function CompanyTable({ companies, currency, userCtc, editingExpected, setEditingExpected, expectedValue, setExpectedValue, expectedNotes, setExpectedNotes, saveExpectedSalary }: {
  companies: CompanyComparison[];
  currency: string;
  userCtc: number | null;
  editingExpected: number | null;
  setEditingExpected: (id: number | null) => void;
  expectedValue: string;
  setExpectedValue: (v: string) => void;
  expectedNotes: string;
  setExpectedNotes: (v: string) => void;
  saveExpectedSalary: (id: number) => void;
}) {
  const sym = currencySymbol(currency);

  const statusColors: Record<string, string> = {
    saved: "bg-zinc-400/10 text-zinc-500",
    applied: "bg-blue-500/10 text-blue-500",
    interviewing: "bg-amber-500/10 text-amber-500",
    offered: "bg-green-500/10 text-green-500",
    rejected: "bg-red-500/10 text-red-500",
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="text-left py-2 font-medium">Company</th>
            <th className="text-left py-2 font-medium">Role</th>
            <th className="text-left py-2 font-medium">Status</th>
            <th className="text-right py-2 font-medium">Listed Salary</th>
            <th className="text-right py-2 font-medium">Market Range</th>
            <th className="text-right py-2 font-medium">Expected Ask</th>
            <th className="text-right py-2 font-medium">vs. Current</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => {
            const bestMin = c.listingSalaryMin || c.enrichedSalaryMin;
            const bestMax = c.listingSalaryMax || c.enrichedSalaryMax;
            const isEditing = editingExpected === c.savedJobId;

            return (
              <tr key={c.savedJobId} className="border-b hover:bg-muted/30 transition-colors">
                <td className="py-3">
                  <div className="font-medium">{c.company}</div>
                  <div className="text-[10px] text-muted-foreground flex gap-2">
                    {c.companyType && <span>{c.companyType}</span>}
                    {c.companySize && <span>{c.companySize} emp</span>}
                    {c.glassdoorRating && <span>{c.glassdoorRating}</span>}
                  </div>
                </td>
                <td className="py-3 text-xs">{c.jobTitle}</td>
                <td className="py-3">
                  <Badge className={statusColors[c.status] || "bg-muted text-muted-foreground"}>
                    {c.status}
                  </Badge>
                </td>
                <td className="py-3 text-right">
                  {c.listingSalary || (bestMin ? `${sym}${formatSalary(bestMin, currency)} - ${sym}${formatSalary(bestMax, currency)}` : <span className="text-muted-foreground">—</span>)}
                </td>
                <td className="py-3 text-right">
                  {c.enrichedSalaryMedian ? (
                    <span className="font-medium">{sym}{formatSalary(c.enrichedSalaryMedian, currency)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-3 text-right">
                  {isEditing ? (
                    <div className="flex items-center gap-1 justify-end">
                      <Input
                        type="number"
                        className="w-28 h-7 text-xs"
                        placeholder="Amount"
                        value={expectedValue}
                        onChange={(e) => setExpectedValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveExpectedSalary(c.savedJobId)}
                      />
                      <Button size="sm" className="h-7 w-7 p-0" onClick={() => saveExpectedSalary(c.savedJobId)}>
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setEditingExpected(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : c.expectedSalary ? (
                    <button
                      className="font-bold text-primary hover:underline"
                      onClick={() => {
                        setEditingExpected(c.savedJobId);
                        setExpectedValue(c.expectedSalary?.toString() || "");
                        setExpectedNotes(c.expectedSalaryNotes || "");
                      }}
                    >
                      {sym}{formatSalary(c.expectedSalary, currency)}
                    </button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={() => {
                        setEditingExpected(c.savedJobId);
                        setExpectedValue("");
                        setExpectedNotes("");
                      }}
                    >
                      Set Ask
                    </Button>
                  )}
                </td>
                <td className="py-3 text-right">
                  {c.expectedSalary && userCtc ? (
                    <span className={c.expectedSalary > userCtc ? "text-green-500 font-bold" : "text-red-500 font-bold"}>
                      {c.expectedSalary > userCtc ? "+" : ""}{Math.round(((c.expectedSalary - userCtc) / userCtc) * 100)}%
                    </span>
                  ) : bestMax && userCtc ? (
                    <span className={bestMax > userCtc ? "text-green-500" : "text-red-500"}>
                      {bestMax > userCtc ? "+" : ""}{Math.round(((bestMax - userCtc) / userCtc) * 100)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
