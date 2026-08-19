/**
 * Cordis plugin body: name + apply(ctx).
 * Matches dsh first-plugin / bundle tutorials.
 * GateRegistry does not require a live dsh process.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GateRegistry } from './gate-registry.js'

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

  const service = {
    name,
    registry,
    events,
    current: () => registry.current(),
    verify: (id) => registry.verify(id),
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
