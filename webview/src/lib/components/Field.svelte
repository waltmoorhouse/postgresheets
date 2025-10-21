<script lang="ts">
  export let label: string = '';
  export let hint: string | null = null;
</script>

<label>
  <div style="font-weight:600">{label}</div>
  <slot />
  {#if hint}
    <div class="muted" style="font-size:0.85em">{hint}</div>
  {/if}
</label>
