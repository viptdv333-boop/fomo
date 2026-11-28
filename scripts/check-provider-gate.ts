/** Run the real ProviderGate render/effect lifecycle without a browser or extra test dependencies. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { providerOfSource } from "../src/lib/data/provider-catalog";
import { DATA_PROVIDERS, providerById } from "../src/lib/data/providers";

const require=createRequire(import.meta.url);
const effects:Array<{deps:unknown[];cleanup?:()=>void}>=[];
let pending:Array<()=>void>=[], hook=0;
let connected=new Set<string>();
const events=new EventTarget();
const mocks:Record<string,unknown>={
  react:{useEffect:(run:()=>void|(()=>void),deps:unknown[])=>{
    const index=hook++, previous=effects[index];
    if(previous && deps.every((d,i)=>Object.is(d,previous.deps[i]))) return;
    pending.push(()=>{previous?.cleanup?.(); const cleanup=run(); effects[index]={deps,cleanup:typeof cleanup==="function"?cleanup:undefined};});
  }},
  "next/link":{default:()=>null},
  "next-auth/react":{useSession:()=>({status:"authenticated"})},
  "@/lib/i18n/client":{useT:()=>({t:(key:string)=>key})},
  "@/lib/data/provider-catalog":{providerOfSource},
  "@/lib/data/providers":{DATA_PROVIDERS,providerById},
  "@/lib/data/use-connections":{useConnections:()=>({on:connected})},
  "@/components/data/KeyForm":{default:()=>null},
};
const compiled=ts.transpileModule(readFileSync(new URL("../src/components/chart/ProviderGate.tsx",import.meta.url),"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022},
}).outputText;
const module={exports:{} as {default:(props:any)=>unknown}};
vm.runInNewContext(compiled,{module,exports:module.exports,require:(id:string)=>mocks[id]??require(id),window:events});
const Gate=module.exports.default;
const child={type:"chart"};
let backs=0;
const back=()=>{backs++;};
function render(source:string,onBack:(()=>void)|null=back){
  hook=0; pending=[];
  const result=Gate({source,name:source,children:child,onBack:onBack??undefined});
  for(const flush of pending) flush();
  return result;
}
function key(value="Escape",handled=false){
  const e=new Event("keydown",{cancelable:true});
  Object.defineProperty(e,"key",{value});
  if(handled) e.preventDefault();
  events.dispatchEvent(e);
}
for(const source of ["instaforex","moex","bybit","binance","forex","yahoo"]){
  assert.equal((render(source) as any).props.children,child);
  key();
  assert.equal(backs,0,`Escape must not replace the ${source} chart with SBER`);
}
render("twelvedata"); key("Enter"); assert.equal(backs,0);
key("Escape",true); assert.equal(backs,0,"An inner control already handled Escape");
key(); assert.equal(backs,1,"Escape closes an actual connection gate");
connected=new Set(["twelvedata"]); render("twelvedata"); key();
assert.equal(backs,1,"Connecting removes the gate's key listener");
connected=new Set(); render("databento"); key(); assert.equal(backs,2);
render("instaforex"); key(); assert.equal(backs,2,"Changing to a public feed removes the gate listener");
render("databento",null); key(); assert.equal(backs,2);
for(const effect of effects) effect.cleanup?.();
key(); assert.equal(backs,2,"Unmount removes the listener");
console.log("ProviderGate: public/connected charts keep their symbol on Escape; only the visible connection gate handles it; lifecycle cleanup passed.");
