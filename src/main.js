import { argv, stdin, stdout, stderr } from 'node:process';
import { existsSync } from 'node:fs';
import { WALLET_COUNT, OUT_FILE, SHA_FILE } from './constants.js';
import { generateEntropy, zeroFill } from './entropy.js';
import { mnemonicFromEntropy } from './mnemonic.js';
import { deriveA } from './deriveA.js';
import { deriveB } from './deriveB.js';
import { crossCheck } from './crosscheck.js';
import { clearScreen, showWallet, showSummary, promptEnter } from './terminal.js';
import { buildPayload, validatePayload, writeAddresses, readAddresses, writeSha256 } from './save.js';

function guards() {
  if (!stdout.isTTY || !stdin.isTTY) throw new Error('Se requiere una terminal interactiva (TTY).');
  if (process.env.TMUX || process.env.STY) throw new Error('No ejecutar bajo tmux/screen.');
  if (argv.length > 2) throw new Error('El script no acepta argumentos ni flags.');
  if (existsSync(OUT_FILE)) throw new Error(`${OUT_FILE} ya existe.`);
}

async function main() {
  guards();
  clearScreen();
  const results = [];

  for (let w = 1; w <= WALLET_COUNT; w++) {
    const entropy = generateEntropy();
    let mnemonic;
    try {
      mnemonic = mnemonicFromEntropy(entropy);
      const addrA = deriveA(mnemonic);
      const addrB = deriveB(mnemonic);
      const address = crossCheck(w, addrA, addrB);

      clearScreen();
      showWallet(w, mnemonic, address);
      await promptEnter('Anotá las 24 palabras + primeros/últimos 4 de la dirección. Enter para continuar…');
      results.push({ walletNumber: w, address });
    } finally {
      zeroFill(entropy);
      mnemonic = null;
    }
    clearScreen();
  }

  if (new Set(results.map((r) => r.address)).size !== results.length)
    throw new Error('Direcciones duplicadas detectadas — ABORT');

  clearScreen();
  showSummary(results);
  await promptEnter('¿Escribir addresses.json con estas 10 direcciones? Enter para confirmar…');

  const payload = buildPayload(results);
  validatePayload(payload); // valida ANTES de escribir
  writeAddresses(OUT_FILE, payload);
  validatePayload(readAddresses(OUT_FILE)); // re-lee y re-valida
  const hex = writeSha256(OUT_FILE, SHA_FILE);

  stdout.write(`\nOK: ${OUT_FILE} escrito y validado (${WALLET_COUNT} direcciones).\nSHA-256: ${hex}\n`);
}

main().catch((err) => {
  stderr.write(`\nERROR — proceso abortado: ${err.message}\n`); // nunca material sensible
  process.exit(1);
});
