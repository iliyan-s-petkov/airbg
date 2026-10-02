<script>
  // Map chrome: one icon, no prose. Time and switch name live in the title.
  import RefreshButton from './RefreshButton.svelte'

  let {
    status, auto, autoLabel, onauto, onrefresh,
    button = false, buttonLabel = '', busy = false,
  } = $props()

  const hint = $derived(status ? `${autoLabel} · ${status}` : autoLabel)
</script>

<p class="data-refresh">
  {#if button}
    <RefreshButton label={buttonLabel} {busy} variant="icon" {onrefresh} />
  {/if}
  <!-- Clipped, not removed: a live region is the one reader who cannot hover. -->
  <span class="data-refresh__status sr-only" role="status">{status}</span>
  <button
    type="button"
    class="data-refresh__auto"
    role="switch"
    aria-checked={auto}
    title={hint}
    aria-label={hint}
    onclick={() => onauto(!auto)}
  >
    <svg class="data-refresh__ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <!-- A timer, not the manual button's circular arrow: this one repeats on its own. -->
      <path d="M8 14.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <path d="M8 6.5V9l1.75 1.25M6.25 1h3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Off is struck through, so colour is never the only signal. -->
      {#if !auto}
        <path d="M2.5 13.5 13.5 2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      {/if}
    </svg>
  </button>
</p>
