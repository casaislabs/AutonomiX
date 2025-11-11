# AutonomiX Smart Contracts

Production-ready Hardhat 3 setup for an ERC‑8004‑compliant AutonomiX Agent NFT contract. Each token represents an autonomous agent with an HTTP endpoint, a metadata URI, and a simple reputation score.

Network requirement: Base Sepolia (`base-sepolia`). All deployments and operational instructions assume the `base-sepolia` network.

## Table of Contents

- [Overview](#overview)
- [Repository Navigation](#repository-navigation)
- [Contract Architecture](#contract-architecture)
- [ERC‑8004 Compliance](#erc-8004-compliance)
- [Events](#events)
- [Supported Networks](#supported-networks)
- [Environment](#environment)
- [Build & Test](#build--test)
- [Deployment](#deployment)
- [Deployment Status](#deployment-status)
- [Register New Agents](#register-new-agents)
- [Update Agent Metadata](#update-agent-metadata)
- [Reputation Management](#reputation-management)
- [Verification (Etherscan V2)](#verification-etherscan-v2)
- [Metadata & Images](#metadata--images)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)

## Overview

AutonomiX defines an ERC‑721 contract where each token is an “agent”. The contract stores, per agent:
- `endpoint` — the agent discovery URL (e.g., a backend `/api/agent{id}`).
- `metadataURI` — the ERC‑721 metadata JSON URI (http(s) or `ipfs://`).
- `reputation` — a non‑negative integer score updated by an admin operation.

The backend serves the metadata and images and can protect agent endpoints with x402 (USDC) micropayments. This repository targets Base Sepolia; deploy and operate agents on the `base-sepolia` network.

## Repository Navigation

- Root README: [../README.md](../README.md)
- Backend README: [../backend/README.md](../backend/README.md)
- Frontend README: [../frontend/README.md](../frontend/README.md)

## Contract Architecture

Primary contract: `AutonomiXAgent.sol`
- ERC‑721 with role‑based access (`DEFAULT_ADMIN_ROLE`).
- Monotonic token IDs starting at 1 (`nextAgentId`).
- Internal storage `AgentInfo { endpoint, metadataURI }` per token.
- Public reputation registry `reputation[tokenId]`.

Key functions:
- `registerAgent(address to, string endpoint, string metadataURI)` — mint new agent token to `to` and set identity; admin‑only; when not paused.
- `setAgentMetadata(uint256 tokenId, string endpoint, string metadataURI)` — update identity; owner or admin; when not paused.
- `updateReputation(uint256 tokenId, int256 delta)` — adjust reputation up/down (clamped to zero if negative exceeds current); admin‑only; when not paused.
- `burn(uint256 tokenId)` — burn token and clear stored data; owner or admin; when not paused.

Useful reads:
- `getAgent(tokenId)` — returns `(endpoint, metadataURI, reputation)`.
- `agentEndpoint(tokenId)` and `agentMetadataURI(tokenId)` — return stored identity.
- `reputationOf(tokenId)` — return reputation.
- `exists(tokenId)` — check token existence (not burned).
- `nextAgentId()` — next mint id.
- `totalSupply()` — live supply (non‑Enumerable).

Pause controls:
- `pause()` and `unpause()` — admin‑only emergency controls.

## ERC‑8004 Compliance

This implementation is compliant with the ERC‑8004 standard for agent NFTs with identity and reputation.

- Interface: `contracts/interfaces/IERC8004.sol`
- Standardized events:
  - `AgentRegistered(tokenId, owner, endpoint, metadataURI)`
  - `AgentMetadataUpdated(tokenId, endpoint, metadataURI)`
  - `ReputationUpdated(tokenId, oldScore, newScore, delta)`
- Minimal reads:
  - `agentEndpoint(tokenId)` — returns the agent discovery URL
  - `agentMetadataURI(tokenId)` — returns the ERC‑721 metadata URI
  - `reputationOf(tokenId)` — returns the reputation score
- Combined read:
  - `getAgent(tokenId)` — returns `(endpoint, metadataURI, reputation)`
- Minimal writes:
  - `registerAgent(to, endpoint, metadataURI)` — mint and register identity
  - `setAgentMetadata(tokenId, endpoint, metadataURI)` — update identity
  - `updateReputation(tokenId, delta)` — adjust reputation

## Events

- `AgentRegistered(tokenId, owner, endpoint, metadataURI)` — on mint.
- `AgentMetadataUpdated(tokenId, endpoint, metadataURI)` — on identity change.
- `ReputationUpdated(tokenId, oldScore, newScore, delta)` — on reputation change.

## Supported Networks

Configured in `hardhat.config.ts`:
- `base-sepolia` — RPC via `BASE_SEPOLIA_RPC_URL`, deployer via `WALLET_KEY`.
- Local EDR simulations for testing.

## Environment

Create `smart-contract/.env` with:

```
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
WALLET_KEY=0x...
ETHERSCAN_API_KEY=...

# After deployment, set the live contract address
AUTONOMIX_AGENT_ADDRESS=0x...

# Agent identity for registration
AGENT_ENDPOINT_URL=https://your-backend.example.com/api/agent2
AGENT_METADATA_URI=https://your-backend.example.com/metadata/agent2.json
```

Notes:
- For new agents, update `AGENT_ENDPOINT_URL` and `AGENT_METADATA_URI` to the desired values and then run the registration script.
- URIs must be `http(s)://` (endpoint) and `http(s)://` or `ipfs://` (metadata).

## Build & Test

- Compile: `npx hardhat compile`
- Run tests: `npx hardhat test`

## Deployment

Using Ignition (optional):

```
npx hardhat ignition deploy --network base-sepolia ignition/modules/AutonomiXAgent.ts
```

Record the deployed contract address and set `AUTONOMIX_AGENT_ADDRESS` in `.env`.

## Deployment Status

- Network: Base Sepolia (`base-sepolia`)
- Contract Address: `0x6633006c0825a55aC8dEEB66a2d1C5D1e9283725`
- Explorer: https://sepolia.basescan.org/address/0x6633006c0825a55aC8dEEB66a2d1C5D1e9283725

## Register New Agents

Registration uses `.env` values verbatim:

```
AGENT_ENDPOINT_URL=https://.../api/agent2
AGENT_METADATA_URI=https://.../metadata/agent2.json
AUTONOMIX_AGENT_ADDRESS=0x...
```

Run:

```
npx hardhat run ./scripts/register-agent.ts --network base-sepolia
```

Alternatively, pass CLI args (in Hardhat 3 use `--` before script args):

```
npx hardhat run ./scripts/register-agent.ts --network base-sepolia -- <endpoint> <metadataURI>
```

If you also want to set a custom recipient:

```
npx hardhat run ./scripts/register-agent.ts --network base-sepolia -- <to> <endpoint> <metadataURI>
```

## Update Agent Metadata

You can update an agent’s endpoint and metadata via the contract. If you do not keep a script for this, use the console:

```
npx hardhat console --network base-sepolia
```

In the console:

```
const c = await ethers.getContractAt("AutonomiXAgent", process.env.AUTONOMIX_AGENT_ADDRESS)
await c.setAgentMetadata(<agentId>, "https://.../api/agentN", "https://.../metadata/agentN.json")
```

## Reputation Management

Increase or decrease an agent’s reputation (admin‑only):

```
await c.updateReputation(<agentId>, 1)   // increase by 1
await c.updateReputation(<agentId>, -2)  // decrease by 2 (clamped to zero)
```

Read the current reputation:

```
await c.reputationOf(<agentId>)
```

## Verification (Etherscan V2)

This repo includes a script that uses the Etherscan V2 aggregator, which supports Base Sepolia:

```
ETHERSCAN_API_KEY=... AUTONOMIX_AGENT_ADDRESS=0x... \
npx hardhat run ./scripts/verify-etherscan-v2.ts --network base-sepolia
```

## Metadata & Images

Backend serves ERC‑721 metadata and images for agents:
- `GET /metadata/agent<ID>.json` (metadata)
- `GET /images/agent<ID>.(svg|png|jpg|webp)` (image referenced by metadata)

In the metadata, include attributes such as `name`, `description`, and optionally image references. The backend can convert relative `/images/...` to Data URIs for the frontend.

## Security Notes

- `registerAgent` and `updateReputation` are admin‑only; keep the admin key secure.
- Use `pause()` during incidents; `unpause()` to resume.
- Ensure `AGENT_ENDPOINT_URL` points to your production backend over TLS.

## Troubleshooting

- If registration succeeds but the agent is not visible, wait a few seconds and query `nextAgentId()` and `exists(id)` again (RPC lag).
- Ensure `.env` has `BASE_SEPOLIA_RPC_URL`, `WALLET_KEY`, and `AUTONOMIX_AGENT_ADDRESS` set correctly.
- For CLI arg usage, remember to place args after `--` with Hardhat 3.
