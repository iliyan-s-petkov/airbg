// OpenProject #584: every localStorage/sessionStorage key this app writes must
// be in internal/web/static/storage-keys.json, the published allow-list.
//
// Static source scan, not a hand-written key list: a write call added
// anywhere under web/src fails this test unless its key resolves (as a string
// literal, or a `const NAME = 'literal'` it references) to an allowed value.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(here, '..')
const allowListPath = path.resolve(here, '../../../internal/web/static/storage-keys.json')

// lib/storage.js defines writeFlag/writeChoice/setItem generically; its own
// parameter names (`key`) are not literal keys, so it is excluded from the
// scan rather than flagged as a dynamic key.
const storageJs = path.join(srcDir, 'lib', 'storage.js')

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (/\.(js|svelte)$/.test(entry.name)) acc.push(full)
  }
  return acc
}

describe('localStorage allow-list (#584)', () => {
  const allowList = JSON.parse(fs.readFileSync(allowListPath, 'utf8'))
  const allowed = new Set([...(allowList.localStorage ?? []), ...(allowList.sessionStorage ?? [])])
  const files = walk(srcDir)

  // Every `const NAME = 'literal'` in the tree, so a call site that passes an
  // imported constant (e.g. writeFlag(AUTO_KEY, ...)) resolves to its value.
  const constants = new Map()
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/const\s+(\w+)\s*=\s*(['"])((?:(?!\2).)*)\2/g)) {
      constants.set(m[1], m[3])
    }
  }

  function resolve(arg) {
    const literal = arg.match(/^(['"])((?:(?!\1).)*)\1$/)
    if (literal) return literal[2]
    return constants.has(arg) ? constants.get(arg) : null
  }

  it('every storage write uses a key in the allow-list', () => {
    const problems = []
    const callPattern = /(?:writeFlag|writeChoice|\.setItem)\(\s*([^,()]+)\s*,/g

    for (const file of files) {
      if (file === storageJs) continue
      const text = fs.readFileSync(file, 'utf8')
      const rel = path.relative(srcDir, file)
      for (const m of text.matchAll(callPattern)) {
        const key = resolve(m[1].trim())
        if (key === null) {
          problems.push(`${rel}: dynamic/unresolvable storage key in \`${m[0]}\``)
        } else if (!allowed.has(key)) {
          problems.push(`${rel}: storage key "${key}" is not in the allow-list`)
        }
      }
    }
    expect(problems).toEqual([])
  })
})
