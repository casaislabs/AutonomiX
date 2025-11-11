import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AutonomiXAgent", function () {
  async function deploy(admin?: string) {
    const [deployer] = await ethers.getSigners();
    const adminAddr = admin ?? deployer.address;
    const contract = await ethers.deployContract("AutonomiXAgent", [adminAddr]);
    return { contract, deployer };
  }

  it("constructor: reverts with ZeroAddress", async function () {
    const factory = await ethers.getContractFactory("AutonomiXAgent");
    await expect(factory.deploy(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(factory, "ZeroAddress");
  });

  it("registerAgent: only admin, emits event and assigns data", async function () {
    const { contract, deployer } = await deploy();
    const [, user, other] = await ethers.getSigners();

    const endpoint = "https://agent.autonomix.xyz";
    const metadataURI = "ipfs://QmMeta";

    await expect(contract.registerAgent(user.address, endpoint, metadataURI))
      .to.emit(contract, "AgentRegistered")
      .withArgs(1n, user.address, endpoint, metadataURI);

    expect(await contract.ownerOf(1n)).to.equal(user.address);
    expect(await contract.agentEndpoint(1n)).to.equal(endpoint);
    expect(await contract.agentMetadataURI(1n)).to.equal(metadataURI);
    const agent = await contract.getAgent(1n);
    expect(agent.endpoint).to.equal(endpoint);
    expect(agent.metadataURI).to.equal(metadataURI);
    expect(agent.rep).to.equal(0n);

    await expect(contract.connect(other).registerAgent(user.address, endpoint, metadataURI))
      .to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
  });

  it("setAgentMetadata: owner/admin authorized; invalid and nonexistent revert", async function () {
    const { contract } = await deploy();
    const [admin, owner, stranger] = await ethers.getSigners();

    await contract.registerAgent(owner.address, "https://a", "ipfs://m");

    await expect(contract.connect(owner).setAgentMetadata(1n, "https://b", "ipfs://n"))
      .to.emit(contract, "AgentMetadataUpdated")
      .withArgs(1n, "https://b", "ipfs://n");
    expect(await contract.agentEndpoint(1n)).to.equal("https://b");
    expect(await contract.agentMetadataURI(1n)).to.equal("ipfs://n");

    await expect(contract.setAgentMetadata(1n, "https://c", "ipfs://o"))
      .to.emit(contract, "AgentMetadataUpdated")
      .withArgs(1n, "https://c", "ipfs://o");

    await expect(contract.connect(stranger).setAgentMetadata(1n, "https://x", "ipfs://y"))
      .to.be.revertedWithCustomError(contract, "NotAuthorized");

    await expect(contract.connect(owner).setAgentMetadata(1n, "", "ipfs://z"))
      .to.be.revertedWithCustomError(contract, "InvalidMetadata");
    await expect(contract.connect(owner).setAgentMetadata(1n, "https://x", ""))
      .to.be.revertedWithCustomError(contract, "InvalidMetadata");

    await expect(contract.connect(owner).setAgentMetadata(999n, "https://x", "ipfs://y"))
      .to.be.revertedWithCustomError(contract, "TokenNonexistent");
  });

  it("updateReputation: positive/negative delta, clamps to 0, emits event", async function () {
    const { contract } = await deploy();
    const [, owner] = await ethers.getSigners();
    await contract.registerAgent(owner.address, "https://a", "ipfs://m");

    await expect(contract.updateReputation(1n, 10))
      .to.emit(contract, "ReputationUpdated")
      .withArgs(1n, 0n, 10n, 10);
    expect(await contract.reputationOf(1n)).to.equal(10n);

    await expect(contract.updateReputation(1n, -3))
      .to.emit(contract, "ReputationUpdated")
      .withArgs(1n, 10n, 7n, -3);
    expect(await contract.reputationOf(1n)).to.equal(7n);

    await expect(contract.updateReputation(1n, -20))
      .to.emit(contract, "ReputationUpdated")
      .withArgs(1n, 7n, 0n, -20);
    expect(await contract.reputationOf(1n)).to.equal(0n);

    await expect(contract.updateReputation(999n, 1))
      .to.be.revertedWithCustomError(contract, "TokenNonexistent");
  });

  it("updateReputation: reverts on InvalidDeltaMin", async function () {
    const { contract } = await deploy();
    const [, owner] = await ethers.getSigners();
    await contract.registerAgent(owner.address, "https://a", "ipfs://m");
    const minInt = (BigInt(1) << BigInt(255)) * BigInt(-1); // type(int256).min
    await expect(contract.updateReputation(1n, minInt))
      .to.be.revertedWithCustomError(contract, "InvalidDeltaMin");
  });

  it("burn: only authorized, removes storage and subsequent reads revert", async function () {
    const { contract } = await deploy();
    const [, owner, stranger] = await ethers.getSigners();
    await contract.registerAgent(owner.address, "https://a", "ipfs://m");

    await expect(contract.connect(stranger).burn(1n))
      .to.be.revertedWithCustomError(contract, "NotAuthorized");

    await contract.connect(owner).burn(1n);

    await expect(contract.agentEndpoint(1n))
      .to.be.revertedWithCustomError(contract, "TokenNonexistent");
    await expect(contract.agentMetadataURI(1n))
      .to.be.revertedWithCustomError(contract, "TokenNonexistent");
    await expect(contract.reputationOf(1n))
      .to.be.revertedWithCustomError(contract, "TokenNonexistent");
    await expect(contract.tokenURI(1n))
      .to.be.revertedWithCustomError(contract, "TokenNonexistent");
  });

  it("pausable: only admin can pause; whenNotPaused blocks register", async function () {
    const { contract } = await deploy();
    const [, to, stranger] = await ethers.getSigners();

    await expect(contract.connect(stranger).pause())
      .to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");

    await contract.pause();

    await expect(contract.registerAgent(to.address, "https://x", "ipfs://y"))
      .to.be.revertedWithCustomError(contract, "EnforcedPause");

    await contract.unpause();

    await expect(contract.registerAgent(to.address, "https://x", "ipfs://y"))
      .to.emit(contract, "AgentRegistered");
  });

  it("supportsInterface: ERC165, ERC721 and ERC8004", async function () {
    const { contract } = await deploy();

    // ERC165 y ERC721 ids conocidos
    const ERC165 = "0x01ffc9a7";
    const ERC721 = "0x80ac58cd";
    expect(await contract.supportsInterface(ERC165)).to.equal(true);
    expect(await contract.supportsInterface(ERC721)).to.equal(true);

    // Calcular interfaceId de IERC8004 (XOR de selectores de 7 funciones)
    const sigs = [
      "agentEndpoint(uint256)",
      "agentMetadataURI(uint256)",
      "reputationOf(uint256)",
      "getAgent(uint256)",
      "registerAgent(address,string,string)",
      "setAgentMetadata(uint256,string,string)",
      "updateReputation(uint256,int256)",
    ];
    let id = 0n;
    for (const s of sigs) {
      const selectorHex = ethers.dataSlice(ethers.id(s), 0, 4); // first 4 bytes
      const selector = ethers.toBigInt(selectorHex);
      id ^= selector;
    }
    const IERC8004_ID = "0x" + id.toString(16).padStart(8, "0");
    expect(await contract.supportsInterface(IERC8004_ID)).to.equal(true);
  });
});