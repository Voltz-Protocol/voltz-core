import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { Factory } from "../typechain";
import { getConfig } from "../deployConfig/config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deploy } = hre.deployments;
  const { deployer } = await hre.getNamedAccounts();
  const doLogging = true;
  const config = getConfig(hre.network.name);
  const aaveTokens = config.aaveConfig?.aaveTokens;
  const compoundTokens = config.compoundConfig?.compoundTokens;
  const skipFactoryConfig = config.factoryOwnedByMultisig;
  let aaveRateOracle = await ethers.getContractOrNull("MockAaveRateOracle");
  let compoundRateOracle = await ethers.getContractOrNull(
    "MockCompoundRateOracle"
  );
  let underlyingYieldBearingProtocolID_AaveV2: number;
  let underlyingYieldBearingProtocolID_Compound: number;

  // Get Aave ID
  if (!aaveRateOracle && aaveTokens) {
    for (const token of aaveTokens) {
      const rateOracleIdentifier = `AaveRateOracle_${token.name}`;
      aaveRateOracle = await ethers.getContractOrNull(rateOracleIdentifier);

      if (aaveRateOracle) {
        break;
      }
    }
  }

  // Get Compound ID
  if (!compoundRateOracle && compoundTokens) {
    for (const token of compoundTokens) {
      const rateOracleIdentifier = `CompoundRateOracle_${token.name}`;
      compoundRateOracle = await ethers.getContractOrNull(rateOracleIdentifier);

      if (compoundRateOracle) {
        break;
      }
    }
  }

  if (aaveRateOracle) {
    underlyingYieldBearingProtocolID_AaveV2 =
      await aaveRateOracle.UNDERLYING_YIELD_BEARING_PROTOCOL_ID();
    const masterAaveFCM = await deploy("AaveFCM", {
      from: deployer,
      log: doLogging,
    });

    if (skipFactoryConfig) {
      console.log(
        `SKIPPING FACTORY CONFIG. CALL setMasterFCM("${masterAaveFCM.address}", ${underlyingYieldBearingProtocolID_AaveV2}) from multisig.`
      );
    } else {
      const factory = (await ethers.getContract("Factory")) as Factory;
      const trx = await factory.setMasterFCM(
        masterAaveFCM.address,
        underlyingYieldBearingProtocolID_AaveV2,
        { gasLimit: 10000000 }
      );
      await trx.wait();
    }
  }

  if (compoundRateOracle) {
    underlyingYieldBearingProtocolID_Compound =
      await compoundRateOracle.UNDERLYING_YIELD_BEARING_PROTOCOL_ID();
    const masterCompoundFCM = await deploy("CompoundFCM", {
      from: deployer,
      log: doLogging,
    });

    if (skipFactoryConfig) {
      console.log(
        `SKIPPING FACTORY CONFIG. CALL setMasterFCM("${masterCompoundFCM.address}", ${underlyingYieldBearingProtocolID_Compound}) from multisig.`
      );
    } else {
      const factory = (await ethers.getContract("Factory")) as Factory;
      const trx = await factory.setMasterFCM(
        masterCompoundFCM.address,
        underlyingYieldBearingProtocolID_Compound,
        { gasLimit: 10000000 }
      );
      await trx.wait();
    }
  }

  return true; // Only execute once
};
func.tags = ["FCMs"];
func.id = "FCMs";
export default func;
