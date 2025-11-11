// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./AutonomiXAgent.sol";
import "./interfaces/IERC8004.sol";

contract AutonomiXAgentTest is Test {
    AutonomiXAgent ax;
    address admin = address(this);
    address owner = address(0xBEEF);
    address stranger = address(0xB0B);
    address updater = address(0xAA1);

    function setUp() public {
        ax = new AutonomiXAgent(admin);
    }

    function testConstructorZeroAddressReverts() public {
        vm.expectRevert(AutonomiXAgent.ZeroAddress.selector);
        new AutonomiXAgent(address(0));
    }

    function testRegisterAgentWorks() public {
        string memory endpoint = "https://example.com/agent";
        string memory metadata = "ipfs://QmMeta";
        uint256 id = ax.registerAgent(owner, endpoint, metadata);
        assertEq(id, 1);
        assertEq(ax.ownerOf(1), owner);
        assertEq(ax.agentEndpoint(1), endpoint);
        assertEq(ax.agentMetadataURI(1), metadata);
        assertEq(ax.reputationOf(1), 0);
    }

    function testRegisterAgentUnauthorizedReverts() public {
        bytes32 role = ax.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        // Use explicit selector to avoid identifier visibility issues
        bytes4 unauthSel = bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)"));
        vm.expectRevert(abi.encodeWithSelector(unauthSel, stranger, role));
        ax.registerAgent(owner, "https://agent", "ipfs://meta");
    }

    function testSetAgentMetadataByOwnerAndAdmin() public {
        ax.registerAgent(owner, "https://a", "ipfs://m");
        vm.prank(owner);
        ax.setAgentMetadata(1, "https://b", "ipfs://n");
        assertEq(ax.agentEndpoint(1), "https://b");
        assertEq(ax.agentMetadataURI(1), "ipfs://n");

        ax.setAgentMetadata(1, "https://c", "ipfs://o");
        assertEq(ax.agentEndpoint(1), "https://c");
        assertEq(ax.agentMetadataURI(1), "ipfs://o");
    }

    function testSetAgentMetadataInvalidAndNonexistentRevert() public {
        ax.registerAgent(owner, "https://a", "ipfs://m");
        vm.prank(owner);
        vm.expectRevert(AutonomiXAgent.InvalidMetadata.selector);
        ax.setAgentMetadata(1, "", "ipfs://z");

        vm.prank(owner);
        vm.expectRevert(AutonomiXAgent.InvalidMetadata.selector);
        ax.setAgentMetadata(1, "https://x", "");

        vm.prank(owner);
        vm.expectRevert(AutonomiXAgent.TokenNonexistent.selector);
        ax.setAgentMetadata(999, "https://x", "ipfs://y");
    }

    function testUpdateReputationClampToZero() public {
        ax.registerAgent(owner, "https://a", "ipfs://m");
        ax.updateReputation(1, int256(10));
        assertEq(ax.reputationOf(1), 10);
        ax.updateReputation(1, int256(-3));
        assertEq(ax.reputationOf(1), 7);
        ax.updateReputation(1, int256(-20));
        assertEq(ax.reputationOf(1), 0);

        vm.expectRevert(AutonomiXAgent.TokenNonexistent.selector);
        ax.updateReputation(999, int256(1));
    }

    function testBurnAuthorizationAndCleanup() public {
        ax.registerAgent(owner, "https://a", "ipfs://m");

        vm.prank(stranger);
        vm.expectRevert(AutonomiXAgent.NotAuthorized.selector);
        ax.burn(1);

        vm.prank(owner);
        ax.burn(1);

        vm.expectRevert(AutonomiXAgent.TokenNonexistent.selector);
        ax.agentEndpoint(1);
        vm.expectRevert(AutonomiXAgent.TokenNonexistent.selector);
        ax.agentMetadataURI(1);
        vm.expectRevert(AutonomiXAgent.TokenNonexistent.selector);
        ax.reputationOf(1);
        vm.expectRevert(AutonomiXAgent.TokenNonexistent.selector);
        ax.tokenURI(1);
    }

    function testPauseBlocksRegister() public {
        ax.pause();
        // Use explicit selector for EnforcedPause()
        bytes4 pauseSel = bytes4(keccak256("EnforcedPause()"));
        vm.expectRevert(abi.encodeWithSelector(pauseSel));
        ax.registerAgent(owner, "https://x", "ipfs://y");
        ax.unpause();
        uint256 id = ax.registerAgent(owner, "https://x", "ipfs://y");
        assertEq(id, 1);
    }

    function testSupportsInterface() public view {
        // ERC165 and ERC721
        require(ax.supportsInterface(0x01ffc9a7), "ERC165 not supported");
        require(ax.supportsInterface(0x80ac58cd), "ERC721 not supported");
        // IERC8004
        require(ax.supportsInterface(type(IERC8004).interfaceId), "IERC8004 not supported");
    }

    function testEnumerationHelpersAndSupply() public {
        // Initial state: next id starts at 1 (monotonic counter)
        assertEq(ax.nextAgentId(), 1);
        assertEq(ax.totalSupply(), 0);
        assertFalse(ax.exists(1));

        // Register first agent
        uint256 id1 = ax.registerAgent(owner, "https://a", "ipfs://m");
        assertEq(id1, 1);
        assertEq(ax.nextAgentId(), 2);
        assertEq(ax.totalSupply(), 1);
        assertTrue(ax.exists(1));

        // Register second agent
        uint256 id2 = ax.registerAgent(owner, "https://b", "ipfs://n");
        assertEq(id2, 2);
        assertEq(ax.nextAgentId(), 3);
        assertEq(ax.totalSupply(), 2);
        assertTrue(ax.exists(2));

        // Burn first agent: stranger unauthorized, then owner burns
        vm.prank(stranger);
        vm.expectRevert(AutonomiXAgent.NotAuthorized.selector);
        ax.burn(1);

        vm.prank(owner);
        ax.burn(1);
        assertEq(ax.totalSupply(), 1);
        assertFalse(ax.exists(1));
        assertTrue(ax.exists(2));
    }


    function testUpdateReputationInvalidDeltaMinReverts() public {
        ax.registerAgent(owner, "https://a", "ipfs://m");
        vm.expectRevert(AutonomiXAgent.InvalidDeltaMin.selector);
        ax.updateReputation(1, type(int256).min);
    }
}