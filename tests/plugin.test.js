import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { apply, name } from '../src/plugin.js'

const exampleGates = fileURLToPath(new URL('../examples/gates.yaml', import.meta.url))
const exampleRoot = fileURLToPath(new URL('../examples', import.meta.url))

test('hello plugin exports Cordis name + apply', () => {
  assert.equal(name, 'honesty-gate')
  assert.equal(typeof apply, 'function')
})

test('apply registers honestyGate and logs load', () => {
  const lines = []
  const ctx = {
    logger: { info: (msg) => lines.push(msg) },
  }
  const service = apply(ctx, { gatesFile: exampleGates, workspaceRoot: exampleRoot })
  assert.equal(ctx.honestyGate, service)
  assert.equal(service.registry.document.gates.length, 2)
  assert.match(lines[0], /plugin loaded \(2 gates\)/)
})

test('tools/pre-execute listener short-circuits without calling next when blocked', async () => {
  let nextCalled = false
  let handler
  const ctx = {
    on(event, fn) {
      if (event === 'tools/pre-execute') handler = fn
    },
    logger: { info() {} },
  }
  apply(ctx, {
    gatesFile: exampleGates,
    workspaceRoot: fileURLToPath(new URL('.', import.meta.url)),
  })
  assert.equal(typeof handler, 'function')
  const decision = await handler({ name: 'bash' }, async () => {
    nextCalled = true
    return { kind: 'allow' }
  })
  assert.equal(decision.kind, 'deny')
  assert.equal(nextCalled, false)
})

test('apply exposes evaluate and emits evaluator.verdict', () => {
  const emitted = []
  const ctx = {
    emit: (event, payload) => emitted.push({ event, payload }),
    logger: { info() {} },
  }
  const service = apply(ctx, { gatesFile: exampleGates, workspaceRoot: exampleRoot })
  const verdict = service.evaluate('confirmed')
  assert.equal(verdict.gate, 'confirmed')
  assert.ok(['pass', 'warn', 'fail'].includes(verdict.verdict))
  assert.ok(emitted.some((row) => row.event === 'evaluator.verdict'))
})

test('advance fails closed when the Evaluator returns fail', () => {
  const service = apply({ logger: { info() {} } }, {
    gatesFile: exampleGates,
    workspaceRoot: fileURLToPath(new URL('.', import.meta.url)),
  })
  assert.throws(
    () => service.advance('confirmed'),
    (err) => err.name === 'GateError' && /cannot advance confirmed/.test(err.message),
  )
})

test('tools/pre-execute calls next when the current gate verifies', async () => {
  let nextCalled = false
  let handler
  const ctx = {
    on(event, fn) {
      if (event === 'tools/pre-execute') handler = fn
    },
    logger: { info() {} },
  }
  apply(ctx, { gatesFile: exampleGates, workspaceRoot: exampleRoot })
  const decision = await handler({ name: 'read' }, async () => {
    nextCalled = true
    return { kind: 'allow' }
  })
  assert.equal(decision.kind, 'allow')
  assert.equal(nextCalled, true)
})
