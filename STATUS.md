# Status

**Phase:** 4 — bundle/profile polish + eval harness
**Date:** 2026-08-19

## Done

- Shallow-cloned `deepseek-ai/deepseek-harness` to `../deepseek-harness` at `dsh-v0.1.0-rc.8`
- Cordis-shaped `name` + `apply(ctx)` bundle
- GateRegistry, Evaluator, MemoryStore (portfolio-kit 0.1.0)
- Example profile layout under `examples/profile/`
- `npm run eval` held-out harness (D3 gate-catch + verdict agreement)
- CI: `.github/workflows/test.yml` runs `npm test` and `npm run eval`
- AGENTS.md + CONTRIBUTING.md

## Not done

- Live `dsh plugin add` on this laptop (needs `dsh` CLI / full harness install)
- Optional LLM judge
- GitHub topic `dsh-plugin` (repo settings; cannot set from git)

Next: bake-off golden set, or live dsh install if the CLI is available.
