// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
import "./interfaces/IFCM.sol";
import "./core_libraries/TraderWithYieldBearingAssets.sol";
import "./interfaces/IERC20Minimal.sol";
import "./interfaces/IVAMM.sol";
import "./interfaces/aave/IAaveV2LendingPool.sol";
import "prb-math/contracts/PRBMathUD60x18.sol";
import "./core_libraries/FixedAndVariableMath.sol";
import "./interfaces/rate_oracles/IRateOracle.sol";
import "./utils/WayRayMath.sol";

// todo: proxy pattern
// todo: bring the FCM into the factory when initiating the IRS instance
// todo: add overrides
// todo: change the name of the unwind boolean since now it handles both fcm and unwinds
// todo: introduce base FCM abstract class?
// todo: have a function that lets traders directly deposit aTokens into their margin account (update margin)
// todo: can we use IERC20Minimal for aTokens?

contract AaveFCM is IFCM {

  using WadRayMath for uint256;

  using TraderWithYieldBearingAssets for TraderWithYieldBearingAssets.Info;
  
  // add overrides
  address public underlyingYieldBearingToken;
  address public vammAddress;
  address public marginEngineAddress;
  address public aaveLendingPool;
  IRateOracle internal rateOracle;

  // add getter
  mapping(address => TraderWithYieldBearingAssets.Info) public override traders;

  /// The resulting margin does not meet minimum requirements
  error MarginRequirementNotMet();

  /// Positions and Traders cannot be settled before the applicable interest rate swap has matured 
  error CannotSettleBeforeMaturity();
  
  constructor (address _underlyingYieldBearingToken, address _vammAddress, address _marginEngineAddress, address _aaveLendingPool) {
    underlyingYieldBearingToken = _underlyingYieldBearingToken;
    vammAddress = _vammAddress;
    marginEngineAddress = _marginEngineAddress;
    aaveLendingPool = _aaveLendingPool;
    address rateOracleAddress = IMarginEngine(marginEngineAddress).rateOracleAddress();
    rateOracle = IRateOracle(rateOracleAddress);
  }

  function initiateFullyCollateralisedFixedTakerSwap(uint256 notional, uint160 sqrtPriceLimitX96) external override {

    require(notional!=0, "notional = 0");

    // initiate a swap
    IVAMM.SwapParams memory params = IVAMM.SwapParams({
        recipient: address(this),
        isFT: true,
        amountSpecified: int256(notional),
        sqrtPriceLimitX96: sqrtPriceLimitX96,
        isExternal: true,
        isTrader: true,
        tickLower: 0,
        tickUpper: 0
    });

    (int256 fixedTokenDelta, int256 variableTokenDelta, uint256 cumulativeFeeIncurred) = IVAMM(vammAddress).swap(params);

    // deposit notional executed in terms of aTokens (e.g. aUSDC)
    IERC20Minimal(underlyingYieldBearingToken).transferFrom(msg.sender, address(this), uint256(-variableTokenDelta));

    TraderWithYieldBearingAssets.Info storage trader = traders[msg.sender];

    uint256 currentRNI = IAaveV2LendingPool(aaveLendingPool).getReserveNormalizedIncome(IMarginEngine(marginEngineAddress).underlyingToken());

    uint256 updatedTraderMargin = trader.marginInScaledYieldBearingTokens + uint256(-variableTokenDelta).rayDiv(currentRNI);
    trader.updateMarginInScaledYieldBearingTokens(updatedTraderMargin);
    
    // update trader fixed and variable token balances

    trader.updateBalancesViaDeltas(fixedTokenDelta, variableTokenDelta);

    // transfer fees to the margin engine (in terms of the underlyingToken e.g. aUSDC)
    IERC20Minimal(IMarginEngine(marginEngineAddress).underlyingToken()).transferFrom(msg.sender, marginEngineAddress, cumulativeFeeIncurred);

  }

  function getTraderMarginInYieldBearingTokens(TraderWithYieldBearingAssets.Info storage trader) internal view returns (uint256 marginInYieldBearingTokens) {
    uint256 currentRNI = IAaveV2LendingPool(aaveLendingPool).getReserveNormalizedIncome(IMarginEngine(marginEngineAddress).underlyingToken());
    marginInYieldBearingTokens = trader.marginInScaledYieldBearingTokens.rayMul(currentRNI);
  }

  function unwindFullyCollateralisedFixedTakerSwap(uint256 notionalToUnwind, uint160 sqrtPriceLimitX96) external override {
    
    TraderWithYieldBearingAssets.Info storage trader = traders[msg.sender];

    require(uint256(-trader.variableTokenBalance) >= notionalToUnwind, "notional to unwind > notional");

    // initiate a swap
    IVAMM.SwapParams memory params = IVAMM.SwapParams({
        recipient: address(this),
        isFT: false,
        amountSpecified: -int256(notionalToUnwind),
        sqrtPriceLimitX96: sqrtPriceLimitX96,
        isExternal: true,
        isTrader: true,
        tickLower: 0,
        tickUpper: 0
    });

    (int256 fixedTokenDelta, int256 variableTokenDelta, uint256 cumulativeFeeIncurred) = IVAMM(vammAddress).swap(params);
        
    // update trader fixed and variable token balances
    
    trader.updateBalancesViaDeltas(fixedTokenDelta, variableTokenDelta);

    // transfer fees to the margin engine
    IERC20Minimal(IMarginEngine(marginEngineAddress).underlyingToken()).transferFrom(msg.sender, marginEngineAddress, cumulativeFeeIncurred);

    // transfer the yield bearing tokens to trader address and update margin in terms of yield bearing tokens
    // variable token delta should be positive
    IERC20Minimal(underlyingYieldBearingToken).transfer(msg.sender, uint256(variableTokenDelta));

    uint256 currentRNI = IAaveV2LendingPool(aaveLendingPool).getReserveNormalizedIncome(IMarginEngine(marginEngineAddress).underlyingToken());

    uint256 updatedTraderMargin = trader.marginInScaledYieldBearingTokens - uint256(variableTokenDelta).rayDiv(currentRNI);
    trader.updateMarginInScaledYieldBearingTokens(updatedTraderMargin);

    checkMarginRequirement(trader);

  }

  
  function checkMarginRequirement(TraderWithYieldBearingAssets.Info storage trader) internal {
    // variable token balance should never be positive
    // margin should cover the variable leg from now to maturity

    uint256 marginToCoverVariableLegFromNowToMaturity = uint256(trader.variableTokenBalance);
    uint256 marginToCoverRemainingSettlementCashflow = getTraderMarginInYieldBearingTokens(trader) - marginToCoverVariableLegFromNowToMaturity;

    int256 remainingSettlementCashflow = calculateRemainingSettlementCashflow(trader);

    if (remainingSettlementCashflow < 0) {
    
      if (uint256(-remainingSettlementCashflow) > marginToCoverRemainingSettlementCashflow) {
        revert MarginRequirementNotMet();
      }
    
    }

  }

  function calculateRemainingSettlementCashflow(TraderWithYieldBearingAssets.Info storage trader) internal returns (int256 remainingSettlementCashflow) {
    
    int256 fixedTokenBalanceWad = PRBMathSD59x18.fromInt(trader.fixedTokenBalance);
    
    int256 variableTokenBalanceWad = PRBMathSD59x18.fromInt(
        trader.variableTokenBalance
    );

    int256 fixedCashflowWad = PRBMathSD59x18.mul(
      fixedTokenBalanceWad,
      int256(
        FixedAndVariableMath.fixedFactor(true, IMarginEngine(marginEngineAddress).termStartTimestampWad(), IMarginEngine(marginEngineAddress).termEndTimestampWad())
      )
    );

    int256 variableFactorFromTermStartTimestampToNow = int256(rateOracle.variableFactor(
      IMarginEngine(marginEngineAddress).termStartTimestampWad(),
      IMarginEngine(marginEngineAddress).termEndTimestampWad()
    ));
    
    int256 variableCashflowWad = PRBMathSD59x18.mul(
      variableTokenBalanceWad,
      variableFactorFromTermStartTimestampToNow
    );

    int256 cashflowWad = fixedCashflowWad + variableCashflowWad;

    /// @dev convert back to non-fixed point representation
    remainingSettlementCashflow = PRBMathSD59x18.toInt(cashflowWad);

  }
    
  modifier onlyAfterMaturity () {
    if (IMarginEngine(marginEngineAddress).termEndTimestampWad() > Time.blockTimestampScaled()) {
        revert CannotSettleBeforeMaturity();
    }
    _;
  }

  // only after maturity
  function settleTrader() external override onlyAfterMaturity { 
    
    TraderWithYieldBearingAssets.Info storage trader = traders[msg.sender];
    require(!trader.isSettled, "not settled");
    
    int256 settlementCashflow = FixedAndVariableMath.calculateSettlementCashflow(trader.fixedTokenBalance, trader.variableTokenBalance, IMarginEngine(marginEngineAddress).termStartTimestampWad(), IMarginEngine(marginEngineAddress).termEndTimestampWad(), rateOracle.variableFactor(IMarginEngine(marginEngineAddress).termStartTimestampWad(), IMarginEngine(marginEngineAddress).termEndTimestampWad()));
    trader.updateBalancesViaDeltas(-trader.fixedTokenBalance, -trader.variableTokenBalance);
    
    if (settlementCashflow > 0) {
      // transfers margin in terms of underlying tokens (e.g. USDC) from 
      IMarginEngine(marginEngineAddress).transferMarginToFCMTrader(msg.sender, uint256(settlementCashflow));
    } else {
      uint256 currentRNI = IAaveV2LendingPool(aaveLendingPool).getReserveNormalizedIncome(IMarginEngine(marginEngineAddress).underlyingToken());
      uint256 updatedTraderMarginInScaledYieldBearingTokens = trader.marginInScaledYieldBearingTokens - uint256(-settlementCashflow).rayDiv(currentRNI);
      trader.updateMarginInScaledYieldBearingTokens(updatedTraderMarginInScaledYieldBearingTokens);
    }

    uint256 traderMarginInYieldBearingTokens = getTraderMarginInYieldBearingTokens(trader);
    trader.updateMarginInScaledYieldBearingTokens(0);    
    IERC20Minimal(underlyingYieldBearingToken).transfer(msg.sender, traderMarginInYieldBearingTokens);
    trader.settleTrader();
  }

  function transferMarginToMarginEngineTrader(address _account, uint256 marginDeltaInUnderlyingTokens) external override {
    /// @audit can only be called by the MarginEngine
    // in case of aave: 1aUSDC = 1USDC (1aToken = 1Token), hence no need for additional calculations
    IERC20Minimal(underlyingYieldBearingToken).transfer(_account, marginDeltaInUnderlyingTokens);
  }

  // optional: margin topup function (in terms of yield bearing tokens)

}