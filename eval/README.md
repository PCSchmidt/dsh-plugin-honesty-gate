# eval/

Held-out fixture harness for honesty-gate (portfolio-kit D3 + verdict agreement).

```sh
npm run eval
```

- No network, no `dsh` process, no API keys
- Cases live in [cases.json](cases.json)
- Target: gate-catch ≥ 85% on known-bad fixtures; exact verdict agreement on labeled cases
