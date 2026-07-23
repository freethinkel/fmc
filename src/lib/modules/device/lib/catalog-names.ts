// id → { group, name }; generated from stock file names Group__ID__Name.bin
// (see watchfaces/files; regeneration — a python one-liner is in git history, not needed, the set is static)
import stock from './stock-dials.json';

const dials = stock as Record<string, { group: string; name: string }>;

export const dialName = (id: number) => dials[id]?.name || `#${id}`;
export const dialGroup = (id: number) => dials[id]?.group || '';
