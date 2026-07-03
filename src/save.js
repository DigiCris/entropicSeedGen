import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getAddress } from 'ethers';
import { PATH, WALLET_COUNT } from './constants.js';

// Allowlist estricta de claves.
const TOP_KEYS = ['purpose', 'threshold', 'derivationPath', 'bip39Passphrase', 'note', 'wallets'];
const WALLET_KEYS = ['walletNumber', 'address'];
// Blacklist como defensa ADICIONAL (needles en minúscula; el haystack se compara en lowercase).
const SENSITIVE_KEYS = ['mnemonic', 'seed', 'privatekey', 'entropy', 'xprv', 'xpub'];

// Construye el objeto de salida (solo datos públicos).
export function buildPayload(results) {
  return {
    purpose: 'Safe signers',
    threshold: '6-of-10',
    derivationPath: PATH, // todas las wallets comparten este path
    bip39Passphrase: 'empty',
    note: 'Solo datos públicos. walletNumber identifica cada seed independiente (NO es índice de derivación).',
    wallets: results.map((r) => ({ walletNumber: r.walletNumber, address: r.address })),
  };
}

// Valida un payload. Se usa ANTES de escribir y DESPUÉS de releer desde disco.
export function validatePayload(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Validación: payload no es objeto — ABORT');

  // Allowlist estricta top-level: ninguna clave fuera de la permitida.
  for (const k of Object.keys(data))
    if (!TOP_KEYS.includes(k)) throw new Error(`Validación: clave top-level no permitida "${k}" — ABORT`);

  const w = data.wallets;
  if (!Array.isArray(w) || w.length !== WALLET_COUNT)
    throw new Error(`Validación: no hay exactamente ${WALLET_COUNT} wallets — ABORT`);

  const seen = new Set();
  for (const item of w) {
    if (item === null || typeof item !== 'object' || Array.isArray(item))
      throw new Error('Validación: wallet no es objeto — ABORT');
    // Allowlist estricta por wallet: exactamente walletNumber + address.
    for (const k of Object.keys(item))
      if (!WALLET_KEYS.includes(k)) throw new Error(`Validación: clave de wallet no permitida "${k}" — ABORT`);
    if (typeof item.walletNumber !== 'number') throw new Error('Validación: falta walletNumber — ABORT');
    const a = getAddress(item.address); // lanza si el EIP-55 es inválido
    if (a !== item.address) throw new Error('Validación: address no canónico — ABORT');
    if (seen.has(a)) throw new Error('Validación: address duplicado — ABORT');
    seen.add(a);
  }

  // Blacklist adicional: ningún substring de clave sensible en el JSON.
  const flat = JSON.stringify(data).toLowerCase();
  for (const k of SENSITIVE_KEYS)
    if (flat.includes(`"${k}"`)) throw new Error(`Validación: campo sensible "${k}" presente — ABORT`);
}

// Escribe (tras confirmar que no existe). El payload ya debe venir validado.
export function writeAddresses(outPath, payload) {
  if (existsSync(outPath)) throw new Error(`${outPath} ya existe — ABORT (no sobrescribir)`);
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', { encoding: 'utf8' });
}

// Re-lee desde disco para re-validar.
export function readAddresses(outPath) {
  return JSON.parse(readFileSync(outPath, 'utf8'));
}

// Hash SHA-256 público del archivo público.
export function writeSha256(outPath, shaPath) {
  const hex = createHash('sha256').update(readFileSync(outPath)).digest('hex');
  writeFileSync(shaPath, `${hex}  ${outPath}\n`, { encoding: 'utf8' });
  return hex;
}
