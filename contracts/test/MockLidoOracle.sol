// SPDX-License-Identifier: Apache-2.0
pragma solidity =0.8.9;

import "contracts/interfaces/lido/ILidoOracle.sol";
import "contracts/test/MockStEth.sol";

/**
 * @dev Lido Oracle mock - only for testing purposes.
 */
contract MockLidoOracle is ILidoOracle {
    uint256 private sharesMultiplier = 1e27;
    MockStEth public mockStEth;

    constructor(MockStEth _mockStEth) {
        mockStEth = _mockStEth;
    }

    /**
     * @notice Report beacon balance and its change during the last frame
     */
    function getLastCompletedReportDelta()
        external
        view
        override
        returns (
            uint256 postTotalPooledEther,
            uint256 preTotalPooledEther,
            uint256 timeElapsed
        )
    {
        // 101 ether, 100 ether, 1 day
        return (1e20 + 1e18, 1e20, 86400);
    }

    /**
     * @notice Return currently reportable epoch (the first epoch of the current frame) as well as
     * its start and end times in seconds
     */
    function getCurrentFrame()
        external
        view
        override
        returns (
            uint256 frameEpochId,
            uint256 frameStartTime,
            uint256 frameEndTime
        )
    {
        // solhint-disable-next-line not-rely-on-time
        uint256 lastUpdatedTimestamp = mockStEth.getlastUpdatedTimestamp();
        return (0, lastUpdatedTimestamp, lastUpdatedTimestamp + 86400);
    }

    function getLastCompletedEpochId() external view returns (uint256) {
        bool instantUpdates = mockStEth.getInstantUpdates();
        if (instantUpdates) {
            return block.timestamp;
        } else {
            return mockStEth.getlastUpdatedTimestamp();
        }
    }

    function getBeaconSpec()
        external
        view
        returns (
            uint64 epochsPerFrame,
            uint64 slotsPerEpoch,
            uint64 secondsPerSlot,
            uint64 genesisTime
        )
    {
        // By returning 1 seconds per epoch and zero as the genesis, we can simply return the timestamp as the last completed epoch
        return (1, 1, 1, 0);
    }
}
