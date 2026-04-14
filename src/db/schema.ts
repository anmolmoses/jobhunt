import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  isEncrypted: integer("is_encrypted", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const resumes = sqliteTable("resumes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  parsedText: text("parsed_text"),
  structuredData: text("structured_data"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const resumeAnalyses = sqliteTable("resume_analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  resumeId: integer("resume_id")
    .notNull()
    .references(() => resumes.id, { onDelete: "cascade" }),
  aiProvider: text("ai_provider").notNull(),
  overallScore: integer("overall_score").notNull(),
  formattingScore: integer("formatting_score").notNull(),
  contentScore: integer("content_score").notNull(),
  keywordScore: integer("keyword_score").notNull(),
  atsScore: integer("ats_score").notNull(),
  summary: text("summary").notNull(),
  strengths: text("strengths").notNull(), // JSON array
  improvements: text("improvements").notNull(), // JSON array
  toRemove: text("to_remove").notNull(), // JSON array
  toAdd: text("to_add").notNull(), // JSON array
  detailedFeedback: text("detailed_feedback").notNull(),
  rawResponse: text("raw_response"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const jobPreferences = sqliteTable("job_preferences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  desiredRoles: text("desired_roles").notNull().default("[]"), // JSON array
  desiredIndustries: text("desired_industries").notNull().default("[]"),
  experienceLevel: text("experience_level").notNull().default('["mid"]'), // JSON array
  locationPreference: text("location_preference").notNull().default('["remote"]'), // JSON array
  preferredLocations: text("preferred_locations").notNull().default("[]"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  employmentType: text("employment_type").notNull().default('["full_time"]'),
  desiredSkills: text("desired_skills").notNull().default("[]"),
  excludeKeywords: text("exclude_keywords").notNull().default("[]"),
  companySizePreference: text("company_size_preference").notNull().default('["startup","mid","enterprise"]'), // JSON array
  additionalNotes: text("additional_notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const jobSearches = sqliteTable("job_searches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  query: text("query").notNull(),
  filters: text("filters").notNull().default("{}"), // JSON
  providers: text("providers").notNull().default("[]"), // JSON array
  totalResults: integer("total_results").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const jobResults = sqliteTable("job_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  searchId: integer("search_id")
    .notNull()
    .references(() => jobSearches.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  provider: text("provider").notNull(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location"),
  salary: text("salary"),
  salaryMin: real("salary_min"),
  salaryMax: real("salary_max"),
  description: text("description"),
  jobType: text("job_type"),
  isRemote: integer("is_remote", { mode: "boolean" }).notNull().default(false),
  applyUrl: text("apply_url"),
  companyLogo: text("company_logo"),
  postedAt: text("posted_at"),
  tags: text("tags").default("[]"), // JSON array
  relevanceScore: real("relevance_score"),
  dedupeKey: text("dedupe_key"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const savedJobs = sqliteTable("saved_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobResultId: integer("job_result_id")
    .notNull()
    .references(() => jobResults.id, { onDelete: "cascade" }),
  notes: text("notes"),
  status: text("status").notNull().default("saved"),
  appliedAt: text("applied_at"),
  followUpDate: text("follow_up_date"),
  nextStep: text("next_step"), // e.g. "Send thank you email", "Prepare for technical round"
  expectedSalary: real("expected_salary"), // What user expects to ask from this company
  expectedSalaryNotes: text("expected_salary_notes"), // e.g. "Based on glassdoor, market rate is 25L"
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const companyEnrichment = sqliteTable("company_enrichment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyName: text("company_name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
  // Salary data (from JSearch estimated-salary API)
  salaryMedian: real("salary_median"),
  salaryMin: real("salary_min"),
  salaryMax: real("salary_max"),
  salaryPublisherName: text("salary_publisher_name"),
  salaryJobTitle: text("salary_job_title"),
  salaryLocation: text("salary_location"),
  // Company info (from Firecrawl search / AI analysis)
  companySize: text("company_size"), // "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5000+"
  companySizeCategory: text("company_size_category"), // "startup", "mid", "enterprise"
  companyType: text("company_type"), // "public", "private", "startup", "nonprofit", "government"
  industry: text("industry"),
  description: text("description"),
  headquarters: text("headquarters"),
  aiInsights: text("ai_insights"),
  // Funding & growth data (from Firecrawl web search — real data)
  founded: text("founded"),
  funding: text("funding"), // e.g. "$742M"
  fundingStage: text("funding_stage"), // e.g. "Series F"
  valuation: text("valuation"), // e.g. "$7.5B"
  investors: text("investors"),
  revenue: text("revenue"),
  growthSignals: text("growth_signals"),
  glassdoorRating: text("glassdoor_rating"),
  dataSources: text("data_sources"), // JSON array of source names
  rawSalaryData: text("raw_salary_data"), // JSON
  rawAiResponse: text("raw_ai_response"), // JSON
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// LinkedIn data imports — tracks each zip import
export const linkedinImports = sqliteTable("linkedin_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  connectionsCount: integer("connections_count").notNull().default(0),
  messagesCount: integer("messages_count").notNull().default(0),
  companyFollowsCount: integer("company_follows_count").notNull().default(0),
  profileName: text("profile_name"),
  profileHeadline: text("profile_headline"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// LinkedIn connections — imported from data export
export const linkedinConnections = sqliteTable("linkedin_connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id")
    .notNull()
    .references(() => linkedinImports.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  fullName: text("full_name").notNull(),
  profileUrl: text("profile_url"),
  email: text("email"),
  company: text("company"),
  normalizedCompany: text("normalized_company"), // for matching against saved jobs
  position: text("position"),
  connectedOn: text("connected_on"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// LinkedIn messages — lightweight: just tracks unique conversation partners
export const linkedinMessages = sqliteTable("linkedin_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id")
    .notNull()
    .references(() => linkedinImports.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull(),
  participantName: text("participant_name").notNull(),
  participantProfileUrl: text("participant_profile_url"),
  lastMessageDate: text("last_message_date"),
  messageCount: integer("message_count").notNull().default(1),
  direction: text("direction"), // "inbound", "outbound", "both"
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Contacts found via Happenstance for a company
export const networkContacts = sqliteTable("network_contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyName: text("company_name").notNull(),
  normalizedCompany: text("normalized_company").notNull(),
  // Person info from Happenstance
  personName: text("person_name").notNull(),
  personTitle: text("person_title"),
  personLinkedin: text("person_linkedin"),
  personEmail: text("person_email"),
  personLocation: text("person_location"),
  personBio: text("person_bio"),
  personImageUrl: text("person_image_url"),
  // Connection info
  connectionType: text("connection_type"), // "direct", "second_degree", "group"
  mutualConnections: text("mutual_connections"), // JSON array of mutual names
  introducerName: text("introducer_name"), // who can intro you
  // Happenstance metadata
  happenstanceSearchId: text("happenstance_search_id"),
  rawData: text("raw_data"), // full JSON from Happenstance
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Outreach tracking
export const outreachTracking = sqliteTable("outreach_tracking", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id")
    .notNull()
    .references(() => networkContacts.id, { onDelete: "cascade" }),
  savedJobId: integer("saved_job_id")
    .references(() => savedJobs.id, { onDelete: "set null" }),
  // Outreach details
  channel: text("channel").notNull(), // "linkedin", "email", "phone", "other"
  status: text("status").notNull().default("planned"), // "planned", "sent", "replied", "no_reply", "meeting_scheduled", "declined"
  messageTemplate: text("message_template"), // what was sent
  notes: text("notes"),
  sentAt: text("sent_at"),
  repliedAt: text("replied_at"),
  followUpDate: text("follow_up_date"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Activity log — tracks everything the user does
export const activityLog = sqliteTable("activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  savedJobId: integer("saved_job_id")
    .references(() => savedJobs.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "status_change", "note_added", "interview_scheduled", "follow_up_due", "applied", "outreach_sent", "offer_received", "rejected"
  title: text("title").notNull(),
  description: text("description"),
  metadata: text("metadata"), // JSON for extra data
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Resume builder — user-created resumes
export const resumeBuilds = sqliteTable("resume_builds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // e.g. "Senior Backend Engineer Resume"
  contactInfo: text("contact_info").notNull().default("{}"), // JSON: name, email, phone, linkedin, github, location
  summary: text("summary"), // HTML from rich text editor
  experience: text("experience").notNull().default("[]"), // JSON array of { company, title, location, startDate, endDate, current, description (HTML) }
  education: text("education").notNull().default("[]"), // JSON array of { school, degree, field, startDate, endDate, description }
  skills: text("skills").notNull().default("[]"), // JSON array of { category, items[] }
  projects: text("projects").notNull().default("[]"), // JSON array of { name, url, description (HTML), tech[] }
  certifications: text("certifications").notNull().default("[]"), // JSON array of { name, issuer, date, url }
  customSections: text("custom_sections").notNull().default("[]"), // JSON array of { title, content (HTML) }
  pdfPath: text("pdf_path"), // path to generated PDF
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Interview tracking
export const interviews = sqliteTable("interviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  savedJobId: integer("saved_job_id")
    .notNull()
    .references(() => savedJobs.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "phone_screen", "technical", "behavioral", "system_design", "hiring_manager", "onsite", "final", "other"
  scheduledAt: text("scheduled_at"),
  duration: integer("duration"), // minutes
  interviewerName: text("interviewer_name"),
  interviewerTitle: text("interviewer_title"),
  meetingLink: text("meeting_link"),
  notes: text("notes"),
  prepNotes: text("prep_notes"), // AI-generated prep
  outcome: text("outcome"), // "pending", "passed", "failed", "rescheduled", "cancelled"
  feedback: text("feedback"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Cron job configuration — single-row table for automated job search scheduling
export const cronConfig = sqliteTable("cron_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  schedule: text("schedule").notNull().default("0 9 * * *"), // Default: daily at 9 AM
  datePosted: text("date_posted").notNull().default("7d"), // How recent jobs to search for
  resultsPerPage: integer("results_per_page").notNull().default(25),
  lastRunAt: text("last_run_at"),
  lastRunStatus: text("last_run_status"), // "success", "failed", "running"
  lastRunMessage: text("last_run_message"),
  lastRunJobsFound: integer("last_run_jobs_found"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Cron run history — log of each automated search run
export const cronRunHistory = sqliteTable("cron_run_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status").notNull(), // "success", "failed"
  jobsFound: integer("jobs_found").notNull().default(0),
  queriesRun: integer("queries_run").notNull().default(0),
  providersUsed: text("providers_used").notNull().default("[]"), // JSON array
  message: text("message"),
  durationMs: integer("duration_ms"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const geocodeCache = sqliteTable("geocode_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  locationQuery: text("location_query").notNull().unique(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  displayName: text("display_name"),
  failed: integer("failed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Gamification — profile, daily log, XP events, achievements

export const gamificationProfile = sqliteTable("gamification_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  totalXp: integer("total_xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActiveDate: text("last_active_date"), // YYYY-MM-DD
  streakProtectionUsed: integer("streak_protection_used", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  dailyGoals: text("daily_goals").notNull().default('{"applications":3,"searches":2,"outreach":1,"jobsSaved":2}'), // JSON
  streakConfig: text("streak_config").notNull().default('{"countToward":["apply","search","outreach","interview","resume"],"protectionDays":1}'), // JSON
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const gamificationDailyLog = sqliteTable("gamification_daily_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(), // YYYY-MM-DD
  applications: integer("applications").notNull().default(0),
  searches: integer("searches").notNull().default(0),
  outreach: integer("outreach").notNull().default(0),
  interviews: integer("interviews").notNull().default(0),
  resumeUploads: integer("resume_uploads").notNull().default(0),
  resumeAnalyses: integer("resume_analyses").notNull().default(0),
  resumeTailors: integer("resume_tailors").notNull().default(0),
  jobsSaved: integer("jobs_saved").notNull().default(0),
  totalActions: integer("total_actions").notNull().default(0),
  xpEarned: integer("xp_earned").notNull().default(0),
  goalsMetBonus: integer("goals_met_bonus", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const gamificationXpEvents = sqliteTable("gamification_xp_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actionType: text("action_type").notNull(),
  xpAmount: integer("xp_amount").notNull(),
  multiplier: real("multiplier").notNull().default(1.0),
  description: text("description").notNull(),
  metadata: text("metadata"), // JSON
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Company portals — tracked company career pages for direct scanning
export const companyPortals = sqliteTable("company_portals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyName: text("company_name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
  careersUrl: text("careers_url").notNull(),
  apiEndpoint: text("api_endpoint"), // e.g. "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs"
  scanMethod: text("scan_method").notNull().default("firecrawl"), // "greenhouse", "lever", "ashby", "firecrawl"
  category: text("category"), // "AI Labs", "Enterprise", "Startup", etc.
  logoUrl: text("logo_url"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  titleFilters: text("title_filters").notNull().default("[]"), // JSON: positive keywords to match
  titleExclusions: text("title_exclusions").notNull().default("[]"), // JSON: negative keywords to exclude
  lastScannedAt: text("last_scanned_at"),
  lastScanJobCount: integer("last_scan_job_count"),
  // Company directory fields (from Fortune CSV import)
  fortuneRank: integer("fortune_rank"),
  industry: text("industry"),
  revenue: text("revenue"), // e.g. "$716.9B"
  employees: text("employees"), // e.g. "1,600,000"
  hqCity: text("hq_city"),
  hqState: text("hq_state"),
  website: text("website"),
  ceo: text("ceo"),
  founded: text("founded"),
  publicPrivate: text("public_private"), // "Public", "Private"
  ticker: text("ticker"),
  fundingInfo: text("funding_info"), // "IPO" or "Series F ($1.4B raised, $14B valuation)"
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Notifications — alerts for new jobs, scan completions, etc.
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // "new_jobs", "scan_complete", "scan_error", "system"
  title: text("title").notNull(),
  message: text("message").notNull(),
  metadata: text("metadata"), // JSON: { portalId, jobCount, companyName, etc. }
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Portal scan schedule — config for automated career page scanning
export const portalScanConfig = sqliteTable("portal_scan_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  schedule: text("schedule").notNull().default("0 8 * * *"), // Default: daily at 8 AM
  scanBatchSize: integer("scan_batch_size").notNull().default(20), // How many portals per run
  notifyOnNewJobs: integer("notify_on_new_jobs", { mode: "boolean" }).notNull().default(true),
  lastRunAt: text("last_run_at"),
  lastRunStatus: text("last_run_status"), // "success", "failed", "running"
  lastRunMessage: text("last_run_message"),
  lastRunNewJobs: integer("last_run_new_jobs"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Portal scan results — jobs found from scanning company portals
export const portalScanResults = sqliteTable("portal_scan_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  portalId: integer("portal_id")
    .notNull()
    .references(() => companyPortals.id, { onDelete: "cascade" }),
  externalId: text("external_id"), // Job ID from the ATS
  title: text("title").notNull(),
  department: text("department"),
  location: text("location"),
  applyUrl: text("apply_url"),
  description: text("description"),
  isRemote: integer("is_remote", { mode: "boolean" }).notNull().default(false),
  postedAt: text("posted_at"),
  dedupeKey: text("dedupe_key"),
  dismissed: integer("dismissed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Interview stories — STAR+Reflection format story bank
export const interviewStories = sqliteTable("interview_stories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  theme: text("theme").notNull(), // "leadership", "conflict", "failure", "innovation", "teamwork", "technical", "communication", "growth"
  situation: text("situation").notNull(),
  task: text("task").notNull(),
  action: text("action").notNull(),
  result: text("result").notNull(),
  reflection: text("reflection"), // What I learned
  skills: text("skills").notNull().default("[]"), // JSON array of skills demonstrated
  questionsItAnswers: text("questions_it_answers").notNull().default("[]"), // JSON: e.g. "Tell me about a time you..."
  source: text("source").notNull().default("manual"), // "manual", "resume_extracted"
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Job evaluations — 10-dimension scoring (career-ops style)
export const jobEvaluations = sqliteTable("job_evaluations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobResultId: integer("job_result_id")
    .references(() => jobResults.id, { onDelete: "cascade" }),
  savedJobId: integer("saved_job_id")
    .references(() => savedJobs.id, { onDelete: "cascade" }),
  // 10-dimension scores (0-10 scale)
  northStarAlignment: real("north_star_alignment"), // 25% — Does this align with career goals?
  cvMatch: real("cv_match"), // 15% — How well do skills/experience match?
  seniorityFit: real("seniority_fit"), // 15% — Right level?
  compensation: real("compensation"), // 10% — Fair pay?
  growthTrajectory: real("growth_trajectory"), // 10% — Career growth potential?
  remoteQuality: real("remote_quality"), // 5% — Remote/hybrid quality?
  companyReputation: real("company_reputation"), // 5% — Company brand/stability?
  techStackModernity: real("tech_stack_modernity"), // 5% — Modern tech?
  speedToOffer: real("speed_to_offer"), // 5% — Fast hiring process?
  cultureSignals: real("culture_signals"), // 5% — Culture fit signals?
  overallScore: real("overall_score"), // Weighted composite
  summary: text("summary"),
  pros: text("pros").notNull().default("[]"), // JSON array
  cons: text("cons").notNull().default("[]"), // JSON array
  recommendation: text("recommendation"), // "strong_apply", "apply", "maybe", "skip"
  rawData: text("raw_data"), // Full JSON response
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Application assist — persisted cover letter, why this role, etc.
export const applicationAssist = sqliteTable("application_assist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobResultId: integer("job_result_id")
    .references(() => jobResults.id, { onDelete: "cascade" }),
  savedJobId: integer("saved_job_id")
    .references(() => savedJobs.id, { onDelete: "cascade" }),
  coverLetterDraft: text("cover_letter_draft"),
  whyThisRole: text("why_this_role"),
  whyThisCompany: text("why_this_company"),
  biggestStrength: text("biggest_strength"),
  challengeOvercome: text("challenge_overcome"),
  whatYouBring: text("what_you_bring"),
  salaryExpectation: text("salary_expectation"),
  additionalNotes: text("additional_notes"),
  rawData: text("raw_data"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// LinkedIn outreach — persisted messages, follow-up email, search queries
export const linkedinOutreach = sqliteTable("linkedin_outreach", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobResultId: integer("job_result_id")
    .references(() => jobResults.id, { onDelete: "cascade" }),
  savedJobId: integer("saved_job_id")
    .references(() => savedJobs.id, { onDelete: "cascade" }),
  hiringManagerMessage: text("hiring_manager_message"),
  recruiterMessage: text("recruiter_message"),
  peerMessage: text("peer_message"),
  followUpEmail: text("follow_up_email"),
  searchQueries: text("search_queries"), // JSON array
  rawData: text("raw_data"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// LinkedIn authenticated scrape — run history
export const linkedinScrapeRuns = sqliteTable("linkedin_scrape_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status").notNull().default("running"), // "running", "completed", "failed", "stopped"
  jobsFound: integer("jobs_found").notNull().default(0),
  jobsInserted: integer("jobs_inserted").notNull().default(0),
  pagesScraped: integer("pages_scraped").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: text("started_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  finishedAt: text("finished_at"),
});

// LinkedIn authenticated scrape — real-time log entries
export const linkedinScrapeLogs = sqliteTable("linkedin_scrape_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id")
    .notNull()
    .references(() => linkedinScrapeRuns.id, { onDelete: "cascade" }),
  level: text("level").notNull().default("info"), // "info", "warn", "error", "success"
  message: text("message").notNull(),
  metadata: text("metadata"), // JSON: optional extra data
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// User salary profile — current compensation details
export const userSalaryProfile = sqliteTable("user_salary_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Current compensation
  currentCtc: real("current_ctc"), // Total CTC (annual)
  currentInHand: real("current_in_hand"), // Monthly in-hand
  currentBase: real("current_base"), // Annual base salary
  currentBonus: real("current_bonus"), // Annual bonus
  currentStocks: real("current_stocks"), // Annual stock/ESOP value
  currentOther: real("current_other"), // Other benefits (annual)
  currency: text("currency").notNull().default("INR"),
  // Breakdown JSON: { basicSalary, hra, specialAllowance, pf, gratuity, insurance, etc. }
  salaryBreakdown: text("salary_breakdown").notNull().default("{}"),
  // User profile
  currentTitle: text("current_title"),
  currentCompany: text("current_company"),
  totalExperience: real("total_experience"), // years
  relevantExperience: real("relevant_experience"), // years in current domain
  location: text("location"),
  skills: text("skills").notNull().default("[]"), // JSON array
  noticePeriod: text("notice_period"), // "immediate", "15 days", "30 days", "60 days", "90 days"
  expectedMinCtc: real("expected_min_ctc"),
  expectedMaxCtc: real("expected_max_ctc"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Salary market data — scraped benchmarks from multiple sources
export const salaryMarketData = sqliteTable("salary_market_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobTitle: text("job_title").notNull(),
  normalizedTitle: text("normalized_title").notNull(),
  company: text("company"), // null = aggregate market data
  normalizedCompany: text("normalized_company"),
  location: text("location"),
  experienceMin: real("experience_min"), // years
  experienceMax: real("experience_max"),
  // Salary ranges
  salaryMin: real("salary_min"),
  salaryMax: real("salary_max"),
  salaryMedian: real("salary_median"),
  salaryP25: real("salary_p25"), // 25th percentile
  salaryP75: real("salary_p75"), // 75th percentile
  salaryP90: real("salary_p90"), // 90th percentile
  currency: text("currency").notNull().default("INR"),
  // Breakdown if available
  baseSalaryMin: real("base_salary_min"),
  baseSalaryMax: real("base_salary_max"),
  bonusMin: real("bonus_min"),
  bonusMax: real("bonus_max"),
  stocksMin: real("stocks_min"),
  stocksMax: real("stocks_max"),
  // Source metadata
  source: text("source").notNull(), // "ambitionbox", "glassdoor", "levels_fyi", "payscale", "linkedin", "firecrawl_search"
  sourceUrl: text("source_url"),
  sampleSize: integer("sample_size"), // number of data points
  confidence: text("confidence"), // "high", "medium", "low"
  rawData: text("raw_data"), // JSON of full scraped data
  // Cache control
  scrapedAt: text("scraped_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  expiresAt: text("expires_at"), // when to re-scrape
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const gamificationAchievements = sqliteTable("gamification_achievements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  achievementId: text("achievement_id").notNull().unique(),
  unlockedAt: text("unlocked_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  xpAwarded: integer("xp_awarded").notNull().default(0),
  notified: integer("notified", { mode: "boolean" }).notNull().default(false),
});
