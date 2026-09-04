# AGENTS.md

How coding agents should work in this repository.

## Read first

1. [README.md](README.md) and [STATUS.md](STATUS.md)
2. [portfolio-kit GATE_CONTRACT](https://github.com/PCSchmidt/portfolio-kit/blob/main/docs/GATE_CONTRACT.md)
3. [portfolio-kit DATA_POLICY](https://github.com/PCSchmidt/portfolio-kit/blob/main/docs/DATA_POLICY.md)

## Do

- Keep gate / Evaluator / memory field names identical to portfolio-kit 0.1.0.
- Validate memory and verdicts before write; fail closed.
- Isolate Evaluator requests (drop `chat_history`, `generator_self_score`).
- Call `next()` in waterfall listeners unless you are deliberately vetoing.
- Run `npm test` and `npm run eval` after contract or judge changes.

## Do not

- Invent a second gate or memory schema.
- Boot a full dsh process unless the task is specifically a live profile install.
- Commit `.honesty-gate/`, `.env`, or non-public data.
- Start redteam-blue-gate work from this repo.
- This repository is paused after Phase 4. Do not add Phase 5+ implementation unless the user explicitly asks for the live `dsh` check or the optional LLM judge. Follow the current family sequence in [portfolio-kit STATUS](https://github.com/PCSchmidt/portfolio-kit/blob/main/docs/STATUS.md).
