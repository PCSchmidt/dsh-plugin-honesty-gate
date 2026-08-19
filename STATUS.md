# Status

**Phase:** 2 — hello plugin + GateRegistry + independent Evaluator
**Date:** 2026-08-19

## Done

- Shallow-cloned `deepseek-ai/deepseek-harness` to `../deepseek-harness` at `dsh-v0.1.0-rc.8`
- Cordis-shaped `name` + `apply(ctx)` bundle
- GateRegistry: YAML DAG, cycle check, artifact / `tests_exist` mechanical verify
- Independent Evaluator: fresh-context request isolation, mechanical adversarial judge, portfolio-kit verdict JSON
- `advance(gateId)` fail-closed on mechanical fail or Evaluator `fail`
- Praise-stripping and schema validation on every verdict

## Not done

- Memory store
- Live `dsh plugin add` against a running profile
- Optional LLM judge (API)
- `dsh-plugin` GitHub topic

Next: schema-validated semantic / episodic / corrections memory.
