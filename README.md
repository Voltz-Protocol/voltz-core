# Voltz Core

![](<.gitbook/assets/whitepaper_banner (1).jpg>)

## Introduction

Voltz is a noncustodial automated market maker for Interest Rate Swaps (IRS). Voltz uses a Concentrated Liquidity Virtual AMM (vAMM) for price discovery only, with the management of the underlying assets performed by the Margin Engine. The combined impact of these modules enables counterparties to create and trade fixed and variable rates through a mechanism that is up to 3,000x more capital efficient than alternative interest rate swap models, whilst also providing Liquidity Providers and Traders with significant control and flexibility over their positions.

This repository contains the smart contracts that power Voltz Protocol. Over time, the Voltz Protocol will be governed by the VoltzDAO, so that the protocol is owned and managed by the community that uses it. Decentralising ownership is critical to ensure the strength of the ecosystem we are all looking to build and to provide control to those that use the system. However, Voltz will initially be controlled by the Voltz Multisigs whilst the VoltzDAO is being developed.

We would love to see how you can build and improve upon what we've built here at Voltz.

## Code Contributions

We welcome and are extremely excited to support individuals and teams that wish to contribute to the Voltz core contracts. If you wish to propose changes to the current codebase, make sure you do it in accordance with the contribution guidelines. Before starting to work on major contributions make sure to discuss them with the Voltz community and the core team to make sure they are in alignment with our roadmap and long-term vision. In case you have any questions or just want to have a discussion feel free to jump into the dev channel of our [discord](https://discord.com/invite/KVWtUGRumk).

## Build and Test

### Getting Started

[Install Npm](https://nodejs.org/en/download/)

[Install and Setup Hardhat](https://hardhat.org)

### Setup

```
git clone https://github.com/voltzprotocol/voltz-core.git
cd voltz-core
npm install
npx husky install
```

### Compile

```
npx hardhat compile
```

### Test

```
npx hardhat test
```

### Linting

We use [eslint](https://eslint.org/), [solhint](https://protofire.github.io/solhint/) and [prettier](https://prettier.io/) to handle linting.

`package.json` contains a few scripts to help you with linting and formatting.

The most important is `npm run check`, which will fix any formatting and linting issues and then run the entire codebase through the linter. You should always run this before merging any code into `main`.

By default, we install a pre-push hook to run `npm run check` before each push. If you need to override this, you can pass the `--no-verify` flag:

    git push -u origin my-fancy-branch --no-verify

#### Linting

- `npm run lint` - Lint the entire codebase.
- `npm run lint:sol` - Lint Solidity files.
- `npm run lint:ts` - Lint TypeScript files.
- `npm run lint:sol:fix` - Fix Solidity files.
- `npm run lint:ts:fix` - Fix TypeScript files.
- `npm run lint:fix` - Fix linting errors across the entire codebase.

#### Formatting

- `npm run format` - Format the entire codebase.
- `npm run format:sol` - Format Solidity files.
- `npm run format:ts` - Format TypeScript files.
- `npm run format:sol:check` - Check the formatting of all Solidity files.
- `npm run format:ts:check` - Check the formatting of all TypeScript files.
- `npm run format:check` - Check the formatting of all files.

### Deployment and Testing

#### Create a local deployment for testing

To start a local blockchain (hardhat node) and deploy our contracts to it, run:

`npm run deploy:localhost`

#### Deploy to kovan

To desploy our contracts to the kovan testnet, first check the configuration for kovan in [the deployment config](./deploy/config.ts), and once it is correct run:

`npm run deploy:kovan`

#### Mint tokens for testing

There is a task for this. Run `npx hardhat help mintTestTokens` for task usage.

#### Deploy an IRS Instance

Run: `npx hardhat createIrsInstance --network <networkName> --rate-oracle <rateOracleName> [--tick-spacing <tickSpacingValue>]`

Where `rateOracleName` is the name of a rate oracle instance as defined in the `deployments/<networkName>` directory. E.g. it might be "TestRateOracle" on localhost, or "AaveRateOracle_USDT" on kovan.

#### List IRS Instances

`npx hardhat listIrsInstances --network <networkName>`

For humans, some post-processing can be useful to make the output more readable. E.g. in bash:

`npx hardhat listIrsInstances --network <networkName> | column -s, -t`
