// Which watch a published face was made for. The `device` select on the PocketBase
// `watchfaces` collection — the values here are the schema's values, so they change together
// with the migration in fmc_pocketbase that defines them.
//
// This is catalog metadata, not device geometry: both watches drive a 466x466 panel and share
// the same .bin layout, so nothing in the file says which one a face was drawn for. Only the
// creator knows, which is why they used to type it into the name.

export interface Device {
  value: string;
  /** Full product name — the dropdown row and the showcase page. */
  label: string;
  /** What the card badge and the closed filter show, where "CMF" is already implied. */
  short: string;
}

export const DEVICES: Device[] = [
  { value: "watch_pro_2", label: "CMF Watch Pro 2", short: "Watch Pro 2" },
  { value: "watch_3_pro", label: "CMF Watch 3 Pro", short: "Watch 3 Pro" },
  { value: "watch_pro", label: "CMF Watch Pro", short: "Watch Pro" },
];

/**
 * The watch a face is assumed to be for when it doesn't say. FMC only ever targeted the
 * Watch Pro 2 — the editor, the BLE flashing path and the seeded catalog are all its — so
 * everything published before this field existed was authored there unless the creator wrote
 * otherwise in the name.
 */
export const DEFAULT_DEVICE = "watch_pro_2";

/** Badge/showcase text for a record's device, or "" when it doesn't claim one. */
export const deviceLabel = (device: unknown): string =>
  DEVICES.find((d) => d.value === device)?.short ?? "";

/**
 * Does a face whose record says `wfDevice` belong on the shelf for `device`? An empty `device`
 * is the whole marketplace.
 *
 * ponytail: an untagged face falls under DEFAULT_DEVICE rather than dropping out of every
 * shelf, because most of the marketplace predates the field and a filter that hid all of it
 * would be useless on day one. Upgrade path: once the untagged backlog is claimed by its
 * creators, drop the fallback arm and let unset mean "unknown".
 */
export const matchesDevice = (wfDevice: unknown, device: string): boolean =>
  !device || (wfDevice ? wfDevice === device : device === DEFAULT_DEVICE);
