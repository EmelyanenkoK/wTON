import { expect, use } from "chai";
import { Builder, Cell, Coins, Slice } from "ton3-core";
import {
  generateAddress,
  tvmMatchers,
  TestableContract,
  MessageFlag,
} from "@tonkite/testing";
import { Emulator } from "@tonkite/vm";
import { MINTER_CODE, WALLET_CODE, GLOBAL_CONFIG } from "./common";

use(tvmMatchers);

describe("wTON Minter", () => {
  let emulator: Emulator;
  let minter: TestableContract;

  before(async () => {
    emulator = await Emulator.create(GLOBAL_CONFIG);
  });

  beforeEach(() => {
    minter = TestableContract.from(emulator, {
      address: generateAddress(),
      balance: new Coins(1),
      code: MINTER_CODE,
      data: new Builder().storeRef(new Cell()).storeRef(WALLET_CODE).cell(),
    });
  });

  describe("get get_jetton_data", () => {
    it("should return jetton data", async () => {
      const jettonData = await minter.runGetMethod<
        [bigint, bigint, Slice, Cell, Cell]
      >("get_jetton_data");

      expect(jettonData[0]).to.equalCoins(new Coins(5_000_000_000n)); // total supply - 5bn TON
      expect(jettonData[1]).to.eq(-1n); // mintable
      expect(jettonData[2].loadAddress()).eq(null); // doesn't have an admin
      expect(jettonData[4]).to.equalCell(WALLET_CODE); // wallet code
    });
  });

  describe("internal @mint", () => {
    it("should send state init to a wallet", async () => {
      const RECEIVER = generateAddress();

      const context = await minter.handleInternalMessage({
        src: generateAddress(),
        value: new Coins(1), // 1 < 1 + 0.015 + 0.1
        body: new Builder()
          .storeUint(21, 32) // op::mint
          .storeUint(0, 64) // query_id
          .storeAddress(RECEIVER)
          .cell(),
      });

      expect(context).not.to.changeBalance(); // doesn't exhaust contract balance

      const message = context.selectOutMessage()!;

      expect(message.outMessage.init?.code).to.equalCell(WALLET_CODE); // deploys a wallet code
      expect(message.mode).to.eq(MessageFlag.REMAINING_GAS); // send remaining gas to a wallet
    });
  });
});
