<script>
  import { onMount } from 'svelte'

  // A bottom sheet over the page with the station's facts. Phones only reach
  // it (the header (i) and the chart menu); desktop keeps the inline disclosure.
  let { title, closeLabel, rows = [], network = '', onclose } = $props()

  let sheet = $state()

  // Focus moves in on open and back to whatever opened it on close.
  onMount(() => {
    const opener = document.activeElement
    sheet?.focus()
    return () => opener?.focus?.()
  })

  function onkeydown(e) {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    e.preventDefault()
    onclose()
  }
</script>

<div class="about-backdrop" role="presentation" onclick={onclose}></div>
<div
  class="about-sheet"
  role="dialog"
  aria-modal="true"
  aria-label={title}
  tabindex="-1"
  bind:this={sheet}
  {onkeydown}
>
  <div class="about-sheet__grip" aria-hidden="true"></div>
  <div class="about-sheet__head">
    <h3>{title}</h3>
    <button type="button" class="about-sheet__close" aria-label={closeLabel} onclick={onclose}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
      </svg>
    </button>
  </div>
  <dl>
    {#each rows as row (row.key)}
      <dt>{row.label}</dt>
      <dd>{row.value}</dd>
    {/each}
  </dl>
  {#if network}<p class="about-sheet__network">{network}</p>{/if}
</div>
