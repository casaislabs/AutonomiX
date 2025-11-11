import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AutonomiXAgentModule", (m) => {
  const deployer = m.getAccount(0);
  const admin = m.getParameter("ADMIN_ADDRESS", deployer);

  const autonomiXAgent = m.contract("AutonomiXAgent", [admin]);

  return { autonomiXAgent };
});