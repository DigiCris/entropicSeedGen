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
