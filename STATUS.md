# Status

**Phase:** 1 — hello plugin + GateRegistry
**Date:** 2026-08-19

## Done

- Shallow-cloned `deepseek-ai/deepseek-harness` to `../deepseek-harness` at `dsh-v0.1.0-rc.8`
- Cordis-shaped `name` + `apply(ctx)` bundle (`package.json` `dsh.bundle`, `cordis.patch.yml`)
- GateRegistry: YAML DAG, cycle check, artifact / `tests_exist` mechanical verify (exit 2)
- `tools/pre-execute` veto when the current required gate fails
- `npm test` (stdlib `node:test`)

## Not done

- Independent Evaluator
- Memory store
- Live `dsh plugin add` against a running profile (needs `dsh` CLI / full harness install)
- `dsh-plugin` GitHub topic (set in repo settings)

Next: Evaluator as a fresh-context service returning portfolio-kit verdict JSON.
