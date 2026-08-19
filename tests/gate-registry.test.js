import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { GateError, GateRegistry, parseGatesDocument } from '../src/gate-registry.js'

const exampleGates = fileURLToPath(new URL('../examples/gates.yaml', import.meta.url))
const exampleRoot = fileURLToPath(new URL('../examples', import.meta.url))

test('parses the example DAG and reports current gate', () => {
  const registry = GateRegistry.fromFile(exampleGates, { workspaceRoot: exampleRoot })
  assert.equal(registry.document.gates.length, 2)
  assert.equal(registry.current()?.id, 'confirmed')
  assert.equal(registry.canProceed('confirmed'), true)
  assert.equal(registry.canProceed('tests_passing'), false)
})

test('verify fails when artifacts are missing', () => {
  const empty = mkdtempSync(join(tmpdir(), 'honesty-gate-'))
  writeFileSync(join(empty, 'gates.yaml'), `
version: "1.0"
gates:
  - id: confirmed
    label: Scope
    type: human_approval
    requires_artifacts: [CONTRACT.md]
`)
  const registry = GateRegistry.fromFile(join(empty, 'gates.yaml'), { workspaceRoot: empty })
  const result = registry.verify('confirmed')
  assert.equal(result.ok, false)
  assert.equal(result.exitCode, 2)
  assert.match(result.reasons.join(' '), /CONTRACT.md is missing/)
})

test('verify + markPassed succeed when artifacts exist', () => {
  const registry = GateRegistry.fromFile(exampleGates, { workspaceRoot: exampleRoot })
  const result = registry.verify('confirmed')
  assert.equal(result.ok, true)
  registry.markPassed('confirmed')
  assert.equal(registry.current()?.id, 'tests_passing')
})

test('tests_exist is the mechanical pre-condition on tests_passing', () => {
  const registry = GateRegistry.fromFile(exampleGates, { workspaceRoot: exampleRoot })
  registry.markPassed('confirmed')
  const result = registry.verify('tests_passing')
  assert.equal(result.ok, false)
  assert.match(result.reasons.join(' '), /tests/)
})

test('tests_exist passes when tests/ is present', () => {
  const root = mkdtempSync(join(tmpdir(), 'honesty-gate-tests-'))
  writeFileSync(join(root, 'CONTRACT.md'), 'ok')
  writeFileSync(join(root, 'SPEC.md'), 'ok')
  mkdirSync(join(root, 'tests'))
  writeFileSync(join(root, 'gates.yaml'), `
version: "1.0"
gates:
  - id: confirmed
    label: Scope
    type: human_approval
    requires_artifacts: [CONTRACT.md, SPEC.md]
    hooks:
      pre: [artifacts_exist]
  - id: tests_passing
    label: Tests
    type: automated
    requires: [confirmed]
    hooks:
      pre: [tests_exist]
    requires_artifacts: [tests]
`)
  const registry = GateRegistry.fromFile(join(root, 'gates.yaml'), { workspaceRoot: root })
  registry.markPassed('confirmed')
  const result = registry.verify('tests_passing')
  assert.equal(result.ok, true)
})

test('rejects cycles', () => {
  assert.throws(
    () => parseGatesDocument(`
version: "1.0"
gates:
  - id: a
    label: A
    type: automated
    requires: [b]
  - id: b
    label: B
    type: automated
    requires: [a]
`),
    (err) => err instanceof GateError && /circular/.test(err.message),
  )
})

test('preExecuteDecision denies tools while the current gate fails', () => {
  const empty = mkdtempSync(join(tmpdir(), 'honesty-gate-deny-'))
  writeFileSync(join(empty, 'gates.yaml'), `
version: "1.0"
gates:
  - id: confirmed
    label: Scope
    type: human_approval
    requires_artifacts: [CONTRACT.md]
    on_fail: block_all_writes
`)
  const registry = GateRegistry.fromFile(join(empty, 'gates.yaml'), { workspaceRoot: empty })
  const decision = registry.preExecuteDecision({ name: 'write' })
  assert.equal(decision.kind, 'deny')
  assert.match(decision.reason, /honesty-gate blocked write/)
})
