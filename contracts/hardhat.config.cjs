require('@nomicfoundation/hardhat-ethers');
require('@quai/hardhat-deploy-metadata');
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  defaultNetwork: 'hardhat',
  solidity: {
    version: '0.8.19',
    settings: {
      optimizer: { enabled: true, runs: 1000 },
      metadata: { bytecodeHash: 'none' },
      evmVersion: 'paris',
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: false,
    },
    orchard: {
      url: 'https://orchard.rpc.quai.network/cyprus1',
      chainId: 15000,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      gas: 'auto',
      gasPrice: 'auto',
      timeout: 120000,
    },
  },
  paths: {
    sources: './src',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};
