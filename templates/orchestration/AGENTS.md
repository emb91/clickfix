# Repository instructions

> Template — copy to your repo root and edit for your stack. `AGENTS.md` at the repo
> root is read automatically by Claude Code and most coding agents. Keep it short and
> concrete; delete sections you don't need.

## Agent PR workflow

- **One task = one branch.** Branch off the latest default branch at the start
  (`git switch main && git pull && git switch -c <type>/<short-task-name>`) and stay on it for
  the whole task — no branch-hopping mid-task.
- For a single-agent task or one uninterrupted workstream, open exactly one PR at the end.
- For an explicitly coordinated multi-agent batch, each sub-agent owns one issue/theme and
  opens exactly one PR for that theme. "One PR" applies per owning sub-agent/theme, not to the
  whole batch.
- **Commit only your own files, via explicit paths** (`git commit -- <paths>`); never
  `git add -A` / `commit -a` — it sweeps up other agents' work.
- The orchestrator may use a temporary coordination branch to audit or combine work, but final
  PRs should stay aligned to the agreed agent/theme ownership unless you say otherwise.
- Each agent PR should record: the theme, verification performed, residual risks, branch state,
  and PR URL before the work is considered complete.

## Branch & merge safety — assess state, never assume

- **Before pushing to a branch whose PR you opened, verify the PR isn't already merged.** PRs
  often merge out-of-band right after opening — never assume it's still open. Check with
  `gh pr view <n> --json state,mergedAt` and `git log origin/main..HEAD --oneline`. If it's
  MERGED, **STOP**: do not push more (the commits strand ahead of main and never ship). Cut a
  fresh branch off the latest main and open a new PR for the further work.
- Sync onto latest main before opening or merging: `git fetch && git rebase origin/main`,
  resolve conflicts on your branch, then `git push --force-with-lease`.
- **Never reuse a branch after its PR merges** — start a fresh one off main.
- Never force-push `main` or any shared branch; `--force-with-lease` is only for your own
  feature branch after a rebase.
- Squash-merge after approval (safe because the branch is never reused), then delete the branch.

## Worktree completion protocol

- Every agent working in a separate worktree owns closing it out. Work is not complete
  while important changes exist only as uncommitted files in a worktree.
- Before stopping, leave the work in one of: committed + pushed to a named branch (PR link
  recorded); committed locally on a named branch (noted as needing push/PR); stashed with a
  descriptive message (worktree path + stash name recorded); or explicitly marked discardable.
- Before ending a task, report: worktree path; branch name; `git status --short --branch`;
  latest commit SHA; whether the branch is pushed; PR URL if any; any uncommitted/stashed work.
- If an agent creates a worktree, that agent documents how to resume, merge, park, or remove it.

## Project-specific conventions (EDIT THIS)

Add the rules unique to your stack so agents don't guess. Examples:

- **Migrations / DB:** how to create, apply, and reconcile migrations; never rewrite an
  applied migration — add a forward one.
- **Tests / checks:** the exact commands that must pass before a PR (typecheck, unit, lint).
- **Don't-touch zones:** generated files, vendored code, secrets/config.
- **Tooling fallbacks:** if a CLI is missing, which MCP/connector to use instead before
  declaring work blocked.
