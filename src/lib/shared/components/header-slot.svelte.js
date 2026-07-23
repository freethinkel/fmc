// Slot in the shared header: a page puts its snippet here, site-header renders it.
// ponytail: one slot for the whole app; if more are needed, key them.
export const headerSlot = $state({ snippet: null });
