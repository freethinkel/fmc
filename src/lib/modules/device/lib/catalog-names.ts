// id → { group, name }; сгенерировано из имён стоковых файлов Group__ID__Name.bin
// (см. watchfaces/files; перегенерация — python-однострочник в git-истории не нужна, состав статичен)
import stock from './stock-dials.json';

const dials = stock as Record<string, { group: string; name: string }>;

export const dialName = (id: number) => dials[id]?.name || `#${id}`;
export const dialGroup = (id: number) => dials[id]?.group || '';
