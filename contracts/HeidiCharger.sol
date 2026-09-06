// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts@5.1.0/token/ERC20/IERC20.sol";

/**
 * @title HeidiCharger  (simulierte IoT-EV-Ladestation)
 * @notice Eine Ladestation als Contract. Die Station selbst ist ein echtes
 *         ERC-4337 Smart Account (`stationAccount`) – dorthin fliesst das Geld.
 *
 * Ablauf:
 *  1. Ist die Station frei (`isFree()`), waehlt der:die Fahrer:in eine kW-Menge
 *     (5 / 10 / 15 / 20). Die Wallet sendet EINE UserOperation mit zwei Calls:
 *       token.approve(charger, quote(kW))
 *       charger.startCharge(kW)
 *  2. `startCharge` zieht `kW * pricePerKwBase` HDI ein und schickt sie direkt an
 *     das Smart Account der Station, merkt sich die Session und setzt
 *     `endsAt = now + kW * secondsPerKw` (Zeitraffer der „Ladedauer").
 *  3. Nach `endsAt` ist die Station automatisch wieder frei. Beide Oberflaechen
 *     (Wallet + Simulator-Seite) lesen `status()` – kein Server-Zustand noetig.
 *
 * Bewusst minimal: kein Owner, kein vorzeitiger Abbruch, keine Rueckerstattung.
 * Lern-/Demo-Code fuer Sepolia.
 */
contract HeidiCharger {
    IERC20  public immutable token;
    address public immutable stationAccount;   // Zahlungsempfaenger (Smart Account der Station)
    uint256 public immutable pricePerKwBase;   // HDI-Basiseinheiten (2 Dezimalst.) je kW
    uint256 public immutable secondsPerKw;     // Zeitraffer: „Ladedauer" je kW in Sekunden

    struct Session {
        address user;
        uint8   kW;
        uint64  startedAt;
        uint64  endsAt;
        uint256 paid;
    }
    Session public current;

    event ChargeStarted(address indexed user, uint8 kW, uint256 paid, uint64 startedAt, uint64 endsAt);

    constructor(IERC20 token_, address stationAccount_, uint256 pricePerKwBase_, uint256 secondsPerKw_) {
        require(address(token_) != address(0), "token 0");
        require(stationAccount_ != address(0), "station 0");
        require(pricePerKwBase_ > 0 && secondsPerKw_ > 0, "params 0");
        token = token_;
        stationAccount = stationAccount_;
        pricePerKwBase = pricePerKwBase_;
        secondsPerKw = secondsPerKw_;
    }

    /// @notice true, wenn keine Ladung mehr laeuft.
    function isFree() public view returns (bool) {
        return block.timestamp >= current.endsAt;
    }

    /// @notice Preis fuer `kW` in HDI-Basiseinheiten.
    function quote(uint8 kW) public view returns (uint256) {
        return uint256(kW) * pricePerKwBase;
    }

    /// @notice Ladung starten. Vorher `token.approve(address(this), quote(kW))`.
    function startCharge(uint8 kW) external {
        require(kW == 5 || kW == 10 || kW == 15 || kW == 20, "kW: 5/10/15/20");
        require(isFree(), "Station besetzt");

        uint256 cost = quote(kW);
        require(token.transferFrom(msg.sender, stationAccount, cost), "Zahlung fehlgeschlagen");

        uint64 nowTs = uint64(block.timestamp);
        uint64 endsAt = nowTs + uint64(uint256(kW) * secondsPerKw);
        current = Session({ user: msg.sender, kW: kW, startedAt: nowTs, endsAt: endsAt, paid: cost });
        emit ChargeStarted(msg.sender, kW, cost, nowTs, endsAt);
    }

    /// @notice Alles, was die Oberflaechen brauchen, in einem Aufruf.
    function status()
        external
        view
        returns (
            bool free,
            address user,
            uint8 kW,
            uint64 startedAt,
            uint64 endsAt,
            uint256 paid,
            uint256 remaining
        )
    {
        Session memory s = current;
        free = block.timestamp >= s.endsAt;
        remaining = s.endsAt > block.timestamp ? s.endsAt - block.timestamp : 0;
        return (free, s.user, s.kW, s.startedAt, s.endsAt, s.paid, remaining);
    }
}
