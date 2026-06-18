const hre = require('hardhat');

async function main() {
  const signers = await hre.ethers.getSigners();
  console.log('Network:', hre.network.name);
  console.log('Signer 0:', signers[0].address);
  console.log('Expected:  0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267');
  
  const balance = await hre.ethers.provider.getBalance(signers[0].address);
  console.log('Balance:', hre.ethers.formatEther(balance), 'QUAI');
}

main().catch(console.error);
