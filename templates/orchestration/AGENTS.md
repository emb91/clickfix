# Repository instructions

> Template — copy to your repo root and edit for your stack. `AGENTS.md` at the repo
> root is read automatically by Claude Code and most coding agents. Keep it short and
> concrete; delete sections you don't need.

## Agent PR workflow

- For a single-agent task or one uninterrupted workstream, open exactly one PR at the
  end of the work.
- For an explicitly coordinated multi-agent batch, each sub-agent owns one issue/theme
  and opens exactly one PR for that theme. "One PR" applies per owning sub-agent/theme,
  not to the whole batch.
- The orchestrator may use a temporary coordination branch to audit or combine work, but
  final PRs should stay aligned to the agreed agent/theme ownership unless you say otherwise.
- Each agent PR should record: the theme, verification performed, residual risks, branch
  state, and PR URL before the work is considered complete.

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
