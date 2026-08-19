import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadCatalog, runEval } from '../eval/run.js'

test('held-out eval meets gate-catch target and full agreement', () => {
  const catalog = loadCatalog()
  assert.ok(catalog.cases.length >= 8)
  const report = runEval(catalog, { now: '2026-08-19T18:00:00.000Z' })
  assert.equal(report.metrics.schema_valid, 1)
  assert.equal(report.metrics.verdict_agreement, 1)
  assert.ok(report.metrics.D3_gate_catch_rate >= report.target_gate_catch)
  assert.equal(report.metrics.isolation_hold, 1)
  assert.equal(report.ok, true)
  assert.equal(report.cases[0].case_id, 'HG-001')
})

test('eval fails the run when a known-bad case is mislabeled as pass', () => {
  const catalog = loadCatalog()
  const broken = {
    ...catalog,
    cases: catalog.cases.map((item) => (
      item.case_id === 'HG-001'
        ? { ...item, expect_verdict: 'pass' }
        : item
    )),
  }
  const report = runEval(broken)
  assert.equal(report.ok, false)
  assert.ok(report.metrics.verdict_agreement < 1)
})
