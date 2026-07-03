import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js'; // Keccak Ethereum, NO sha3_256
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { PATH } from './constants.js';
import { zeroFill } from './entropy.js';

// (mnemonic: string) -> string (EIP-55)
export function deriveA(mnemonic) {
  const seed = mnemonicToSeedSync(mnemonic); // Uint8Array(64), passphrase VACÍA
  let node;
  try {
    const hd = HDKey.fromMasterSeed(seed); // recibe SEED de 64B, no el mnemónico
    node = hd.derive(PATH);
    if (!node.privateKey) throw new Error('deriveA: sin privateKey en la ruta — ABORT');

    const pub = secp256k1.getPublicKey(node.privateKey, false); // 65B no comprimida (0x04||X||Y)
    const hash = keccak_256(pub.slice(1)); // dropear 0x04 → 64B, luego keccak
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
