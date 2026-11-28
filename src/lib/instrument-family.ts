/** Underlying identity is independent from the selected venue / spot / futures contract. */
import { instaInstrument } from "./instaforex-meta";
import { TERMINAL_DATA, type TerminalInstrument } from "./terminal-data";

const COMMODITIES: Record<string,string> = { GOLD:"Золото",SILV:"Серебро",PLT:"Платина",PLD:"Палладий",COPPER:"Медь",BR:"Нефть Brent",WTI:"Нефть WTI",NG:"Газ",COCOA:"Какао",COFFEE:"Кофе",SUGAR:"Сахар",WHEAT:"Пшеница",CORN:"Кукуруза",SOY:"Соя",COTTON:"Хлопок",ORANGE:"Апельсиновый сок",LUMBER:"Пиломатериалы",OATS:"Овёс",RICE:"Рис",RBOB:"Бензин RBOB",HEATING_OIL:"Топочный мазут",SOY_OIL:"Соевое масло",SOY_MEAL:"Соевый шрот",LIVESTOCK:"Скот" };
export const STOCK_FUTURES: Record<string,string> = { SBER:"SBRF",SBERP:"SBPR",GAZP:"GAZR",MTSS:"MTSI",PLZL:"PLZLM",SNGS:"SNGR",SNGSP:"SNGP",LKOH:"LKOH",ROSN:"ROSN",GMKN:"GMKN",VTBR:"VTBR",MGNT:"MGNT",AFLT:"AFLT",ALRS:"ALRS",MAGN:"MAGN",NLMK:"NLMK",MOEX:"MOEX",OZON:"OZON",YDEX:"YDEX",T:"T",TATN:"TATN",PHOR:"PHOR",POSI:"POSI",RUAL:"RUAL",HYDR:"HYDR",IRAO:"IRAO",FEES:"FEES",RTKM:"RTKM",VKCO:"VKCO",X5:"X5" };
export const US_STOCK_FUTURES: Record<string,string> = { AAPL:"APPF",AMD:"AMDF",AMZN:"AMZNF",TSLA:"TSLAF",NFLX:"NFLXF",COIN:"COINF",CMG:"CMGF",COHR:"COHRF",CRWD:"CRWDF",CVNA:"CVNAF",DASH:"DASHF",HOOD:"HOODF",LITE:"LITEF",LULU:"LULUF",NBIS:"NBISF",PANW:"PANWF",SMCI:"SMCIF",SNDK:"SNDKF",UBER:"UBERF" };
const ALIAS: Record<string,string> = { XAUUSD:"GOLD",XAGUSD:"SILV",XPTUSD:"PLT",XPDUSD:"PLD",XCUUSD:"COPPER",CU:"COPPER",KC:"COFFEE",SUGR:"SUGAR" };
const STOCK_NAMES:Record<string,string>={SBER:"Сбербанк",SBERP:"Сбербанк · привилегированные",GAZP:"Газпром",LKOH:"ЛУКОЙЛ",ROSN:"Роснефть",GMKN:"Норникель",VTBR:"ВТБ",MGNT:"Магнит",AFLT:"Аэрофлот",ALRS:"АЛРОСА",MAGN:"ММК",NLMK:"НЛМК",MTSS:"МТС",MOEX:"Московская биржа",OZON:"Ozon",YDEX:"Яндекс",T:"Т-Технологии",TATN:"Татнефть",SNGS:"Сургутнефтегаз",SNGSP:"Сургутнефтегаз · привилегированные",PLZL:"Полюс",PHOR:"ФосАгро",POSI:"Группа Позитив",RUAL:"РУСАЛ",HYDR:"РусГидро",IRAO:"Интер РАО",FEES:"Россети",RTKM:"Ростелеком",VKCO:"VK",X5:"X5"};
export function instrumentFamily(inst: Pick<TerminalInstrument,"source"|"dataTicker"|"name"|"group">): {asset:string;name:string;stock?:string} | null {
  if (inst.source === "bybit" || inst.source === "binance") return null;
  const savedUsStock=inst.source==="yahoo" && instaInstrument(inst.dataTicker)?.group==="stock";
  const info = inst.source === "instaforex" || inst.source === "forex" || savedUsStock ? instaInstrument(inst.dataTicker) : undefined;
  if (info?.asset) return {asset:info.asset,name:COMMODITIES[info.asset] ?? info.name.split(" · ")[0]};
  if (info?.group === "stock") return {asset:US_STOCK_FUTURES[info.id] ?? info.id,name:info.name,stock:info.id};
  if (inst.source === "forex" || inst.source === "instaforex") return null;
  const usStock = Object.entries(US_STOCK_FUTURES).find(([,f])=>f===inst.dataTicker)?.[0];
  if (inst.source === "moex" && usStock) return {asset:inst.dataTicker,stock:usStock,name:instaInstrument(usStock)?.name ?? inst.name};
  const raw=inst.dataTicker.replace(/\.F$/,"").replace(/\d!$/,"");
  const candidates=[raw,raw.replace(/[FGHJKMNQUVXZ]\d{1,2}$/i,"")];
  const prefixes:Record<string,string>={GD:"GOLD",SV:"SILV",PT:"PLT",PD:"PLD",CE:"COPPER",CC:"COCOA",NA:"NASD",MX:"MIX",RI:"RTS",SF:"SPYF",SR:"SBRF",GZ:"GAZR",LK:"LKOH",RN:"ROSN",GM:"GMKN",VB:"VTBR",MG:"MGNT",AF:"AFLT",AL:"ALRS"};
  for(const c of candidates) {
    const asset=ALIAS[c] ?? prefixes[c] ?? c;
    if(COMMODITIES[asset]) return {asset,name:COMMODITIES[asset]};
    const stock=Object.entries(STOCK_FUTURES).find(([s,f])=>s===asset||f===asset)?.[0];
    if(inst.source==="moex" && stock) return {asset:STOCK_FUTURES[stock],stock,name:STOCK_NAMES[stock] ?? inst.name.split(" · ")[0]};
  }
  const curatedShare=inst.source==="moex" && TERMINAL_DATA[0].instruments.some(i=>i.dataTicker===inst.dataTicker);
  if (inst.group === "stock" || curatedShare) return {asset:inst.dataTicker,stock:inst.dataTicker,name:inst.name};
  // Exact unknown MOEX contracts are resolved against the exchange family catalogue by the API.
  if(inst.source==="moex" && (inst.group==="future"||/[FGHJKMNQUVXZ]\d{1,2}$/.test(inst.dataTicker))) return {asset:raw,name:inst.name.split(" · ")[0]};
  return null;
}
