/**
 * Cordis plugin body: name + apply(ctx).
 * Matches dsh first-plugin / bundle tutorials.
 * GateRegistry does not require a live dsh process.
 */

import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GateError, GateRegistry } from './gate-registry.js'
import { Evaluator } from './evaluator.js'
import { MemoryStore } from './memory-store.js'

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
  const memoryDir = options.memoryDir
    ?? ctx.config?.memoryDir
    ?? join(workspaceRoot, '.honesty-gate', 'memory')
  const project = options.project ?? ctx.config?.project ?? 'honesty-gate'

  const events = []
  const emit = (event, payload) => {
    events.push({ event, payload })
    ctx.emit?.(event, payload)
  }

  const registry = GateRegistry.fromFile(resolve(gatesFile), { workspaceRoot, emit })
  const evaluator = new Evaluator({ emit, name: 'gate-evaluator' })
  const memory = MemoryStore.open(memoryDir, { project, emit, sessionId: options.sessionId })
  memory.doctor()
  memory.appendEpisodic({ event_type: 'session_start' })

  const evaluate = (id, request) => {
    if (request) return evaluator.evaluate(request)
    const gate = registry.get(id)
    return evaluator.evaluateWorkspace(id, gate, workspaceRoot, { session_id: memory.sessionId })
  }

  const recordBlock = (id, notes) => {
    memory.appendEpisodic({
      event_type: 'gate_blocked',
      gate: id,
      outcome: 'block',
      notes,
    })
  }

  const advance = (id) => {
    const verified = registry.verify(id)
    if (!verified.ok) {
      const notes = verified.reasons.join('; ')
      recordBlock(id, notes)
      throw new GateError(`cannot advance ${id}: ${notes}`, verified.exitCode)
    }
    const verdict = evaluate(id)
    if (verdict.verdict === 'fail') {
      recordBlock(id, verdict.notes)
      throw new GateError(
        `cannot advance ${id}: evaluator verdict fail (${verdict.notes})`,
        2,
      )
    }
    const gate = registry.markPassed(id)
    memory.appendEpisodic({
      event_type: 'gate_passed',
      gate: id,
      outcome: verdict.verdict === 'warn' ? 'warn' : 'pass',
      artifacts: verdict.artifacts_reviewed,
      notes: verdict.notes,
    })
    return { gate, verdict, memory }
  }

  const service = {
    name,
    registry,
    evaluator,
    memory,
    events,
    current: () => registry.current(),
    verify: (id) => registry.verify(id),
    evaluate,
    advance,
    markPassed: (id) => registry.markPassed(id),
    remember: (input) => memory.writeSemantic(input),
    reflect: (entry) => memory.appendCorrection(entry),
    revertMemory: () => memory.revertLast(),
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
