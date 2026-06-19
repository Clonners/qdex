require('@nomicfoundation/hardhat-ethers');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  defaultNetwork: 'hardhat',
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: { enabled: true, runs: 1000 },
      metadata: { bytecodeHash: 'none' },
      evmVersion: 'london',
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: false,
    },
  },
  paths: {
    sources: './src',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};
