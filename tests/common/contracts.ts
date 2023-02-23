import { BOC } from "ton3-core";
import { readFileSync } from "fs";
import path from "path";

export const [MINTER_CODE] = BOC.from(
  readFileSync(path.join(__dirname, "../../build/boc/wton-minter.boc"))
).root;

export const [WALLET_CODE] = BOC.from(
  readFileSync(path.join(__dirname, "../../build/boc/wton-wallet.boc"))
).root;
