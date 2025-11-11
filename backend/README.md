# AutonomiX Backend

Production‑ready Express.js API that serves ERC‑721 metadata and images for AutonomiX Agent NFTs and exposes agent endpoints protected by x402 (USDC) micropayments. Designed to operate with the ERC‑8004 contract on Base Sepolia.

## Table of Contents

- [Overview](#overview)
- [Live API](#live-api)
- [Repository Navigation](#repository-navigation)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Environment](#environment)
- [Setup](#setup)
- [Development](#development)
- [Endpoints](#endpoints)
- [Paywall x402](#paywall-x402)
- [Metadata & Images](#metadata--images)
- [Agent Endpoints](#agent-endpoints)
- [Contract Integration (Base Sepolia)](#contract-integration-base-sepolia)
- [Error Handling & Logging](#error-handling--logging)
- [Troubleshooting](#troubleshooting)

## Overview

This backend powers AutonomiX by:
- Serving ERC‑721 metadata JSON and images under `/metadata` and `/images`.
- Exposing local agent endpoints under `/api/agent<ID>`.
- Protecting selected endpoints with the x402 (USDC) paywall on Base Sepolia.
- Reading and writing to the ERC‑8004 contract (e.g., updating reputation).

## Live API

Production deployment: https://api-autonomix.casaislabs.com

## Repository Navigation

- Root README: [../README.md](../README.md)
- Frontend README: [../frontend/README.md](../frontend/README.md)
- Smart Contracts README: [../smart-contract/README.md](../smart-contract/README.md)

## Architecture

- Runtime: Node.js 18+
- Framework: Express.js
- Entry point: `src/index.ts` (applies security middleware, registers health, metadata and agent routes)
- Auto‑registration of endpoints: scans `src/routes/endpoint/agent{N}.ts` and mounts `/api/agent{N}` automatically.
- Configuration module: `src/config.ts` centralizes environment variables and helpers (provider, contract, signer, x402 settings).

## How It Works

- Startup: `src/index.ts` applies security, sets up x402 paywall, auto‑registers endpoints, and mounts health/metadata routes.
- Auto‑registration: files matching `src/routes/endpoint/agent{N}.ts` are scanned; their exported registration functions mount `GET /api/agent{N}`.
- Paywall: `x402-express` middleware protects selected `GET /api/agent{N}` endpoints; users must complete a USDC micropayment (Base Sepolia) before the request reaches the handler.
- Contract I/O: handlers use `ethers` with `RPC_URL`, `AGENT_ADDRESS`, and `ADMIN_PRIVATE_KEY` to read/write (e.g., `exists(id)`, `getAgent(id)`, `updateReputation(id, delta)`).
- Static assets: ERC‑721 metadata (`/metadata`) and images (`/images`) are served from `backend/public`.

## Environment

Populate `backend/.env` (see `src/config.ts` for authoritative names):

```
PORT=3000
FRONTEND_ORIGIN=http://localhost:5173
RPC_URL=https://sepolia.base.org
AGENT_ADDRESS=0x6633006c0825a55aC8dEEB66a2d1C5D1e9283725

# Admin signer (optional; required for reputation updates)
ADMIN_PRIVATE_KEY=0x...

# x402 (USDC) paywall configuration
X402_RECEIVER_ADDRESS=0x...    # USDC payment receiver address
X402_NETWORK=base-sepolia
X402_PRICE_USD=$0.001
X402_FACILITATOR_URL=https://x402.org/facilitator
X402_PROTECTED_PATHS=/api/agent1,/api/agent2  # optional extra protected paths

# Caching & limits (optional)
MAX_IMAGE_BYTES=1048576
CACHE_TTL_MS=60000
```

## Setup

```
npm ci
```

## Development

```
npm run dev
```

By default, the API listens on `http://0.0.0.0:3000` and enforces CORS based on `FRONTEND_ORIGIN`.

## Endpoints

- `GET /health` — basic health check.
- `GET /agents` — list agents from the contract (optional, if implemented in `routes/agents.ts`).
- `GET /metadata/agent<ID>.json` — ERC‑721 metadata document served from `public/metadata`.
- `GET /images/agent<ID>.(svg|png|jpg|webp)` — image assets served from `public/images`.
- `GET /api/agent<ID>` — local agent endpoint (auto‑registered from `routes/endpoint/agent{N}.ts`).

## Paywall x402

Selected `GET /api/agent<ID>` endpoints are protected via x402 (USDC) using `x402-express` middleware:
- Auto‑detects `agent{N}.ts` files and registers protected routes with a price (`X402_PRICE_USD`), network (`X402_NETWORK`) and receiver (`X402_RECEIVER_ADDRESS`).
- Additional routes can be protected by listing them in `X402_PROTECTED_PATHS` (comma‑separated).
- The middleware validates payment and forwards requests to the underlying endpoint upon success.

## Metadata & Images

- Static assets live under `backend/public/metadata` and `backend/public/images`.
- Metadata JSON should include `name`, `description`, and `image` (absolute URL or Data URI).
- The frontend consumes these assets directly.

Example ERC‑721 metadata (served at `/metadata/agent1.json`):

```
{
  "name": "AutonomiX Agent #1",
  "description": "Autonomous agent with on‑chain identity and reputation.",
  "image": "https://api-autonomix.casaislabs.com/images/agent1.png",
  "attributes": [
    { "trait_type": "endpoint", "value": "https://api-autonomix.casaislabs.com/api/agent1" },
    { "trait_type": "reputation", "value": 42 }
  ]
}
```

Images are served from `/images/agent<ID>.(svg|png|jpg|webp)`.

## Agent Endpoints

- Endpoints reside in `backend/src/routes/endpoint/agent{N}.ts` and export a registration function (e.g., `registerAgent1Endpoint`).
- Example behavior (`agent1.ts`): checks contract existence, updates reputation (`updateReputation(id, 1)`), returns a JSON payload with the tx hash and new reputation.
- Endpoints can be paywalled via x402 and will be auto‑mounted at `/api/agent{N}`.

Example success response (`GET /api/agent1`):

```
{
  "message": "hello, i'm Mercury",
  "txHash": "0xabc123...",
  "reputation": "43"
}
```

Example error response (misconfiguration):

```
{
  "error": "Backend misconfigured: RPC_URL or AGENT_ADDRESS missing"
}
```

## Contract Integration (Base Sepolia)

- Network: Base Sepolia (`base-sepolia`)
- Contract Address: `0x584f13dF99D690D5Bf6393CCA75BC701E528556d`
- Explorer: https://sepolia.basescan.org/address/0x584f13dF99D690D5Bf6393CCA75BC701E528556d

The backend uses `ethers` to read from and (optionally) write to the ERC‑8004 contract (ABI loaded from `src/abi/AutonomiXAgent.json`).

## Error Handling & Logging

- Unified error responses as JSON with `error` messages and proper HTTP status codes.
- Startup logs list x402 protected routes and endpoint registration results.
- Misconfigurations (missing `RPC_URL`, `AGENT_ADDRESS`, or admin key) are surfaced with clear messages.

## Troubleshooting

- If `/api/agent<ID>` returns 500, verify `RPC_URL`, `AGENT_ADDRESS`, and `ADMIN_PRIVATE_KEY`.
- If x402 appears disabled, ensure `X402_RECEIVER_ADDRESS` is a valid address and `X402_NETWORK=base-sepolia`.
- For CORS issues, check `FRONTEND_ORIGIN`.