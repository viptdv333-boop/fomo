/** Refresh public InstaForex instruments and save local company artwork. No account or API key. */
import fs from "node:fs/promises";
import path from "node:path";
import type { InstaInstrument } from "../src/lib/instaforex-meta";
import ti from "../src/lib/tinvest-icons.generated.json";

async function main() {
  const response = await fetch("https://quotes.instaforex.com/api/quotesList", { signal: AbortSignal.timeout(20000), headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`catalogue ${response.status}`);
  const json = await response.json();
  const raw = (json.quotesList ?? json) as Array<{ symbol: string; description: string; digits: number; trade: number; type: number }>;
  const [stockSpec, liveRows] = await Promise.all([
    fetch("https://www.instaforex.com/specifications_com_v2_api?instrument=stocks").then(r=>r.json()),
    fetch("https://api2-webtrader.ifxdb.com/api/public/quotes/list?server=usa2").then(r=>r.json()),
  ]);
  const stockMetadata = stockSpec.symbols.insta_standard.filter((r: any)=>r.country === "US");
  const stocks = stockMetadata.map((r: any) => raw.find(x=>x.symbol===r.ticker)).filter(Boolean) as typeof raw;
  const stockIcons = new Map<string,string>(stockMetadata.map((r:any)=>[r.ticker.slice(1),r.iconUrl]));
  const rows: InstaInstrument[] = [];
  const add = (row: InstaInstrument) => { if (!rows.some((r) => r.id === row.id)) rows.push(row); };
  const commodities: Array<[string, string, string, string, InstaInstrument["fgroup"], string[]]> = [
    ["XAUUSD", "XAUUSD", "Золото · спот", "GOLD", "gold", ["GOLD"]],
    ["XAGUSD", "SILVER", "Серебро · спот", "SILV", "silver", []],
    ["XPTUSD", "XPTUSD", "Платина · спот", "PLT", "platinum", ["XPTUSD.m"]],
    ["XPDUSD", "XPDUSD", "Палладий · спот", "PLD", "palladium", ["XPDUSD.m"]],
    ["XCUUSD", "XCUUSD", "Медь · спот", "COPPER", "copper", ["XCUUSD.m"]],
    ["BRENT.SPOT", "#BRENT", "Нефть Brent · спот", "BR", "oil", ["BRENT", "#BRENT.z"]],
    ["WTI.SPOT", "#CL.ecn", "Нефть WTI · спот", "WTI", "oil", []],
    ["NG.SPOT", "#NGCash.z", "Природный газ · спот", "NG", "gas", ["#NG.zs", "#NG.z.nds"]],
    ["COCOA.SPOT", "#CC.zs", "Какао · спот", "COCOA", "soft", ["#CC.z.nds"]],
    ["COFFEE.SPOT", "#KC.z", "Кофе арабика · спот", "COFFEE", "soft", ["#KC.z.nds"]],
    ["ROBUSTA.SPOT", "#LRC.zs", "Кофе робуста · спот", "COFFEE", "soft", ["#LRC.z.nds"]],
    ["SUGAR.SPOT", "#LSU.zs", "Сахар · спот", "SUGAR", "soft", ["#SB.z.nds"]],
    ["WHEAT.SPOT", "#Wheat.z", "Пшеница · спот", "WHEAT", "grain", ["#Wheat.z.nds"]],
    ["COTTON.SPOT", "#CT.z.nds", "Хлопок · спот", "COTTON", "soft", []],
    ["ORANGE.SPOT", "#OJ.z", "Апельсиновый сок · спот", "ORANGE", "soft", []],
    ["LUMBER.SPOT", "#LUMBER.z", "Пиломатериалы · спот", "LUMBER", "other", []],
    ["OATS.SPOT", "#OATS.z", "Овёс · спот", "OATS", "grain", []],
    ["RICE.SPOT", "#RR.z", "Рис · спот", "RICE", "grain", []],
  ];
  for (const [id, symbol, name, asset, fgroup, alternatives] of commodities) {
    const available = [symbol, ...alternatives].filter((s) => raw.some((r) => r.symbol === s && r.trade === 2));
    if (!available.length) continue;
    let chosen: string | undefined;
    for (const symbol of available) {
      const ticks = await fetch("https://api2-webtrader.ifxdb.com/api/public/quotes/extraData?"+new URLSearchParams({server:"usa2",symbol}), {signal:AbortSignal.timeout(10000)}).then(r=>r.json()).catch(()=>[]);
      if (Array.isArray(ticks) && ticks.some(t=>t.symbol===symbol && +t.bid>0 && +t.lasttime>Date.now()/1000-7*86400)) { chosen=symbol; break; }
    }
    if (!chosen) continue; // Never publish dead 2023 spot tickers as a live market.
    const info = raw.find((r) => r.symbol === chosen)!;
    add({ id, symbol: chosen, name, group: "future", kind: "spot", asset, fgroup, digits: info.digits });
  }
  const classify = (r: {symbol:string;description:string}): {asset:string;fgroup:InstaInstrument["fgroup"];name:string} | null => {
    const d=r.description.toLowerCase(), t=r.symbol;
    // The published #KC description currently says Cotton, but KC is the coffee contract.
    // Keep separate oil products / soybean products separate from their parent commodity too.
    const roots: Record<string,[string,InstaInstrument["fgroup"],string]> = {
      KC:["COFFEE","soft","Кофе"], CT:["COTTON","soft","Хлопок"], CC:["COCOA","soft","Какао"],
      XRB:["RBOB","oil","Бензин RBOB"], XB:["RBOB","oil","Бензин RBOB"], HO:["HEATING_OIL","oil","Топочный мазут"],
      ZL:["SOY_OIL","grain","Соевое масло"], ZM:["SOY_MEAL","grain","Соевый шрот"],
    };
    const root=t.replace(/^#/,"").replace(/[FGHJKMNQUVXZ]\d{1,2}$/,"");
    const exact=roots[root];
    if(exact) return {asset:exact[0],fgroup:exact[1],name:exact[2]};
    const defs: Array<[RegExp,string,InstaInstrument["fgroup"],string]> = [[/brent/,"BR","oil","Нефть Brent"],[/natural gas/,"NG","gas","Газ"],[/crude|gasoline|heating/,"WTI","oil","Нефтепродукты"],[/gold/,"GOLD","gold","Золото"],[/silver/,"SILV","silver","Серебро"],[/copper/,"COPPER","copper","Медь"],[/platinum/,"PLT","platinum","Платина"],[/palladium/,"PLD","palladium","Палладий"],[/cocoa/,"COCOA","soft","Какао"],[/coffee/,"COFFEE","soft","Кофе"],[/sugar/,"SUGAR","soft","Сахар"],[/cotton/,"COTTON","soft","Хлопок"],[/wheat/,"WHEAT","grain","Пшеница"],[/corn/,"CORN","grain","Кукуруза"],[/soybean/,"SOY","grain","Соя"],[/orange/,"ORANGE","soft","Апельсиновый сок"],[/cattle|hog/,"LIVESTOCK","livestock","Скот"]];
    const match=defs.find(([re])=>re.test(d));
    return match ? {asset:match[1],fgroup:match[2],name:match[3]} : null;
  };
  for (const r of liveRows) {
    if (r.tradeEnabled !== 2 || !/^Futures (Energy|Agro|Metals|Goods)$/.test(r.typeName)) continue;
    const family=classify(r); if (!family) continue;
    add({id:r.symbol.replace(/^#/,""),symbol:r.symbol,name:`${family.name} · ${r.description}`,group:"future",kind:"monthly",asset:family.asset,fgroup:family.fgroup,digits:r.digits});
  }
  const currencies = new Set("USD EUR GBP JPY CHF AUD CAD NZD CNH CNY TRY RUB INR KZT SEK NOK PLN MXN ZAR SGD HKD DKK CZK HUF ILS RON BRL THB IDR KRW CLP COP AED SAR BHD QAR OMR TWD UAH".split(" "));
  for (const r of raw) if (r.trade === 2 && /^[A-Z]{6}$/.test(r.symbol) && currencies.has(r.symbol.slice(0, 3)) && currencies.has(r.symbol.slice(3))) add({ id: r.symbol, symbol: r.symbol, name: r.description, group: "forex", digits: r.digits });
  // Standard share symbols, excluding account suffixes, retired symbols and crypto/indices.
  for (const r of stocks) add({ id: r.symbol.slice(1), symbol: r.symbol, name: r.description, group: "stock", digits: r.digits });
  const logos: Record<string, string> = {};
  const dir = "public/icons/instruments/us";
  await fs.mkdir(dir, { recursive: true });
  const pending = rows.filter((r) => r.group === "stock"); let next = 0, failed = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < pending.length) {
      const row = pending[next++];
      const own = (ti.aliases as Record<string, string>)[`stock:${row.id}`];
      if (own) { logos[row.id] = own; continue; }
      const target = path.join(dir, `${row.id}.svg`);
      try {
        try { if ((await fs.stat(target)).size > 100) { logos[row.id] = `/${target.replaceAll('\\', '/')}`.replace('/public/', '/'); continue; } } catch {}
        const r = await fetch(stockIcons.get(row.id) || `https://financialmodelingprep.com/image-stock/${encodeURIComponent(row.id)}.png`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok || !r.headers.get('content-type')?.startsWith('image/')) throw new Error('missing brand');
        const image = Buffer.from(await r.arrayBuffer());
        if (image.length < 100) throw new Error('empty');
        await fs.writeFile(target, image); logos[row.id] = `/icons/instruments/us/${row.id}.svg`;
      } catch { failed++; }
    }
  }));
  await fs.writeFile('src/lib/instaforex-catalog.generated.json', JSON.stringify(rows, null, 2)+'\n');
  await fs.writeFile('src/lib/instaforex-logos.generated.json', JSON.stringify(logos, null, 2)+'\n');
  console.log(JSON.stringify({ instruments: rows.length, currencies: rows.filter(r=>r.group==='forex').length, commodities: rows.filter(r=>r.group==='future').length, stocks: pending.length, logos: Object.keys(logos).length, missingLogos: failed }));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
