import assert from "node:assert/strict";
import { defaultHandles, getToolDef, type Env } from "../src/lib/chart/drawings/tools";
import { DrawingsController } from "../src/lib/chart/drawings/controller";
import type { Drawing, Pt } from "../src/lib/chart/drawings/types";
import type { ChartEngine } from "../src/lib/chart/engine";
import type { PointerInfo } from "../src/lib/chart/types";

const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
for (const log of [false, true]) {
  const env = {
    toX: (t: number) => t / 10, timeAt: (x: number) => x * 10,
    toY: (p: number) => log ? 500 - Math.log(p) * 40 : 500 - p,
    priceAt: (y: number) => log ? Math.exp((500 - y) / 40) : 500 - y,
  } as Env;
  const px = (d: Drawing) => d.points.map(p => ({ x: env.toX(p.t), y: env.toY(p.p) }));
  const drawing = (tool: string, P: Pt[]): Drawing => ({ id: "shape", tool, locked: false, style: { ...getToolDef(tool)!.style }, points: P.map(p => ({ t: env.timeAt(p.x), p: env.priceAt(p.y) })) });
  for (const tool of ["rect", "ellipse"]) for (const reverse of [false, true]) {
    const P = [{ x: 80, y: 90 }, { x: 360, y: 250 }];
    if (reverse) P.reverse();
    const d = drawing(tool, P), hs = defaultHandles(getToolDef(tool)!, env, d, P);
    assert.equal(hs.length, 8);
    for (let side = 0; side < 4; side++) {
      const pts = structuredClone(d.points), h = hs[4 + side];
      h.drag!(pts, env.timeAt(h.x + 30), env.priceAt(h.y + 25));
      const actual = px({ ...d, points: pts }), expected = structuredClone(P);
      if (side === 0) expected[0].y += 25;
      if (side === 1) expected[1].x += 30;
      if (side === 2) expected[1].y += 25;
      if (side === 3) expected[0].x += 30;
      actual.forEach((p, i) => { near(p.x, expected[i].x); near(p.y, expected[i].y); });
    }
  }
  for (const tool of ["triangle", "polyline"]) {
    const P = [{ x: 70, y: 100 }, { x: 270, y: 100 }, { x: 170, y: 300 }];
    const d = drawing(tool, P), hs = defaultHandles(getToolDef(tool)!, env, d, P);
    const pts = structuredClone(d.points);
    hs[3].drag!(pts, env.timeAt(220), env.priceAt(140));
    const actual = px({ ...d, points: pts });
    near(actual[0].x, 70); near(actual[1].x, 270);
    near(actual[0].y, 140); near(actual[1].y, 140);
    assert.deepEqual(pts[2], d.points[2]);
  }
  const corners = (P: Pt[]) => {
    const len = Math.hypot(P[1].x-P[0].x, P[1].y-P[0].y);
    const n = { x: -(P[1].y-P[0].y)/len, y: (P[1].x-P[0].x)/len };
    const w = (P[2].x-P[0].x)*n.x+(P[2].y-P[0].y)*n.y;
    return [P[0],P[1],{x:P[1].x+n.x*w,y:P[1].y+n.y*w},{x:P[0].x+n.x*w,y:P[0].y+n.y*w}];
  };
  for (let side=0; side<4; side++) {
    const P=[{x:100,y:100},{x:300,y:200},{x:160,y:280}], d=drawing("rotated_rect",P), before=corners(P);
    const h=defaultHandles(getToolDef(d.tool)!,env,d,P)[2+side], pts=structuredClone(d.points);
    h.drag!(pts,env.timeAt(h.x+23),env.priceAt(h.y+31));
    const after=corners(px({...d,points:pts}));
    for(const k of [(side+2)%4,(side+3)%4]) {near(after[k].x,before[k].x);near(after[k].y,before[k].y);}
    near((after[1].y-after[0].y)/(after[1].x-after[0].x),.5);
  }
  const c=drawing("circle",[{x:200,y:200},{x:250,y:200}]), pts=structuredClone(c.points);
  defaultHandles(getToolDef("circle")!,env,c,px(c))[2].drag!(pts,env.timeAt(280),env.priceAt(210));
  const cp=px({...c,points:pts}); near(cp[0].x,215);near(cp[0].y,200);near(cp[1].x,280);
  near(cp[0].x-Math.hypot(cp[1].x-cp[0].x,cp[1].y-cp[0].y),150);

  // The real controller must capture the new handles, retain the pane scale, and support undo/redo.
  for (const pointerType of ["mouse", "touch"]) for (const paneId of ["main", "rsi"]) {
    const engine = {
      addLayer() {}, removeLayer() {}, requestOverlayRedraw() {}, opts: {locale:"ru",fontFamily:"sans-serif"},
      getPaneRect: () => ({top:0,width:600,height:500}), getPrecision:()=>2, getTheme:()=>({bg:"#fff"}), getIntervalMs:()=>60000,
      timeToX:env.toX,xToTime:env.timeAt,priceToY:(_pane:string,p:number)=>env.toY(p),yToPrice:(_pane:string,y:number)=>env.priceAt(y),getCandles:()=>[],getIndexForTime:(t:number)=>t,
    } as unknown as ChartEngine;
    const ctl=new DrawingsController();ctl.attach(engine);
    const d={...drawing("rect",[{x:80,y:90},{x:360,y:250}]),paneId};
    ctl.restore(JSON.stringify({v:1,drawings:[d]}));ctl.selectById(d.id);
    const event=(x:number,y:number):PointerInfo=>({x,y,paneId,region:"plot",button:0,pointerType,shiftKey:false,ctrlKey:false,altKey:false});
    assert(ctl.pointerDown(event(220,90)));
    ctl.pointerMove(event(235,125));ctl.pointerUp(event(235,125));
    const updated=JSON.parse(ctl.serialize()).drawings[0];near(env.toY(updated.points[0].p),125);assert.deepEqual(updated.points[1],d.points[1]);near(updated.points[0].t,d.points[0].t);
    ctl.undo();assert.deepEqual(JSON.parse(ctl.serialize()).drawings[0].points,d.points);
    ctl.redo();assert.deepEqual(JSON.parse(ctl.serialize()).drawings[0].points,updated.points);
    const saved=ctl.serialize();ctl.restore(saved);assert.equal(ctl.serialize(),saved);
    ctl.detach();
  }
}
console.log("Shape side handles: geometry, reversed anchors, log scales, panes, mouse/touch, undo/redo and serialization OK");
