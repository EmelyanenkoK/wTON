import { Address, Builder, Cell, Coins } from "ton3-core";
import { WTONOperation } from "../WTONOperation";

export function externalTransfer({
  queryId,
  amount,
  responseAddress,
  forwardAmount,
  forwardPayload,
}: {
  queryId?: bigint;
  amount: Coins;
  responseAddress?: Address | null;
  forwardAmount?: Coins;
  forwardPayload?: Cell;
}) {
  return new Builder()
    .storeUint(WTONOperation.EXTERNAL_TRANSFER, 32)
    .storeUint(queryId ?? 0, 64)
    .storeCoins(amount)
    .storeAddress(responseAddress ?? null)
    .storeCoins(forwardAmount ?? new Coins(0))
    .storeMaybeRef(forwardPayload ?? null)
    .cell();
}
