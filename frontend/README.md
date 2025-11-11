# AutonomiX Frontend

Production-ready React + TypeScript + Vite application for browsing and interacting with AutonomiX Agent NFTs. The UI consumes ERC‑8004 agent identity (endpoint, metadata) and reputation from the deployed contract on Base Sepolia.

## Table of Contents

- [Overview](#overview)
- [Live Site](#live-site)
- [Repository Navigation](#repository-navigation)
- [Features](#features)
- [Architecture](#architecture)
- [Environment](#environment)
- [Setup](#setup)
- [Development](#development)
- [Build & Preview](#build--preview)
- [Configuration](#configuration)
- [Contract Integration (Base Sepolia)](#contract-integration-base-sepolia)
- [ERC‑8004 Support](#erc-8004-support)
- [Pages & Components](#pages--components)
- [API & Metadata](#api--metadata)
- [Troubleshooting](#troubleshooting)

## Overview

This frontend renders a list of agents, their metadata and images, and integrates with the AutonomiXAgent contract to read basic identity and reputation. It targets Base Sepolia (`base-sepolia`) and expects a backend to serve metadata and images.

## Live Site

Production deployment: https://autonomix.casaislabs.com

## Repository Navigation

- Root README: [../README.md](../README.md)
- Backend README: [../backend/README.md](../backend/README.md)
- Smart Contracts README: [../smart-contract/README.md](../smart-contract/README.md)

## Features

- Agent gallery and detail views.
- Reads `agentEndpoint`, `agentMetadataURI`, and `reputationOf` from the contract.
- Fetches ERC‑721 metadata JSON from the backend and displays associated images.
- Minimal wallet connection for read operations (no signing required for viewing).

## Architecture

- Framework: React 18 + Vite
- Language: TypeScript
- Styling: vanilla CSS (`src/index.css`) with components in `src/components`
- Web3 integration lives under `src/web3`

## Environment

Create `frontend/.env` with:

```
VITE_NETWORK=base-sepolia
VITE_RPC_URL=https://sepolia.base.org
VITE_CONTRACT_ADDRESS=0x584f13dF99D690D5Bf6393CCA75BC701E528556d
VITE_BACKEND_URL=http://localhost:3000
```

Notes:
- `VITE_NETWORK` must be `base-sepolia`.
- `VITE_CONTRACT_ADDRESS` should point to the deployed AutonomiXAgent contract.
- `VITE_BACKEND_URL` should point to your backend serving metadata and images.

## Setup

```
npm ci
```

## Development

```
npm run dev
```

Open the local dev server and ensure it can reach `VITE_BACKEND_URL` for metadata and images.

## Build & Preview

```
npm run build
npm run preview
```

## Configuration

- Update environment variables in `frontend/.env` to reflect your deployment.
- Ensure CORS is configured on the backend to allow the frontend origin.

## Contract Integration (Base Sepolia)

- Network: Base Sepolia (`base-sepolia`)
- Contract Address: `0x584f13dF99D690D5Bf6393CCA75BC701E528556d`
- Explorer: https://sepolia.basescan.org/address/0x584f13dF99D690D5Bf6393CCA75BC701E528556d

The UI reads from the contract using the configured RPC and address and displays metadata fetched from the backend.

## ERC‑8004 Support

This frontend integrates with the ERC‑8004 agent NFT contract:
- Reads on‑chain identity via `agentEndpoint`, `agentMetadataURI`, and `getAgent`.
- Reads reputation via `reputationOf`.
- Presents `endpoint` and `metadataURI` in the UI for agent discovery.
- Operates read‑only from the UI; write operations (register, set metadata, update reputation) are performed via backend/admin tools.

## Pages & Components

- `src/components/Header.tsx` — top navigation and branding.
- `src/components/AgentPanel.tsx` — agent list and details.
- `src/App.tsx` — main layout and routing.

## API & Metadata

Expected backend routes:
- `GET /metadata/agent<ID>.json` — ERC‑721 metadata documents.
- `GET /images/agent<ID>.(svg|png|jpg|webp)` — images referenced by metadata.
- Agent endpoints exposed under `/api/agent<ID>` may be paywalled via x402.

## Troubleshooting

- Ensure `VITE_CONTRACT_ADDRESS` is correct and the RPC is reachable.
- If images or metadata fail to load, verify `VITE_BACKEND_URL` and CORS.
- Use the browser dev tools network tab to check failing requests and JSON shape.
