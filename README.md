# wTON

This contract is fully compatible with next standards:

[![TEP-64 - Token Data Standard](https://img.shields.io/badge/TEP--64-Token%20Data%20Standard-blue)](https://github.com/ton-blockchain/TEPs/blob/master/text/0064-token-data-standard.md)
[![TEP-74 - Jettons Standard](https://img.shields.io/badge/TEP--74-Jettons%20Standard-blue)](https://github.com/ton-blockchain/TEPs/blob/master/text/0074-jettons-standard.md)
[![TEP-89 - Discoverable Jettons Wallets](https://img.shields.io/badge/TEP--89-Discoverable%20Jettons%20Wallets-blue)](https://github.com/ton-blockchain/TEPs/blob/master/text/0089-jetton-wallet-discovery.md)

## Contracts

### Minter

This is jetton wallet factory: contract that mimics to Jetton Minter,
but it doesn't mint jettons itself, instead it only deploys wallets which mint tokens for themselves.

### Wallet

It mimics sending of TONs as jetton transfer.
When it receives `transfer` messages it calculates receiver wTON wallet
and sends there `internal_transfer` amount of jettons is equal to amount of accepted TONs minus fee.
In turn when wTON wallet receives `internal_transfer` it generates `transfer_notification`.

Note that amount of "transferred" jettons will correspond to TON amount not to amount of jettons in internal_transfer.
wTON also checks `forward_payload`: if it contains only number `8388449` encoded in 23 bits,
it treats it as special request to "unwrap tokens" and send them directly to owner.

NOTE: This number is used since usually 32-bit ops are used and collisions are not expected.
