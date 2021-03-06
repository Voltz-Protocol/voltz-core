import { task } from "hardhat/config";
import { MarginEngine } from "../typechain";
import { ethers } from "ethers";
import mustache from "mustache";
import path from "path";

import { getPositions, Position } from "../scripts/getPositions";

interface liquidationTemplateData {
  liquidationsPerPool: {
    marginEngineAddress: string;
    vammAddress: string;
    liquidatablePositions: {
      owner: string;
      tickLower: number;
      tickUpper: number;
    }[];
  }[];
}

async function writeLiquidationOfPositionsToGnosisSafeTemplate(
  data: liquidationTemplateData
) {
  // Get external template with fetch
  const fs = require("fs");
  const template = fs.readFileSync(
    path.join(__dirname, "liquidatePositions.mustache.json"),
    "utf8"
  );
  const output = mustache.render(template, data);

  const file = `liquidatePositions.json`;
  fs.writeFileSync(file, output);
}

task("liquidatePositions", "Liquidate liquidatable positions")
  .addFlag(
    "multisig",
    "If set, the task will output a JSON file for use in a multisig, instead of sending transactions on chain"
  )
  .setAction(async (taskArgs, hre) => {
    if (!taskArgs.multisig) {
      console.log(
        "Currently no support for sending on chain transactions. --multisig flag must be turned on."
      );
      return;
    }

    const data: liquidationTemplateData = {
      liquidationsPerPool: [],
    };

    const marginEngineAddresses = new Set<string>();
    const positions: Position[] = await getPositions();
    for (const position of positions) {
      marginEngineAddresses.add(position.marginEngine);
    }

    for (const marginEngineAddress of marginEngineAddresses) {
      const marginEngine = (await hre.ethers.getContractAt(
        "MarginEngine",
        marginEngineAddress
      )) as MarginEngine;

      const liquidationsOfPool: {
        marginEngineAddress: string;
        vammAddress: string;
        liquidatablePositions: {
          owner: string;
          tickLower: number;
          tickUpper: number;
        }[];
      } = {
        marginEngineAddress: marginEngineAddress,
        vammAddress: (await marginEngine.vamm()).toString(),
        liquidatablePositions: [],
      };

      for (const position of positions) {
        if (position.marginEngine !== marginEngineAddress) {
          continue;
        }

        const positionRequirementSafety =
          await marginEngine.callStatic.getPositionMarginRequirement(
            position.owner,
            position.tickLower,
            position.tickUpper,
            false
          );

        const positionRequirementLiquidation =
          await marginEngine.callStatic.getPositionMarginRequirement(
            position.owner,
            position.tickLower,
            position.tickUpper,
            true
          );

        const positionInfo = await marginEngine.callStatic.getPosition(
          position.owner,
          position.tickLower,
          position.tickUpper
        );

        let status = "HEALTHY";
        if (positionInfo.margin.lte(positionRequirementLiquidation)) {
          status = "DANGER";
        } else if (positionInfo.margin.lte(positionRequirementSafety)) {
          status = "WARNING";
        }

        if (
          status === "DANGER" &&
          positionRequirementLiquidation.gt(BigInt(0))
        ) {
          liquidationsOfPool.liquidatablePositions.push({
            owner: position.owner,
            tickLower: position.tickLower,
            tickUpper: position.tickUpper,
          });

          console.log(
            position.owner,
            position.tickLower,
            position.tickUpper,
            ethers.utils.formatEther(positionInfo.margin),
            ethers.utils.formatEther(positionRequirementLiquidation),
            ethers.utils.formatEther(positionRequirementSafety),
            status,
            marginEngineAddress
          );
        }
      }

      if (liquidationsOfPool.liquidatablePositions.length > 0) {
        data.liquidationsPerPool.push(liquidationsOfPool);
      }
    }

    if (taskArgs.multisig) {
      writeLiquidationOfPositionsToGnosisSafeTemplate(data);
    }
  });

module.exports = {};
