// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IERC8004 - Standard interface for agent NFTs with identity and reputation
interface IERC8004 {
    // Standardized events
    event AgentRegistered(uint256 indexed tokenId, address indexed owner, string endpoint, string metadataURI);
    event AgentMetadataUpdated(uint256 indexed tokenId, string endpoint, string metadataURI);
    event ReputationUpdated(uint256 indexed tokenId, uint256 oldScore, uint256 newScore, int256 delta);

    // Minimal reads
    function agentEndpoint(uint256 tokenId) external view returns (string memory);
    function agentMetadataURI(uint256 tokenId) external view returns (string memory);
    function reputationOf(uint256 tokenId) external view returns (uint256);

    // Combined read for convenience
    function getAgent(uint256 tokenId) external view returns (string memory endpoint, string memory metadataURI, uint256 reputationScore);

    // Minimal writes
    function registerAgent(address to, string calldata endpoint, string calldata metadataURI) external returns (uint256 tokenId);
    function setAgentMetadata(uint256 tokenId, string calldata endpoint, string calldata metadataURI) external;
    function updateReputation(uint256 tokenId, int256 delta) external;
}