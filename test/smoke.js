// Smoke test — SOLO vectores públicos. No toca el flujo real ni genera material sensible.
// Sale con código != 0 si algo falla.
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { deriveA, toEIP55 } from '../src/deriveA.js';
import { deriveB } from '../src/deriveB.js';
import { crossCheck } from '../src/crosscheck.js';
import { buildPayload, validatePayload } from '../src/save.js';

let failed = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    console.error(`  FAIL ${name}`);
    failed++;
  }
}
function expectThrow(name, fn) {
  try {
    fn();
    console.error(`  FAIL ${name} (no lanzó)`);
    failed++;
  } catch {
    console.log(`  ok   ${name}`);
  }
}

// Vector público de Hardhat (mnemónico de test conocido).
const HARDHAT = 'test test test test test test test test test test test junk';
const HARDHAT_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// 1) Subpaths .js importables (si algún import falla, el módulo ni carga → lo cubre el import de arriba).
check('subpaths .js importan (bip39 wordlist)', Array.isArray(wordlist) && wordlist.length === 2048);

// 2) deriveA y deriveB coinciden con el vector Hardhat.
const a = deriveA(HARDHAT);
const b = deriveB(HARDHAT);
check('deriveA == vector Hardhat', a === HARDHAT_ADDR);
check('deriveB == vector Hardhat', b === HARDHAT_ADDR);
check('crossCheck A/B ok', crossCheck(1, a, b) === HARDHAT_ADDR);

// 3) Vectores EIP-55 oficiales (EIP-55) pasan por toEIP55 (se le pasa el hex en minúsculas sin 0x).
const EIP55 = [
  '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
  '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
  '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
];
for (const addr of EIP55) {
  check(`EIP-55 ${addr.slice(0, 8)}…`, toEIP55(addr.slice(2).toLowerCase()) === addr);
}

// 4) Round-trip con entropía FIJA de prueba (no CSPRNG).
const fixed = new Uint8Array(32).fill(7);
const mn = bip39.entropyToMnemonic(fixed, wordlist);
const back = bip39.mnemonicToEntropy(mn, wordlist);
check('round-trip entropía fija', Buffer.from(back).equals(Buffer.from(fixed)));
check('validateMnemonic true', bip39.validateMnemonic(mn, wordlist) === true);
check('24 palabras', mn.split(' ').length === 24);

// 5) validatePayload acepta lo bueno y rechaza lo malo.
const good = buildPayload([
  { walletNumber: 1, address: a },
  { walletNumber: 2, address: EIP55[0] },
]);
// forzamos que sean exactamente WALLET_COUNT(10) para el chequeo de tamaño
const ten = buildPayload(Array.from({ length: 10 }, (_, i) => ({ walletNumber: i + 1, address: EIP55[i % 4] })));
expectThrow('rechaza addresses duplicados', () => validatePayload(ten));

const uniqueTen = buildPayload(
  Array.from({ length: 10 }, (_, i) => ({
    walletNumber: i + 1,
    // 10 direcciones canónicas distintas derivadas de mnemónicos de test fijos
    address: deriveA(bip39.entropyToMnemonic(new Uint8Array(32).fill(i + 1), wordlist)),
  })),
);
check('acepta payload válido de 10', (() => { try { validatePayload(uniqueTen); return true; } catch { return false; } })());

expectThrow('rechaza clave top-level extra', () => validatePayload({ ...uniqueTen, evil: 1 }));
expectThrow('rechaza clave sensible en wallet', () =>
  validatePayload({ ...uniqueTen, wallets: uniqueTen.wallets.map((x, i) => (i === 0 ? { ...x, privateKey: '0x00' } : x)) }),
);
expectThrow('rechaza cantidad != 10', () => validatePayload(good));

if (failed > 0) {
  console.error(`\nSMOKE FAILED: ${failed} chequeo(s)`);
  process.exit(1);
}
console.log('\nSMOKE OK');
