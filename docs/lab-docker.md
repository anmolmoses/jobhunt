# Running the Lab in Docker

The lab runs as a `lab` service alongside `jobhunt` in `docker-compose.yml`.
- Port: `3100` (override with `LAB_PORT` env var)
- Shares SQLite DB and uploads volumes with the main app
- Source dirs bind-mounted for live edits on host

## First-time setup

```bash
# From repo root
docker compose build lab
docker compose up -d lab
```

Then open http://localhost:3100.

## Claude Code CLI inside the container

The compose file mounts your host `~/.claude` into the container at `/root/.claude`, so the Claude Code provider reuses your host subscription/auth automatically — no extra steps needed in the common case.

The CLI itself is NOT baked into `Dockerfile.lab` (you said you wanted to handle that yourself). When you're ready to add it, two approaches:

### Option A — Add to the image (recommended, reproducible)

Edit `Dockerfile.lab` and add before the `COPY . .` line:

```dockerfile
RUN npm install -g @anthropic-ai/claude-code
```

Then rebuild: `docker compose build lab && docker compose up -d lab`.

Verify inside the container:
```bash
docker exec -it jobhunt-lab claude --version
docker exec -it jobhunt-lab claude -p "say hi" --output-format json
```

If `claude -p` works, the lab's Claude Code provider is ready. The `~/.claude` mount handles auth transparently.

### Option B — Install at runtime (faster iteration, not reproducible)

```bash
docker exec -it jobhunt-lab npm install -g @anthropic-ai/claude-code
docker exec -it jobhunt-lab claude --version
```

Not recommended long-term — wipes on container rebuild.

### Auth troubleshooting

If `claude` inside the container can't see your host auth:

1. Confirm the mount is live:
   ```bash
   docker exec -it jobhunt-lab ls /root/.claude
   ```
   You should see files like `.credentials.json`, `projects/`, `settings.json`.

2. If you prefer in-container auth instead of mounting `~/.claude`:
   - Comment out the `${HOME}/.claude:/root/.claude` line in `docker-compose.yml`
   - `docker exec -it jobhunt-lab claude` — this drops you into an interactive shell that'll OAuth
   - Named volume the auth dir so it persists: add `- lab-claude-auth:/root/.claude` and declare the volume

3. For API-key auth instead of subscription OAuth: set `ANTHROPIC_API_KEY` in `.env` — the CLI falls back to it.

## Networking

The lab joins `firecrawl_backend` (same as main app), so Firecrawl is reachable at the hostname `firecrawl-api-1:3002` from inside the container. If your SQLite `firecrawl_api_url` setting points to `http://localhost:3002` (host-mode value), update it to the Docker hostname, or use `http://host.docker.internal:3002` if you want one URL that works in both modes.

## Common commands

```bash
# Tail lab logs
docker compose logs -f lab

# Restart just the lab (e.g. after Dockerfile.lab edits)
docker compose up -d --build lab

# Shell into the running container
docker exec -it jobhunt-lab sh

# Stop
docker compose stop lab
```
