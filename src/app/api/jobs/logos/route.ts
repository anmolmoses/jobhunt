import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq, isNull, like, or } from "drizzle-orm";
import { getCompanyLogoUrl, guessDomain } from "@/lib/company/logo";
import { getSetting } from "@/lib/settings";

/**
 * POST /api/jobs/logos
 * Bulk refresh company logos for all job results.
 * - Default: updates jobs without logos AND jobs with broken logo.dev direct URLs
 * - ?force=true: re-fetches logos for ALL jobs
 *
 * Returns SSE stream with progress updates.
 */
export async function POST(request: NextRequest) {
  const force = request.nextUrl.searchParams.get("force") === "true";

  const token = await getSetting("logodev_api_key");
  if (!token) {
    return Response.json({ error: "Logo.dev API key not configured" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: unknown) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // Get jobs that need logo updates:
        // - force: ALL jobs
        // - default: jobs with no logo OR broken direct logo.dev URLs (token in URL = broken in browser)
        const jobs = force
          ? db.select({ id: schema.jobResults.id, company: schema.jobResults.company, companyLogo: schema.jobResults.companyLogo }).from(schema.jobResults).all()
          : db.select({ id: schema.jobResults.id, company: schema.jobResults.company, companyLogo: schema.jobResults.companyLogo }).from(schema.jobResults).where(
              or(
                isNull(schema.jobResults.companyLogo),
                like(schema.jobResults.companyLogo, "%img.logo.dev/%"),
              )
            ).all();

        // Build unique companies map (company name -> list of job IDs)
        const companyJobs = new Map<string, number[]>();
        for (const job of jobs) {
          const key = job.company.toLowerCase();
          if (!companyJobs.has(key)) {
            companyJobs.set(key, []);
          }
          companyJobs.get(key)!.push(job.id);
        }

        const total = companyJobs.size;
        let done = 0;
        let updated = 0;
        let failed = 0;

        send({ step: `Refreshing logos for ${total} companies...`, total, progress: 0 });

        for (const [companyKey, jobIds] of companyJobs) {
          done++;
          const originalName = jobs.find((j) => j.company.toLowerCase() === companyKey)!.company;
          const pct = Math.round((done / total) * 100);

          send({
            step: originalName,
            detail: `${done}/${total}`,
            progress: pct,
          });

          try {
            // Generate proxy URL (bypasses browser auth issues)
            const domain = guessDomain(originalName);
            if (domain) {
              const logoUrl = `/api/logos?domain=${encodeURIComponent(domain)}`;
              for (const jobId of jobIds) {
                db.update(schema.jobResults)
                  .set({ companyLogo: logoUrl })
                  .where(eq(schema.jobResults.id, jobId))
                  .run();
              }
              updated++;
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
        }

        send({ total, updated, failed, done: true });
      } catch (error) {
        console.error("Logo refresh error:", error);
        send({ error: "Logo refresh failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
