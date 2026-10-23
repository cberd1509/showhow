/**
 * `patch` laid over `real` (an API response, or a base spec). Objects merge key by key; an array in
 * the patch patches the real array index by index, and `null` deletes.
 */
export function merge(real: unknown, patch: unknown): unknown {
  if (patch === null) return undefined;
  if (Array.isArray(patch) && Array.isArray(real)) {
    return real.map((v, i) => (i < patch.length ? merge(v, patch[i]) : v)).filter((v) => v !== undefined);
  }
  if (isObject(patch) && isObject(real)) {
    const out: Record<string, unknown> = { ...real };
    for (const [k, v] of Object.entries(patch)) {
      const m = merge(real[k], v);
      if (m === undefined) delete out[k];
      else out[k] = m;
    }
    return out;
  }
  return patch;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
