// Gutschein-Einloesung (LinkDrop): ephemeraler Key aus dem QR signiert eine an
// die Empfaengeradresse gebundene Nachricht; der Contract prueft die Signatur.

import { keccak256, encodePacked, getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { CONFIG } from './config.js'

export function voucherAddressFromKey(privKey) {
  return privateKeyToAccount(privKey.startsWith('0x') ? privKey : '0x' + privKey).address
}

// Muss zur Solidity-Seite passen:
//   keccak256(abi.encodePacked("HeidiVoucher", block.chainid, address(this), recipient))
//   danach toEthSignedMessageHash + ECDSA.recover
export async function buildVoucherClaim(privKey, recipient) {
  const eph = privateKeyToAccount(privKey.startsWith('0x') ? privKey : '0x' + privKey)
  const hash = keccak256(
    encodePacked(
      ['string', 'uint256', 'address', 'address'],
      ['HeidiVoucher', BigInt(CONFIG.CHAIN_ID), getAddress(CONFIG.VOUCHER_ADDRESS), getAddress(recipient)],
    ),
  )
  const signature = await eph.signMessage({ message: { raw: hash } })
  return { ephemeral: eph.address, recipient: getAddress(recipient), signature }
}
