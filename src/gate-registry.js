/**
 * GateRegistry — portfolio-kit / Meridian gate DAG, without a second language.
 *
 * Mechanical pass for this increment:
 *   dependencies passed + required artifacts exist and are non-empty.
 * Optional built-in pre-hooks: artifacts_exist, tests_exist.
 * Shell hooks are not executed (arbitrary command execution is out of scope).
 */

import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'

const GATE_TYPES = new Set(['automated', 'human_approval'])
const ON_FAIL = new Set(['block_all_writes', 'block_gate_writes', 'warn'])
const BUILTIN_HOOKS = new Set(['artifacts_exist', 'tests_exist'])

export class GateError extends Error {
  /**
   * @param {string} message
   * @param {number} [exitCode]
   */
  constructor(message, exitCode = 2) {
    super(message)
    this.name = 'GateError'
    this.exitCode = exitCode
  }
}

/**
 * @param {string} text
 * @param {string} [source]
 */
export function parseGatesDocument(text, source = 'gates.yaml') {
  let raw
  try {
    raw = parseYaml(text)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new GateError(`${source}: invalid YAML (${reason})`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new GateError(`${source}: document must be a mapping`)
  }
  if (!Array.isArray(raw.gates) || raw.gates.length === 0) {
    throw new GateError(`${source}: gates must be a non-empty list`)
  }

  /** @type {Map<string, object>} */
  const byId = new Map()
  for (const [index, gate] of raw.gates.entries()) {
    const loc = `${source} gates[${index}]`
    if (!gate || typeof gate !== 'object') {
      throw new GateError(`${loc}: expected a mapping`)
    }
    for (const key of ['id', 'label', 'type']) {
      if (typeof gate[key] !== 'string' || !gate[key].trim()) {
        throw new GateError(`${loc}: missing ${key}`)
      }
    }
    if (!GATE_TYPES.has(gate.type)) {
      throw new GateError(`${loc}: type must be automated | human_approval`)
    }
    if (byId.has(gate.id)) {
      throw new GateError(`${source}: duplicate gate id ${gate.id}`)
    }
    const onFail = gate.on_fail ?? 'block_all_writes'
    if (!ON_FAIL.has(onFail)) {
      throw new GateError(`${loc}: invalid on_fail`)
    }
    const requires = Array.isArray(gate.requires) ? gate.requires.map(String) : []
    const artifacts = Array.isArray(gate.requires_artifacts)
      ? gate.requires_artifacts.map(String)
      : []
    const pre = Array.isArray(gate.hooks?.pre) ? gate.hooks.pre.map(String) : []
    for (const hook of pre) {
      if (!BUILTIN_HOOKS.has(hook)) {
        throw new GateError(
          `${loc}: unknown pre-hook ${hook} (built-ins: ${[...BUILTIN_HOOKS].join(', ')})`,
        )
      }
    }
    byId.set(gate.id, {
      id: gate.id,
      label: gate.label,
      type: gate.type,
      required: gate.required !== false,
      approval_token: gate.approval_token,
      requires,
      requires_artifacts: artifacts,
      hooks: { pre, post: Array.isArray(gate.hooks?.post) ? gate.hooks.post.map(String) : [] },
      emits: gate.emits,
      on_fail: onFail,
    })
  }

  for (const gate of byId.values()) {
    for (const dep of gate.requires) {
      if (!byId.has(dep)) {
        throw new GateError(`${source}: gate ${gate.id} requires unknown ${dep}`)
      }
    }
  }

  const cycle = findCycle(byId)
  if (cycle) {
    throw new GateError(`${source}: circular dependency ${cycle.join(' → ')}`)
  }

  return {
    version: String(raw.version ?? '1.0'),
    project: raw.project ?? {},
    gates: [...byId.values()],
    byId,
  }
}

/**
 * @param {Map<string, { id: string, requires: string[] }>} byId
 * @returns {string[] | null}
 */
function findCycle(byId) {
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map([...byId.keys()].map((id) => [id, WHITE]))
  /** @type {string[]} */
  const stack = []

  const visit = (id) => {
    color.set(id, GRAY)
    stack.push(id)
    for (const dep of byId.get(id)?.requires ?? []) {
      if (color.get(dep) === GRAY) {
        const start = stack.indexOf(dep)
        return [...stack.slice(start), dep]
      }
      if (color.get(dep) === WHITE) {
        const hit = visit(dep)
        if (hit) return hit
      }
    }
    stack.pop()
    color.set(id, BLACK)
    return null
  }

  for (const id of byId.keys()) {
    if (color.get(id) === WHITE) {
      const hit = visit(id)
      if (hit) return hit
    }
  }
  return null
}

export class GateRegistry {
  /**
   * @param {object} document
   * @param {{ workspaceRoot?: string, emit?: Function }} [options]
   */
  constructor(document, options = {}) {
    this.document = document
    this.workspaceRoot = options.workspaceRoot ? resolve(options.workspaceRoot) : process.cwd()
    this.emit = options.emit
    /** @type {Set<string>} */
    this.passed = new Set()
  }

  /**
   * @param {string} filePath
   * @param {{ workspaceRoot?: string, emit?: Function }} [options]
   */
  static fromFile(filePath, options = {}) {
    const abs = resolve(filePath)
    const text = readFileSync(abs, 'utf8')
    const workspaceRoot = options.workspaceRoot ?? dirname(abs)
    return new GateRegistry(parseGatesDocument(text, abs), { ...options, workspaceRoot })
  }

  /**
   * @param {string} id
   */
  get(id) {
    const gate = this.document.byId.get(id)
    if (!gate) throw new GateError(`unknown gate ${id}`)
    return gate
  }

  /**
   * Next required gate whose dependencies are all passed.
   * @returns {object | null}
   */
  current() {
    for (const gate of this.document.gates) {
      if (this.passed.has(gate.id)) continue
      if (!gate.required) continue
      if (this.canProceed(gate.id)) return gate
    }
    return null
  }

  /**
   * @param {string} id
   */
  canProceed(id) {
    const gate = this.get(id)
    return gate.requires.every((dep) => this.passed.has(dep))
  }

  /**
   * Mechanical verify. Exit 2 on failure — the model cannot talk past this.
   * @param {string} id
   */
  verify(id) {
    const gate = this.get(id)
    /** @type {string[]} */
    const reasons = []

    if (!this.canProceed(id)) {
      const missing = gate.requires.filter((dep) => !this.passed.has(dep))
      reasons.push(`dependencies not passed: ${missing.join(', ')}`)
    }

    const hooks = gate.hooks.pre.length > 0
      ? gate.hooks.pre
      : gate.requires_artifacts.length > 0
        ? ['artifacts_exist']
        : []

    for (const hook of hooks) {
      reasons.push(...this.#runBuiltin(hook, gate))
    }

    const ok = reasons.length === 0
    const result = {
      ok,
      exitCode: ok ? 0 : 2,
      gate,
      reasons,
    }
    this.emit?.('gate.verified', result)
    if (!ok) this.emit?.('gate.failed', result)
    return result
  }

  /**
   * @param {string} id
   */
  markPassed(id) {
    const verified = this.verify(id)
    if (!verified.ok) {
      throw new GateError(
        `cannot pass ${id}: ${verified.reasons.join('; ')}`,
        verified.exitCode,
      )
    }
    this.passed.add(id)
    this.emit?.('gate.passed', { gate: this.get(id) })
    return this.get(id)
  }

  /**
   * Deny a tool when the current required gate is mechanically failing
   * and on_fail is a block variant.
   * @param {{ name?: string }} exec
   * @returns {{ kind: 'allow' } | { kind: 'deny', reason: string }}
   */
  preExecuteDecision(exec) {
    const gate = this.current()
    if (!gate) return { kind: 'allow' }
    if (gate.on_fail === 'warn') return { kind: 'allow' }
    const verified = this.verify(gate.id)
    if (verified.ok) return { kind: 'allow' }
    const tool = exec?.name ?? '(unknown tool)'
    return {
      kind: 'deny',
      reason: `honesty-gate blocked ${tool} at ${gate.id}: ${verified.reasons.join('; ')}`,
    }
  }

  /**
   * @param {string} hook
   * @param {object} gate
   * @returns {string[]}
   */
  #runBuiltin(hook, gate) {
    if (hook === 'artifacts_exist') {
      return this.#missingArtifacts(gate.requires_artifacts)
    }
    if (hook === 'tests_exist') {
      const candidates = gate.requires_artifacts.length > 0
        ? gate.requires_artifacts
        : ['tests', 'test', 'package.json']
      const missing = this.#missingArtifacts(candidates)
      if (missing.length === 0) return []
      return [`tests_exist failed: ${missing.join('; ')}`]
    }
    return [`unknown hook ${hook}`]
  }

  /**
   * @param {string[]} relativePaths
   * @returns {string[]}
   */
  #missingArtifacts(relativePaths) {
    /** @type {string[]} */
    const missing = []
    for (const rel of relativePaths) {
      const abs = join(this.workspaceRoot, rel)
      try {
        const st = statSync(abs)
        if (st.isDirectory()) continue
        if (st.size === 0) missing.push(`${rel} is empty`)
      } catch {
        missing.push(`${rel} is missing`)
      }
    }
    return missing
  }
}
