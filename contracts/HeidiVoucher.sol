// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts@5.1.0/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts@5.1.0/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts@5.1.0/utils/cryptography/MessageHashUtils.sol";

/**
 * @title HeidiVoucher  (LinkDrop-Prinzip)
 * @notice Physische Papier-Gutscheine mit QR-Code.
 *
 * Ablauf:
 *  1. Aussteller erzeugt ein Einmal-Schluesselpaar. Der PRIVATE Key wird als
 *     QR-Code auf den Papiergutschein gedruckt. Aussteller ruft
 *     `createVoucher(ephemeralAddress, amount)` und hinterlegt dabei `amount` HDI
 *     im Contract (vorher `approve`).
 *  2. Empfaenger scannt den QR, die App liest den privaten Key, signiert damit
 *     eine an DIE EIGENE Empfaengeradresse gebundene Nachricht und ruft
 *     `claim(ephemeralAddress, recipient, signature)`.
 *  3. Der Contract prueft die Signatur, zahlt `amount` HDI an `recipient` und
 *     markiert den Gutschein als eingeloest -> danach unbrauchbar.
 *
 * Front-running-sicher: die Transaktion enthaelt nur die (an den Empfaenger
 * gebundene) Signatur, nie den privaten Key. Ein Beobachter im Mempool kann sie
 * nicht auf eine andere Adresse ummuenzen.
 */
contract HeidiVoucher {
    using MessageHashUtils for bytes32;

    IERC20 public immutable token;

    mapping(address => uint256) public amountOf; // ephemeralAddr => HDI (0 = leer/eingeloest)
    mapping(address => bool) public claimed;

    event VoucherCreated(address indexed ephemeral, uint256 amount, address indexed issuer);
    event VoucherClaimed(address indexed ephemeral, address indexed recipient, uint256 amount);

    constructor(IERC20 token_) {
        token = token_;
    }

    /// @notice Gutschein anlegen und mit `amount` HDI hinterlegen (vorher `approve`).
    function createVoucher(address ephemeral, uint256 amount) external {
        require(ephemeral != address(0), "zero ephemeral");
        require(amount > 0, "zero amount");
        require(amountOf[ephemeral] == 0 && !claimed[ephemeral], "voucher exists");
        amountOf[ephemeral] = amount;
        require(token.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        emit VoucherCreated(ephemeral, amount, msg.sender);
    }

    /// @notice Nachricht, die der Einmal-Key signieren muss (an `recipient` gebunden).
    function claimHash(address recipient) public view returns (bytes32) {
        return keccak256(abi.encodePacked("HeidiVoucher", block.chainid, address(this), recipient));
    }

    /// @notice Gutschein einloesen. `signature` = Einmal-Key ueber claimHash(recipient).
    function claim(address ephemeral, address recipient, bytes calldata signature) external {
        uint256 amount = amountOf[ephemeral];
        require(amount > 0, "voucher empty or claimed");
        require(recipient != address(0), "zero recipient");

        address signer = ECDSA.recover(claimHash(recipient).toEthSignedMessageHash(), signature);
        require(signer == ephemeral, "bad signature");

        amountOf[ephemeral] = 0;
        claimed[ephemeral] = true;
        require(token.transfer(recipient, amount), "payout failed");
        emit VoucherClaimed(ephemeral, recipient, amount);
    }

    function previewVoucher(address ephemeral) external view returns (uint256 amount, bool isClaimed) {
        return (amountOf[ephemeral], claimed[ephemeral]);
    }
}
