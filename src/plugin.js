/**
 * Cordis plugin body: name + apply(ctx).
 * Matches dsh first-plugin / bundle tutorials.
 * GateRegistry does not require a live dsh process.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GateError, GateRegistry } from './gate-registry.js'
import { Evaluator } from './evaluator.js'

const DEFAULT_GATES = fileURLToPath(new URL('../examples/gates.yaml', import.meta.url))

export const name = 'honesty-gate'

/**
 * @param {object} [ctx]
 * @param {object} [options]
 */
export function apply(ctx = {}, options = {}) {
  const gatesFile = options.gatesFile
    ?? ctx.config?.gatesFile
    ?? DEFAULT_GATES
  const workspaceRoot = options.workspaceRoot
    ?? ctx.config?.workspaceRoot
    ?? process.cwd()

  const events = []
  const emit = (event, payload) => {
    events.push({ event, payload })
    ctx.emit?.(event, payload)
  }

  const registry = GateRegistry.fromFile(resolve(gatesFile), { workspaceRoot, emit })
  const evaluator = new Evaluator({ emit, name: 'gate-evaluator' })

  const evaluate = (id, request) => {
    if (request) return evaluator.evaluate(request)
    const gate = registry.get(id)
    return evaluator.evaluateWorkspace(id, gate, workspaceRoot)
  }

  const advance = (id) => {
    const verified = registry.verify(id)
    if (!verified.ok) {
      throw new GateError(`cannot advance ${id}: ${verified.reasons.join('; ')}`, verified.exitCode)
    }
    const verdict = evaluate(id)
    if (verdict.verdict === 'fail') {
      throw new GateError(
        `cannot advance ${id}: evaluator verdict fail (${verdict.notes})`,
        2,
      )
    }
    return { gate: registry.markPassed(id), verdict }
  }

  const service = {
    name,
    registry,
    evaluator,
    events,
    current: () => registry.current(),
    verify: (id) => registry.verify(id),
    evaluate,
    advance,
    markPassed: (id) => registry.markPassed(id),
  }

  if (typeof ctx.provide === 'function') {
    ctx.provide('honestyGate', service)
  } else {
    ctx.honestyGate = service
  }

  if (typeof ctx.on === 'function') {
    ctx.on('tools/pre-execute', async (exec, next) => {
      const decision = registry.preExecuteDecision(exec)
      if (decision.kind === 'deny') return decision
      if (typeof next === 'function') return next()
      return { kind: 'allow' }
    })
  }

  const logger = ctx.logger
  const line = `[honesty-gate] plugin loaded (${registry.document.gates.length} gates)`
  if (logger && typeof logger.info === 'function') logger.info(line)
  else console.log(line)

  return service
}

export function createHonestyGate(ctx, options) {
  return apply(ctx, options)
}
