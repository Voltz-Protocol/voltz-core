// SPDX-License-Identifier: Apache-2.0
pragma solidity =0.8.9;

/**
 * @dev RocketPool RETH mock - only for testing purposes.
 */
contract MockRocketEth {
    uint256 private _rethMultiplier = 0;
    uint256 private _lastUpdatedBlock;
    bool private _instantUpdates;

    constructor (bool instantUpdates) {
        _instantUpdates = instantUpdates;
    }

    function getEthValue(uint256 rethAmount) public view returns (uint256) {
        return (rethAmount * _rethMultiplier) / 1e27;
    }

    function getLastUpdatedBlock() public view returns (uint256) {
        if (_instantUpdates) {
            return block.number;
        }
        else {
            return _lastUpdatedBlock;
        }
    }

    function setRethMultiplierInRay(uint256 rethMultiplier) public {
        _rethMultiplier = rethMultiplier;
        _lastUpdatedBlock = block.number;
    }
}
