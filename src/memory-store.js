/**
 * Schema-validated three-tier memory (portfolio-kit / Meridian contract 0.1.0).
 *
 * semantic.json          — patterns[], deduped by SHA-256 hash
 * episodic.jsonl         — append-only session / gate events
 * corrections.jsonl      — append-only reflexion entries
 *
 * Invalid writes fail closed. Writes are reversible (pop last effect).
 */

import { createHash, randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

export class MemoryError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message)
    this.name = 'MemoryError'
  }
}

const EPISODIC_TYPES = new Set([
  'session_start',
  'session_end',
  'gate_passed',
  'gate_blocked',
  'stop_event',
  'feature_complete',
  'error_logged',
])
const OUTCOMES = new Set(['pass', 'fail', 'warn', 'block'])
const CONFIDENCE = new Set(['LOW', 'MEDIUM', 'HIGH'])
const PATTERN_ID = /^PAT-[A-Z0-9]+-[0-9]{3}$/
const HASH64 = /^[a-f0-9]{64}$/
const SESSION8 = /^[a-f0-9]{8}$/

/**
 * @param {string} value
 * @param {string} where
 */
function requireIso(value, where) {
  if (typeof value !== 'string' || !value.includes('T')) {
    throw new MemoryError(`${where}: expected ISO-8601 date-time`)
  }
}

/**
 * @param {object} obj
 * @param {string[]} allowed
 * @param {string} where
 */
function rejectExtra(obj, allowed, where) {
  const extra = Object.keys(obj).filter((key) => !allowed.includes(key))
  if (extra.length) throw new MemoryError(`${where}: unexpected keys ${extra.join(', ')}`)
}

/**
 * @param {object} pattern
 * @param {string} [where]
 */
export function validateSemanticPattern(pattern, where = 'semantic_pattern') {
  if (!pattern || typeof pattern !== 'object') throw new MemoryError(`${where}: expected object`)
  rejectExtra(pattern, [
    'pattern_id', 'description', 'context', 'confidence', 'validated_count',
    'hash', 'created', 'last_validated', 'source_projects',
  ], where)
  if (!PATTERN_ID.test(pattern.pattern_id ?? '')) {
    throw new MemoryError(`${where}: pattern_id must match PAT-XXXX-000`)
  }
  if (typeof pattern.description !== 'string' || pattern.description.length < 10 || pattern.description.length > 500) {
    throw new MemoryError(`${where}: description must be 10-500 chars`)
  }
  if (typeof pattern.context !== 'string' || pattern.context.length < 10) {
    throw new MemoryError(`${where}: context must be at least 10 chars`)
  }
  if (!CONFIDENCE.has(pattern.confidence)) {
    throw new MemoryError(`${where}: confidence must be LOW|MEDIUM|HIGH`)
  }
  if (!Number.isInteger(pattern.validated_count) || pattern.validated_count < 1) {
    throw new MemoryError(`${where}: validated_count must be integer >= 1`)
  }
  if (!HASH64.test(pattern.hash ?? '')) {
    throw new MemoryError(`${where}: hash must be 64 hex chars`)
  }
  requireIso(pattern.created, `${where}.created`)
  requireIso(pattern.last_validated, `${where}.last_validated`)
  if (pattern.source_projects !== undefined) {
    if (!Array.isArray(pattern.source_projects) || pattern.source_projects.some((p) => typeof p !== 'string')) {
      throw new MemoryError(`${where}: source_projects must be string[]`)
    }
  }
  return pattern
}

/**
 * @param {object} file
 * @param {string} [where]
 */
export function validateSemanticFile(file, where = 'semantic.json') {
  if (!file || typeof file !== 'object') throw new MemoryError(`${where}: expected object`)
  rejectExtra(file, ['schema_version', 'memory_type', 'project', 'patterns', 'last_updated'], where)
  if (file.schema_version !== '1.0' || file.memory_type !== 'semantic') {
    throw new MemoryError(`${where}: schema_version/memory_type mismatch`)
  }
  if (!Array.isArray(file.patterns)) throw new MemoryError(`${where}: patterns must be an array`)
  file.patterns.forEach((pattern, i) => validateSemanticPattern(pattern, `${where}.patterns[${i}]`))
  if (file.last_updated) requireIso(file.last_updated, `${where}.last_updated`)
  if (file.project !== undefined && typeof file.project !== 'string') {
    throw new MemoryError(`${where}: project must be a string`)
  }
  return file
}

/**
 * @param {object} event
 * @param {string} [where]
 */
export function validateEpisodic(event, where = 'episodic') {
  if (!event || typeof event !== 'object') throw new MemoryError(`${where}: expected object`)
  rejectExtra(event, [
    'timestamp', 'event_type', 'session_id', 'gate', 'project', 'outcome', 'notes', 'artifacts',
  ], where)
  requireIso(event.timestamp, `${where}.timestamp`)
  if (!EPISODIC_TYPES.has(event.event_type)) {
    throw new MemoryError(`${where}: unknown event_type`)
  }
  if (!SESSION8.test(event.session_id ?? '')) {
    throw new MemoryError(`${where}: session_id must be 8 hex chars`)
  }
  if (event.outcome !== undefined && !OUTCOMES.has(event.outcome)) {
    throw new MemoryError(`${where}: bad outcome`)
  }
  if (event.notes !== undefined && (typeof event.notes !== 'string' || event.notes.length > 1000)) {
    throw new MemoryError(`${where}: notes too long`)
  }
  if (event.artifacts !== undefined) {
    if (!Array.isArray(event.artifacts) || event.artifacts.some((a) => typeof a !== 'string')) {
      throw new MemoryError(`${where}: artifacts must be string[]`)
    }
  }
  return event
}

/**
 * @param {object} entry
 * @param {string} [where]
 */
export function validateCorrection(entry, where = 'correction') {
  if (!entry || typeof entry !== 'object') throw new MemoryError(`${where}: expected object`)
  rejectExtra(entry, [
    'session_id', 'gate', 'date', 'project', 'predicted_hours', 'actual_hours',
    'delta_ratio', 'variance_percent', 'root_cause', 'action_next',
    'semantic_pattern_id', 'errors_open', 'errors_close',
  ], where)
  if (!SESSION8.test(entry.session_id ?? '')) {
    throw new MemoryError(`${where}: session_id must be 8 hex chars`)
  }
  if (typeof entry.gate !== 'string' || !entry.gate) {
    throw new MemoryError(`${where}: gate is required`)
  }
  requireIso(entry.date, `${where}.date`)
  if (typeof entry.project !== 'string' || !entry.project) {
    throw new MemoryError(`${where}: project is required`)
  }
  if (typeof entry.root_cause !== 'string' || entry.root_cause.length < 10 || entry.root_cause.length > 2000) {
    throw new MemoryError(`${where}: root_cause must be 10-2000 chars`)
  }
  if (typeof entry.action_next !== 'string' || entry.action_next.length < 10 || entry.action_next.length > 1000) {
    throw new MemoryError(`${where}: action_next must be 10-1000 chars`)
  }
  if (entry.semantic_pattern_id !== undefined && !PATTERN_ID.test(entry.semantic_pattern_id)) {
    throw new MemoryError(`${where}: bad semantic_pattern_id`)
  }
  for (const key of ['predicted_hours', 'actual_hours']) {
    if (entry[key] !== undefined && !(typeof entry[key] === 'number' && entry[key] > 0)) {
      throw new MemoryError(`${where}: ${key} must be > 0`)
    }
  }
  for (const key of ['errors_open', 'errors_close']) {
    if (entry[key] !== undefined && !(Number.isInteger(entry[key]) && entry[key] >= 0)) {
      throw new MemoryError(`${where}: ${key} must be integer >= 0`)
    }
  }
  return entry
}

/**
 * @param {string} description
 * @param {string} context
 */
export function hashPattern(description, context) {
  return createHash('sha256').update(`${description}\n${context}`).digest('hex')
}

/**
 * @returns {string}
 */
export function newSessionId() {
  return randomBytes(4).toString('hex')
}

function emptySemantic(project) {
  return {
    schema_version: '1.0',
    memory_type: 'semantic',
    ...(project ? { project } : {}),
    patterns: [],
    last_updated: new Date().toISOString(),
  }
}

function readJsonl(path) {
  if (!existsSync(path)) return []
  const text = readFileSync(path, 'utf8')
  const rows = []
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line))
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new MemoryError(`${path}:${i + 1}: invalid JSON (${reason})`)
    }
  }
  return rows
}

function writeJsonl(path, rows) {
  const body = rows.length ? `${rows.map((row) => JSON.stringify(row)).join('\n')}\n` : ''
  writeFileSync(path, body, 'utf8')
}

export class MemoryStore {
  /**
   * @param {string} dir
   * @param {{ project?: string, emit?: Function, sessionId?: string }} [options]
   */
  constructor(dir, options = {}) {
    this.dir = resolve(dir)
    this.project = options.project ?? 'honesty-gate'
    this.emit = options.emit
    this.sessionId = options.sessionId ?? newSessionId()
    this.semanticPath = join(this.dir, 'semantic.json')
    this.episodicPath = join(this.dir, 'episodic.jsonl')
    this.correctionsPath = join(this.dir, 'corrections.jsonl')
    /** @type {{ type: string, undo: () => void }[]} */
    this.effects = []
    mkdirSync(this.dir, { recursive: true })
    this.#loadOrInit()
  }

  /**
   * @param {string} dir
   * @param {object} [options]
   */
  static open(dir, options = {}) {
    return new MemoryStore(dir, options)
  }

  #loadOrInit() {
    if (!existsSync(this.semanticPath)) {
      writeFileSync(this.semanticPath, `${JSON.stringify(emptySemantic(this.project), null, 2)}\n`, 'utf8')
    }
    const semantic = JSON.parse(readFileSync(this.semanticPath, 'utf8'))
    validateSemanticFile(semantic, this.semanticPath)
    const episodic = readJsonl(this.episodicPath)
    episodic.forEach((row, i) => validateEpisodic(row, `${this.episodicPath}:${i + 1}`))
    const corrections = readJsonl(this.correctionsPath)
    corrections.forEach((row, i) => validateCorrection(row, `${this.correctionsPath}:${i + 1}`))
    this.semantic = semantic
    this.episodic = episodic
    this.corrections = corrections
  }

  /**
   * Re-read disk. Throws MemoryError if any file is corrupt.
   */
  doctor() {
    this.#loadOrInit()
    return {
      ok: true,
      semantic: this.semantic.patterns.length,
      episodic: this.episodic.length,
      corrections: this.corrections.length,
    }
  }

  /**
   * @param {object} input
   */
  writeSemantic(input) {
    const now = new Date().toISOString()
    const description = input.description
    const context = input.context
    const hash = input.hash ?? hashPattern(String(description), String(context))
    const existing = this.semantic.patterns.find((p) => p.hash === hash)
    if (existing) {
      const before = { ...existing }
      existing.validated_count += 1
      existing.last_validated = now
      if (existing.validated_count >= 5) existing.confidence = 'HIGH'
      else if (existing.validated_count >= 2) existing.confidence = 'MEDIUM'
      if (input.source_projects) {
        const set = new Set([...(existing.source_projects ?? []), ...input.source_projects])
        existing.source_projects = [...set]
      }
      validateSemanticPattern(existing)
      this.semantic.last_updated = now
      this.#persistSemantic()
      this.#pushEffect('semantic', () => {
        Object.assign(existing, before)
        this.#persistSemantic()
      })
      this.emit?.('memory.write', { memory_type: 'semantic', validation: 'pass', duplicates_removed: 1 })
      return { pattern: existing, duplicate: true }
    }

    const nextIndex = this.semantic.patterns.length + 1
    const pattern = validateSemanticPattern({
      pattern_id: input.pattern_id ?? `PAT-HGATE-${String(nextIndex).padStart(3, '0')}`,
      description,
      context,
      confidence: input.confidence ?? 'LOW',
      validated_count: input.validated_count ?? 1,
      hash,
      created: input.created ?? now,
      last_validated: input.last_validated ?? now,
      ...(input.source_projects ? { source_projects: input.source_projects } : {}),
    })
    this.semantic.patterns.push(pattern)
    this.semantic.last_updated = now
    this.#persistSemantic()
    this.#pushEffect('semantic', () => {
      this.semantic.patterns = this.semantic.patterns.filter((p) => p.hash !== hash)
      this.#persistSemantic()
    })
    this.emit?.('memory.write', { memory_type: 'semantic', validation: 'pass', duplicates_removed: 0 })
    return { pattern, duplicate: false }
  }

  /**
   * @param {object} event
   */
  appendEpisodic(event) {
    const row = validateEpisodic({
      timestamp: event.timestamp ?? new Date().toISOString(),
      event_type: event.event_type,
      session_id: event.session_id ?? this.sessionId,
      ...(event.gate ? { gate: event.gate } : {}),
      project: event.project ?? this.project,
      ...(event.outcome ? { outcome: event.outcome } : {}),
      ...(event.notes ? { notes: event.notes } : {}),
      ...(event.artifacts ? { artifacts: event.artifacts } : {}),
    })
    this.episodic.push(row)
    this.#persistJsonl(this.episodicPath, this.episodic)
    this.#pushEffect('episodic', () => {
      this.episodic.pop()
      this.#persistJsonl(this.episodicPath, this.episodic)
    })
    this.emit?.('memory.write', { memory_type: 'episodic', validation: 'pass' })
    return row
  }

  /**
   * @param {object} entry
   */
  appendCorrection(entry) {
    const predicted = entry.predicted_hours
    const actual = entry.actual_hours
    const computed = {}
    if (typeof predicted === 'number' && typeof actual === 'number' && predicted > 0) {
      computed.delta_ratio = Math.round((actual / predicted) * 100) / 100
      computed.variance_percent = Math.round(((actual - predicted) / predicted) * 10000) / 100
    }
    const row = validateCorrection({
      session_id: entry.session_id ?? this.sessionId,
      gate: entry.gate,
      date: entry.date ?? new Date().toISOString(),
      project: entry.project ?? this.project,
      root_cause: entry.root_cause,
      action_next: entry.action_next,
      ...(predicted !== undefined ? { predicted_hours: predicted } : {}),
      ...(actual !== undefined ? { actual_hours: actual } : {}),
      ...computed,
      ...(entry.semantic_pattern_id ? { semantic_pattern_id: entry.semantic_pattern_id } : {}),
      ...(entry.errors_open !== undefined ? { errors_open: entry.errors_open } : {}),
      ...(entry.errors_close !== undefined ? { errors_close: entry.errors_close } : {}),
    })
    this.corrections.push(row)
    this.#persistJsonl(this.correctionsPath, this.corrections)
    this.#pushEffect('corrections', () => {
      this.corrections.pop()
      this.#persistJsonl(this.correctionsPath, this.corrections)
    })
    this.emit?.('memory.write', { memory_type: 'corrections', validation: 'pass' })
    return row
  }

  /**
   * Undo the most recent write (Cordis-style reversible effect).
   */
  revertLast() {
    const effect = this.effects.pop()
    if (!effect) throw new MemoryError('no reversible memory write to undo')
    effect.undo()
    this.emit?.('memory.reverted', { type: effect.type })
    return effect.type
  }

  #pushEffect(type, undo) {
    this.effects.push({ type, undo })
  }

  #persistSemantic() {
    writeFileSync(this.semanticPath, `${JSON.stringify(this.semantic, null, 2)}\n`, 'utf8')
  }

  #persistJsonl(path, rows) {
    writeJsonl(path, rows)
  }
}
