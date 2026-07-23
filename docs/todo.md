# TODO

- Combo's 3rd goal ring (id `0x6c`, `ID_LABELS` = `'metric (slot)?'`) has no confirmed
  real-metric mapping — `idValue()` falls back to `sim.steps` for it (same as `0x6a`/`0x8b`,
  see the `// unlabelled complication-slot metrics` case in `render.ts`), so all 3 of
  Combo's nested rings currently move together when `sim.steps` changes, even though on a
  real device that slot could be configured to any metric (calories, distance, hr, ...).
  Decoding which metric it actually is would need the same kind of reverse-engineering done
  for Function's widget-slot mechanism (`0x79`+slotIndex / `activeIdx`, see `withSlotOverrides`
  in `render.ts`) — figure out the real per-slot metric selection instead of guessing steps.
