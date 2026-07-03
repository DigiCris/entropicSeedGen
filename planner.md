# planner.md — Especificación técnica del generador de wallets EVM

> Plan de **implementación del programa**. Describe qué hace, su arquitectura, módulos, funciones (firmas + código) y dependencias, con detalle suficiente para implementarlo de forma mecánica. Solo software: sin runbook operativo.

---

## Tabla de contenidos

- [0. Qué hace el programa](#0-qué-hace-el-programa)
- [1. Decisiones de diseño](#1-decisiones-de-diseño)
- [2. Stack y versiones exactas](#2-stack-y-versiones-exactas)
- [3. Estructura de archivos](#3-estructura-de-archivos)
- [4. Diseño del script](#4-diseño-del-script)
- [5. package.json, package-lock y .gitignore](#5-packagejson-package-lock-y-gitignore)
- [6. Instalación y build](#6-instalación-y-build)
- [7. Smoke test](#7-smoke-test)
- [8. Nota de honestidad](#8-nota-de-honestidad)
- [9. Cambios aplicados / cambios rechazados](#9-cambios-aplicados--cambios-rechazados)

---

## 0. Qué hace el programa

Programa de línea de comandos en **Node.js 22 LTS** que genera 10 firmantes EVM (EOAs para un Safe 6-de-10):

1. Genera **10** frases semilla BIP-39 de **24 palabras** (256 bits de entropía cada una).
2. Para cada semilla deriva **solo** la primera dirección EVM en `m/44'/60'/0'/0/0` (passphrase BIP-39 **vacía**).
3. Verifica cada semilla por software (round-trip de entropía + doble derivación cruzada A/B) y **aborta** ante cualquier discrepancia.
4. Muestra wallet por wallet: `Wallet N / 10`, las 24 palabras y la dirección EIP-55, y espera **Enter** antes de limpiar la pantalla y continuar.
5. Al final muestra el resumen de las 10 direcciones, pide **una confirmación** y escribe **solo datos públicos**.
6. El programa solo escribe dos archivos públicos: `addresses.json` y `addresses.sha256.txt`. No escribe secretos, logs ni temporales, no usa el portapapeles y no realiza operaciones de red.

---

## 1. Decisiones de diseño

Solo se listan las que afectan al código. Cada una se refleja en §4.

| Requisito | Implementación |
|---|---|
| Entropía fuerte, única fuente | `crypto.randomFillSync(new Uint8Array(32))` (CSPRNG del SO). Prohibido `Math.random`, timestamps, UUIDs, "entropía manual". |
| Sin secretos de entrada | No acepta mnemónico/entropía/clave por args, flags, stdin, archivos ni env. |
| 24 palabras / 256 bits | 32 bytes → `entropyToMnemonic` → 24 palabras. |
| Mnemónico desde NUESTRA entropía | `@scure/bip39` **`entropyToMnemonic`**, **no** `generateMnemonic` (este generaría su propia aleatoriedad). |
| Passphrase BIP-39 vacía | En A (`mnemonicToSeedSync(mnemonic)`) y en B (`fromPhrase(m, '', PATH)`). |
| Round-trip | `entropy → mnemonic → entropy` con comparación byte a byte. |
| Validaciones del mnemónico | `validateMnemonic` + comprobar exactamente 24 palabras. |
| Doble derivación independiente | A = `@scure/bip32` + `@noble/curves` + `keccak_256` de `@noble/hashes`; B = `ethers` v6. **Abort** si A ≠ B. |
| Checksum | EIP-55 (manual en A; `ethers` lo entrega en B; comparar en forma canónica con `getAddress`). |
| Confirmación por wallet | Pausa con **Enter** antes de limpiar y avanzar. |
| Confirmación final | Mostrar las 10 direcciones y pedir Enter antes de escribir. |
| No sobrescribir | Abortar si `addresses.json` ya existe. |
| Salida válida | Validar el payload **en memoria** antes de escribir; re-leer y re-validar tras escribir; sin direcciones duplicadas. |
| Solo datos públicos | El objeto de resultados solo tiene `walletNumber` + `address`; el JSON nunca contiene semillas ni claves. |
| Higiene de secretos | Zero-fill best-effort (en `try/finally`) de los `Uint8Array` (entropía, seed, clave privada, round-trip). |
| Sin trazas | Sin `console.log`, sin modo verbose/debug; los errores nunca incluyen material sensible. |
| Guards | Abortar si no hay TTY, si hay args, o si corre bajo `tmux`/`screen`. |
| ESM + Node 22 | `@scure`/`@noble` v2 es ESM-only → `"type":"module"`. |

**Numeración**: `walletNumber` 1..10 es identificador humano, **no** un índice de derivación (las 10 son semillas independientes, todas en `m/44'/60'/0'/0/0`).

---

## 2. Stack y versiones exactas

Línea v2 coordinada (`@scure`/`@noble` en `2.2.0`), ESM, con `ethers 6.17.0`. Versiones **exactas** (sin `^`/`~`).

| Paquete | Versión | Rol |
|---|---|---|
| `node` | `22.x` | `crypto.randomFillSync`/`randomBytes`. `engines.node="22.x"` + `.nvmrc=22`. |
| `@scure/bip39` | `2.2.0` | `entropyToMnemonic`, `mnemonicToEntropy`, `validateMnemonic`, `mnemonicToSeedSync` + wordlist. |
| `@scure/bip32` | `2.2.0` | `HDKey.fromMasterSeed(seed).derive(path)`. |
| `@noble/curves` | `2.2.0` | `secp256k1.getPublicKey(priv, false)`. |
| `@noble/hashes` | `2.2.0` | `keccak_256` (Ethereum, no SHA3-256) + `bytesToHex`/`utf8ToBytes`. |
| `@scure/base` | `2.2.0` | Transitiva; queda en el lock. |
| `ethers` | `6.17.0` | `HDNodeWallet.fromPhrase`, `getAddress`. |

**Gotchas de versión (respetar; NO inventar APIs):**

1. **ESM-only**: `"type":"module"`.
2. **`.js` obligatorio** en imports de subpath v2: `@scure/bip39/wordlists/english.js`, `@noble/hashes/sha3.js`, `@noble/curves/secp256k1.js`, `@noble/hashes/utils.js`.
3. **`keccak_256` v2 solo acepta `Uint8Array`** → EIP-55 con `utf8ToBytes(...)`.
4. **`secp256k1.Point`** (en v1 era `ProjectivePoint`); la ruta recomendada usa `getPublicKey(priv, false)`.
5. **Duplicación de noble bajo ethers**: `ethers 6.17.0` trae anidados `@noble/hashes@1.3.2` + `@noble/curves@1.2.0`; confirmar con `npm ls @noble/hashes @noble/curves`. Es lo que da al cross-check independencia de árbol/versiones (no total: misma familia `noble`).

---

## 3. Estructura de archivos

```
wallet-gen/
├── .gitignore
├── .nvmrc                  # 22
├── package.json
├── package-lock.json       # COMMITEADO (hashes de integridad para npm ci)
├── README.md               # solo cómo instalar y ejecutar
├── planner.md
├── src/
│   ├── constants.js        # PATH, WALLET_COUNT, ENTROPY_BYTES, OUT_FILE, SHA_FILE
│   ├── entropy.js          # generateEntropy + zeroFill
│   ├── mnemonic.js         # mnemonicFromEntropy
│   ├── deriveA.js          # deriveA (noble/scure) + toEIP55
│   ├── deriveB.js          # deriveB (ethers) + toChecksum
│   ├── crosscheck.js       # crossCheck
│   ├── terminal.js         # clearScreen, showWallet, showSummary, promptEnter
│   ├── save.js             # buildPayload, validatePayload, writeAddresses, readAddresses, writeSha256
│   └── main.js             # orquestador
└── test/
    └── smoke.js            # vectores públicos (no toca el flujo real)
```

`node_modules/` y las salidas (`addresses.json`, `addresses.sha256.txt`) no se commitean.

---

## 4. Diseño del script

### 4.1 Flujo

```
guards() → aborta si: !TTY | TMUX/STY | args extra | existe addresses.json

para w en 1..10:
  entropy   ← randomFillSync(new Uint8Array(32))
  mnemonic  ← mnemonicFromEntropy(entropy)   // entropyToMnemonic + round-trip + validate + 24 palabras
  addrA ← deriveA(mnemonic) ; addrB ← deriveB(mnemonic)
  address ← crossCheck(w, addrA, addrB)       // abort si A ≠ B
  clearScreen(); showWallet(w, mnemonic, address); promptEnter(Enter)
  zeroFill(entropy)  // en finally
  push { walletNumber:w, address }

chequear duplicados → abort si hay
clearScreen(); showSummary(results); promptEnter("¿Escribir? Enter…")
payload ← buildPayload(results)
validatePayload(payload)                       // valida ANTES de escribir
writeAddresses(OUT_FILE, payload)
validatePayload(readAddresses(OUT_FILE))       // re-lee y re-valida
writeSha256(OUT_FILE, SHA_FILE)
```

### 4.2 `src/constants.js`

```js
export const PATH = "m/44'/60'/0'/0/0";
export const WALLET_COUNT = 10;
export const ENTROPY_BYTES = 32;        // 256 bits → 24 palabras
export const OUT_FILE = 'addresses.json';
export const SHA_FILE = 'addresses.sha256.txt';
```

### 4.3 `src/entropy.js`

```js
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
```

### 4.4 `src/mnemonic.js`

```js
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js'; // .js OBLIGATORIO en v2

// (entropy: Uint8Array(32)) -> string (24 palabras). Lanza si algo falla.
export function mnemonicFromEntropy(entropy) {
  const mnemonic = bip39.entropyToMnemonic(entropy, wordlist); // NO generateMnemonic

  const roundtrip = bip39.mnemonicToEntropy(mnemonic, wordlist); // Uint8Array(32)
  try {
    if (roundtrip.length !== entropy.length) throw new Error('round-trip: longitud distinta — ABORT');
    let diff = 0;
    for (let i = 0; i < entropy.length; i++) diff |= entropy[i] ^ roundtrip[i];
    if (diff !== 0) throw new Error('round-trip: entropía no coincide — ABORT');
  } finally {
    roundtrip.fill(0);
  }

  if (!bip39.validateMnemonic(mnemonic, wordlist)) throw new Error('validateMnemonic falló — ABORT');
  if (mnemonic.split(' ').length !== 24) throw new Error('el mnemónico no tiene 24 palabras — ABORT');
  return mnemonic;
}
```

### 4.5 `src/deriveA.js` (implementación A — noble/scure)

```js
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';            // Keccak Ethereum, NO sha3_256
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { PATH } from './constants.js';
import { zeroFill } from './entropy.js';

// (mnemonic: string) -> string (EIP-55)
export function deriveA(mnemonic) {
  const seed = mnemonicToSeedSync(mnemonic);          // Uint8Array(64), passphrase VACÍA
  let node;
  try {
    const hd = HDKey.fromMasterSeed(seed);            // recibe SEED de 64B, no el mnemónico
    node = hd.derive(PATH);
    if (!node.privateKey) throw new Error('deriveA: sin privateKey en la ruta — ABORT');

    const pub  = secp256k1.getPublicKey(node.privateKey, false); // 65B no comprimida (0x04||X||Y)
    const hash = keccak_256(pub.slice(1));            // dropear 0x04 → 64B, luego keccak
    return toEIP55(bytesToHex(hash.slice(-20)));
  } finally {
    zeroFill(seed);
    if (node?.privateKey) zeroFill(node.privateKey);
  }
}

// EIP-55: keccak sobre los BYTES ASCII del hex en minúsculas (v2 rechaza strings).
export function toEIP55(lowerHexNoPrefix) {
  const h = bytesToHex(keccak_256(utf8ToBytes(lowerHexNoPrefix)));
  let out = '0x';
  for (let i = 0; i < lowerHexNoPrefix.length; i++) {
    const c = lowerHexNoPrefix[i];
    out += (c >= 'a' && c <= 'f' && parseInt(h[i], 16) >= 8) ? c.toUpperCase() : c;
  }
  return out;
}
```

Gotchas: `keccak_256` (no `sha3_256`); `getPublicKey(priv, false)` → 65B; dropear `0x04` (`pub.slice(1)`); `fromMasterSeed` recibe el seed de 64B; EIP-55 con `utf8ToBytes`.

**Vector de referencia** (smoke test): mnemónico Hardhat `test test test test test test test test test test test junk` → `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`.

### 4.6 `src/deriveB.js` (implementación B — ethers v6)

```js
import { HDNodeWallet, getAddress } from 'ethers';
import { PATH } from './constants.js';

// (mnemonic: string) -> string (EIP-55)
export function deriveB(mnemonic) {
  // arg2 "" = PASSPHRASE BIP-39 (vacía, coincide con A); arg3 = path. fromPhrase AUTO-DERIVA la ruta.
  const node = HDNodeWallet.fromPhrase(mnemonic, '', PATH);
  return node.address; // ya viene EIP-55
}

export function toChecksum(raw) {
  return getAddress(raw); // idempotente; lanza si el checksum es inválido
}
```

### 4.7 `src/crosscheck.js`

```js
import { toChecksum } from './deriveB.js';

export function crossCheck(w, addrA, addrB) {
  const a = toChecksum(addrA); // normaliza A a EIP-55 canónico
  if (a !== addrB) throw new Error(`Discrepancia A/B en Wallet ${w}: A=${a} B=${addrB} — ABORT`);
  return addrB;
}
```

### 4.8 `src/terminal.js`

```js
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { WALLET_COUNT, PATH } from './constants.js';

export function clearScreen() { stdout.write('\x1b[2J\x1b[3J\x1b[H'); }

export function showWallet(w, mnemonic, address) {
  const first4 = address.slice(2, 6), last4 = address.slice(-4);
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
```

### 4.9 `src/save.js`

```js
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
    derivationPath: PATH,          // todas las wallets comparten este path
    bip39Passphrase: 'empty',
    note: 'Solo datos públicos. walletNumber identifica cada seed independiente (NO es índice de derivación).',
    wallets: results.map(r => ({ walletNumber: r.walletNumber, address: r.address })),
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
```

### 4.10 `src/main.js` (orquestador)

```js
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
      await promptEnter(`Anotá las 24 palabras + primeros/últimos 4 de la dirección. Enter para continuar…`);
      results.push({ walletNumber: w, address });
    } finally {
      zeroFill(entropy);
      mnemonic = null;
    }
    clearScreen();
  }

  if (new Set(results.map(r => r.address)).size !== results.length)
    throw new Error('Direcciones duplicadas detectadas — ABORT');

  clearScreen();
  showSummary(results);
  await promptEnter('¿Escribir addresses.json con estas 10 direcciones? Enter para confirmar…');

  const payload = buildPayload(results);
  validatePayload(payload);                     // valida ANTES de escribir
  writeAddresses(OUT_FILE, payload);
  validatePayload(readAddresses(OUT_FILE));     // re-lee y re-valida
  const hex = writeSha256(OUT_FILE, SHA_FILE);

  stdout.write(`\nOK: ${OUT_FILE} escrito y validado (${WALLET_COUNT} direcciones).\nSHA-256: ${hex}\n`);
}

main().catch(err => {
  stderr.write(`\nERROR — proceso abortado: ${err.message}\n`); // nunca material sensible
  process.exit(1);
});
```

---

## 5. package.json, package-lock y .gitignore

### 5.1 `package.json`

```json
{
  "name": "wallet-gen",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": "22.x" },
  "scripts": {
    "smoke": "node test/smoke.js"
  },
  "dependencies": {
    "@scure/bip39": "2.2.0",
    "@scure/bip32": "2.2.0",
    "@noble/curves": "2.2.0",
    "@noble/hashes": "2.2.0",
    "ethers": "6.17.0"
  }
}
```

Sin script `start`: el programa se ejecuta con `node src/main.js`. Versiones **exactas**; `"type":"module"`; sin `devDependencies`.

### 5.2 `.nvmrc`

```
22
```

### 5.3 `package-lock.json`

Se **commitea**. Con `npm ci`, instala exactamente el árbol del lock, falla si lock y `package.json` discrepan, y verifica los hashes de integridad SHA-512 de cada tarball → instalación determinista y verificada.

### 5.4 `.gitignore`

```gitignore
node_modules/
addresses.json
addresses.sha256.txt
*.log
npm-debug.log*
.DS_Store
```

---

## 6. Instalación y build

No hay compilación (JS puro). "Build" = instalar dependencias de forma reproducible y validar con el smoke test.

```bash
# setup inicial (fija versiones y genera el lock)
nvm use
npm install --save-exact @scure/bip39@2.2.0 @scure/bip32@2.2.0 @noble/curves@2.2.0 @noble/hashes@2.2.0 ethers@6.17.0

# instalación reproducible desde el lock
npm ci --ignore-scripts

# verificación
npm ls @noble/hashes @noble/curves
npm run smoke
```

`--ignore-scripts` bloquea los scripts de lifecycle (vector de supply-chain en install); es seguro porque las deps son JS puro sin build nativo.

---

## 7. Smoke test

`test/smoke.js` valida versiones/subpaths y corrección de la derivación con **solo vectores públicos**, sin tocar el flujo real ni generar material sensible. Sale con código ≠ 0 si algo falla.

Chequeos mínimos:
1. Importan los cuatro subpaths `.js` de §2.
2. `deriveA` y `deriveB` del mnemónico Hardhat dan ambos `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`.
3. Los 4 vectores EIP-55 del estándar pasan por `toEIP55`.
4. Round-trip `entropy → mnemonic → entropy` con entropía fija de prueba; `validateMnemonic` da true; 24 palabras.
5. `validatePayload` rechaza un JSON con una clave extra / campo sensible / address duplicado / no canónico.

---

## 8. Nota de honestidad

Zero-fill best-effort: el programa limpia los `Uint8Array` que controla (entropía, seed, clave privada, round-trip), pero **no puede** garantizar el borrado de memoria: el mnemónico es un `string` inmutable en V8 (no se puede sobrescribir) y las librerías mantienen copias internas que no exponen para limpiar. La higiene de memoria es best-effort, no absoluta.

---

## 9. Cambios aplicados / cambios rechazados

**Aplicados**

| # | Cambio | Nota |
|---|---|---|
| 1 | Sacar `start` de `package.json`. | Elegí **eliminarlo** (no el `echo … && exit 1`): un `start` que sale con código ≠ 0 igual dispara el log ELIFECYCLE de npm, así que no cumple el objetivo de "sin logs" y agrega ruido. Eliminarlo es más simple; se ejecuta con `node src/main.js`. |
| 2 | `deriveA` con `try/finally`. | Aplicado (§4.5): el zero-fill de `seed`/`node.privateKey` corre aunque haya error. Igual en `mnemonic.js` para `roundtrip`. |
| 3 | Allowlist estricta de campos. | Aplicado (§4.9): `validatePayload` exige claves top-level y por wallet exactamente permitidas; la blacklist queda como defensa adicional. |
| 4 | Validar antes de escribir. | Aplicado (§4.10): `buildPayload → validatePayload → write → read → validatePayload → sha`. |
| 5 | Wording preciso de archivos escritos. | Aplicado (§0.6): "solo escribe dos archivos públicos: `addresses.json` y `addresses.sha256.txt`; no escribe secretos, logs ni temporales". |

**Recortes por pedido de simplicidad** (no eran recomendaciones tuyas, pero pediste algo mucho más simple y que §9 no lo habías pedido): eliminé la sección "Por qué la entropía es fuerte", la sección larga de "Garantías y límites" y la de "Criterios de aceptación", dejando solo la nota de honestidad de memoria (§8) que sí pediste conservar. Se conservó intacto todo lo técnico del keep-list (24 palabras, 256 bits, `randomFillSync`, `entropyToMnemonic`, round-trip, path, A/B, EIP-55, `walletNumber`, confirmaciones, abort si existe, `.gitignore`, smoke, sin secretos de entrada, sin modo debug).

**Rechazados**: ninguno — las 5 recomendaciones accionables se aplicaron.
