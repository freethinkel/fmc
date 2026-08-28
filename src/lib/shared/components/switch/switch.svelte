<script lang="ts">
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    onChange?: (checked: boolean) => void;
  }
  let { checked = $bindable(false), disabled, onChange }: Props = $props();
</script>

<label class="root">
  <input
    type="checkbox"
    bind:checked
    {disabled}
    onchange={() => onChange?.(checked)}
  />
  <span class="switch"><span class="thumb"></span></span>
</label>

<style>
  .root {
    display: inline-flex;
    -webkit-tap-highlight-color: transparent;
    cursor: pointer;
  }
  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  /* an iOS-style pill: the thumb is wider than tall and squishes wider still while pressed */
  .switch {
    --size: 1.4rem;
    --track: 2;
    --knob: 1;
    --squish: 1.1;
    --padding: 0.2rem;

    padding: var(--padding);
    width: calc(var(--size) * var(--track));
    border-radius: 10em;
    background: oklch(from var(--color-text) l c h / 18%);
    transition: background-color 0.1s linear;
  }
  .thumb {
    display: block;
    height: var(--size);
    width: calc(var(--size) * var(--knob));
    border-radius: 10em;
    background: oklch(1 0 0);
    box-shadow: 0 2px 4px oklch(0 0 0 / 10%);
    transition:
      transform var(--spring-transition),
      width var(--spring-transition),
      box-shadow 0.1s linear;
  }
  .root:active .thumb {
    width: calc(var(--size) * var(--knob) * var(--squish));
  }
  input:checked + .switch {
    background: var(--color-accent);

    .thumb {
      /* the squished thumb starts further left, so its right edge stays pinned to the track */
      transform: translateX(
        calc(var(--size) * (var(--track) - var(--knob)) - var(--padding) * 2)
      );
      box-shadow: 0 2px 6px oklch(0 0 0 / 20%);
    }
  }
  .root:active input:checked + .switch .thumb {
    transform: translateX(
      calc(
        var(--size) * (var(--track) - var(--knob) * var(--squish)) -
          var(--padding) * 2
      )
    );
  }
  input:disabled + .switch {
    opacity: 0.5;
  }
  input:focus-visible + .switch {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
