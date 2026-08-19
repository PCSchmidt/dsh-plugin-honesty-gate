#!/usr/bin/env node
/**
 * Small honesty-gate eval harness.
 * Scores D3 gate-catch and Evaluator verdict agreement on a held-out fixture set.
 * No network, no dsh process, no API keys.
 *
 *   node eval/run.js
 *   npm run eval
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Evaluator } from '../src/evaluator.js'
import { validateVerdict } from '../src/verdict.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_CASES = join(HERE, 'cases.json')

/**
 * @param {string | string[]} expected
 * @param {string} actual
 */
function verdictMatches(expected, actual) {
  return Array.isArray(expected) ? expected.includes(actual) : expected === actual
}

/**
 * @param {object} catalog
 * @param {{ now?: string }} [opts]
 */
export function runEval(catalog, opts = {}) {
  const evaluator = new Evaluator({ name: 'gate-evaluator' })
  const rows = []
  let catchHits = 0
  let catchN = 0
  let agreementHits = 0
  let schemaHits = 0
  let isolationHits = 0
  let isolationN = 0

  for (const testCase of catalog.cases) {
    const started = Date.now()
    const verdict = evaluator.evaluate(testCase.request)
    validateVerdict(verdict, testCase.case_id)
    schemaHits += 1

    const agreed = verdictMatches(testCase.expect_verdict, verdict.verdict)
    if (agreed) agreementHits += 1

    if (testCase.kind === 'bad') {
      catchN += 1
      const caught = verdict.verdict === 'fail' || verdict.verdict === 'warn'
      if (caught) catchHits += 1
    }

    if (testCase.failure_mode === 'self_grade_contamination') {
      isolationN += 1
      if (verdict.verdict === 'fail') isolationHits += 1
    }

    rows.push({
      case_id: testCase.case_id,
      project: catalog.project,
      runtime: catalog.runtime,
      scores: {
        D3: testCase.kind === 'bad' && (verdict.verdict === 'fail' || verdict.verdict === 'warn') ? 10 : testCase.kind === 'bad' ? 0 : null,
      },
      gate_verdict: verdict.verdict,
      expected: testCase.expect_verdict,
      agreed,
      failure_mode: testCase.failure_mode,
      notes: verdict.notes,
      duration_ms: Date.now() - started,
    })
  }

  const n = catalog.cases.length
  const badN = catchN
  const report = {
    project: catalog.project,
    runtime: catalog.runtime,
    rubric: catalog.rubric,
    generated_at: opts.now ?? new Date().toISOString(),
    golden_set_size: n,
    split: 'held-out-fixtures',
    seed: null,
    model: 'mechanical-judge',
    metrics: {
      D3_gate_catch_rate: badN ? catchHits / badN : null,
      D3_n: badN,
      verdict_agreement: n ? agreementHits / n : null,
      schema_valid: n ? schemaHits / n : null,
      isolation_hold: isolationN ? isolationHits / isolationN : null,
      isolation_n: isolationN,
    },
    target_gate_catch: catalog.target_gate_catch ?? 0.85,
    cases: rows,
    next: 'Add an optional LLM judge and compare self-grading delta on the same fixtures.',
  }
  report.ok = (report.metrics.D3_gate_catch_rate ?? 0) >= report.target_gate_catch
    && report.metrics.verdict_agreement === 1
    && report.metrics.schema_valid === 1
  return report
}

export function loadCatalog(path = DEFAULT_CASES) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function main() {
  const report = runEval(loadCatalog())
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (!report.ok) {
    process.stderr.write(
      `eval failed: catch=${report.metrics.D3_gate_catch_rate} agreement=${report.metrics.verdict_agreement}\n`,
    )
    process.exitCode = 1
  }
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invoked) main()
