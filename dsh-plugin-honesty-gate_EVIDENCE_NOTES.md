# dsh-plugin-honesty-gate: Evidence Notes

Labels: Confirmed, Ran it, Per the docs, My reading, Ask the author. All runs were in a scratch copy of tracked files outside the clone; the clone was read-only and `git status` there shows no changes.

## E1 Fact sheet
- Name and licence: dsh-plugin-honesty-gate, MIT, public, 0 stars, 0 forks (Confirmed, repo metadata query).
- Kind: plugin library (JavaScript, ES modules, Node 20+; one dependency, `yaml`). About 1,340 lines in `src/`, 5 test files (32 tests). Confirmed.
- Status: "Phase 4 complete, paused 2026-08-19" (README, STATUS.md, AGENTS.md, CONTRIBUTING.md). Per the docs.
- History: 7 commits, 6 on 2026-08-19, 1 on 2026-09-04. Confirmed. No co-author trailers in any commit message. The guide therefore says only "AI coding agents".
- Needs: no paid service, no GPU, no large download. Ran it.
- Deployed: no. Live dsh not installed (STATUS.md "Not done"). Per the docs.
- Related: README says it re-implements Meridian contracts; shared documents live in portfolio-kit. The code mentions Meridian only in comments (grep of `src/`, `index.js`); no import of Meridian code. Confirmed. portfolio-kit's STATUS.md (read in its clone) says gate-enforced-rag has a dsh-shaped plugin of its own. Per the docs.

## E2 Reading and running log
Read: README, STATUS, AGENTS, CONTRIBUTING, package.json, CI workflow, eval README and cases, all of `src/`, `eval/run.js`, example gate list and patch, test file names and counts. Not read in full: individual test bodies (counted only), memory-store internals beyond the checks and hash. Not read: the dsh program itself (not in the clone).
Commands (scratch copy): `npm ci` (1 package), `npm test`, `npm run eval`, two probe scripts. `gh run list` and `gh repo view` for CI history and metadata (read-only). A pattern search of tracked files for key-like strings found nothing.

## E3 Claims check (level L2: reproduced by re-running)
- CL-01 "npm test 32/32": Ran it, 32 pass, 0 fail, 0 skipped. Supported.
- CL-02 "D3 catch 1.0 (n=6), agreement 1.0, schema_valid 1.0, isolation_hold 1.0": Ran it, matches. Supported, but the catch count counts warn as caught: HG-003 (stub) returns warn (a pass-through), so 5 of 6 bad cases are stopped by fail.
- CL-03 "8-case held-out set": the cases are in-repo fixtures written with the rules; "held-out" is the repo's label. Partly (My reading).
- CL-04 "CI runs npm test and npm run eval": workflow confirms; three runs, all success. Supported.
- CL-05 "advance: verify must exit 0 and verdict must not be fail": Confirmed in `plugin.js`.
- CL-06 "Evaluator accepts only gate, session_id, artifacts, contract, spec, gate_spec": Confirmed in `isolateRequest`; extra keys are dropped and recorded in an internal `_dropped` field that does not appear in the verdict.
- CL-07 The example gate list (not the README) declares a human-approval gate with `approval_token`: the token is parsed (gate-registry line ~88) and never read elsewhere. Unsupported as an enforced control. See E4 probe P9.
- CL-08 "Invalid writes throw MemoryError and do not persist": Supported by test and probe P12.
- CL-09 "Reversible `revertLast()`": Confirmed.

## E4 Rule attacks and probes (Ran it; scratch scripts, not in the repo)
| Probe | Input | Result |
| --- | --- | --- |
| P1 | Contract and spec of vague fluff, no stub words | pass, overall 9.6 (missed) |
| P2 | Text about "mastodon" | medium issue "stub language" (false alarm; verdict still pass at 7.0) |
| P3 | Out-of-scope item in contract, same words in capitals in spec, passed as separate contract/spec fields | fail (caught) |
| P3 (artifacts only) | Same, supplied only as artifacts, no contract/spec fields | pass (missed; check needs the separate fields). In the plugin's own advance flow the workspace reader fills contract and spec from CONTRACT.md and SPEC.md, and the check fires (fail) (reviewer re-run) |
| P3b | Paraphrase ("login and password sign-in") of the out-of-scope item | pass (missed) |
| P4 | Praise stripper on "greater", "great" | output "er" (word fragments removed) |
| P5/P6 | Request without gate; artifact that is a number | clear errors (handled) |
| P7 | Judge callback returning 99, -5, "x" | clamped to 10, 0, 0 (handled) |
| P8 | advance with files missing | refused, both named (handled) |
| P9 | advance on the human-approval gate with files present and no approval | pass; next gate becomes current (missed) |
| P10 | advance tests gate with no tests folder | refused (handled) |
| P11 | tests folder present but empty | pass (missed; folders count as present) |
| P12 | remember({}) | MemoryError, nothing saved (handled) |
| extra | Artifact path "old/NOTCONTRACT.md" for required "CONTRACT.md" | pass (missed; suffix match) |
| extra | Self-score 9.8 with a real file | pass; with a missing file | fail (so HG-006 would fail without isolation) |

The guide's "1 of 6 stopped" counts the six probes aimed at things a gate should stop: P1, P3b, the suffix-name file, P11, P9, and the capitals case (the only one stopped). Small hand-picked set; not a rate.

## E5 Code map
`index.js` re-exports. `src/plugin.js` (apply, advance, pre-execute hook), `src/gate-registry.js` (YAML parse, cycle detection by three-colour walk, verify, built-in `artifacts_exist` and `tests_exist`, `preExecuteDecision`), `src/evaluator.js` (isolateRequest, mechanicalJudge, Evaluator), `src/verdict.js` (weights, verdictFrom, stripPraise, validateVerdict), `src/memory-store.js` (three stores, SHA-256 `hashPattern`, effects stack for undo). `eval/run.js` and `eval/cases.json` (HG-001 to HG-008).

## E6 Model call sites
None. The Evaluator accepts an optional `judge` callback; default is the mechanical judge. No call site in the repo supplies a model. Confirmed.

## E7 Tests and CI
Runner reports 32 tests, 0 skipped, across five files (plugin, evaluator, gate registry, memory store, eval); per-file counts were not reconciled. Node's built-in runner. CI: one job, `npm ci`, `npm test`, `npm run eval` on Node 20; scratch run used Node 24. No coverage tool. Spot checks not performed on test bodies beyond names.

## E8 History
Seven commits, one per phase on 2026-08-19, plus a pause note and a 2026-09-04 doc clarification. No plan-before-results protocol; the eval cases and the rules arrived in the same commit (f16b03d). Author identity on commits mixes a name and two email styles; no tool credit.

## E9 Gates and approvals
The example gate `confirmed` is typed `human_approval` with token "CONFIRMED"; no code checks it (P9). Verdicts record `evaluator: gate-evaluator`, not a person.

## E10 Environment
`package-lock.json` present; `npm ci` used. Declared Node >=20; run on 24. Eval output records no versions. 

## E11 Security and privacy
No key-like strings in tracked files (pattern search). `.env` and the `.honesty-gate/` memory folder are ignored. Reads and writes only local files. The `requires_artifacts` paths are joined to the workspace root without a check that they stay inside it (My reading; not probed).

## E12 Shortcomings
1. Referee passes vague text (High; undisclosed beyond "mechanical judge"). 2. Approval gate unenforced (High for the claim; undisclosed). 3. Out-of-scope check literal and only on separate contract/spec fields (Medium). 4. Suffix path match (Medium). 5. Empty tests folder passes (Medium). 6. Substring stub words; praise stripper mangles words (Low). 7. "held-out" label and HG-006 not isolating (Low). 8. Pass state not restored on restart (Low). Options: widen patterns, add model judge, or document the limit; add probes to the eval first.

## E13 Method detail
Overall = 0.30 completeness + 0.25 quality + 0.20 consistency + 0.25 spec adherence, rounded to one decimal. Pass if overall >= 7 and no high issue; fail if overall < 5 or any high issue; else warn. Completeness = present/required*10; quality = substantial/required*10; consistency 8 (no high issue), 5 (high), 2 (contradiction), capped at 6 with a medium issue; spec adherence = (required - highs)/required*10 capped at 6 with a medium issue. Toy example in the guide (8, 6, 8, 8 gives 7.5) recomputed by hand.

## E14 Discrepancies
README "held-out" versus same-commit fixtures. The example gate list declares a human-approval gate; the README does not mention it, and code does not enforce it. Memory is described as reversible; only the last write is, via `revertLast()`.

## E15 Production readiness
Works locally. Missing: live dsh install, enforced approval, stronger referee, version tags (none exist), monitoring, runbook. CI present.

## E17 Completeness
Done and tested: gate registry, referee, memory store, wrapper (fake context), eval. Not done (per STATUS): live install, model judge, GitHub topic. Planned only: nothing beyond these.

## Revision log (second draft)
Applied the ten reader-check fixes; the first draft is archived as the v1draft file. No new runs; every number is unchanged from E3 and E4.
1. dsh, Meridian and Cordis each defined in one plain sentence at first use; portfolio-kit, gate-enforced-rag and "sibling projects" references removed from the guide.
2. Opening split into the example, the idea and terms, a plain statement about the name, and one status-and-numbers paragraph.
3. The worked example and the journey picture now come first.
4. The six probes are a short list, one line each.
5. Jargon glossed or dropped: hook, harness, plugin, YAML (expanded), append-only, held-out, unit test, fail-closed, false alarms; "wrapper" became "connector", "mechanical check" became "file check", "fixtures" became "cases", "schema" became "fixed format".
6. One name, "referee"; the code's word Evaluator is mentioned once in the body and once in the glossary.
7. Caveats (no live install, self-written cases) stated once in the opening and once in the real-use chapter; other places point back briefly.
8. The learned-versus-rules picture is placed in the methods chapter.
9. Cut: SHA-256 fingerprint, loop-detection walk, weights arithmetic, family glossary entries. Weights are in E13.
10. The name is reframed up front: a file-existence and pattern check that passes vague text (9.6) and stopped 1 of 6 probes; "honesty gate" is not a lie detector. Subtitle, strengths chapter and interview answers say the same once.
Also: the parts picture was regenerated (labels "Referee", "file checks", plugin name) and viewed; the other pictures are unchanged. Word count about 3,890 by plain wc -w (first draft 4,490). Builders named only as AI coding agents; no tool credit appears in commits (E1).
