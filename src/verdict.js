/**
 * portfolio-kit Evaluator verdict helpers (contract 0.1.0).
 * Stdlib only — no jsonschema dependency.
 */

const SCORE_KEYS = ['completeness', 'quality', 'consistency', 'spec_adherence']
const VERDICTS = new Set(['pass', 'warn', 'fail'])
const SEVERITIES = new Set(['high', 'medium', 'low'])
const FORBIDDEN_PRAISE = [
  'great',
  'excellent',
  'well done',
  'looks good',
  'solid work',
  'minor issue',
  'just a small thing',
  'overall this is good but',
]

export const WEIGHTS = {
  completeness: 0.3,
  quality: 0.25,
  consistency: 0.2,
  spec_adherence: 0.25,
}

/**
 * @param {number} value
 */
export function clampScore(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.min(10, Math.max(0, value))
}

/**
 * @param {{ completeness: number, quality: number, consistency: number, spec_adherence: number }} scores
 */
export function overallScore(scores) {
  const total = SCORE_KEYS.reduce((sum, key) => sum + clampScore(scores[key]) * WEIGHTS[key], 0)
  return Math.round(total * 10) / 10
}

/**
 * @param {number} overall
 * @param {{ severity: string }[]} issues
 */
export function verdictFrom(overall, issues) {
  const high = issues.some((issue) => issue.severity === 'high')
  if (overall < 5 || high) return 'fail'
  if (overall < 7) return 'warn'
  return 'pass'
}

/**
 * @param {string} text
 */
export function stripPraise(text) {
  let out = String(text ?? '')
  for (const phrase of FORBIDDEN_PRAISE) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    out = out.replace(re, '')
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * @param {object} verdict
 * @param {string} [where]
 */
export function validateVerdict(verdict, where = 'verdict') {
  if (!verdict || typeof verdict !== 'object' || Array.isArray(verdict)) {
    throw new Error(`${where}: expected object`)
  }
  const extra = Object.keys(verdict).filter((key) => ![
    'gate',
    'session_id',
    'timestamp',
    'evaluator',
    'artifacts_reviewed',
    'scores',
    'overall',
    'issues',
    'verdict',
    'notes',
  ].includes(key))
  if (extra.length) throw new Error(`${where}: unexpected keys ${extra.join(', ')}`)

  for (const key of ['gate', 'session_id', 'timestamp', 'evaluator', 'notes']) {
    if (typeof verdict[key] !== 'string' || !verdict[key].trim()) {
      throw new Error(`${where}: missing ${key}`)
    }
  }
  if (!verdict.timestamp.includes('T')) {
    throw new Error(`${where}: timestamp must be ISO-8601`)
  }
  if (!Array.isArray(verdict.artifacts_reviewed)) {
    throw new Error(`${where}: artifacts_reviewed must be an array`)
  }
  if (!verdict.scores || typeof verdict.scores !== 'object') {
    throw new Error(`${where}: scores must be an object`)
  }
  for (const key of SCORE_KEYS) {
    const val = verdict.scores[key]
    if (typeof val !== 'number' || val < 0 || val > 10) {
      throw new Error(`${where}: scores.${key} must be 0-10`)
    }
  }
  if (typeof verdict.overall !== 'number' || verdict.overall < 0 || verdict.overall > 10) {
    throw new Error(`${where}: overall must be 0-10`)
  }
  if (!VERDICTS.has(verdict.verdict)) {
    throw new Error(`${where}: bad verdict`)
  }
  if (!Array.isArray(verdict.issues)) {
    throw new Error(`${where}: issues must be an array`)
  }
  for (const [i, issue] of verdict.issues.entries()) {
    if (!issue || typeof issue !== 'object') throw new Error(`${where}.issues[${i}]: expected object`)
    if (typeof issue.artifact !== 'string' || typeof issue.description !== 'string') {
      throw new Error(`${where}.issues[${i}]: missing artifact/description`)
    }
    if (!SEVERITIES.has(issue.severity)) {
      throw new Error(`${where}.issues[${i}]: bad severity`)
    }
  }
  if (verdict.notes.length > 500) {
    throw new Error(`${where}: notes exceed 500 chars`)
  }
  return verdict
}
