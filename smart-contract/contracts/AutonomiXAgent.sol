// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IERC8004.sol";

/// @title AutonomiXAgent (ERC-8004 compliant)
/// @notice Each ERC-721 token represents an agent with identity (endpoint/metadata) and a simple reputation score
contract AutonomiXAgent is ERC721, AccessControl, Pausable, IERC8004 {

    uint256 private _tokenIdCounter;
    // Tracks live supply without adopting ERC721Enumerable
    uint256 private _totalSupply;

    struct AgentInfo {
        string endpoint;      // Agent endpoint URL
        string metadataURI;   // Token metadata URI
    }

    mapping(uint256 => AgentInfo) private _agentInfo;
    mapping(uint256 => uint256) public reputation;       // Reputation registry
    // Invoice tracking removed: micropayments handled off-chain with admin updates

    // Custom errors
    error NotAuthorized();
    error TokenNonexistent();
    error ZeroAddress();
    error InvalidMetadata();
    error InvalidDeltaMin();

    // ERC-8004 events are declared in the interface

    constructor(address admin) ERC721("AutonomiX Agent", "AXAG") {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Register a new agent and mint its ERC-721 token
    /// @dev Emits {AgentRegistered}. Only callable by `DEFAULT_ADMIN_ROLE` when not paused
    /// @param to Owner address that will receive the newly minted agent token
    /// @param endpoint Agent discovery endpoint URL
    /// @param metadataURI Token metadata URI (e.g., ipfs://CID)
    /// @return agentId Newly assigned agent token id
    function registerAgent(address to, string calldata endpoint, string calldata metadataURI) external override onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused returns (uint256 agentId) {
        if (to == address(0)) revert ZeroAddress();
        if (bytes(endpoint).length == 0 || bytes(metadataURI).length == 0) revert InvalidMetadata();
        // Use monotonic counter so IDs start at 1 and are never reused
        unchecked { agentId = _tokenIdCounter + 1; _tokenIdCounter += 1; }
        _safeMint(to, agentId);
        unchecked { _totalSupply += 1; }
        AgentInfo storage agent = _agentInfo[agentId];
        agent.endpoint = endpoint;
        agent.metadataURI = metadataURI;
        emit AgentRegistered(agentId, to, endpoint, metadataURI);
        return agentId;
    }

    /// @notice Update an agent's reputation score by a signed delta
    /// @dev Emits {ReputationUpdated}. Only callable by `DEFAULT_ADMIN_ROLE` when not paused
    /// @param agentId Agent token id
    /// @param delta Reputation change (positive increases, negative decreases; clamped to zero)
    function updateReputation(uint256 agentId, int256 delta) external override onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        _updateReputationInternal(agentId, delta);
    }

    // Invoice-based reputation updates removed for simplicity in micropayment flows

    /// @dev Internal helper to update an agent's reputation and emit {ReputationUpdated}
    function _updateReputationInternal(uint256 agentId, int256 delta) internal {
        if (_ownerOf(agentId) == address(0)) revert TokenNonexistent();
        // Prevent overflow when converting the minimum int256 value
        if (delta == type(int256).min) revert InvalidDeltaMin();
        uint256 oldScore = reputation[agentId];
        if (delta >= 0) {
            reputation[agentId] = oldScore + uint256(delta);
        } else {
            uint256 abs = uint256(-delta);
            reputation[agentId] = abs > oldScore ? 0 : oldScore - abs;
        }
        emit ReputationUpdated(agentId, oldScore, reputation[agentId], delta);
    }

    /// @notice Update agent endpoint and metadata URI
    /// @dev Owner or admin can update. Emits {AgentMetadataUpdated}
    /// @param agentId Agent token id
    /// @param endpoint New agent endpoint URL
    /// @param metadataURI New token metadata URI
    function setAgentMetadata(uint256 agentId, string calldata endpoint, string calldata metadataURI) external override whenNotPaused {
        address owner = _ownerOf(agentId);
        if (owner == address(0)) revert TokenNonexistent();
        if (!(_isAuthorized(owner, _msgSender(), agentId) || hasRole(DEFAULT_ADMIN_ROLE, _msgSender()))) revert NotAuthorized();
        if (bytes(endpoint).length == 0 || bytes(metadataURI).length == 0) revert InvalidMetadata();

        AgentInfo storage agent = _agentInfo[agentId];
        agent.endpoint = endpoint;
        agent.metadataURI = metadataURI;
        emit AgentMetadataUpdated(agentId, endpoint, metadataURI);
    }

    /// @notice Read agent endpoint, metadata URI and reputation in one call
    /// @param agentId Agent token id
    /// @return endpoint Agent endpoint URL
    /// @return metadataURI Token metadata URI
    /// @return rep Current reputation score
    function getAgent(uint256 agentId) external view override returns (string memory endpoint, string memory metadataURI, uint256 rep) {
        if (_ownerOf(agentId) == address(0)) revert TokenNonexistent();
        AgentInfo storage agent = _agentInfo[agentId];
        return (agent.endpoint, agent.metadataURI, reputation[agentId]);
    }

    /// @notice Get agent endpoint URL
    /// @param agentId Agent token id
    function agentEndpoint(uint256 agentId) external view override returns (string memory) {
        if (_ownerOf(agentId) == address(0)) revert TokenNonexistent();
        return _agentInfo[agentId].endpoint;
    }

    /// @notice Get agent metadata URI
    /// @param agentId Agent token id
    function agentMetadataURI(uint256 agentId) external view override returns (string memory) {
        if (_ownerOf(agentId) == address(0)) revert TokenNonexistent();
        return _agentInfo[agentId].metadataURI;
    }

    /// @notice Get agent reputation score
    /// @param agentId Agent token id
    function reputationOf(uint256 agentId) external view override returns (uint256) {
        if (_ownerOf(agentId) == address(0)) revert TokenNonexistent();
        return reputation[agentId];
    }

    /// @notice ERC-721 tokenURI override to return agent metadata URI
    /// @param agentId Agent token id
    function tokenURI(uint256 agentId) public view override returns (string memory) {
        if (_ownerOf(agentId) == address(0)) revert TokenNonexistent();
        return _agentInfo[agentId].metadataURI;
    }

    /// @notice Returns whether an agent token exists (not burned)
    /// @param agentId Agent token id
    function exists(uint256 agentId) external view returns (bool) {
        return _ownerOf(agentId) != address(0);
    }

    /// @notice Returns the next agent id to be assigned (monotonic)
    /// @dev Starts at 1 and increases by 1 per mint; unaffected by burns
    function nextAgentId() external view returns (uint256) {
        return _tokenIdCounter + 1;
    }

    /// @notice Returns the current number of live agent tokens
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    // Invoice consumption read removed

    /// @notice Burn an agent token and clear its stored data
    /// @dev Owner or admin can burn when not paused
    /// @param agentId Agent token id
    function burn(uint256 agentId) external whenNotPaused {
        address owner = _ownerOf(agentId);
        if (owner == address(0)) revert TokenNonexistent();
        if (!(_isAuthorized(owner, _msgSender(), agentId) || hasRole(DEFAULT_ADMIN_ROLE, _msgSender()))) revert NotAuthorized();
        _burn(agentId);
        unchecked { _totalSupply -= 1; }
        delete _agentInfo[agentId];
        delete reputation[agentId];
    }

    /// @notice Emergency pause
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    /// @notice Lift emergency pause
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    /// @notice ERC165 interface support
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl, ERC721) returns (bool) {
        return interfaceId == type(IERC8004).interfaceId || super.supportsInterface(interfaceId);
    }
}
