import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  MemoryError,
  MemoryStore,
  hashPattern,
  validateCorrection,
  validateEpisodic,
} from '../src/memory-store.js'

function tempStore(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'honesty-mem-'))
  return MemoryStore.open(dir, { project: 'honesty-gate', sessionId: 'aabbccdd', ...opts })
}

test('opens empty store with valid semantic file', () => {
  const store = tempStore()
  const health = store.doctor()
  assert.equal(health.ok, true)
  assert.equal(health.semantic, 0)
  const raw = JSON.parse(readFileSync(store.semanticPath, 'utf8'))
  assert.equal(raw.memory_type, 'semantic')
  assert.equal(raw.schema_version, '1.0')
})

test('rejects invalid episodic writes', () => {
  const store = tempStore()
  assert.throws(
    () => store.appendEpisodic({ event_type: 'not_a_type' }),
    (err) => err instanceof MemoryError,
  )
  assert.equal(store.episodic.length, 0)
})

test('rejects invalid corrections', () => {
  assert.throws(
    () => validateCorrection({
      session_id: 'aabbccdd',
      gate: 'confirmed',
      date: '2026-08-19T17:00:00Z',
      project: 'x',
      root_cause: 'short',
      action_next: 'also short',
    }),
    (err) => err instanceof MemoryError,
  )
})

test('appends episodic and correction records', () => {
  const store = tempStore()
  const event = store.appendEpisodic({
    event_type: 'gate_passed',
    gate: 'confirmed',
    outcome: 'pass',
    notes: 'Mechanical verify and evaluator passed.',
  })
  validateEpisodic(event)
  const corr = store.appendCorrection({
    gate: 'confirmed',
    root_cause: 'Estimate assumed missing artifacts that already existed.',
    action_next: 'Cut confirmed-gate estimates when CONTRACT and SPEC are prewritten.',
    predicted_hours: 4,
    actual_hours: 3,
  })
  assert.equal(corr.delta_ratio, 0.75)
  assert.equal(store.episodic.length, 1)
  assert.equal(store.corrections.length, 1)
})

test('semantic writes dedupe on hash and bump validated_count', () => {
  const store = tempStore()
  const input = {
    description: 'Frontend gates with more than eight components take 1.5x.',
    context: 'fullstack-web recipe after two dogfood builds',
  }
  const first = store.writeSemantic(input)
  const second = store.writeSemantic(input)
  assert.equal(first.duplicate, false)
  assert.equal(second.duplicate, true)
  assert.equal(store.semantic.patterns.length, 1)
  assert.equal(second.pattern.validated_count, 2)
  assert.equal(second.pattern.confidence, 'MEDIUM')
  assert.equal(second.pattern.hash, hashPattern(input.description, input.context))
})

test('revertLast undoes the most recent write', () => {
  const store = tempStore()
  store.appendEpisodic({ event_type: 'session_start' })
  store.appendEpisodic({ event_type: 'gate_passed', gate: 'confirmed', outcome: 'pass' })
  assert.equal(store.episodic.length, 2)
  assert.equal(store.revertLast(), 'episodic')
  assert.equal(store.episodic.length, 1)
  assert.equal(store.episodic[0].event_type, 'session_start')
})

test('doctor fails closed on corrupt jsonl', () => {
  const dir = mkdtempSync(join(tmpdir(), 'honesty-bad-'))
  writeFileSync(join(dir, 'episodic.jsonl'), '{not-json\n', 'utf8')
  assert.throws(
    () => MemoryStore.open(dir),
    (err) => err instanceof MemoryError && /invalid JSON/.test(err.message),
  )
})
