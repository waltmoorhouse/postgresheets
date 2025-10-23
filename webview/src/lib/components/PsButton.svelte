<script lang="ts">
  export let variant: 'default' | 'primary' | 'accent' | 'ghost' | 'link' = 'default';
  export let disabled = false;
  export let type: 'button' | 'submit' | 'reset' = 'button';
</script>

<button
  on:click
  class={`ps-btn ${variant === 'primary' ? 'ps-btn--primary' : ''} ${variant === 'accent' ? 'ps-btn--accent' : ''} ${variant === 'ghost' ? 'ps-btn--ghost' : ''} ${variant === 'link' ? 'ps-btn--link' : ''}`}
  type={type}
  disabled={disabled}
  {...$$restProps}
>
  <slot></slot>
</button>
