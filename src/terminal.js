import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { WALLET_COUNT, PATH } from './constants.js';

export function clearScreen() {
  stdout.write('\x1b[2J\x1b[3J\x1b[H');
}

export function showWallet(w, mnemonic, address) {
  const first4 = address.slice(2, 6);
  const last4 = address.slice(-4);
  stdout.write(`==============  Wallet ${w} / ${WALLET_COUNT}  ==============\n\n`);
  stdout.write(`Frase semilla (24 palabras) — ANOTAR A MANO:\n\n`);
  mnemonic.split(' ').forEach((word, k) => stdout.write(`  ${String(k + 1).padStart(2)}. ${word}\n`));
  stdout.write(`\nDirección EIP-55: ${address}\n`);
  stdout.write(`Verificación: primeros 4 = ${first4}   últimos 4 = ${last4}\n`);
  stdout.write(`Ruta: ${PATH}   (passphrase BIP-39 VACÍA)\n\n`);
}

export function showSummary(results) {
  stdout.write(`=== Resumen: ${results.length} direcciones públicas ===\n\n`);
  for (const r of results) stdout.write(`  Wallet ${r.walletNumber}: ${r.address}\n`);
  stdout.write('\n');
}

export async function promptEnter(msg) {
  const rl = createInterface({ input: stdin, output: stdout });
  await rl.question(`${msg} `);
  rl.close();
}
