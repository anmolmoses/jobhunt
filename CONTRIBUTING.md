# Contributing to JobHunt

Thank you for your interest in contributing to JobHunt! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/jobhunt.git`
3. Install dependencies: `npm install`
4. Copy `.env.example` to `.env.local` and fill in your API keys
5. Push the database schema: `npm run db:push`
6. Start the dev server: `npm run dev`

## Development

### Tech Stack
- **Framework**: Next.js 15+ (App Router)
- **UI**: Tailwind CSS + custom components
- **Database**: SQLite via better-sqlite3 + Drizzle ORM
- **AI**: Claude (Anthropic) + OpenAI (configurable)

### Project Structure
```
src/
  app/          # Next.js pages and API routes
  components/   # React components
  db/           # Database schema and connection
  lib/          # Core business logic
  types/        # TypeScript type definitions
```

### Commands
- `npm run dev` — Start dev server with Turbopack
- `npm run build` — Production build
- `npm run lint` — Run ESLint
- `npm run db:push` — Push schema to SQLite
- `npm run db:generate` — Generate Drizzle migrations

## Pull Requests

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Run `npm run build` to verify no errors
4. Commit with a descriptive message
5. Push and open a PR against `main`

### Guidelines
- Keep PRs focused — one feature or fix per PR
- Add/update types in `src/types/` for any new data structures
- Follow the existing code style (Tailwind for styling, no CSS modules)
- API routes go in `src/app/api/`, business logic goes in `src/lib/`
- Test with `npm run build` before submitting

## Adding a New Job Provider

1. Create `src/lib/jobs/your-provider.ts` implementing `JobSearchProvider` interface
2. Add your provider name to the `JobProviderName` type in `src/types/jobs.ts`
3. Register it in the `providers` array in `src/lib/jobs/orchestrator.ts`
4. If it needs an API key, add it to `src/lib/settings.ts` ENV_VAR_MAP and the Settings page

## Security

- Never commit API keys or secrets
- Use `.env.local` for local development
- Report security vulnerabilities via GitHub Issues (private)
- See SECURITY.md for more details

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
