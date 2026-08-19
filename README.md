# dsh-plugin-honesty-gate

Ports Meridian’s Generator / Evaluator separation, mechanical gates, and validated memory into a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) / Cordis plugin.

**Status:** Phase 1 — hello plugin + GateRegistry

Built on Meridian’s gate + independent Evaluator contracts. This is the highest-leverage external contribution in the family: the same reliability properties, expressed as Cordis services, waterfall hooks, and reversible effects.

## Relation to Meridian

Meridian remains the source of primitives ([PCSchmidt/meridian](https://github.com/PCSchmidt/meridian)). This repo **re-implements the same contracts** inside dsh. It does not fork a second gate language.

Local dsh reference checkout (sibling, not a dependency): `../deepseek-harness` @ `dsh-v0.1.0-rc.8` (`141eb6f`). This increment does **not** boot a full dsh process.

## Shared contracts

This project follows [portfolio-kit](https://github.com/PCSchmidt/portfolio-kit):

- [GATE_CONTRACT.md](https://github.com/PCSchmidt/portfolio-kit/blob/main/docs/GATE_CONTRACT.md)
- [EVAL_RUBRIC_TEMPLATE.md](https://github.com/PCSchmidt/portfolio-kit/blob/main/docs/EVAL_RUBRIC_TEMPLATE.md)
- [MEMORY_SCHEMA.md](https://github.com/PCSchmidt/portfolio-kit/blob/main/docs/MEMORY_SCHEMA.md)
- [DATA_POLICY.md](https://github.com/PCSchmidt/portfolio-kit/blob/main/docs/DATA_POLICY.md)

## Architecture

```mermaid
flowchart TB
    dsh[dsh / Cordis context]
    subgraph plugin [dsh-plugin-ho — later]
        MS[MemoryStore — later
        EV[Evaluator fresh session]
        MS[MemoryStore schema-validated]
        GR --> EV
        EV --> MS
    end
    dsh --> plugin
    plugin -->|gate.passed / gate.failed| dsh
```

`tools/pre-execute` listener: if the current required gate fails mechanically, return `{ kind: 'deny', reason }` **without** calling `next()` (Cordis waterfall veto).

## What this increment does

| Piece | Behavior |
|-------|----------|
| `apply(ctx)` | Cordis hello plugin; logs load; exposes `ctx.honestyGate` |
| `GateRegistry` | Parse `gates.yaml`, reject cycles, `current` / `verify` / `markPassed` |
| Mechanical pre-hooks | `artifacts_exist`, `tests_exist` (exit-code 2 on fail) |
| Bundle manifest | `dsh.bundle` + [cordis.patch.yml](cordis.patch.yml) |

Shell hook execution is out of scope (no arbitrary command runner).

## Install as a dsh bundle (when `dsh` is on PATH)

```sh
```
index.js                 # Cordis exports
src/plugin.js            # apply(ctx)
src/gate-registry.js     # YAML DAG + mechanical verify
cordis.patch.yml         # dsh bundle layer
examples/                # sample gates.yaml + artifacts
tests/                   # node:test
```
dsh --profile honesty-gate-demo --dump-config
```

## Develop

```sh
npm install
npm test
```

Requires Node.js 20+. Tests use `node:test` and do not start dsh.

## Planned phases

1. Clone dsh from source; Cordis hello plugin; GateRegistry + one mechanical pre-condition *(this increment)*
2. Independent Evaluator service + structured JSON verdict
3. Schema-validated semantic / episodic / corrections memory
4. Installable profile/bundle polish, eval harness, `dsh-plugin` topic

## Public / unclassified data only

No JPO, F-35, or other non-public program data. See the kit data policy.

## Current tree

Phase 0 is documentation only. Implementation starts after portfolio-kit is the published contract source.
