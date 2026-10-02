// @vitest-environment jsdom
//
// theme-init.js is a classic script that runs before paint; evaluate its
// source against a storage double and read what it did to documentElement.
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../internal/web/static/theme-init.js'),
  'utf8',
)

function run(items) {
  const localStorage = { getItem: (k) => (k in items ? items[k] : null) }
  new Function('localStorage', 'document', src)(localStorage, document)
  return document.documentElement.dataset.theme
}

describe('theme-init.js', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme
  })

  it('applies the kanarche:theme choice', () => {
    expect(run({ 'kanarche:theme': 'dark' })).toBe('dark')
  })

  it('falls back to the pre-rename airbg:theme choice', () => {
    expect(run({ 'airbg:theme': 'light' })).toBe('light')
  })

  it('prefers the new key over the old one', () => {
    expect(run({ 'kanarche:theme': 'light', 'airbg:theme': 'dark' })).toBe('light')
  })

  it('applies nothing for no choice or an unknown value', () => {
    expect(run({})).toBeUndefined()
    expect(run({ 'kanarche:theme': 'sepia' })).toBeUndefined()
  })
})
