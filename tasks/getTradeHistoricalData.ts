import { task, types } from "hardhat/config";
import { BigNumber } from "ethers";
import { IMarginEngine, IPeriphery } from "../typechain";
import "@nomiclabs/hardhat-ethers";
import { toBn } from "../test/helpers/toBn";

import { MAX_SQRT_RATIO, MIN_SQRT_RATIO } from "../test/shared/utilities";
import { decodeInfoPostSwap } from "./errorHandling";

const blocksPerDay = 6570; // 13.15 seconds per block

// const peripheryAddress = "0x13E9053D9090ed6a1FAE3f59f9bD3C1FCa4c5726";
const peripheryAddress = "0x2657101a6Bb5538DD84b0B8c8E2Deac667b9c66c";

// deployment blocks of margin engine's
const deploymentBlocks = {
  "0x9ea5Cfd876260eDadaB461f013c24092dDBD531d": 14883716, // aUSDC
  "0x21F9151d6e06f834751b614C2Ff40Fc28811B235": 15058080, // stETH
  "0x641a6e03FA9511BDE6a07793B04Cb00Aba8305c0": 14883745, // cDAI
  "0x317916f91050Ee7e4F53F7c94e83FBD4eCAdec7e": 14883728, // aDAI
  "0xB1125ba5878cF3A843bE686c6c2486306f03E301": 15055872, // rETH
};

const tokenDecimals = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6, // USDC
  "0x6b175474e89094c44da98b954eedeac495271d0f": 18, // DAI
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": 18, // WETH
};

const getDeploymentBlock = (address: string): number => {
  if (!Object.keys(deploymentBlocks).includes(address)) {
    throw new Error(
      `Unrecognized error. Check the deployment block of ${address}!`
    );
  }
  return deploymentBlocks[address as keyof typeof deploymentBlocks];
};

const getTokenDecimals = (address: string): number => {
  if (!Object.keys(tokenDecimals).includes(address.toLowerCase())) {
    throw new Error(
      `Unrecognized error. Check the token decimals of ${address.toLowerCase()}!`
    );
  }
  return tokenDecimals[address.toLowerCase() as keyof typeof tokenDecimals];
};

const scale = (x: number, decimals: number): BigNumber => {
  return toBn(x, decimals);
};

const descale = (x: BigNumber, decimals: number): number => {
  if (decimals >= 6) {
    return x.div(BigNumber.from(10).pow(decimals - 6)).toNumber() / 1e6;
  } else {
    return x.toNumber() / 10 ** decimals;
  }
};

const tickToFixedRate = (tick: number): number => {
  return 1.0001 ** -tick;
};

task("getTradeHistoricalData", "Get trader historical data")
  .addOptionalParam(
    "fromBlock",
    "Get data from this past block number (up to some larger block number defined by `toBlock`)",
    undefined,
    types.int
  )
  .addParam(
    "blockInterval",
    "Script will fetch data every `blockInterval` blocks (between `fromBlock` and `toBlock`)",
    blocksPerDay,
    types.int
  )
  .addOptionalParam(
    "toBlock",
    "Get data up to this block (defaults to latest block)",
    undefined,
    types.int
  )
  .addParam(
    "marginEngineAddress",
    "Queried Margin Engine Address",
    "0x0000000000000000000000000000000000000000",
    types.string
  )
  .setAction(async (taskArgs, hre) => {
    const periphery = (await hre.ethers.getContractAt(
      "Periphery",
      peripheryAddress
    )) as IPeriphery;

    const marginEngineAddress = taskArgs.marginEngineAddress;

    const marginEngine = (await hre.ethers.getContractAt(
      "MarginEngine",
      marginEngineAddress
    )) as IMarginEngine;

    const underlying = await marginEngine.underlyingToken();
    const decimals = getTokenDecimals(underlying);
    console.log("underlying token:", underlying);
    console.log("decimals:", decimals);

    const deploymentBlockNumber = getDeploymentBlock(marginEngineAddress);
    if (!deploymentBlockNumber) {
      throw new Error("Couldn't fetch deployment block number");
    }

    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const currentBlockNumber = currentBlock.number;
    let fromBlock = deploymentBlockNumber;
    let toBlock = currentBlockNumber;

    if (taskArgs.fromBlock) {
      fromBlock = Math.max(deploymentBlockNumber, taskArgs.fromBlock);
    }

    if (taskArgs.toBlock) {
      toBlock = Math.min(currentBlockNumber, taskArgs.toBlock);
    }

    if (fromBlock >= toBlock) {
      console.error(`Invalid block range: ${fromBlock}-${toBlock}`);
    }

    const deploymentBlock = await hre.ethers.provider.getBlock(
      deploymentBlockNumber
    );

    console.log(
      `This margin engine (${marginEngineAddress}) was deployed at ${new Date(
        deploymentBlock.timestamp * 1000
      ).toISOString()}.\n`
    );

    const fs = require("fs");
    const file = `historicalData/historicalTradeHistoricalData/${marginEngineAddress}.csv`;

    const header =
      "block,timestamp,fixed_rate,available_ft,slippage_ft_10,slippage_ft_100,slippage_ft_1000,slippage_ft_10000,available_vt,slippage_vt_10,slippage_vt_100,slippage_vt_1000,slippage_vt_10000";

    fs.appendFileSync(file, header + "\n");
    console.log(header);

    console.log("network name:", hre.network.name);
    console.log("current block", hre.ethers.provider.blockNumber);

    for (let b = fromBlock; b <= toBlock; b += taskArgs.blockInterval) {
      const block = await hre.ethers.provider.getBlock(b);

      if (b >= deploymentBlockNumber) {
        try {
          const tick = await periphery.getCurrentTick(marginEngineAddress, {
            blockTag: b,
          });

          const ft_info: {
            availableNotional: BigNumber;
            tickAfter: number;
          }[] = [];
          const vt_info: {
            availableNotional: BigNumber;
            tickAfter: number;
          }[] = [];

          for (const notional of [1_000_000_000_000, 10, 100, 1_000, 10_000]) {
            {
              const ft: {
                availableNotional: BigNumber;
                tickAfter: number;
              } = {
                availableNotional: BigNumber.from(0),
                tickAfter: 0,
              };
              await periphery.callStatic
                .swap(
                  {
                    marginEngine: marginEngineAddress,
                    isFT: true,
                    notional: scale(notional, decimals),
                    sqrtPriceLimitX96: BigNumber.from(MAX_SQRT_RATIO.sub(1)),
                    tickLower: 0,
                    tickUpper: 60,
                    marginDelta: "0",
                  },
                  {
                    blockTag: b,
                  }
                )
                .then((result) => {
                  ft.availableNotional = result._variableTokenDelta;
                  ft.tickAfter = result._tickAfter;
                })
                .catch((error) => {
                  const result = decodeInfoPostSwap(error);
                  ft.availableNotional = result.availableNotional;
                  ft.tickAfter = result.tick;
                });

              ft_info.push(ft);
            }

            {
              const vt: {
                availableNotional: BigNumber;
                tickAfter: number;
              } = {
                availableNotional: BigNumber.from(0),
                tickAfter: 0,
              };
              await periphery.callStatic
                .swap(
                  {
                    marginEngine: marginEngineAddress,
                    isFT: false,
                    notional: scale(notional, decimals),
                    sqrtPriceLimitX96: BigNumber.from(MIN_SQRT_RATIO.add(1)),
                    tickLower: 0,
                    tickUpper: 60,
                    marginDelta: "0",
                  },
                  {
                    blockTag: b,
                  }
                )
                .then((result) => {
                  vt.availableNotional = result._variableTokenDelta;
                  vt.tickAfter = result._tickAfter;
                })
                .catch((error) => {
                  const result = decodeInfoPostSwap(error);
                  vt.availableNotional = result.availableNotional;
                  vt.tickAfter = result.tick;
                });

              vt_info.push(vt);
            }
          }

          let response = `${b},${block.timestamp},${(
            tickToFixedRate(tick) / 100
          ).toFixed(6)}`;

          for (let i = 0; i < 5; i++) {
            if (i > 0) {
              const slippage = Math.abs(
                tickToFixedRate(ft_info[i].tickAfter) - tickToFixedRate(tick)
              );
              response = response + "," + (slippage / 100).toFixed(6);
            } else {
              response =
                response +
                "," +
                Math.abs(descale(ft_info[i].availableNotional, decimals));
            }
          }

          for (let i = 0; i < 5; i++) {
            if (i > 0) {
              const slippage = Math.abs(
                tickToFixedRate(vt_info[i].tickAfter) - tickToFixedRate(tick)
              );
              response = response + "," + (slippage / 100).toFixed(6);
            } else {
              response =
                response +
                "," +
                Math.abs(descale(vt_info[i].availableNotional, decimals));
            }
          }

          fs.appendFileSync(file, `${response}\n`);
          console.log(response);
        } catch (error) {
          console.log("error:", error);
        }
      }
    }
  });

module.exports = {};
