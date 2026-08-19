/**
 * Independent Evaluator — fresh-context service.
 *
 * Each evaluate() call sees only the request payload (gate id, artifact
 * snapshots, CONTRACT/SPEC text). It does not receive generator chat,
 * self-scores, or prior session memory. That is the A003 separation.
 *
 * Default judge is mechanical and adversarial (no API key). An optional
 * `judge` callback may supply scores; they are still schema-validated and
 * praise-stripped before return.
 */

import { randomBytes } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  clampScore,
  overallScore,
  stripPraise,
  validateVerdict,
  verdictFrom,
} from './verdict.js'

const REQUEST_KEYS = new Set([
  'gate',
  'session_id',
  'artifacts',
  'contract',
  'spec',
  'gate_spec',
])

const STUB_MARKERS = [
  'todo',
  'tbd',
  'placeholder',
  'coming soon',
  'lorem ipsum',
  '[project name]',
  'not implemented',
]

export class EvaluatorError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message)
    this.name = 'EvaluatorError'
  }
}

/**
 * Drop generator-contaminated fields so the judge cannot see them.
 * @param {object} raw
 */
export function isolateRequest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new EvaluatorError('evaluate request must be an object')
  }
  if (typeof raw.gate !== 'string' || !raw.gate.trim()) {
    throw new EvaluatorError('request.gate is required')
  }
  /** @type {object} */
  const clean = {
    gate: raw.gate.trim(),
    session_id: typeof raw.session_id === 'string' && raw.session_id.trim()
      ? raw.session_id.trim()
      : randomBytes(4).toString('hex'),
    artifacts: normalizeArtifacts(raw.artifacts),
    contract: typeof raw.contract === 'string' ? raw.contract : '',
    spec: typeof raw.spec === 'string' ? raw.spec : '',
    gate_spec: raw.gate_spec && typeof raw.gate_spec === 'object' ? { ...raw.gate_spec } : {},
  }
  const leaked = Object.keys(raw).filter((key) => !REQUEST_KEYS.has(key))
  if (leaked.length) {
    // Isolation, not a hard error: drop generator_self_score / chat_history / etc.
    clean._dropped = leaked
  }
  return clean
}

/**
 * @param {unknown} artifacts
 * @returns {{ path: string, content: string | null, missing: boolean }[]}
 */
function normalizeArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) return []
  return artifacts.map((item, index) => {
    if (typeof item === 'string') {
      return { path: item, content: null, missing: true }
    }
    if (!item || typeof item !== 'object') {
      throw new EvaluatorError(`artifacts[${index}] must be a path or { path, content }`)
    }
    const path = String(item.path ?? '')
    if (!path) throw new EvaluatorError(`artifacts[${index}].path is required`)
    const missing = item.missing === true || item.content == null
    return {
      path,
      content: missing ? null : String(item.content),
      missing,
    }
  })
}

/**
 * @param {string} text
 */
function headingOnly(text) {
  const body = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('---'))
  return body.length === 0
}

/**
 * @param {string} text
 */
function looksStub(text) {
  const lower = text.toLowerCase()
  return STUB_MARKERS.some((marker) => lower.includes(marker))
}

/**
 * Mechanical adversarial judge. Default is skepticism.
 * @param {ReturnType<typeof isolateRequest>} request
 */
export function mechanicalJudge(request) {
  /** @type {{ artifact: string, severity: 'high'|'medium'|'low', description: string }[]} */
  const issues = []
  const reviewed = request.artifacts.map((art) => art.path)
  const required = Array.isArray(request.gate_spec?.requires_artifacts)
    ? request.gate_spec.requires_artifacts.map(String)
    : request.artifacts.map((art) => art.path)

  let present = 0
  let substantial = 0
  for (const art of request.artifacts) {
    if (art.missing || art.content == null) {
      issues.push({
        artifact: art.path,
        severity: 'high',
        description: `${art.path} is missing`,
      })
      continue
    }
    const text = art.content.trim()
    if (!text) {
      issues.push({
        artifact: art.path,
        severity: 'high',
        description: `${art.path} is empty`,
      })
      continue
    }
    present += 1
    if (headingOnly(text)) {
      issues.push({
        artifact: art.path,
        severity: 'high',
        description: `${art.path} has no content beyond the heading`,
      })
      continue
    }
    if (looksStub(text)) {
      issues.push({
        artifact: art.path,
        severity: 'medium',
        description: `${art.path} still contains placeholder or stub language`,
      })
      continue
    }
    substantial += 1
  }

  for (const rel of required) {
    if (!request.artifacts.some((art) => art.path === rel || art.path.endsWith(rel))) {
      issues.push({
        artifact: rel,
        severity: 'high',
        description: `${rel} is required by the gate spec and was not reviewed`,
      })
    }
  }

  const contract = request.contract.trim()
  const spec = request.spec.trim()
  if (contract && spec) {
    const outSection = contract.toLowerCase().split('out of scope')[1] ?? ''
    const forbidden = [...outSection.matchAll(/^\s*[-*]\s+(.+)$/gm)].map((m) => m[1].trim())
    for (const item of forbidden) {
      if (item.length >= 8 && spec.toLowerCase().includes(item.toLowerCase().slice(0, 40))) {
        issues.push({
          artifact: 'SPEC.md',
          severity: 'high',
          description: `SPEC.md contradicts CONTRACT.md out-of-scope item: ${item.slice(0, 80)}`,
        })
      }
    }
  }

  const n = Math.max(required.length, request.artifacts.length, 1)
  const completeness = clampScore((present / n) * 10)
  const quality = clampScore((substantial / n) * 10)
  const highCount = issues.filter((issue) => issue.severity === 'high').length
  const mediumCount = issues.filter((issue) => issue.severity === 'medium').length
  let consistency = highCount > 0 && issues.some((i) => /contradict/.test(i.description))
    ? 2
    : highCount > 0
      ? 5
      : 8
  let spec_adherence = required.length === 0
    ? 8
    : clampScore(((required.length - highCount) / required.length) * 10)
  if (mediumCount > 0) {
    consistency = Math.min(consistency, 6)
    spec_adherence = Math.min(spec_adherence, 6)
  }

  return {
    scores: {
      completeness,
      quality,
      consistency,
      spec_adherence,
    },
    issues,
    reviewed,
  }
}

export class Evaluator {
  /**
   * @param {{ judge?: Function, emit?: Function, name?: string }} [options]
   */
  constructor(options = {}) {
    this.judge = options.judge ?? mechanicalJudge
    this.emit = options.emit
    this.name = options.name ?? 'gate-evaluator'
    /** @type {object[]} */
    this.history = []
  }

  /**
   * Fresh-context evaluation. Returns portfolio-kit verdict JSON only.
   * @param {object} rawRequest
   */
  evaluate(rawRequest) {
    const request = isolateRequest(rawRequest)
    const judged = this.judge(request) ?? {}
    const scores = {
      completeness: clampScore(judged.scores?.completeness ?? 0),
      quality: clampScore(judged.scores?.quality ?? 0),
      consistency: clampScore(judged.scores?.consistency ?? 0),
      spec_adherence: clampScore(judged.scores?.spec_adherence ?? 0),
    }
    const issues = Array.isArray(judged.issues)
      ? judged.issues.map((issue) => ({
        artifact: String(issue.artifact ?? request.gate),
        severity: issue.severity === 'high' || issue.severity === 'low' ? issue.severity : 'medium',
        description: stripPraise(issue.description || 'unspecified finding'),
      }))
      : []
    const overall = overallScore(scores)
    const verdict = verdictFrom(overall, issues)
    const decisive = issues[0]?.description ?? 'No high-severity gaps in the reviewed artifacts.'
    const notes = stripPraise(judged.notes || decisive).slice(0, 500) || decisive.slice(0, 500)

    const result = validateVerdict({
      gate: request.gate,
      session_id: request.session_id,
      timestamp: new Date().toISOString(),
      evaluator: this.name,
      artifacts_reviewed: Array.isArray(judged.reviewed) ? judged.reviewed : request.artifacts.map((a) => a.path),
      scores,
      overall,
      issues,
      verdict,
      notes,
    })

    this.history.push({ gate: result.gate, session_id: result.session_id, verdict: result.verdict })
    this.emit?.('evaluator.verdict', result)
    return result
  }

  /**
   * Build a request from files on disk — still a fresh payload, no generator state.
   * @param {string} gateId
   * @param {object} gate
   * @param {string} workspaceRoot
   * @param {{ session_id?: string }} [opts]
   */
  evaluateWorkspace(gateId, gate, workspaceRoot, opts = {}) {
    const root = resolve(workspaceRoot)
    const paths = [
      ...(gate?.requires_artifacts ?? []),
    ]
    const artifacts = paths.map((rel) => {
      const abs = join(root, rel)
      try {
        const st = statSync(abs)
        if (st.isDirectory()) {
          return { path: rel, content: `(directory ${rel})`, missing: false }
        }
        return { path: rel, content: readFileSync(abs, 'utf8'), missing: false }
      } catch {
        return { path: rel, content: null, missing: true }
      }
    })
    const readOptional = (name) => {
      try {
        return readFileSync(join(root, name), 'utf8')
      } catch {
        return ''
      }
    }
    return this.evaluate({
      gate: gateId,
      session_id: opts.session_id,
      artifacts,
      contract: readOptional('CONTRACT.md'),
      spec: readOptional('SPEC.md'),
      gate_spec: {
        id: gate?.id,
        label: gate?.label,
        type: gate?.type,
        requires_artifacts: gate?.requires_artifacts ?? [],
      },
    })
  }
}
