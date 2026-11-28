import assert from "node:assert/strict";
import fs from "node:fs";
import { INSTA_INSTRUMENTS, instaItems, instaInstrument, instaBrandIcon } from "../src/lib/instaforex-meta";
import { instrumentIcon } from "../src/lib/instrument-icons";
import { instrumentFamily } from "../src/lib/instrument-family";
import { parseInstaCandles, getInstaCandles, getInstaQuote } from "../src/lib/instaforex";
import { knownMoexAssets } from "../src/lib/futures-assets";
import { buildDisplayRows } from "../src/lib/instrument-rows";
import { FX_CURRENCIES, parseFxSymbol } from "../src/lib/forex-meta";

async function main() {
  const stocks=instaItems("stock");
  assert(stocks.length>150);
  for(const row of stocks) {
    assert.equal(row.country,"US");
    const icon=instaBrandIcon(row.secid);
    assert(icon && fs.existsSync(`public${icon}`),`Missing local brand ${row.secid}`);
  }
  assert.equal(new Set(INSTA_INSTRUMENTS.map(r=>r.id)).size,INSTA_INSTRUMENTS.length);
  assert.equal(instaItems("crypto").length,0);
  for(const row of INSTA_INSTRUMENTS.filter(r=>r.group==="forex")) {
    const pair=parseFxSymbol(row.id);
    assert(pair && FX_CURRENCIES[pair.base]?.flag && FX_CURRENCIES[pair.quote]?.flag, `Missing pair flags ${row.id}`);
  }
  for(const row of INSTA_INSTRUMENTS.filter(r=>r.asset && knownMoexAssets().includes(r.asset))) {
    const local=instrumentIcon({source:"instaforex",ticker:row.id,dataTicker:row.id});
    const moex=instrumentIcon({source:"moex",ticker:row.asset!,dataTicker:row.asset!,group:"future"});
    assert.equal(local,moex,`Different underlying icons ${row.id}`);
  }
  assert.equal(instrumentFamily({source:"forex",dataTicker:"XAUUSD",name:"XAUUSD"})?.name,"Золото");
  assert.equal(instrumentFamily({source:"moex",dataTicker:"SBER",name:"Сбербанк",group:"stock"})?.asset,"SBRF");
  assert.equal(instrumentFamily({source:"moex",dataTicker:"SRZ6",name:"Сбербанк",group:"future"})?.stock,"SBER");
  assert.equal(instrumentFamily({source:"instaforex",dataTicker:"AAPL",name:"Apple",group:"stock"})?.asset,"APPF");
  assert.equal(instrumentFamily({source:"moex",dataTicker:"APPF",name:"Apple",group:"future"})?.stock,"AAPL");
  assert.equal(instrumentFamily({source:"moex",dataTicker:"T",name:"Т-Технологии",group:"stock"})?.name,"Т-Технологии");
  assert.notEqual(instrumentFamily({source:"instaforex",dataTicker:"T",name:"AT&T",group:"stock"})?.name,"Т-Технологии");
  assert.equal(instaInstrument("KCZ26")?.asset,"COFFEE");
  for(const id of ["SBH27","SBK27","SBN27"]) assert.equal(instaInstrument(id)?.asset,"SUGAR",`Missing public sugar expiry ${id}`);
  for(const [id,asset] of [["GDZ0","GOLD"],["SVH0","SILV"],["PTM0","PLT"],["PDU0","PLD"]]) {
    assert.equal(instrumentIcon({source:"moex",ticker:id,dataTicker:id}),instrumentIcon({source:"moex",ticker:asset,dataTicker:asset,group:"future"}),`New expiry artwork ${id}`);
  }
  const rows=buildDisplayRows([
    {secid:"COCOA",ticker:"COCOA",name:"Какао",source:"moex",group:"future",fgroup:"soft",asset:"COCOA",country:"RU"},
    {secid:"COFFEE",ticker:"COFFEE",name:"Кофе",source:"moex",group:"future",fgroup:"soft",asset:"COFFEE",country:"RU"},
    {secid:"CCZ26",ticker:"CCZ26",name:"Какао",source:"instaforex",group:"future",fgroup:"soft",asset:"COCOA"},
  ],{tab:"future",asset:"",mix:false});
  const selectable=rows.filter(r=>r.kind==="item");
  assert.deepEqual(selectable.map(r=>r.item.secid),["COCOA","CCZ26","COFFEE"]);
  const xml='<Candle><Timestamp>1700000000</Timestamp><Open>10</Open><High>12</High><Low>9</Low><Close>11</Close><Volume>42</Volume></Candle>';
  assert.equal(parseInstaCandles(xml)[0].volume,42);
  assert.equal(parseInstaCandles(xml.replace('<High>12','<High>8')).length,0);
  console.log(`Offline checks passed: ${stocks.length} local stock brands; underlying icons, instrument families, grouping, XML validation.`);
  if(process.argv.includes("--live")) {
    for(const id of ["EURUSD","IBM","XAUUSD","XAGUSD","XPDUSD","BRENT.SPOT","NG","SBH27","SBK27","SBN27"]) {
      assert(instaInstrument(id),`Missing catalogue ${id}`);
      const [quote,bars]=await Promise.all([getInstaQuote(id),getInstaCandles(id,"60",10)]);
      assert(quote && quote.price>0,`No quote ${id}`);
      assert(bars.candles.length>0,`No chart ${id}`);
      assert(bars.candles.every((c,i,a)=>!i||c.timestamp>a[i-1].timestamp));
      console.log(`${id}: quote + ${bars.candles.length} ascending H1 candles; volume=${bars.volume}`);
    }
    for(const interval of ["1","5","15","30","60","240","D","W","M"]) {
      const r=await getInstaCandles("XAUUSD",interval,5);
      assert(r.candles.length>0,`No gold ${interval} chart`);
    }
    console.log('Live feed and all native chart intervals passed.');
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
