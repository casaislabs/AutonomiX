import "dotenv/config";
import { network } from "hardhat";

const { ethers } = await network.connect();

function ensure(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

function isMetadataUri(u: string): boolean {
  return /^ipfs:\/\//i.test(u) || isHttpUrl(u);
}

async function main() {
  const agentAddress = (process.env.AUTONOMIX_AGENT_ADDRESS || "").trim();
  ensure(agentAddress.length > 0 && ethers.isAddress(agentAddress), "AUTONOMIX_AGENT_ADDRESS env missing or invalid");

  const args = process.argv.slice(2);
  const endpointEnv = (process.env.AGENT_ENDPOINT_URL || "").trim();
  const metadataEnv = (process.env.AGENT_METADATA_URI || "").trim();
  // BASE_METADATA_URL deprecated; use AGENT_METADATA_URI verbatim from .env
  const toEnv = (process.env.AGENT_TO_ADDRESS || "").trim();

  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();

  let to: string = toEnv && ethers.isAddress(toEnv) ? toEnv : signerAddr;
  let endpoint: string;
  let metadataURI: string;

  if (endpointEnv && metadataEnv) {
    endpoint = endpointEnv;
    metadataURI = metadataEnv; // use verbatim from .env
  } else {
    // Fallback to CLI args. Note: in Hardhat 3, pass script args after `--`
    // Example: npx hardhat run ./scripts/register-agent.ts --network base-sepolia -- <endpoint> <metadataURI>
    ensure(
      args.length >= 2 && args.length <= 3,
      "Usage: set AGENT_ENDPOINT_URL and AGENT_METADATA_URI in .env, or run: npx hardhat run ./scripts/register-agent.ts --network basesepolia -- [to] <endpoint> <metadataURI>"
    );
    if (args.length === 3) {
      [to, endpoint, metadataURI] = args;
    } else {
      [endpoint, metadataURI] = args;
    }
  }

  ensure(ethers.isAddress(to), "Invalid recipient address: <to>");
  ensure(to.toLowerCase() !== "0x0000000000000000000000000000000000000000", "Recipient address must not be zero address");
  ensure(isHttpUrl(endpoint), "Endpoint must start with http(s)://");
  ensure(isMetadataUri(metadataURI), "Metadata URI must be ipfs:// or http(s)://");
  const contract = await ethers.getContractAt("AutonomiXAgent", agentAddress, signer);

  // Admin-only guard
  const adminRole: string = await contract.DEFAULT_ADMIN_ROLE();
  const isAdmin: boolean = await contract.hasRole(adminRole, signerAddr);
  ensure(isAdmin, "Signer is not DEFAULT_ADMIN_ROLE; registerAgent requires admin");

  // Pre-check: contract must not be paused to register
  const isPaused: boolean = await (contract as any).paused();
  ensure(!isPaused, "Contract is paused; run unpause.ts or unpause via admin before registering");

  console.log(`Debug: adminRole=${adminRole}, isAdmin=${isAdmin}, paused=${isPaused}`);

  console.log(`Registering agent on ${agentAddress} (chain ${Number((await ethers.provider.getNetwork()).chainId)})`);
  console.log(`- to: ${to}${to.toLowerCase() === signerAddr.toLowerCase() ? " (signer)" : ""}`);
  console.log(`- endpoint: ${endpoint}`);
  console.log(`- metadataURI: ${metadataURI}`);
  // Optional dry-run; if it reverts due to estimateGas quirks, proceed with explicit gasLimit
  try {
    await (contract as any).callStatic.registerAgent(to, endpoint, metadataURI);
  } catch {
    console.log("Preflight warning: callStatic reverted; proceeding with explicit gasLimit.");
  }

  const tx = await contract.registerAgent(to, endpoint, metadataURI, { gasLimit: 500_000n });
  console.log(`Submitted tx: ${tx.hash}`);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Transaction not mined or replaced; receipt is null");
  if (receipt.status !== 1) throw new Error(`Transaction failed/reverted, status=${receipt.status}`);
  console.log(`Mined in block ${receipt.blockNumber}, status=${receipt.status}`);

  let tokenId: bigint | undefined;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog({ data: log.data, topics: log.topics });
      if (parsed?.name === "AgentRegistered") {
        tokenId = parsed.args[0] as bigint;
        break;
      }
      if (parsed?.name === "Transfer" && String(parsed.args[1]).toLowerCase() === to.toLowerCase()) {
        tokenId = parsed.args[2] as bigint;
      }
    } catch {
      // ignore non-matching logs
    }
  }

  // If logs parsing failed, derive the freshly minted id as nextAgentId()-1
  if (typeof tokenId === "undefined") {
    const nextId: any = await contract.nextAgentId();
    const nextIdBig = typeof nextId === "bigint" ? nextId : BigInt(nextId);
    tokenId = nextIdBig - 1n;
  }

  // Poll until token becomes visible to avoid RPC lag right after mining
  let existsLatest = false;
  for (let i = 0; i < 10; i++) {
    existsLatest = await contract.exists(tokenId);
    if (existsLatest) break;
    await new Promise((res) => setTimeout(res, 800));
  }
  if (!existsLatest) {
    console.log(
      `Registered successfully, but agentId=${tokenId} not visible yet. Try re-running after a few seconds or use get-agent.ts.`
    );
    return;
  }

  console.log(`Registered agentId=${tokenId}`);
  const [ep, mu, rep] = await contract.getAgent(tokenId);
  console.log(`Agent data: endpoint=${ep}, metadataURI=${mu}, reputation=${rep}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});