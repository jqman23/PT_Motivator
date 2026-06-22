<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Workflow rules

- Do not create pull requests unless Josh explicitly asks for a PR.
- Do not run `gh pr create`.
- Prefer committing and pushing directly to `main`.
- After completing changes, run:
  - `git status`
  - `git add .`
  - `git commit -m "Clear short message"`
  - `git pull --rebase origin main`
  - `git push origin main`
- If direct push to `main` is unavailable in Codex cloud, stop and explain the limitation instead of creating a PR.