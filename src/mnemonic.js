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
