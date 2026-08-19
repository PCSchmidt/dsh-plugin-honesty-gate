import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Evaluator, isolateRequest } from '../src/evaluator.js'
import { validateVerdict } from '../src/verdict.js'

const exampleRoot = fileURLToPath(new URL('../examples', import.meta.url))

test('isolateRequest drops generator-contaminated fields', () => {
  const clean = isolateRequest({
    gate: 'confirmed',
    session_id: 'aabbccdd',
    artifacts: [{ path: 'CONTRACT.md', content: 'Scope text that is long enough.' }],
    generator_self_score: 9.5,
    chat_history: ['I finished the gate'],
  })
  assert.equal(clean.gate, 'confirmed')
  assert.deepEqual(clean._dropped, ['generator_self_score', 'chat_history'])
  assert.equal('generator_self_score' in clean, false)
})

test('missing artifact is a high-severity fail', () => {
  const verdict = new Evaluator().evaluate({
    gate: 'confirmed',
    session_id: '11111111',
    artifacts: [{ path: 'CONTRACT.md', content: null, missing: true }],
    gate_spec: { requires_artifacts: ['CONTRACT.md'] },
  })
  validateVerdict(verdict)
  assert.equal(verdict.verdict, 'fail')
  assert.equal(verdict.issues[0].severity, 'high')
  assert.match(verdict.issues[0].description, /missing/)
})

test('heading-only artifact is a high-severity fail', () => {
  const verdict = new Evaluator().evaluate({
    gate: 'confirmed',
    session_id: '22222222',
    artifacts: [{ path: 'SPEC.md', content: '# SPEC.md\n\n## Feature\n' }],
    gate_spec: { requires_artifacts: ['SPEC.md'] },
  })
  assert.equal(verdict.verdict, 'fail')
  assert.match(verdict.issues[0].description, /heading/)
})

test('stub language is scored as a gap', () => {
  const verdict = new Evaluator().evaluate({
    gate: 'confirmed',
    session_id: '33333333',
    artifacts: [{
      path: 'CONTRACT.md',
      content: '# CONTRACT\n\nTODO implement this product later. Placeholder only.',
    }],
    gate_spec: { requires_artifacts: ['CONTRACT.md'] },
  })
  assert.ok(verdict.issues.some((issue) => /stub|placeholder/i.test(issue.description)))
  assert.ok(verdict.verdict === 'fail' || verdict.verdict === 'warn')
})

test('substantial artifacts produce a pass verdict', () => {
  const verdict = new Evaluator().evaluate({
    gate: 'confirmed',
    session_id: '44444444',
    artifacts: [
      {
        path: 'CONTRACT.md',
        content: '# CONTRACT\n\nHonesty-gate example workspace. Public unclassified fixtures only.\n\n## Out of scope\n\n- Replacing Claude Code as a daily editor\n',
      },
      {
        path: 'SPEC.md',
        content: '# SPEC\n\n## Feature: Hello plugin loads\n\nThe apply function registers honestyGate and GateRegistry loads this example DAG.\n',
      },
    ],
    contract: '# CONTRACT\n\nHonesty-gate example workspace.\n\n## Out of scope\n\n- Replacing Claude Code as a daily editor\n',
    spec: '# SPEC\n\n## Feature: Hello plugin loads\n\nThe apply function registers honestyGate.\n',
    gate_spec: { requires_artifacts: ['CONTRACT.md', 'SPEC.md'] },
  })
  validateVerdict(verdict)
  assert.equal(verdict.verdict, 'pass')
  assert.equal(verdict.evaluator, 'gate-evaluator')
  assert.ok(verdict.overall >= 7)
})

test('CONTRACT out-of-scope vs SPEC is a high-severity fail', () => {
  const verdict = new Evaluator().evaluate({
    gate: 'confirmed',
    session_id: '55555555',
    artifacts: [
      { path: 'CONTRACT.md', content: '# C\n\nProduct brief for the demo.\n\n## Out of scope\n\n- User authentication system\n' },
      { path: 'SPEC.md', content: '# S\n\n## Feature\n\nBuild the user authentication system this sprint.\n' },
    ],
    contract: '# C\n\nProduct brief for the demo.\n\n## Out of scope\n\n- User authentication system\n',
    spec: '# S\n\n## Feature\n\nBuild the user authentication system this sprint.\n',
    gate_spec: { requires_artifacts: ['CONTRACT.md', 'SPEC.md'] },
  })
  assert.equal(verdict.verdict, 'fail')
  assert.ok(verdict.issues.some((issue) => /contradict/i.test(issue.description)))
})

test('custom judge scores are still schema-validated and praise-stripped', () => {
  const evaluator = new Evaluator({
    judge: () => ({
      scores: { completeness: 8, quality: 8, consistency: 8, spec_adherence: 8 },
      issues: [{ artifact: 'SPEC.md', severity: 'low', description: 'great work but the heading is long' }],
      notes: 'looks good overall',
      reviewed: ['SPEC.md'],
    }),
  })
  const verdict = evaluator.evaluate({
    gate: 'confirmed',
    session_id: '66666666',
    artifacts: [{ path: 'SPEC.md', content: 'enough body text for a review' }],
  })
  validateVerdict(verdict)
  assert.doesNotMatch(verdict.notes, /looks good/i)
  assert.doesNotMatch(verdict.issues[0].description, /great/i)
})

test('evaluateWorkspace reads the example fixtures', () => {
  const evaluator = new Evaluator()
  const verdict = evaluator.evaluateWorkspace(
    'confirmed',
    { id: 'confirmed', requires_artifacts: ['CONTRACT.md', 'SPEC.md'] },
    exampleRoot,
    { session_id: '77777777' },
  )
  validateVerdict(verdict)
  assert.equal(verdict.session_id, '77777777')
  assert.ok(verdict.artifacts_reviewed.includes('CONTRACT.md'))
})
