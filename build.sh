#!/usr/bin/env sh

func -SPA func/stdlib.func func/jetton-minter.func -o ./build/wton-minter.fif
func -SPA func/stdlib.func func/jetton-wallet.func -o ./build/wton-wallet.fif
echo '"build/wton-minter.fif" include 2 boc+>B "build/boc/wton-minter.boc" B>file' | fift -s
echo '"build/wton-wallet.fif" include 2 boc+>B "build/boc/wton-wallet.boc" B>file' | fift -s
