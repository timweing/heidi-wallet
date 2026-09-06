// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts@5.1.0/token/ERC20/IERC20.sol";

/**
 * @title HeidiBikes  (Velo-Verleih mit Depot)
 * @notice Kleine Velo-Flotte an festen Stationen. Ablauf wie beim Parkplatz:
 *
 *  1. `rent(bikeId, plannedMin)` – Mieter:in hinterlegt ein festes **Depot**
 *     (`depositBase` HDI, vorher `approve`) im Contract und nennt die vorgesehene
 *     Nutzungsdauer. Das Velo ist damit belegt.
 *  2. `returnBike(bikeId, stationId)` – Rückgabe an einer der erlaubten Stationen.
 *     Der Contract zahlt das **Depot zurück**; bei Überzeit wird eine Strafe
 *     (`penaltyPerMinBase` je Minute über `plannedMin`, gedeckelt aufs Depot)
 *     abgezogen und an `operator` überwiesen.
 *
 * Bewusst minimal: kein Owner, keine Reservierung ohne Nutzung, keine
 * vorzeitige Kündigung durch Dritte. Das Depot ist per Konstruktion gedeckt –
 * der Contract hält nur, was eingezahlt wurde. Lern-/Demo-Code für Sepolia.
 */
contract HeidiBikes {
    IERC20  public immutable token;
    address public immutable operator;          // erhaelt die Ueberzeit-Strafen
    uint256 public immutable depositBase;       // Depot je Miete (HDI-Basiseinheiten)
    uint256 public immutable penaltyPerMinBase; // Strafe je Minute ueber plannedMin

    string[] public stations;                   // erlaubte Rueckgabe-Stationen (Namen)

    struct Bike {
        address renter;    // 0 => frei
        uint64  startedAt;
        uint32  plannedMin;
        uint256 deposit;
        uint8   station;    // aktuelle Station, solange frei
    }
    Bike[] public bikes;

    event Rented(uint8 indexed bikeId, address indexed renter, uint32 plannedMin, uint256 deposit, uint64 startedAt);
    event Returned(uint8 indexed bikeId, address indexed renter, uint8 stationId, uint256 usedMin, uint256 penalty, uint256 refund);

    constructor(
        IERC20 token_,
        address operator_,
        uint256 depositBase_,
        uint256 penaltyPerMinBase_,
        uint8 bikeCount_,
        string[] memory stations_
    ) {
        require(address(token_) != address(0) && operator_ != address(0), "zero addr");
        require(depositBase_ > 0 && penaltyPerMinBase_ > 0, "zero param");
        require(bikeCount_ >= 1 && bikeCount_ <= 20, "1..20 Velos");
        require(stations_.length >= 1 && stations_.length <= 20, "1..20 Stationen");
        token = token_;
        operator = operator_;
        depositBase = depositBase_;
        penaltyPerMinBase = penaltyPerMinBase_;
        stations = stations_;
        for (uint8 i = 0; i < bikeCount_; i++) {
            bikes.push(Bike({ renter: address(0), startedAt: 0, plannedMin: 0, deposit: 0, station: uint8(i % stations_.length) }));
        }
    }

    function bikeCount() external view returns (uint256) { return bikes.length; }
    function stationCount() external view returns (uint256) { return stations.length; }

    function _calc(Bike memory b) private view returns (uint256 usedMin, uint256 overMin, uint256 penalty) {
        if (b.renter == address(0)) return (0, 0, 0);
        usedMin = (block.timestamp - b.startedAt + 59) / 60; // aufgerundet
        overMin = usedMin > b.plannedMin ? usedMin - b.plannedMin : 0;
        penalty = overMin * penaltyPerMinBase;
        if (penalty > b.deposit) penalty = b.deposit;
    }

    /// @notice Velo reservieren. Vorher `token.approve(address(this), depositBase)`.
    function rent(uint8 bikeId, uint32 plannedMin) external {
        require(bikeId < bikes.length, "bad bike");
        require(plannedMin >= 15 && plannedMin <= 1440, "15..1440 min");
        Bike storage b = bikes[bikeId];
        require(b.renter == address(0), "Velo belegt");
        require(token.transferFrom(msg.sender, address(this), depositBase), "Depot fehlgeschlagen");
        b.renter = msg.sender;
        b.startedAt = uint64(block.timestamp);
        b.plannedMin = plannedMin;
        b.deposit = depositBase;
        emit Rented(bikeId, msg.sender, plannedMin, depositBase, b.startedAt);
    }

    /// @notice Velo an einer Station zurueckgeben. Depot minus Ueberzeit-Strafe zurueck.
    function returnBike(uint8 bikeId, uint8 stationId) external {
        require(bikeId < bikes.length, "bad bike");
        require(stationId < stations.length, "bad station");
        Bike storage b = bikes[bikeId];
        require(b.renter == msg.sender, "nicht dein Velo");

        (uint256 usedMin, , uint256 penalty) = _calc(b);
        uint256 refund = b.deposit - penalty;

        b.renter = address(0);
        b.startedAt = 0;
        b.plannedMin = 0;
        b.deposit = 0;
        b.station = stationId;

        if (penalty > 0) require(token.transfer(operator, penalty), "penalty xfer");
        if (refund > 0) require(token.transfer(msg.sender, refund), "refund xfer");
        emit Returned(bikeId, msg.sender, stationId, usedMin, penalty, refund);
    }

    /// @notice Alles fuer die UI in einem Aufruf.
    function bikeInfo(uint8 bikeId)
        external
        view
        returns (
            address renter,
            uint64 startedAt,
            uint32 plannedMin,
            uint256 deposit,
            uint8 station,
            uint256 usedMin,
            uint256 overMin,
            uint256 penalty
        )
    {
        Bike memory b = bikes[bikeId];
        (usedMin, overMin, penalty) = _calc(b);
        return (b.renter, b.startedAt, b.plannedMin, b.deposit, b.station, usedMin, overMin, penalty);
    }
}
