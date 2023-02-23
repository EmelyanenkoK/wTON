import { Cell, Slice } from "ton3-core";
import { assert } from "chai";
import { WTONOperation } from "../WTONOperation";

/**
 * unwrap_notification query_id:uint64 amount:Coins from:MsgAddress = InternalMsgBody;
 *
 * @param messageBody
 */
export function unpackUnwrapNotification(messageBody: Cell) {
  const body = Slice.parse(messageBody);

  assert.equal(
    body.loadUint(32),
    WTONOperation.UNWRAP_NOTIFICATION,
    "expected an unwrap_notification body"
  );

  const queryId = body.loadBigUint(64);
  const amount = body.loadCoins();
  const from = body.loadAddress();

  return {
    queryId,
    amount,
    from,
  };
}
