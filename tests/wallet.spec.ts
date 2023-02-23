import { expect, use } from "chai";
import { Address, Builder, Cell, Coins, Slice } from "ton3-core";
import {
  generateAddress,
  tvmMatchers,
  JettonOperation,
  TestableContract,
} from "@tonkite/testing";
import { Emulator } from "@tonkite/vm";
import {
  WALLET_CODE,
  GLOBAL_CONFIG,
  WTONOperation,
  unpackUnwrapNotification,
  externalTransfer,
} from "./common";
import { WTONError } from "./common/WTONError";

use(tvmMatchers);

describe("wTON Wallet", () => {
  const GAS_CONSUMPTION = Coins.fromNano(13000000);

  let emulator: Emulator;
  let owner: Address;
  let minter: Address;
  let wallet: TestableContract;

  before(async () => {
    emulator = await Emulator.create(GLOBAL_CONFIG);
  });

  beforeEach(() => {
    owner = generateAddress();
    minter = generateAddress();
    wallet = TestableContract.from(emulator, {
      address: generateAddress(),
      balance: new Coins(1),
      code: WALLET_CODE,
      data: new Builder()
        .storeAddress(owner)
        .storeAddress(minter)
        .storeRef(WALLET_CODE)
        .cell(),
    });
  });

  describe("get get_wallet_data", () => {
    it("should return wallet data", async () => {
      const walletData = await wallet.runGetMethod<
        [bigint, Slice, Slice, Cell]
      >("get_wallet_data");

      expect(walletData[0]).to.equalCoins(wallet.balance); // balance of wallet
      expect(walletData[1].loadAddress()).to.equalAddress(owner); // address of owner
      expect(walletData[2].loadAddress()).to.equalAddress(minter); // address of minter
      expect(walletData[3]).to.equalCell(WALLET_CODE); // wallet code
    });
  });

  describe("@transfer", () => {
    it("should send state init to other wallet", async () => {
      const context = await wallet.handleInternalMessage({
        src: owner,
        value: new Coins(0.1),
        body: JettonOperation.transfer({
          amount: new Coins(1),
          destination: generateAddress(),
        }),
      });

      expect(context).to.completeComputePhase();
      expect(context).to.sendMessage(JettonOperation.INTERNAL_TRANSFER);

      const internalTransferMessage = context.selectOutMessage({
        operation: JettonOperation.INTERNAL_TRANSFER,
      }) as any;
      expect(internalTransferMessage.outMessage.init?.code).to.equalCell(
        WALLET_CODE
      );
    });

    it("should send `msg_value` TON if `amount` less than `msg_value`", async () => {
      const messageValue = new Coins(5);
      const amount = new Coins(1);

      const context = await wallet.handleInternalMessage({
        src: owner,
        value: messageValue,
        body: JettonOperation.transfer({
          amount,
          destination: generateAddress(),
        }),
      });

      expect(context).to.completeComputePhase();
      expect(context).to.sendMessage(JettonOperation.INTERNAL_TRANSFER);

      const internalTransferMessage = context.selectOutMessage({
        operation: JettonOperation.INTERNAL_TRANSFER,
      }) as any;
      expect(internalTransferMessage.outMessage.info.value.coins).to.equalCoins(
        messageValue
      );
    });

    it("should send `amount` + `fees` TON if `msg_value` less then `amount`", async () => {
      const messageValue = new Coins(0.1);
      const amount = new Coins(1);

      const context = await wallet.handleInternalMessage({
        src: owner,
        value: messageValue,
        body: JettonOperation.transfer({
          amount,
          destination: generateAddress(),
        }),
      });

      expect(context).to.completeComputePhase();
      expect(context).not.to.failActionPhase();
      expect(context).to.sendMessage(JettonOperation.INTERNAL_TRANSFER);

      const internalTransferMessage = context.selectOutMessage({
        operation: JettonOperation.INTERNAL_TRANSFER,
      }) as any;
      expect(internalTransferMessage.outMessage.info.value.coins).to.equalCoins(
        amount.add(new Coins(GAS_CONSUMPTION).mul(2))
      );
    });

    it("should fail if cross-chain", async () => {
      const destination = generateAddress({ workchain: -1 });
      const context = await wallet.handleInternalMessage({
        src: owner,
        value: new Coins(1),
        body: JettonOperation.transfer({
          amount: new Coins(1),
          destination,
        }),
      });

      expect(wallet.address.workchain).not.to.eq(destination.workchain); // workchains are different
      expect(context).to.failComputePhase(WTONError.WRONG_WORKCHAIN);
    });

    it("should not fail on `action` phase if not enough funds", async () => {
      const context = await wallet.handleInternalMessage({
        src: owner,
        value: new Coins(1),
        body: JettonOperation.transfer({
          amount: new Coins(5), // More than balance + msg_value
          destination: generateAddress(),
        }),
      });

      expect(context).to.failComputePhase(WTONError.NOT_ENOUGH_FUNDS);
      expect(context).not.to.failActionPhase("no-funds");
    });

    it("should fail if sender is not owner", async () => {
      const context = await wallet.handleInternalMessage({
        src: generateAddress(),
        value: new Coins(2),
        body: JettonOperation.transfer({
          amount: new Coins(1.0),
          destination: generateAddress(),
        }),
      });

      expect(context).to.failComputePhase(WTONError.UNAUTHORIZED_TRANSFER);
    });

    it("should send @internal_transfer to recipient", async () => {
      const amount = new Coins(1.5);
      const destination = generateAddress();
      const context = await wallet.handleInternalMessage({
        src: owner,
        value: new Coins(2),
        body: JettonOperation.transfer({
          amount,
          destination,
        }),
      });

      expect(context).to.completeComputePhase();
      expect(context).to.sendMessage(JettonOperation.INTERNAL_TRANSFER);

      const internalTransferMessage = context.selectOutMessage({
        operation: JettonOperation.INTERNAL_TRANSFER,
      })!;
      const internalTransfer = JettonOperation.unpackInternalTransfer(
        internalTransferMessage.outMessage.body
      );

      expect(internalTransfer.from).to.equalAddress(owner);
      expect(internalTransfer.amount).to.equalCoins(amount);
    });
  });

  describe("internal @internal_transfer", () => {
    it("should fail if sender is not wallet", async () => {
      const context = await wallet.handleInternalMessage({
        src: generateAddress(),
        value: new Coins(1),
        body: JettonOperation.internalTransfer({
          amount: new Coins(1),
          from: generateAddress(),
        }),
      });

      expect(context).to.failComputePhase(
        WTONError.UNAUTHORIZED_INCOMING_TRANSFER
      );
    });
  });

  describe("internal @external_transfer", () => {
    it("should not exhaust contract balance", async () => {
      const amount = new Coins(1.5);
      const sender = generateAddress();
      const context = await wallet.handleInternalMessage({
        src: sender,
        // `msg_value` must be more than fee::gas_consumption + jetton_amount + forward_amount + fwd_fee
        value: new Coins(amount).add(GAS_CONSUMPTION).add(Coins.fromNano(1)),
        body: externalTransfer({
          amount,
          forwardAmount: new Coins(100), // 100 TON is more that `msg_value`
        }),
      });

      expect(context).to.failComputePhase(WTONError.NOT_ENOUGH_FUNDS);
    });

    it("should notify about transfer from `sender`", async () => {
      const sender = generateAddress();
      const amount = new Coins(2);
      const forwardAmount = new Coins(1);
      const fees = new Coins(0.1);
      const comment = new Builder()
        .storeUint(0, 32)
        .storeString("Hello!")
        .cell();
      const context = await wallet.handleInternalMessage({
        src: sender,
        value: new Coins(amount).add(forwardAmount).add(fees),
        body: externalTransfer({
          queryId: 920233830n,
          amount,
          forwardAmount,
          forwardPayload: comment,
        }),
      });

      expect(context).to.completeComputePhase();
      expect(context).to.sendMessage(JettonOperation.TRANSFER_NOTIFICATION);

      const transferNotificationMessage = context.selectOutMessage({
        operation: JettonOperation.TRANSFER_NOTIFICATION,
      })!;
      const transferNotification = JettonOperation.unpackTransferNotification(
        transferNotificationMessage.outMessage.body
      );

      expect(transferNotification.queryId).to.eq(920233830n);
      expect(transferNotification.sender).to.equalAddress(sender);
      expect(transferNotification.amount).to.equalCoins(amount);
      expect(
        Slice.parse(transferNotification.forwardPayload).skip(32).loadString()
      ).to.eq("Hello!");
    });

    it("should consume less than `gas_consumption`", async () => {
      const fees = new Coins(0.035);
      const amount = new Coins(0.5);
      const forwardAmount = new Coins(1);
      const BIG_FORWARD_PAYLOAD = new Builder()
        .storeAddress(generateAddress())
        .storeAddress(generateAddress())
        .storeAddress(generateAddress())
        .cell();

      const sender = generateAddress();
      const context = await wallet.handleInternalMessage({
        src: sender,
        value: new Coins(fees).add(amount).add(forwardAmount),
        body: externalTransfer({
          amount,
          forwardAmount,
          forwardPayload: BIG_FORWARD_PAYLOAD,
        }),
      });

      expect(context).to.completeComputePhase();
      expect(context.transaction.totalFees.coins).to.satisfy(
        (totalFees: Coins) => totalFees.lt(GAS_CONSUMPTION),
        "expected transaction to have consumed less gas then `fee::gas_consumption`"
      );
    });
  });

  describe("internal @burn", () => {
    it("should fail because of not funds", async () => {
      const destination = generateAddress();
      const context = await wallet.handleInternalMessage({
        src: owner,
        value: new Coins(0.1),
        body: JettonOperation.burn({
          amount: new Coins(5),
          responseDestination: destination,
        }),
      });

      expect(context).to.failComputePhase(WTONError.NOT_ENOUGH_FUNDS);
    });

    it("should send unwrapped tokens to owner", async () => {
      const destination = generateAddress();
      const amount = new Coins(0.87);
      const queryId = 2130230n;
      const context = await wallet.handleInternalMessage({
        src: owner,
        value: new Coins(0.1),
        body: JettonOperation.burn({
          queryId,
          amount,
          responseDestination: destination,
        }),
      });

      expect(context).to.completeComputePhase();
      expect(context).to.sendMessage(WTONOperation.UNWRAP_NOTIFICATION);

      const unwrapNotificationMessage = context.selectOutMessage({
        operation: WTONOperation.UNWRAP_NOTIFICATION,
      })!;
      expect(unwrapNotificationMessage.outMessage.info)
        .property("dest")
        .equalAddress(destination);
      expect(unwrapNotificationMessage.outMessage.info)
        .property("value")
        .property("coins")
        .equalCoins(amount);

      const unwrapNotification = unpackUnwrapNotification(
        unwrapNotificationMessage.outMessage.body
      );
      expect(unwrapNotification.queryId).to.eq(queryId);
      expect(unwrapNotification.from).to.equalAddress(owner);
      expect(unwrapNotification.amount).to.equalCoins(amount);
    });
  });

  describe("internal unknown operation", () => {
    it("should throw 0xffff error", async () => {
      const UNKNOWN_OP = 0xfacecafe;

      const context = await wallet.handleInternalMessage({
        src: generateAddress(),
        value: new Coins(1),
        body: new Builder().storeUint(UNKNOWN_OP, 32).storeUint(0, 64).cell(),
      });

      expect(context).to.failComputePhase(WTONError.UNKNOWN_OPERATION);
    });
  });
});
