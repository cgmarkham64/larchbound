Perform an isolated code review of the current uncommitted changes.

Steps:
1. Run `git diff HEAD` and `git diff --cached` to collect all uncommitted changes. If the output is empty, run `git diff HEAD~1` to review the last commit instead.
2. Run `git status` to understand which files are involved.
3. Spawn a fresh subagent (Agent tool) with the full diff and the project context below. Do NOT share any context from the current conversation — brief the subagent entirely through its prompt.

Brief the subagent with this prompt (fill in the actual diff and file list):

---
You are a senior engineer doing a cold code review of the following diff from the LarchBound project — a React 19 / TypeScript frontend with an Express/MongoDB backend.

Tech context:
- Frontend: React 19, TanStack Router, TanStack Query, Zustand, React Hook Form + Zod, Tailwind CSS v4
- Backend: Express 4, Mongoose 8, TypeScript, JWT auth (local dev) / Keycloak (Docker)
- ESLint with typescript-eslint and react-hooks plugins enforced

Files changed:
<paste git status output>

Diff:
<paste full git diff output>

Review for:
1. **Correctness** — logic errors, wrong assumptions, edge cases that will break
2. **Security** — injection risks, auth bypasses, data leaks, unsafe operations
3. **React patterns** — hooks rule violations, stale closures, missing deps, unnecessary effects
4. **TypeScript** — unsafe `any` casts, missing null checks, incorrect types
5. **Performance** — unnecessary re-renders, missing memoization, expensive operations in render
6. **Style consistency** — deviations from the patterns already established in the codebase

Format your response as:
- A one-paragraph summary of the overall change quality
- A bullet list of specific issues found (file:line — severity — description)
- A bullet list of things done well (positive callouts)
    
Severity levels: 🔴 bug/security, 🟡 concern, 🟢 suggestion
---

4. Report the subagent's full review findings back to the user.