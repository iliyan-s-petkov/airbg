<script>
  import { tick } from 'svelte'
  import { closeOnOutside } from '../lib/menu.js'

  // The chart row's "more" button and its menu. An item either runs and closes
  // the menu, or (item.sub) swaps the menu for the `sub` snippet with a back row.
  // items: [{ key, label, detail?, disabled?, hint?, sub?, separator?, run? }]
  let { label, items, sub = null } = $props()

  let open = $state(false)
  let view = $state(null)
  let root = $state()
  let button = $state()
  let menu = $state()

  $effect(() => {
    if (!open) return
    return closeOnOutside(root, () => { open = false })
  })

  const focusables = () => [...menu?.querySelectorAll('[role="menuitem"]') ?? []]

  async function show() {
    open = true
    view = null
    await tick()
    const first = focusables().find((el) => el.getAttribute('aria-disabled') !== 'true')
    first?.focus()
  }

  function close(refocus = true) {
    open = false
    view = null
    if (refocus) button?.focus()
  }

  function choose(item) {
    if (item.disabled) return
    if (item.sub) {
      view = item
      tick().then(() => focusables()[0]?.focus())
      return
    }
    close()
    item.run?.()
  }

  function onkeydown(e) {
    if (!open) return
    if (e.key === 'Escape') {
      e.stopPropagation()
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'Tab') {
      close(false)
      return
    }
    const keys = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' }
    if (!(e.key in keys)) return
    const list = focusables()
    if (!list.length) return
    e.preventDefault()
    const at = list.indexOf(document.activeElement)
    const step = keys[e.key]
    const next = step === 'first' ? 0 : step === 'last' ? list.length - 1
      : (at + step + list.length) % list.length
    list[next].focus()
  }
</script>

<div class="panel-morewrap" role="presentation" bind:this={root} {onkeydown}>
  <button
    type="button"
    class="panel-more"
    bind:this={button}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={label}
    title={label}
    onclick={() => (open ? close() : show())}
  >
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="13" cy="8" r="1.4" />
    </svg>
  </button>
  {#if open}
    <div class="panel-menu" role="menu" aria-label={label} bind:this={menu}>
      {#if view}
        <button type="button" role="menuitem" class="panel-menu__item panel-menu__back" onclick={() => { view = null; tick().then(() => focusables()[0]?.focus()) }}>
          <span aria-hidden="true">‹</span> {view.label}
        </button>
        <div class="panel-menu__sub" role="group" aria-label={view.label}>{@render sub?.()}</div>
      {:else}
        {#each items as item (item.key)}
          {#if item.separator}<div class="panel-menu__sep" role="separator"></div>{/if}
          <button
            type="button"
            role="menuitem"
            class="panel-menu__item"
            aria-disabled={item.disabled ? 'true' : undefined}
            title={item.disabled ? item.hint : undefined}
            onclick={() => choose(item)}
          >
            <span>{item.label}</span>
            {#if item.detail}<span class="panel-menu__detail">{item.detail}</span>{/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>
