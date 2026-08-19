# eval/

Held-out fixture harness for honesty-gate (portfolio-kit D3 + verdict agreement).

```sh
npm run eval
```

- No network, no `dsh` process, no API keys
- Cases live in [cases.json](cases.json)
- Target: gate-catch ≥ 85% on known-bad fixtures; exact verdict agreement on labeled cases
- Last run 2026-08-19: catch 1.0 / agreement 1.0 / `ok: true`
- Family pause: no more cases until bake-off or an optional LLM-judge increment
