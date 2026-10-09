import type { Register } from 'claude-code'

// ---- Arabic/Persian shaping: logical letters -> presentation forms ----

// [isolated, final, initial, medial]; two forms = joins to the right only.
const FORMS: Record<string, number[]> = {}
// U+0621..U+064A map onto U+FE80.. in order; counts say how many forms each has.
const BASIC = 'ءآأؤإئابةتثجحخدذرزسشصضطظعغفقكلمنهوىي'
const COUNTS = [1, 2, 2, 2, 2, 4, 2, 4, 2, 4, 4, 4, 4, 4, 2, 2, 2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 4]
let at = 0xfe80
;[...BASIC].forEach((ch, i) => {
  const n = COUNTS[i] ?? 1
  FORMS[ch] = Array.from({ length: n }, (_, k) => at + k)
  at += n
})
const seq = (start: number, n = 4) => Array.from({ length: n }, (_, k) => start + k)
Object.assign(FORMS, {
  'پ': seq(0xfb56), 'چ': seq(0xfb7a), 'ژ': seq(0xfb8a, 2),
  'ک': seq(0xfb8e), 'گ': seq(0xfb92), 'ی': seq(0xfbfc),
})
// lam + alef ligatures: [isolated, final]
const LAM_ALEF: Record<string, number[]> = { 'آ': [0xfef5, 0xfef6], 'أ': [0xfef7, 0xfef8], 'إ': [0xfef9, 0xfefa], 'ا': [0xfefb, 0xfefc] }
const TATWEEL = 'ـ'
const isMark = (c: string) => /[ً-ٰٟۖ-ۭ]/.test(c)
const joinsBoth = (c?: string) => c === TATWEEL || (c !== undefined && (FORMS[c]?.length ?? 0) === 4)
const joinsRight = (c?: string) => c === TATWEEL || (c !== undefined && (FORMS[c]?.length ?? 0) >= 2)

type Unit = { s: string; opaque?: 'L' | 'R' }

function shape(units: Unit[]): Unit[] {
  const ch = (i: number) => (units[i]?.opaque ? undefined : units[i]?.s)
  const near = (i: number, step: number) => {
    let j = i + step
    while (ch(j) !== undefined && isMark(ch(j)!)) j += step
    return j
  }
  const out: Unit[] = []
  for (let i = 0; i < units.length; i++) {
    const c = ch(i)
    const forms = c === undefined ? undefined : FORMS[c]
    if (!forms) { out.push(units[i]!); continue }
    const joinPrev = joinsRight(c) && joinsBoth(ch(near(i, -1)))
    const n = near(i, 1)
    if (c === 'ل' && n === i + 1 && LAM_ALEF[ch(n) ?? '']) {
      out.push({ s: String.fromCharCode(LAM_ALEF[ch(n)!]![joinPrev ? 1 : 0]!) })
      i = n
      continue
    }
    const joinNext = forms.length === 4 && joinsRight(ch(n))
    const k = joinPrev && joinNext ? 3 : joinPrev ? 1 : joinNext ? 2 : 0
    out.push({ s: String.fromCharCode(forms[k] ?? forms[0]!) })
  }
  return out
}

// ---- bidi: logical -> visual order for one line (simplified UBA) ----

const RTL_CHAR = /[֐-ٟ٪-ۯۺ-ࣿיִ-﷿ﹰ-﻿]/
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«' }
const kind = (u: Unit): 'R' | 'L' | 'E' | 'N' =>
  u.opaque ?? (RTL_CHAR.test(u.s) ? 'R' : /\p{Nd}/u.test(u.s) ? 'E' : /\p{L}/u.test(u.s) ? 'L' : 'N')

function reorder(units: Unit[], rtl: boolean): Unit[] {
  // strong direction per unit: numbers stay LTR inside RTL text
  let lastStrong = rtl ? 'R' : 'L'
  const dir = units.map(u => {
    const k = kind(u)
    if (k === 'R' || k === 'L') lastStrong = k
    return k === 'E' ? (rtl ? 'L' : lastStrong === 'R' ? 'A' : 'L') : k
  })
  const strongAt = (i: number, step: number) => {
    for (let j = i; j >= 0 && j < dir.length; j += step) if (dir[j] !== 'N') return dir[j] === 'A' ? 'R' : dir[j]
    return rtl ? 'R' : 'L'
  }
  const levels = dir.map((d, i) => {
    if (d === 'N') {
      const a = strongAt(i, -1)
      d = a === strongAt(i, 1) ? a! : rtl ? 'R' : 'L'
    }
    return d === 'R' ? 1 : d === 'A' ? 2 : rtl ? 2 : 0
  })
  const out = units.map((u, i) => (levels[i]! % 2 && !u.opaque && MIRROR[u.s] ? { s: MIRROR[u.s]! } : u))
  for (let lv = Math.max(0, ...levels); lv >= 1; lv--) {
    for (let i = 0; i < out.length; ) {
      if (levels[i]! < lv) { i++; continue }
      let j = i
      while (j < out.length && levels[j]! >= lv) j++
      out.splice(i, j - i, ...out.slice(i, j).reverse())
      levels.splice(i, j - i, ...levels.slice(i, j).reverse())
      i = j
    }
  }
  return out
}

// ---- markdown-aware driver ----

const TOKEN = /(`+)[\s\S]*?\1|(!?\[)([^\]]*)(\]\([^)\s]*\))|[\s\S]/gu

function units(text: string): Unit[] {
  return [...text.matchAll(TOKEN)].map(m => {
    if (m[1]) return { s: m[0], opaque: 'L' as const } // inline code: untouched
    if (m[2]) return { s: m[2] + line(m[3]!, 0) + m[4], opaque: RTL_CHAR.test(m[3]!) ? 'R' as const : 'L' as const }
    return { s: m[0] }
  })
}

const width = (u: Unit) => (u.opaque ? u.s.length : isMark(u.s) || u.s === '‌' ? 0 : 1)

/** One markdown line to visual order; `cols` > 0 pre-wraps RTL lines so the terminal's own wrap never splits them. */
function line(text: string, cols: number): string {
  if (!RTL_CHAR.test(text)) return text
  const prefix = /^\s*(?:(?:[-*+]|\d+[.)]|#{1,6}|>)\s+)*/.exec(text)![0]
  const all = shape(units(text.slice(prefix.length)))
  const count = (k: string) => all.filter(u => kind(u) === k).length
  const rtl = count('R') > count('L')
  const room = cols - prefix.length
  let rows = [all]
  if (rtl && cols > 0) {
    // ponytail: greedy wrap at spaces; a word wider than the row overflows and the terminal wraps it
    const words: Unit[][] = [[]]
    for (const u of all) u.s === ' ' && !u.opaque ? words.push([]) : words.at(-1)!.push(u)
    rows = [[]]
    let used = 0
    for (const w of words) {
      const ww = w.reduce((a, u) => a + width(u), 0)
      if (used > 0 && used + 1 + ww > room) { rows.push([]); used = 0 }
      else if (rows.at(-1)!.length || used) { rows.at(-1)!.push({ s: ' ' }); used++ }
      rows.at(-1)!.push(...w)
      used += ww
    }
  }
  const pad = ' '.repeat(prefix.length)
  return rows.map((r, i) => (i ? pad : prefix) + reorder(r, rtl).map(u => u.s).join('')).join('\n')
}

/** Rewrites markdown so RTL text reads right on a terminal with no bidi/shaping. Code fences are left alone. */
export function rtl(markdown: string, cols = 0): string {
  let fence = ''
  return markdown.split('\n').map(l => {
    const f = /^\s*(`{3,}|~{3,})/.exec(l)?.[1]
    if (f && (!fence || f[0] === fence[0] && f.length >= fence.length)) { fence = fence ? '' : f; return l }
    return fence ? l : line(l, cols)
  }).join('\n')
}

// ---- hooks ----

const KEY = 'enabled'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'rtl', description: 'Persian/Arabic shaping in the terminal: on or off', argumentHint: 'on|off' })
    return next(e)
  })

  on('command.run', { command: 'rtl' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== 'on' && arg !== 'off') {
      const now = (await $.store.get(KEY)) !== false
      return { text: `rtl is ${now ? 'on' : 'off'}. Use /rtl on or /rtl off.` }
    }
    await $.store.set(KEY, arg === 'on')
    $.ui.invalidate('ui.render')
    return { text: `rtl ${arg}` }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || (await $.store.get(KEY)) === false) return next(e)
    const text = rtl(e.props.text, (e.viewport?.columns ?? 80) - 4)
    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })
}
