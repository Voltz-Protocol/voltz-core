import { waffle, ethers } from "hardhat";
import { toBn } from "evm-bn";
import { consts } from "../../../helpers/constants";
import {
  ALPHA,
  APY_LOWER_MULTIPLIER,
  APY_UPPER_MULTIPLIER,
  BETA,
  encodeSqrtRatioX96,
  MIN_DELTA_IM,
  MIN_DELTA_LM,
  TICK_SPACING,
  T_MAX,
  XI_LOWER,
  XI_UPPER,
} from "../../../shared/utilities";
import { e2eParameters } from "../e2eSetup";
import { ScenarioRunner } from "../general";
import { MarginEngineEmergency } from "../../../../typechain/MarginEngineEmergency";
import { BigNumber } from "ethers";
import { expect } from "../../../shared/expect";

const { provider } = waffle;

const e2eParams: e2eParameters = {
  duration: consts.ONE_MONTH.mul(3),
  numActors: 6,
  marginCalculatorParams: {
    apyUpperMultiplierWad: APY_UPPER_MULTIPLIER,
    apyLowerMultiplierWad: APY_LOWER_MULTIPLIER,
    minDeltaLMWad: MIN_DELTA_LM,
    minDeltaIMWad: MIN_DELTA_IM,
    sigmaSquaredWad: toBn("0.15"),
    alphaWad: ALPHA,
    betaWad: BETA,
    xiUpperWad: XI_UPPER,
    xiLowerWad: XI_LOWER,
    tMaxWad: T_MAX,

    devMulLeftUnwindLMWad: toBn("0.5"),
    devMulRightUnwindLMWad: toBn("0.5"),
    devMulLeftUnwindIMWad: toBn("0.8"),
    devMulRightUnwindIMWad: toBn("0.8"),

    fixedRateDeviationMinLeftUnwindLMWad: toBn("0.1"),
    fixedRateDeviationMinRightUnwindLMWad: toBn("0.1"),

    fixedRateDeviationMinLeftUnwindIMWad: toBn("0.3"),
    fixedRateDeviationMinRightUnwindIMWad: toBn("0.3"),

    gammaWad: toBn("1.0"),
    minMarginToIncentiviseLiquidators: 0, // keep zero for now then do tests with the min liquidator incentive
  },
  lookBackWindowAPY: consts.ONE_WEEK,
  startingPrice: encodeSqrtRatioX96(1, 1),
  feeProtocol: 5,
  fee: toBn("0.01"),
  tickSpacing: TICK_SPACING,
  positions: [
    [0, -TICK_SPACING, TICK_SPACING],
    [1, -3 * TICK_SPACING, -TICK_SPACING],
    [0, -3 * TICK_SPACING, TICK_SPACING],
    [0, 0, TICK_SPACING],
    [2, -3 * TICK_SPACING, TICK_SPACING],
    [3, -TICK_SPACING, TICK_SPACING],
    [4, -TICK_SPACING, TICK_SPACING],
    [5, -TICK_SPACING, TICK_SPACING],
  ],
  skipped: true,
};

class ScenarioRunnerInstance extends ScenarioRunner {
  override async run() {
    const otherWallet = provider.getWallets()[1];

    await this.mintAndApprove(this.owner.address);
    await this.token.approve(
      this.marginEngineTest.address,
      BigNumber.from(10).pow(27)
    );

    const initOwnerBalance = await this.token.balanceOf(this.owner.address);
    const initMEBalance = await this.token.balanceOf(
      this.marginEngineTest.address
    );

    await this.marginEngineTest.updatePositionMargin(
      this.owner.address,
      -this.params.tickSpacing,
      this.params.tickSpacing,
      toBn("210")
    );

    expect(await this.token.balanceOf(this.owner.address)).to.be.eq(
      initOwnerBalance.sub(toBn("210"))
    );

    expect(await this.token.balanceOf(this.marginEngineTest.address)).to.be.eq(
      initMEBalance.add(toBn("210"))
    );

    const marginEngineEmergencyMasterFactory = await ethers.getContractFactory(
      "MarginEngineEmergency"
    );
    const marginEngineEmergencyMaster =
      (await marginEngineEmergencyMasterFactory.deploy()) as MarginEngineEmergency;

    await expect(
      this.marginEngineTest
        .connect(otherWallet)
        .upgradeTo(marginEngineEmergencyMaster.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await this.marginEngineTest.upgradeTo(marginEngineEmergencyMaster.address);

    const marginEngineEmergency = marginEngineEmergencyMasterFactory.attach(
      this.marginEngineTest.address
    ) as MarginEngineEmergency;

    await marginEngineEmergency.emergencyWithdrawal(
      this.owner.address,
      -this.params.tickSpacing,
      this.params.tickSpacing
    );

    expect(await this.token.balanceOf(this.owner.address)).to.be.eq(
      initOwnerBalance
    );

    expect(await this.token.balanceOf(this.marginEngineTest.address)).to.be.eq(
      initMEBalance
    );
  }
}

const test = async () => {
  console.log("upgradability");
  const scenario = new ScenarioRunnerInstance(
    e2eParams,
    "test/end_to_end/general_setup/upgradability/console.txt"
  );
  await scenario.init();
  await scenario.run();
};

it("upgradability", test);
