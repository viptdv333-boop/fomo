import { NextRequest, NextResponse } from "next/server";
import { findFamily, getFortsFamilies, refreshDays } from "@/lib/moex-contracts";
import { commodityAsset, instrumentFamily, STOCK_FUTURES, US_STOCK_FUTURES } from "@/lib/instrument-family";
import { INSTA_INSTRUMENTS, instaInstrument } from "@/lib/instaforex-meta";
import { moexAssetGroup } from "@/lib/futures-assets";
import { lookupMarket } from "@/lib/moex-search";
import { instrumentIcon } from "@/lib/instrument-icons";
import { chainContracts } from "@/lib/ng-symbols";
import type { TerminalInstrument, ChartSource } from "@/lib/terminal-data";
import { ipOf, overLimit } from "@/lib/mem-rate-limit";

export async function GET(req:NextRequest) {
  if(overLimit(`asset-markets:${ipOf(req)}`,120)) return NextResponse.json({error:"Too many requests"},{status:429});
  const ticker=req.nextUrl.searchParams.get("ticker")??"", source=req.nextUrl.searchParams.get("source")??"";
  if(!/^[A-Za-z0-9_.!^-]{1,30}$/.test(ticker)||!["moex","forex","instaforex","yahoo","fmp"].includes(source)) return NextResponse.json({error:"Invalid instrument"},{status:400});
  const group=req.nextUrl.searchParams.get("group")==="stock"?"stock":undefined;
  const family=instrumentFamily({source:source as ChartSource,dataTicker:ticker,name:ticker,group});
  const families=await getFortsFamilies();
  // Equal tickers in different countries are not the same company (US T = AT&T, MOEX T = T-Technologies).
  const moexAsset=family?.stock && (source==="instaforex"||source==="yahoo") ? US_STOCK_FUTURES[family.stock] : family?.asset;
  const f=source==="moex" ? findFamily(families,ticker,true) ?? (moexAsset?findFamily(families,moexAsset,true):null) : moexAsset ? findFamily(families,moexAsset,true):null;
  const root=commodityAsset(f?.asset ?? family?.asset ?? "");
  const stock=family?.stock ?? (f?Object.entries({...STOCK_FUTURES,...US_STOCK_FUTURES}).find(([,a])=>a===f.asset)?.[0] ?? (moexAssetGroup(f.asset)==="stock"?f.asset:undefined):undefined);
  const usShare=!!stock && (source==="instaforex" || source==="yahoo" || !!f && US_STOCK_FUTURES[stock]===f.asset);
  const title=family?.name===ticker && f ? f.name : family?.name ?? f?.name ?? ticker;
  const items:Array<TerminalInstrument & {kind:string;expiry?:string|null}>=[];
  for(const r of INSTA_INSTRUMENTS) if((r.asset && commodityAsset(r.asset)===root)||(usShare && r.group==="stock" && r.id===stock)) items.push({ticker:r.id,name:r.name,source:"instaforex",dataTicker:r.id,group:r.group,emoji:"",kind:r.kind??"stock"});
  const related=stock ? [] : families.filter(candidate=>commodityAsset(candidate.asset)===root);
  // Keep the selected exchange family first, then the same commodity's other contract sizes/currencies.
  const markets=f ? [f,...related.filter(candidate=>candidate.asset!==f.asset)] : related;
  for(const market of markets) {
    const rf=refreshDays(market);
    const continuous=rf.contracts.filter(c=>c.order>=1).length>=2?chainContracts(market.asset,market.name,"ru"):[];
    const underlyingIcon=instrumentIcon({source:"moex",ticker:market.asset,dataTicker:market.asset,group:"future"});
    for(const c of [...continuous,...rf.contracts.map(c=>({ticker:c.secid,shortname:c.shortname,kind:c.kind,expiry:c.expiry}))]) items.push({ticker:c.ticker,name:market.name,source:"moex",dataTicker:c.ticker,group:"future",emoji:underlyingIcon,kind:c.kind,expiry:c.expiry});
  }
  if(source==="moex" && stock && !usShare) {
    const share=await lookupMarket(stock,"moex");
    if(share?.source==="moex" && share.group==="stock") items.unshift({ticker:stock,name:share.name,source:"moex",dataTicker:stock,group:"stock",emoji:"",kind:"stock"});
  }
  const seen=new Set<string>();
  const unique=items.filter(i=>!seen.has(`${i.source}:${i.dataTicker}`)&&!!seen.add(`${i.source}:${i.dataTicker}`)).map(i=>({...i,emoji:instrumentIcon(i)}));
  // Do not cache a partial list as authoritative when ISS is temporarily unavailable.
  const unavailable=families.length===0;
  return NextResponse.json({name:title,items:unique,unavailable},{headers:{"Cache-Control":unavailable?"no-store":"public, s-maxage=60, stale-while-revalidate=300"}});
}
