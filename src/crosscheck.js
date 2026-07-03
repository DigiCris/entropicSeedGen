import { toChecksum } from './deriveB.js';

export function crossCheck(w, addrA, addrB) {
  const a = toChecksum(addrA); // normaliza A a EIP-55 canónico
  if (a !== addrB) throw new Error(`Discrepancia A/B en Wallet ${w}: A=${a} B=${addrB} — ABORT`);
  return addrB;
}
