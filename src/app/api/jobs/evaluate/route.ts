import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { createAIProvider } from "@/lib/ai/provider";

const EVALUATION_SYSTEM_PROMPT = `You are an elite career strategist evaluating a job opportunity against a candidate's profile. Score the job across 10 dimensions on a 0-10 scale.

You MUST respond with valid JSON only. No markdown, no code blocks.

Response format:
{
  "northStarAlignment": <0-10, how well does this role align with the candidate's career trajectory and goals?>,
  "cvMatch": <0-10, how well do the candidate's skills and experience match the requirements?>,
  "seniorityFit": <0-10, is this the right seniority level for the candidate?>,
  "compensation": <0-10, is the compensation fair for the role and location? Use 5 if unknown>,
  "growthTrajectory": <0-10, does this role offer career growth, learning, and advancement?>,
  "remoteQuality": <0-10, does the remote/hybrid/onsite setup match preferences?>,
  "companyReputation": <0-10, company brand, stability, and market position>,
  "techStackModernity": <0-10, how modern and relevant is the tech stack?>,
  "speedToOffer": <0-10, does the company have a reputation for fast hiring? Use 5 if unknown>,
  "cultureSignals": <0-10, positive culture signals from the job description>,
  "summary": "<2-3 sentence evaluation summary>",
  "pros": ["<pro 1>", "<pro 2>", "<pro 3>"],
  "cons": ["<con 1>", "<con 2>"],
  "recommendation": "<one of: strong_apply, apply, maybe, skip>",
  "keyGaps": ["<skill or experience gap 1>", ...],
  "interviewTips": ["<tip 1>", "<tip 2>"]
}

Scoring guide:
- northStarAlignment (25% weight): Does this role move the candidate toward their career goals?
- cvMatch (15%): Skills overlap, experience relevance, technology match
- seniorityFit (15%): Right level — not too junior, not too senior
- compensation (10%): Market rate for role/location, salary if mentioned
- growthTrajectory (10%): Learning opportunities, company growth stage, career ladder
- remoteQuality (5%): Match with candidate's location preference
- companyReputation (5%): Brand strength, glassdoor, funding, market position
- techStackModernity (5%): Modern vs legacy tech, relevant tools
- speedToOffer (5%): Hiring speed signals (startup = fast, enterprise = slow)
- cultureSignals (5%): Work-life balance, team culture, diversity signals

Be honest and critical. Don't inflate scores. A "maybe" is better than a false "strong_apply".`;

const EVALUATION_USER_PROMPT = (
  resumeText: string,
  preferences: string,
  jobTitle: string,
  company: string,
  location: string,
  description: string,
) => `## Candidate Resume:
${resumeText.slice(0, 3000)}

## Candidate Preferences:
${preferences}

## Job Opportunity:
**${jobTitle}** at **${company}**
Location: ${location}

${description.slice(0, 4000)}`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobResultId, savedJobId, jobTitle, company, location, description } = body;

    if (!jobTitle || !company) {
      return NextResponse.json({ error: "jobTitle and company are required" }, { status: 400 });
    }

    // Check for existing evaluation
    if (jobResultId) {
      const existing = db.select().from(schema.jobEvaluations)
        .where(eq(schema.jobEvaluations.jobResultId, jobResultId))
        .get();
      if (existing) {
        return NextResponse.json(existing);
      }
    }

    // Load resume
    const resume = db.select().from(schema.resumes)
      .orderBy(desc(schema.resumes.createdAt))
      .limit(1)
      .get();

    if (!resume?.parsedText) {
      return NextResponse.json({ error: "No resume found. Upload one first." }, { status: 400 });
    }

    // Load preferences
    const prefs = db.select().from(schema.jobPreferences).limit(1).get();
    const prefsSummary = prefs ? [
      `Desired roles: ${prefs.desiredRoles}`,
      `Experience level: ${prefs.experienceLevel}`,
      `Location preference: ${prefs.locationPreference}`,
      `Preferred locations: ${prefs.preferredLocations}`,
      `Salary range: ${prefs.salaryMin || "?"}-${prefs.salaryMax || "?"}`,
      `Skills: ${prefs.desiredSkills}`,
      `Company size: ${prefs.companySizePreference}`,
    ].join("\n") : "No preferences set";

    const aiProvider = await createAIProvider();
    const rawResponse = await aiProvider.complete({
      messages: [
        { role: "system", content: EVALUATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: EVALUATION_USER_PROMPT(
            resume.parsedText,
            prefsSummary,
            jobTitle,
            company,
            location || "Not specified",
            description || "No description available",
          ),
        },
      ],
      maxTokens: 1024,
      temperature: 0.3,
      responseFormat: "json",
    });

    let jsonStr = rawResponse.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const result = JSON.parse(jsonStr);

    // Calculate weighted overall score
    const overallScore = (
      (result.northStarAlignment || 0) * 0.25 +
      (result.cvMatch || 0) * 0.15 +
      (result.seniorityFit || 0) * 0.15 +
      (result.compensation || 0) * 0.10 +
      (result.growthTrajectory || 0) * 0.10 +
      (result.remoteQuality || 0) * 0.05 +
      (result.companyReputation || 0) * 0.05 +
      (result.techStackModernity || 0) * 0.05 +
      (result.speedToOffer || 0) * 0.05 +
      (result.cultureSignals || 0) * 0.05
    );

    const evaluation = db.insert(schema.jobEvaluations)
      .values({
        jobResultId: jobResultId || null,
        savedJobId: savedJobId || null,
        northStarAlignment: result.northStarAlignment,
        cvMatch: result.cvMatch,
        seniorityFit: result.seniorityFit,
        compensation: result.compensation,
        growthTrajectory: result.growthTrajectory,
        remoteQuality: result.remoteQuality,
        companyReputation: result.companyReputation,
        techStackModernity: result.techStackModernity,
        speedToOffer: result.speedToOffer,
        cultureSignals: result.cultureSignals,
        overallScore: Math.round(overallScore * 10) / 10,
        summary: result.summary || null,
        pros: JSON.stringify(result.pros || []),
        cons: JSON.stringify(result.cons || []),
        recommendation: result.recommendation || "maybe",
        rawData: JSON.stringify(result),
      })
      .returning()
      .get();

    return NextResponse.json({
      ...evaluation,
      pros: result.pros || [],
      cons: result.cons || [],
      keyGaps: result.keyGaps || [],
      interviewTips: result.interviewTips || [],
    });
  } catch (error) {
    console.error("Job evaluation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Evaluation failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobResultId = searchParams.get("jobResultId");

  if (!jobResultId) {
    return NextResponse.json({ error: "jobResultId required" }, { status: 400 });
  }

  const evaluation = db.select().from(schema.jobEvaluations)
    .where(eq(schema.jobEvaluations.jobResultId, parseInt(jobResultId)))
    .get();

  if (!evaluation) {
    return NextResponse.json(null);
  }

  const rawData = evaluation.rawData ? JSON.parse(evaluation.rawData) : {};
  return NextResponse.json({
    ...evaluation,
    pros: JSON.parse(evaluation.pros),
    cons: JSON.parse(evaluation.cons),
    keyGaps: rawData.keyGaps || [],
    interviewTips: rawData.interviewTips || [],
  });
}
