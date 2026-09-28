import { describe, it, expect, vi } from 'vitest'
import { installLazyTimelapse } from '../timelapse-lazy.js'

function harness() {
  const handlers = []
  const chrome = { player: { ontoggle: (fn) => handlers.push(fn) } }
  const real = { toggle: vi.fn(async () => {}), reset: vi.fn(async () => {}) }
  const installTimelapse = vi.fn(() => real)
  const load = vi.fn(async () => ({ installTimelapse }))
  const lazy = installLazyTimelapse({}, {}, {}, chrome, load)
  return { handlers, chrome, real, installTimelapse, load, lazy }
}

describe('installLazyTimelapse', () => {
  it('loads nothing until play is pressed', () => {
    const { load, installTimelapse } = harness()
    expect(load).not.toHaveBeenCalled()
    expect(installTimelapse).not.toHaveBeenCalled()
  })

  it('loads and installs on the first press, then replays that press', async () => {
    const { handlers, load, installTimelapse, real } = harness()
    await handlers[0]()
    expect(load).toHaveBeenCalledTimes(1)
    expect(installTimelapse).toHaveBeenCalledTimes(1)
    expect(real.toggle).toHaveBeenCalledTimes(1)
  })

  it('leaves later presses to the island handler', async () => {
    const { handlers, load, real } = harness()
    await handlers[0]()
    await handlers[0]()
    expect(load).toHaveBeenCalledTimes(1)
    expect(real.toggle).toHaveBeenCalledTimes(1)
  })

  it('ignores a second press while the first is still loading', async () => {
    const { handlers, load } = harness()
    const first = handlers[0]()
    await handlers[0]()
    await first
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('resets as a no-op before load and delegates after', async () => {
    const { handlers, lazy, real } = harness()
    await lazy.reset()
    expect(real.reset).not.toHaveBeenCalled()
    await handlers[0]()
    await lazy.reset()
    expect(real.reset).toHaveBeenCalledTimes(1)
  })

  it('allows a retry after a failed load', async () => {
    const handlers = []
    const chrome = { player: { ontoggle: (fn) => handlers.push(fn) } }
    const real = { toggle: vi.fn(async () => {}), reset: vi.fn() }
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ installTimelapse: () => real })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    installLazyTimelapse({}, {}, {}, chrome, load)
    await handlers[0]()
    await handlers[0]()
    expect(real.toggle).toHaveBeenCalledTimes(1)
  })

  it('returns null without a player', () => {
    expect(installLazyTimelapse({}, {}, {}, {})).toBeNull()
  })
})
