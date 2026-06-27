module.exports = async function (hre) {
  console.log('>>> TEST SCRIPT RUNNING');
  console.log('Network:', hre.network.name);
  console.log('ChainId:', hre.network.config.chainId);
  console.log('>>> DONE');
};
