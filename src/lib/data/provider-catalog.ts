/**
 * The ticker catalogues of the data providers that need the user's own key (Settings -> Data providers). Everyone sees these instruments in the
 * search (so the user can find what a provider offers); opening one without the provider connected shows the connect window instead of a chart
 * (src/components/chart/ProviderGate.tsx). Pure data + a tiny search; safe on the client and the server.
 *
 *   databento   US market: CME / CBOT / NYMEX / COMEX / ICE futures, US stocks and ETFs
 *   twelvedata  the rest of the world: stocks of Europe and Asia, world indices
 *
 * The lists are curated starting sets (the liquid core of each market). Each row's `secid` is the id of the instrument inside the terminal
 * (`?symbol=`, watchlists, layouts); `dataTicker` is derived from it by the provider's data layer.
 */
import type { FutAsset, MarketGroup, MarketItem } from "../market-types";
import { providerById, type DataProvider } from "./providers";
import { allUsFutureItems } from "../us-futures";

type ProviderId = Extract<DataProvider["id"], "databento" | "twelvedata">;

interface Row {
  id: string;
  name: string;
  nameEn?: string;
  exchange: string;
  country: string;
  group: MarketGroup;
  fgroup?: FutAsset;
  /** futures: the root symbol (ES, CL...) the contract rows of the provider hang from */
  asset?: string;
  sub?: string;
}

const fut = (id: string, name: string, nameEn: string, exchange: string, fgroup: FutAsset): Row => ({ id, name, nameEn, exchange, country: "US", group: "future", fgroup, asset: id });
const futx = (id: string, name: string, nameEn: string, exchange: string, country: string, fgroup: FutAsset): Row => ({ id, name, nameEn, exchange, country, group: "future", fgroup });
const stk = (id: string, name: string, exchange: string): Row => ({ id, name, exchange, country: "US", group: "stock" });
const etf = (id: string, name: string, exchange = "NYSE Arca"): Row => ({ id, name, exchange, country: "US", group: "fund" });

const DATABENTO: Row[] = [
  // index futures
  fut("ES", "E-mini S&P 500", "E-mini S&P 500", "CME", "index"),
  fut("NQ", "E-mini Nasdaq-100", "E-mini Nasdaq-100", "CME", "index"),
  fut("YM", "E-mini Dow", "E-mini Dow", "CBOT", "index"),
  fut("RTY", "E-mini Russell 2000", "E-mini Russell 2000", "CME", "index"),
  fut("MES", "Micro E-mini S&P 500", "Micro E-mini S&P 500", "CME", "index"),
  fut("MNQ", "Micro E-mini Nasdaq-100", "Micro E-mini Nasdaq-100", "CME", "index"),
  // energy
  fut("CL", "Нефть WTI", "Crude Oil WTI", "NYMEX", "oil"),
  fut("MCL", "Микро нефть WTI", "Micro WTI Crude Oil", "NYMEX", "oil"),
  fut("NG", "Природный газ", "Natural Gas", "NYMEX", "gas"),
  fut("RB", "Бензин RBOB", "RBOB Gasoline", "NYMEX", "oil"),
  fut("HO", "Мазут (ULSD)", "NY Harbor ULSD", "NYMEX", "oil"),
  // metals
  fut("GC", "Золото", "Gold", "COMEX", "gold"),
  fut("MGC", "Микро золото", "Micro Gold", "COMEX", "gold"),
  fut("SI", "Серебро", "Silver", "COMEX", "silver"),
  fut("HG", "Медь", "Copper", "COMEX", "copper"),
  fut("PL", "Платина", "Platinum", "NYMEX", "platinum"),
  fut("PA", "Палладий", "Palladium", "NYMEX", "palladium"),
  // rates
  fut("ZB", "Облигации США 30 лет", "U.S. Treasury Bond", "CBOT", "bond"),
  fut("ZN", "Облигации США 10 лет", "10-Year T-Note", "CBOT", "bond"),
  fut("ZF", "Облигации США 5 лет", "5-Year T-Note", "CBOT", "bond"),
  fut("ZT", "Облигации США 2 года", "2-Year T-Note", "CBOT", "bond"),
  // currencies
  fut("6E", "Евро / доллар", "Euro FX", "CME", "currency"),
  fut("6B", "Фунт / доллар", "British Pound", "CME", "currency"),
  fut("6J", "Иена / доллар", "Japanese Yen", "CME", "currency"),
  fut("6A", "Австралийский доллар", "Australian Dollar", "CME", "currency"),
  fut("6C", "Канадский доллар", "Canadian Dollar", "CME", "currency"),
  fut("6S", "Швейцарский франк", "Swiss Franc", "CME", "currency"),
  // agriculture
  fut("ZC", "Кукуруза", "Corn", "CBOT", "grain"),
  fut("ZS", "Соя", "Soybeans", "CBOT", "grain"),
  fut("ZW", "Пшеница", "Wheat", "CBOT", "grain"),
  fut("KC", "Кофе", "Coffee", "ICE", "soft"),
  fut("SB", "Сахар", "Sugar No. 11", "ICE", "soft"),
  fut("CC", "Какао", "Cocoa", "ICE", "soft"),
  fut("CT", "Хлопок", "Cotton", "ICE", "soft"),
  fut("LE", "Живой скот", "Live Cattle", "CME", "livestock"),
  fut("HE", "Свиньи", "Lean Hogs", "CME", "livestock"),
  // Europe (Eurex, ICE Europe, ICE Endex) and Cboe Futures
  futx("FDAX", "DAX 40", "DAX 40 Futures", "Eurex", "DE", "index"),
  futx("FDXM", "Мини-DAX", "Mini-DAX Futures", "Eurex", "DE", "index"),
  futx("FESX", "Euro Stoxx 50", "Euro Stoxx 50 Futures", "Eurex", "DE", "index"),
  futx("FSMI", "SMI", "SMI Futures", "Eurex", "CH", "index"),
  futx("FGBL", "Euro-Bund 10 лет", "Euro-Bund", "Eurex", "DE", "bond"),
  futx("FGBM", "Euro-Bobl 5 лет", "Euro-Bobl", "Eurex", "DE", "bond"),
  futx("FGBS", "Euro-Schatz 2 года", "Euro-Schatz", "Eurex", "DE", "bond"),
  futx("B", "Нефть Brent", "Brent Crude", "ICE Europe", "GB", "oil"),
  futx("G", "Газойль", "Low Sulphur Gasoil", "ICE Europe", "GB", "oil"),
  futx("Z", "FTSE 100", "FTSE 100 Futures", "ICE Europe", "GB", "index"),
  futx("R", "Long Gilt", "Long Gilt", "ICE Europe", "GB", "bond"),
  futx("TFM", "Газ TTF", "Dutch TTF Natural Gas", "ICE Endex", "NL", "gas"),
  futx("VX", "Фьючерс на VIX", "VIX Futures", "CFE", "US", "index"),
  // US stocks
  stk("AAPL", "Apple", "NASDAQ"),
  stk("MSFT", "Microsoft", "NASDAQ"),
  stk("NVDA", "NVIDIA", "NASDAQ"),
  stk("AMZN", "Amazon", "NASDAQ"),
  stk("GOOGL", "Alphabet (A)", "NASDAQ"),
  stk("META", "Meta Platforms", "NASDAQ"),
  stk("TSLA", "Tesla", "NASDAQ"),
  stk("AVGO", "Broadcom", "NASDAQ"),
  stk("NFLX", "Netflix", "NASDAQ"),
  stk("AMD", "Advanced Micro Devices", "NASDAQ"),
  stk("INTC", "Intel", "NASDAQ"),
  stk("COST", "Costco", "NASDAQ"),
  stk("PEP", "PepsiCo", "NASDAQ"),
  stk("ADBE", "Adobe", "NASDAQ"),
  stk("CSCO", "Cisco", "NASDAQ"),
  stk("QCOM", "Qualcomm", "NASDAQ"),
  stk("JPM", "JPMorgan Chase", "NYSE"),
  stk("V", "Visa", "NYSE"),
  stk("MA", "Mastercard", "NYSE"),
  stk("UNH", "UnitedHealth", "NYSE"),
  stk("XOM", "Exxon Mobil", "NYSE"),
  stk("CVX", "Chevron", "NYSE"),
  stk("JNJ", "Johnson & Johnson", "NYSE"),
  stk("PG", "Procter & Gamble", "NYSE"),
  stk("WMT", "Walmart", "NYSE"),
  stk("HD", "Home Depot", "NYSE"),
  stk("KO", "Coca-Cola", "NYSE"),
  stk("DIS", "Walt Disney", "NYSE"),
  stk("BA", "Boeing", "NYSE"),
  stk("GS", "Goldman Sachs", "NYSE"),
  stk("BAC", "Bank of America", "NYSE"),
  stk("ORCL", "Oracle", "NYSE"),
  stk("CRM", "Salesforce", "NYSE"),
  stk("NKE", "Nike", "NYSE"),
  stk("MCD", "McDonald's", "NYSE"),
  stk("PFE", "Pfizer", "NYSE"),
  stk("T", "AT&T", "NYSE"),
  stk("UBER", "Uber", "NYSE"),
  stk("PLTR", "Palantir", "NASDAQ"),
  stk("COIN", "Coinbase", "NASDAQ"),
  stk("MSTR", "Strategy (MicroStrategy)", "NASDAQ"),
  stk("TSM", "TSMC (ADR)", "NYSE"),
  stk("BABA", "Alibaba (ADR)", "NYSE"),
  stk("ASML", "ASML (ADR)", "NASDAQ"),
  // ETFs and funds
  etf("SPY", "SPDR S&P 500 ETF"),
  etf("QQQ", "Invesco QQQ (Nasdaq-100)", "NASDAQ"),
  etf("IWM", "iShares Russell 2000"),
  etf("DIA", "SPDR Dow Jones"),
  etf("VTI", "Vanguard Total Stock Market"),
  etf("GLD", "SPDR Gold Shares"),
  etf("SLV", "iShares Silver Trust"),
  etf("TLT", "iShares 20+ Year Treasury"),
  etf("HYG", "iShares High Yield Corporate Bond"),
  etf("XLF", "Financial Select Sector SPDR"),
  etf("XLE", "Energy Select Sector SPDR"),
  etf("XLK", "Technology Select Sector SPDR"),
  etf("EEM", "iShares MSCI Emerging Markets"),
  etf("USO", "United States Oil Fund"),
  etf("IBIT", "iShares Bitcoin Trust", "NASDAQ"),
];

const eu = (id: string, name: string, exchange: string, country: string): Row => ({ id, name, exchange, country, group: "stock" });
const idx = (id: string, name: string, country: string): Row => ({ id, name, exchange: "Index", country, group: "index", sub: "equity" });

const TWELVEDATA: Row[] = [
  // Europe
  eu("SAP.XETR", "SAP", "XETRA", "DE"),
  eu("SIE.XETR", "Siemens", "XETRA", "DE"),
  eu("ALV.XETR", "Allianz", "XETRA", "DE"),
  eu("BMW.XETR", "BMW", "XETRA", "DE"),
  eu("MBG.XETR", "Mercedes-Benz", "XETRA", "DE"),
  eu("ASML.XAMS", "ASML", "Euronext Amsterdam", "NL"),
  eu("MC.XPAR", "LVMH", "Euronext Paris", "FR"),
  eu("OR.XPAR", "L'Oréal", "Euronext Paris", "FR"),
  eu("TTE.XPAR", "TotalEnergies", "Euronext Paris", "FR"),
  eu("NESN.XSWX", "Nestlé", "SIX Swiss", "CH"),
  eu("NOVN.XSWX", "Novartis", "SIX Swiss", "CH"),
  eu("ROG.XSWX", "Roche", "SIX Swiss", "CH"),
  eu("SHEL.XLON", "Shell", "LSE", "GB"),
  eu("HSBA.XLON", "HSBC", "LSE", "GB"),
  eu("AZN.XLON", "AstraZeneca", "LSE", "GB"),
  eu("BP.XLON", "BP", "LSE", "GB"),
  // Asia
  eu("7203.XTKS", "Toyota Motor", "Tokyo SE", "JP"),
  eu("6758.XTKS", "Sony Group", "Tokyo SE", "JP"),
  eu("9984.XTKS", "SoftBank Group", "Tokyo SE", "JP"),
  eu("005930.XKRX", "Samsung Electronics", "Korea Exchange", "KR"),
  eu("0700.XHKG", "Tencent", "HKEX", "HK"),
  eu("9988.XHKG", "Alibaba", "HKEX", "HK"),
  eu("1299.XHKG", "AIA Group", "HKEX", "HK"),
  // Europe, more
  eu("DTE.XETR", "Deutsche Telekom", "XETRA", "DE"),
  eu("ADS.XETR", "Adidas", "XETRA", "DE"),
  eu("BAS.XETR", "BASF", "XETRA", "DE"),
  eu("BAYN.XETR", "Bayer", "XETRA", "DE"),
  eu("DBK.XETR", "Deutsche Bank", "XETRA", "DE"),
  eu("VOW3.XETR", "Volkswagen", "XETRA", "DE"),
  eu("IFX.XETR", "Infineon", "XETRA", "DE"),
  eu("AIR.XPAR", "Airbus", "Euronext Paris", "FR"),
  eu("SAN.XPAR", "Sanofi", "Euronext Paris", "FR"),
  eu("BNP.XPAR", "BNP Paribas", "Euronext Paris", "FR"),
  eu("RMS.XPAR", "Hermès", "Euronext Paris", "FR"),
  eu("CS.XPAR", "AXA", "Euronext Paris", "FR"),
  eu("SU.XPAR", "Schneider Electric", "Euronext Paris", "FR"),
  eu("INGA.XAMS", "ING Groep", "Euronext Amsterdam", "NL"),
  eu("PHIA.XAMS", "Philips", "Euronext Amsterdam", "NL"),
  eu("AD.XAMS", "Ahold Delhaize", "Euronext Amsterdam", "NL"),
  eu("HEIA.XAMS", "Heineken", "Euronext Amsterdam", "NL"),
  eu("UBSG.XSWX", "UBS", "SIX Swiss", "CH"),
  eu("ZURN.XSWX", "Zurich Insurance", "SIX Swiss", "CH"),
  eu("CFR.XSWX", "Richemont", "SIX Swiss", "CH"),
  eu("ULVR.XLON", "Unilever", "LSE", "GB"),
  eu("GSK.XLON", "GSK", "LSE", "GB"),
  eu("RIO.XLON", "Rio Tinto", "LSE", "GB"),
  eu("BARC.XLON", "Barclays", "LSE", "GB"),
  eu("LLOY.XLON", "Lloyds Banking", "LSE", "GB"),
  eu("BATS.XLON", "British American Tobacco", "LSE", "GB"),
  eu("ITX.XMAD", "Inditex", "BME Madrid", "ES"),
  eu("IBE.XMAD", "Iberdrola", "BME Madrid", "ES"),
  eu("BBVA.XMAD", "BBVA", "BME Madrid", "ES"),
  eu("SAN.XMAD", "Banco Santander", "BME Madrid", "ES"),
  eu("ENI.XMIL", "Eni", "Borsa Italiana", "IT"),
  eu("ISP.XMIL", "Intesa Sanpaolo", "Borsa Italiana", "IT"),
  eu("UCG.XMIL", "UniCredit", "Borsa Italiana", "IT"),
  eu("ENEL.XMIL", "Enel", "Borsa Italiana", "IT"),
  eu("RACE.XMIL", "Ferrari", "Borsa Italiana", "IT"),
  eu("VOLV-B.XSTO", "Volvo (B)", "Nasdaq Stockholm", "SE"),
  eu("ERIC-B.XSTO", "Ericsson (B)", "Nasdaq Stockholm", "SE"),
  eu("NOVO-B.XCSE", "Novo Nordisk (B)", "Nasdaq Copenhagen", "DK"),
  // Hong Kong
  eu("0005.XHKG", "HSBC Holdings", "HKEX", "HK"),
  eu("0388.XHKG", "HKEX", "HKEX", "HK"),
  eu("0939.XHKG", "China Construction Bank", "HKEX", "HK"),
  eu("1398.XHKG", "ICBC", "HKEX", "HK"),
  eu("1810.XHKG", "Xiaomi", "HKEX", "HK"),
  eu("2318.XHKG", "Ping An Insurance", "HKEX", "HK"),
  eu("3690.XHKG", "Meituan", "HKEX", "HK"),
  eu("0941.XHKG", "China Mobile", "HKEX", "HK"),
  eu("1211.XHKG", "BYD", "HKEX", "HK"),
  eu("9618.XHKG", "JD.com", "HKEX", "HK"),
  eu("9999.XHKG", "NetEase", "HKEX", "HK"),
  eu("9888.XHKG", "Baidu", "HKEX", "HK"),
  eu("0883.XHKG", "CNOOC", "HKEX", "HK"),
  eu("1024.XHKG", "Kuaishou", "HKEX", "HK"),
  // Japan, more
  eu("8306.XTKS", "Mitsubishi UFJ Financial", "Tokyo SE", "JP"),
  eu("6861.XTKS", "Keyence", "Tokyo SE", "JP"),
  eu("9432.XTKS", "NTT", "Tokyo SE", "JP"),
  eu("7974.XTKS", "Nintendo", "Tokyo SE", "JP"),
  eu("6501.XTKS", "Hitachi", "Tokyo SE", "JP"),
  eu("8035.XTKS", "Tokyo Electron", "Tokyo SE", "JP"),
  eu("9983.XTKS", "Fast Retailing", "Tokyo SE", "JP"),
  // China A-shares, Taiwan, Korea
  eu("600519.XSHG", "Kweichow Moutai", "Shanghai SE", "CN"),
  eu("601318.XSHG", "Ping An Insurance (A)", "Shanghai SE", "CN"),
  eu("600036.XSHG", "China Merchants Bank", "Shanghai SE", "CN"),
  eu("000858.XSHE", "Wuliangye Yibin", "Shenzhen SE", "CN"),
  eu("300750.XSHE", "CATL", "Shenzhen SE", "CN"),
  eu("002594.XSHE", "BYD (A)", "Shenzhen SE", "CN"),
  eu("2330.XTAI", "TSMC", "Taiwan SE", "TW"),
  eu("000660.XKRX", "SK Hynix", "Korea Exchange", "KR"),
  eu("373220.XKRX", "LG Energy Solution", "Korea Exchange", "KR"),
  eu("035420.XKRX", "Naver", "Korea Exchange", "KR"),
  // India
  eu("RELIANCE.XNSE", "Reliance Industries", "NSE India", "IN"),
  eu("TCS.XNSE", "Tata Consultancy", "NSE India", "IN"),
  eu("HDFCBANK.XNSE", "HDFC Bank", "NSE India", "IN"),
  eu("INFY.XNSE", "Infosys", "NSE India", "IN"),
  eu("ICICIBANK.XNSE", "ICICI Bank", "NSE India", "IN"),
  eu("SBIN.XNSE", "State Bank of India", "NSE India", "IN"),
  // Australia, Canada
  eu("BHP.XASX", "BHP Group", "ASX", "AU"),
  eu("CBA.XASX", "Commonwealth Bank", "ASX", "AU"),
  eu("CSL.XASX", "CSL", "ASX", "AU"),
  eu("WBC.XASX", "Westpac", "ASX", "AU"),
  eu("RY.XTSE", "Royal Bank of Canada", "TSX", "CA"),
  eu("TD.XTSE", "Toronto-Dominion Bank", "TSX", "CA"),
  eu("SHOP.XTSE", "Shopify", "TSX", "CA"),
  eu("ENB.XTSE", "Enbridge", "TSX", "CA"),
  // world indices
  idx("SPX", "S&P 500", "US"),
  idx("NDX", "Nasdaq-100", "US"),
  idx("DJI", "Dow Jones", "US"),
  idx("RUT", "Russell 2000", "US"),
  idx("DAX", "DAX 40", "DE"),
  idx("CAC", "CAC 40", "FR"),
  idx("FTSE", "FTSE 100", "GB"),
  idx("STOXX50E", "Euro Stoxx 50", "EU"),
  idx("N225", "Nikkei 225", "JP"),
  idx("HSI", "Hang Seng", "HK"),
  idx("SSEC", "Shanghai Composite", "CN"),
  idx("KS11", "KOSPI", "KR"),
  idx("HSTECH", "Hang Seng Tech", "HK"),
  idx("IBEX", "IBEX 35", "ES"),
  idx("FTSEMIB", "FTSE MIB", "IT"),
  idx("SMI", "SMI", "CH"),
  idx("AEX", "AEX", "NL"),
  idx("TWII", "TAIEX", "TW"),
  idx("NSEI", "Nifty 50", "IN"),
  idx("BSESN", "BSE Sensex", "IN"),
  idx("AXJO", "S&P/ASX 200", "AU"),
  idx("GSPTSE", "S&P/TSX Composite", "CA"),
  idx("BVSP", "Bovespa", "BR"),
  idx("CSI300", "CSI 300", "CN"),
];

const BY_PROVIDER: Record<ProviderId, Row[]> = { databento: DATABENTO, twelvedata: TWELVEDATA };

function toItem(p: ProviderId, r: Row): MarketItem {
  const ticker = r.id.split(".")[0]; // "SAP.XETR" -> SAP (the exchange suffix keeps ids unique and URL-safe)
  return {
    secid: r.id,
    ticker,
    name: r.name,
    ...(r.nameEn ? { nameEn: r.nameEn } : {}),
    group: r.group,
    source: p,
    exchange: r.exchange,
    country: r.country,
    ...(r.sub ? { sub: r.sub } : {}),
    ...(r.fgroup ? { fgroup: r.fgroup } : {}),
    provider: p,
  };
}

let all: MarketItem[] | null = null;

/**
 * Every provider instrument as search rows. A US future the terminal already serves without a key (the FMP table: CL, GC, ES ...) is listed once,
 * as that row: a second «GC» that wants a key would only confuse. The provider rows are the instruments the free table does not have.
 */
export function providerItems(): MarketItem[] {
  if (!all) {
    const served = new Set(allUsFutureItems().map((i) => i.asset));
    // a provider whose data is not switched on (providers.ts `live`) is not offered at all: an instrument that cannot open is not listed
    all = (Object.keys(BY_PROVIDER) as ProviderId[]).filter((p) => providerById(p)?.live).flatMap((p) => BY_PROVIDER[p].filter((r) => !(r.group === "future" && r.country === "US" && r.asset && served.has(r.asset))).map((r) => toItem(p, r)));
  }
  return all;
}

/**
 * The provider rows of one chip ("all" = every group) for the providers the user has connected (`provs`): the catalogue of a provider appears in the
 * search only after its key is connected. No providers connected: nothing.
 */
export function providerItemsOf(group: MarketGroup | "all", provs: readonly string[] = []): MarketItem[] {
  if (provs.length === 0) return [];
  const on = new Set(provs);
  return providerItems().filter((i) => on.has(i.source) && (group === "all" || i.group === group));
}

const n = (s: string) => s.toLowerCase().replace(/ё/g, "е");

/** Provider rows matching a typed query (ticker first, then name), best first. */
export function searchProviderItems(q: string, group: MarketGroup | "all", limit = 40, provs: readonly string[] = []): MarketItem[] {
  const s = n(q.trim());
  if (!s) return [];
  const scored: { it: MarketItem; s: number }[] = [];
  for (const it of providerItemsOf(group, provs)) {
    const t = n(it.ticker);
    const nm = n(it.name);
    const en = n(it.nameEn ?? "");
    let sc = 0;
    if (t === s) sc = 100;
    else if (t.startsWith(s)) sc = 80;
    else if (nm.startsWith(s) || en.startsWith(s)) sc = 60;
    else if (nm.includes(s) || en.includes(s)) sc = 40;
    else if (t.includes(s)) sc = 30;
    if (sc) scored.push({ it, s: sc });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.it);
}

/** Exact lookup by the instrument id (a URL ?symbol=). */
export function lookupProviderItem(id: string): MarketItem | null {
  const s = id.trim().toLowerCase();
  return providerItems().find((i) => i.secid.toLowerCase() === s) ?? null;
}

/** Databento dataset of an exchange (futures venues); US stocks and ETFs sit on DBEQ.BASIC. */
const DB_DATASET: Record<string, string> = {
  CME: "GLBX.MDP3",
  CBOT: "GLBX.MDP3",
  NYMEX: "GLBX.MDP3",
  COMEX: "GLBX.MDP3",
  ICE: "IFUS.IMPACT",
  "ICE Europe": "IFEU.IMPACT",
  "ICE Endex": "NDEX.IMPACT",
  Eurex: "XEUR.EOBI",
  CFE: "XCBF.PITCH",
};

/** What the Databento data layer asks for an instrument id of the catalogue: dataset, symbol (a futures root = the continuous front month) and its kind. */
export function databentoSpecOf(id: string): { dataset: string; symbol: string; stype: "continuous" | "raw_symbol"; future: boolean } | null {
  const r = DATABENTO.find((x) => x.id.toLowerCase() === id.trim().toLowerCase());
  if (!r) return null;
  if (r.group === "future") {
    const dataset = DB_DATASET[r.exchange];
    return dataset ? { dataset, symbol: `${r.id}.c.0`, stype: "continuous", future: true } : null;
  }
  return { dataset: "DBEQ.BASIC", symbol: r.id, stype: "raw_symbol", future: false };
}

/** The provider a chart source needs the user's key for (null: the source is served without a key). */
export function providerOfSource(source: string): ProviderId | null {
  return source === "databento" || source === "twelvedata" ? source : null;
}
