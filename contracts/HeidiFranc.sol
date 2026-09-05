// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// OpenZeppelin wird von Remix direkt von npm aufgeloest (kein Download noetig).
import "@openzeppelin/contracts@5.1.0/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts@5.1.0/access/Ownable.sol";

/**
 * @title HeidiFranc
 * @notice Standard-ERC-20-"Stablecoin" fuer die Heidi Wallet Demo.
 *  - 2 Nachkommastellen: Betraege lesen sich wie CHF.Rappen (z. B. 12.50 HDI).
 *  - `faucet()` ist offen (Test-Bezug, 100 HDI, 24 h Sperre pro Adresse).
 *  - `mint()` nur fuer den Owner (Deployer), um Gutschein-/Park-Guthaben zu stellen.
 *
 * Keine Whitelist, keine Registry, keine Transfer-Einschraenkungen: ein Transfer
 * gelingt, solange das Guthaben reicht. NICHT fuer echten Wert / Mainnet.
 */
contract HeidiFranc is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 100_00; // 100.00 HDI
    uint256 public constant FAUCET_COOLDOWN = 24 hours;

    mapping(address => uint256) public lastFaucet;

    event Faucet(address indexed to, uint256 amount);

    constructor(address owner_) ERC20("Heidi Franc", "HDI") Ownable(owner_) {
        // Startguthaben fuer den Deployer, um Gutschein-/Park-Contracts zu befuellen.
        _mint(owner_, 1_000_000_00); // 1'000'000.00 HDI
    }

    function decimals() public pure override returns (uint8) {
        return 2;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Offener Test-Bezug: 100 HDI, danach 24 h Sperre pro Adresse.
    function faucet() external {
        require(block.timestamp - lastFaucet[msg.sender] >= FAUCET_COOLDOWN, "faucet: cooldown");
        lastFaucet[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit Faucet(msg.sender, FAUCET_AMOUNT);
    }
}
