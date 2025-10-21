<script lang="ts">
  // Simple FocusTrap shim used in the webview build. This is intentionally
  // lightweight — for more complete focus trapping behaviour consider
  // installing a dedicated package. The component simply renders its
  // children and forwards attributes.
  export let ariaLabel: string | undefined;
</script>

<div aria-label={ariaLabel} tabindex="-1">
  <slot />
</div>
