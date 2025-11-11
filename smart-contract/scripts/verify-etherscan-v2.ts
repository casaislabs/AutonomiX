import { artifacts, network } from "hardhat";
import { readFile } from "node:fs/promises";
import path from "node:path";

type EtherscanResponse = { status: string; message: string; result: string };

async function submitVerification(baseUrl: string, params: URLSearchParams) {
  const resp = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const json = (await resp.json()) as EtherscanResponse;
  return json;
}

async function checkStatus(baseUrl: string, apikey: string, guid: string) {
  const params = new URLSearchParams({
    apikey,
    module: "contract",
    action: "checkverifystatus",
    guid,
  });
  const resp = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const json = (await resp.json()) as EtherscanResponse;
  return json;
}

async function main() {
  const fqName = "contracts/AutonomiXAgent.sol:AutonomiXAgent";
  const { ethers } = await network.connect();
  const chainId = await ethers.provider.getNetwork().then((n) => Number(n.chainId));
  // Use unified Etherscan V2 aggregator for all supported chains (incl. Base Sepolia 84532)
  const baseUrl = `https://api.etherscan.io/v2/api?chainid=${chainId}`;

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) throw new Error("ETHERSCAN_API_KEY missing in env");

  const address = (process.env.AUTONOMIX_AGENT_ADDRESS || process.argv[2] || "").trim();
  if (!address || !ethers.isAddress(address)) throw new Error("Provide AutonomiXAgent address via env AUTONOMIX_AGENT_ADDRESS or CLI arg");

  // Read Standard JSON Input from build-info
  const buildInfoId = await artifacts.getBuildInfoId(fqName);
  if (!buildInfoId) throw new Error("Build info ID not found for AutonomiXAgent");
  const buildInfoPath = path.join("artifacts", "build-info", `${buildInfoId}.json`);
  const raw = await readFile(buildInfoPath, "utf-8");
  const bi = JSON.parse(raw);
  const standardJsonInput = bi.input;
  if (!standardJsonInput) throw new Error("Standard JSON input missing");
  let solcVersion: string = bi.solcLongVersion ?? bi.solcVersion;
  if (!solcVersion.startsWith("v")) solcVersion = `v${solcVersion}`;

  // Determine fully-qualified contract name using sources in the Standard JSON input
  const sourceKeys: string[] = Object.keys(standardJsonInput.sources || {});
  const axSourceKey = sourceKeys.find((k) => k.endsWith("/AutonomiXAgent.sol") || k.endsWith("\\AutonomiXAgent.sol") || k === "AutonomiXAgent.sol")
    || sourceKeys[0];
  const fqContractName = `${axSourceKey}:AutonomiXAgent`;

  // Constructor argument: admin = deployer (derived from private key)
  const pk = (
    process.env.WALLET_KEY ||
    process.env.BASE_SEPOLIA_PRIVATE_KEY ||
    process.env.SEPOLIA_PRIVATE_KEY ||
    process.env.SEPOLIA_OWNER_PRIVATE_KEY ||
    ""
  ).trim();
  if (!pk) throw new Error("Private key missing; set WALLET_KEY or BASE_SEPOLIA_PRIVATE_KEY");
  const admin = new ethers.Wallet(pk).address;

  // ABI-encode constructor arguments (single address)
  const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [admin]).replace(/^0x/, "");

  // Prepare parameters for Etherscan V2
  const params = new URLSearchParams({
    apikey: apiKey,
    module: "contract",
    action: "verifysourcecode",
    contractaddress: address,
    sourceCode: JSON.stringify(standardJsonInput),
    codeformat: "solidity-standard-json-input",
    contractname: fqContractName,
    compilerversion: solcVersion,
    constructorArguments: encodedArgs,
  });

  console.log("Submitting verification to Etherscan V2 aggregator...");
  const submit = await submitVerification(baseUrl, params);
  console.log("Submit response:", submit);
  if (submit.status !== "1") {
    throw new Error(`Verification submit failed: ${submit.message} | ${submit.result}`);
  }

  const guid = submit.result;
  console.log("GUID:", guid);

  // Poll for status
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await checkStatus(baseUrl, apiKey, guid);
    console.log("Status:", status);
    if (status.status === "1") {
      console.log("Verification successful:", status.result);
      return;
    }
    if (status.result && /already verified/i.test(status.result)) {
      console.log("Contract is already verified.");
      return;
    }
  }
  throw new Error("Verification status polling timed out");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});