# Promote an experimental provider to production

A copy-paste prompt for Claude Code. Usage:

```bash
claude -p "$(cat docs/promote-experimental.md) <slug>"
```

Replace `<slug>` with one of: `claude-code`, `linkedin-public`, `ycombinator`, `lever`, `ashby`, `workday`.

---

## Prompt

You are promoting an experimental job-search provider to production in this Next.js repo.

**The slug to promote is specified as the last word of this prompt.**

### Pre-flight

1. Confirm the experimental file exists: `src/lib/jobs/experimental/<slug>.ts`. If not, stop and report.
2. Read the file. Note the exported class name (e.g. `LeverProvider`) and its `name` string literal (e.g. `"lever"`).
3. Read `src/lib/jobs/orchestrator.ts` to see the import/registration pattern for existing production providers.
4. Read `src/types/jobs.ts` — confirm the provider's `name` literal is already in the `JobProviderName` union (it should be, since it was experimental). Note: the union has a section-comment marking experimental names; after promotion you can leave the name where it is or move it up to the production section — the comment is advisory only.

### Smoke test before promotion

Run the provider directly and confirm it returns ≥ 1 job for a generic query before wiring it into orchestration:

```bash
cat > /tmp/promote-smoke.ts <<EOF
import { <ClassName> } from "./src/lib/jobs/experimental/<slug>";
(async () => {
  const p = new <ClassName>();
  console.log("configured:", await p.isConfigured());
  const jobs = await p.search({query: "software engineer", datePosted: "30d", resultsPerPage: 10});
  console.log("count:", jobs.length);
  if (jobs[0]) console.log("sample:", {title: jobs[0].title, company: jobs[0].company, url: jobs[0].applyUrl});
})();
EOF
npx tsx /tmp/promote-smoke.ts
rm /tmp/promote-smoke.ts
```

If `configured` is false or `count` is 0, stop and report what's wrong rather than promoting a broken provider.

### Promotion steps

1. **Move the file** from `src/lib/jobs/experimental/<slug>.ts` to `src/lib/jobs/<slug>.ts`. Use `mv`.

2. **Update imports inside the moved file** — its `@/...` imports should already be correct since the alias root didn't change, but double-check any relative imports (none expected).

3. **Register in the orchestrator** at `src/lib/jobs/orchestrator.ts`:
   - Add `import { <ClassName> } from "./<slug>";` near the other provider imports.
   - Add `new <ClassName>(),` to the `providers` array.

4. **Enable in settings.** The orchestrator filters on the SQLite `search_enabled_providers` setting. Write a one-off script to union the new name in:
   ```bash
   cat > /tmp/enable.ts <<EOF
   import { getSetting, setSetting } from "./src/lib/settings";
   (async () => {
     const raw = await getSetting("search_enabled_providers");
     const list: string[] = raw ? JSON.parse(raw) : [];
     if (!list.includes("<slug>")) list.push("<slug>");
     await setSetting("search_enabled_providers", JSON.stringify(list));
     console.log("enabled:", list);
   })();
   EOF
   npx tsx /tmp/enable.ts
   rm /tmp/enable.ts
   ```

5. **Remove from the lab registry** at `lab/src/lib/registry.ts`:
   - Delete the `<slug>` entry from the `EXPERIMENTAL_LOADERS` object.
   - Add a static import for the new production provider alongside the other `currentProviders` entries.

6. **(Optional)** move the name in `src/types/jobs.ts` out of the "experimental" section of the union.

### Verify

- `npx tsc --noEmit` — must pass.
- `npm run build` — must pass.
- `npx tsx scripts/diagnose-providers.ts` — the promoted provider should now appear in the report and return ≥ 1 job.

### Don't

- Don't rewrite the provider's logic during promotion. If it needs fixes, fix them *before* promoting.
- Don't delete experimental files that aren't being promoted.
- Don't touch other providers or the scorer.

Report what changed, the diagnostic count for the promoted provider, and any issues. The slug to promote is:
