import { MockWETH, TestRateOracle } from "../../../typechain";
import { deployments, ethers, waffle } from "hardhat";
import { toBn } from "../../helpers/toBn";
import { consts } from "../../helpers/constants";
import { MockRocketEth } from "../../../typechain/MockRocketEth";
import { MockRocketNetworkBalances } from "../../../typechain/MockRocketNetworkBalances";

let rocketEth: MockRocketEth;
let rocketNetworkBalances: MockRocketNetworkBalances;
let weth: MockWETH;

const { provider } = waffle;

export const ConfigForGenericTests = {
  configName: "RocketPool",
  startingExchangeRate: 1,
  oracleFixture: async () => {
    // Use hardhat-deploy to deploy factory and mocks
    await deployments.fixture(["Factory", "Mocks"]);

    // store rocketEth for use when setting rates
    rocketEth = (await ethers.getContract("MockRocketEth")) as MockRocketEth;
    weth = (await ethers.getContract("MockWETH")) as MockWETH;
    rocketNetworkBalances = (await ethers.getContract(
      "MockRocketNetworkBalances"
    )) as MockRocketNetworkBalances;

    const TestRateOracleFactory = await ethers.getContractFactory(
      "TestRocketPoolRateOracle"
    );

    const testRateOracle = (await TestRateOracleFactory.deploy(
      rocketEth.address,
      rocketNetworkBalances.address,
      weth.address
    )) as TestRateOracle;
    return { testRateOracle, rocketEth: rocketEth };
  },
  setRateAsDecimal: async (rate: number) => {
    // To set the rate for Aave, we call setReserveNormalizedIncome on the lending pool
    // The decimal value is scaled up by 10^27
    const blockNumber = await provider.getBlockNumber();
    console.log("block number of update:", blockNumber.toString());
    await rocketEth.setRethMultiplierInRay(
      toBn(rate, consts.NORMALIZED_RATE_DECIMALS)
    );
  },
};
