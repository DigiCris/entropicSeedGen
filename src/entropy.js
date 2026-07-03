import { randomFillSync } from 'node:crypto';
import { ENTROPY_BYTES } from './constants.js';

// () -> Uint8Array(32). Un solo buffer llenado EN SITIO por el CSPRNG del SO.
export function generateEntropy() {
  const entropy = new Uint8Array(ENTROPY_BYTES);
  randomFillSync(entropy);
  return entropy;
}

export function zeroFill(...bufs) {
  for (const b of bufs) if (b && typeof b.fill === 'function') b.fill(0);
}
