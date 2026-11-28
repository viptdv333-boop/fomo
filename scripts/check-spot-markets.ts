/** Regression: commodity spot search and reciprocal MOEX/spot market selection. No network. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/asset-markets/route";
import { buildFamilies, parseFortsRows } from "../src/lib/moex-contracts";
import { INSTA_INSTRUMENTS, instaItems } from "../src/lib/instaforex-meta";
import { commodityAsset, instrumentFamily } from "../src/lib/instrument-family";
import { popularMarketPage, searchMarketPage } from "../src/lib/moex-search";
import { staticPopular } from "../src/lib/market-popular";
import { recentFor } from "../src/lib/recent-instruments";

async function main() {
  const sample=JSON.parse(readFileSync(new URL("./fixtures/forts-sample.json",import.meta.url),"utf8"));
  const families=buildFamilies(parseFortsRows(sample.securities.columns,sample.securities.data),"2026-10-03");
  const state=(globalThis as any).__fomoForts;
  state.cache={at:Date.now(),families,bySecid:new Map(families.flatMap(f=>f.contracts.map(c=>[c.secid,c])))};
  const spots=INSTA_INSTRUMENTS.filter(r=>r.kind==="spot");
  assert.deepEqual(spots.map(r=>r.id).sort(),["BRENT.SPOT","XAGUSD","XAUUSD","XPDUSD"]);
  const page=await popularMarketPage("spot",{limit:2});
  const next=await popularMarketPage("spot",{limit:2,offset:2});
  assert.equal(page.total,4); assert.equal(page.hasMore,true); assert.equal(next.hasMore,false);
  assert.equal(new Set([...page.items,...next.items].map(r=>r.secid)).size,4);
  assert.deepEqual((await searchMarketPage("золото","spot")).items.map(r=>r.secid),["XAUUSD"]);
  assert.equal((await searchMarketPage("NG","spot")).total,0);
  assert.equal((await searchMarketPage("SBH27","spot")).total,0);
  assert.equal((await popularMarketPage("spot",{filters:{country:"",venue:"MOEX",asset:""}})).total,0);
  assert.deepEqual(staticPopular("spot").map(r=>r.secid),instaItems("spot").map(r=>r.secid));
  assert.deepEqual(recentFor("spot",[...instaItems("spot"),...instaItems("future").filter(r=>r.kind!=="spot")]).map(r=>r.secid),spots.map(r=>r.id));

  async function markets(source:string,ticker:string) {
    const response=await GET(new NextRequest(`http://localhost/api/asset-markets?source=${source}&ticker=${encodeURIComponent(ticker)}`));
    assert.equal(response.status,200);
    return response.json();
  }
  let checks=0;
  for(const spot of spots) {
    const related=families.filter(f=>commodityAsset(f.asset)===spot.asset);
    assert(related.length,`No MOEX family for ${spot.id}`);
    const fromSpot=await markets("instaforex",spot.id);
    for(const f of related) {
      for(const ticker of [f.auto,`${f.asset}1!`,...f.contracts.map(c=>c.secid)]) {
        const result=await markets("moex",ticker);
        assert(result.items.some((i:any)=>i.source==="instaforex" && i.dataTicker===spot.id),`${ticker} misses ${spot.id}`);
        assert(fromSpot.items.some((i:any)=>i.source==="moex" && i.dataTicker===ticker) || ticker===f.auto,`${spot.id} misses ${ticker}`);
        checks++;
      }
    }
  }
  for(const ticker of ["GL1!","GLZ6","GLDRUBF","GOLDM1!"]) {
    assert.equal(instrumentFamily({source:"moex",dataTicker:ticker,name:ticker,group:"future"})?.name,"Золото");
    assert.equal((await markets("moex",ticker)).name,"Золото");
  }
  assert(!(await markets("moex","NG1!")).items.some((i:any)=>i.kind==="spot"),"Current-month gas CFD is not spot");
  assert(!(await markets("instaforex","T")).items.some((i:any)=>i.source==="moex"),"AT&T must not inherit T-Technologies futures with the same ticker");
  console.log(`Spot catalogue/search/pagination/recents passed; ${checks} reciprocal commodity contract checks passed.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
