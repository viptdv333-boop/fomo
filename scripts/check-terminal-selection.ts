import assert from "node:assert/strict";
import { restoredSelection, savedSelection, selectionSource } from "../src/lib/terminal-selection";

const staleSber="?symbol=SBER&source=moex";
for(const [source,dataTicker] of [["instaforex","XAUUSD"],["instaforex","GOLD.m"],["instaforex","NG"],["yahoo","^GSPC"],["yahoo","0700.HK"],["moex","GL1!"],["bybit","BTCUSDT"],["binance","ETHUSDT"],["forex","EURUSD"],["fmp","GCUSD"],["databento","GC.c.0"],["twelvedata","EURUSD"]]) {
  const saved=JSON.stringify({source,dataTicker});
  assert.deepEqual(savedSelection(saved),{source,symbol:dataTicker});
  assert.deepEqual(restoredSelection(saved,staleSber),{source,symbol:dataTicker});
  assert.deepEqual(restoredSelection(null,`?source=${source}&symbol=${encodeURIComponent(dataTicker)}`),{source,symbol:dataTicker});
}
assert.equal(selectionSource("none"),null);
assert.equal(selectionSource("constructor"),null);
for(const raw of ["{", "null",'{}','{"source":"unknown","dataTicker":"SBER"}','{"source":"moex","dataTicker":"<script>"}']) assert.equal(savedSelection(raw),null);
assert.equal(restoredSelection(null,"?symbol=%3Cscript%3E"),null);
console.log("Saved and URL selections restore every provider, including InstaForex metals and Yahoo indices; stale SBER URLs cannot replace them.");
