import { expect } from "@playwright/test";
import type { Locator, Page, TestInfo, Frame } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFormulaEAssets } from "../../scripts/formula-e-live-contract.mjs";
import { assertTouchBuild, assessTouchGesture, createTouchRuntimeEvidence, assertTouchRuntimeRequest, assertTouchRuntimeComplete, collectTouchFrameGesture, recordTouchTrustVerdict, loadTouchRequest, TOUCH_UI_VIEWPORTS } from "../../scripts/touch-ui-live-contract.mjs";
import type { TouchRequest, TouchViewport, TouchFrameSnapshot } from "../../scripts/touch-ui-live-contract.mjs";
// @ts-expect-error Reuse the existing opt-in native preparation observer; no renderer writes.
import { installFunctionalCaptureObserver, waitForFunctionalCapture, verifyFunctionalCapture } from "../../scripts/cabin-preparation-readiness.generated.mjs";
// @ts-expect-error Existing exact preparation deadlines are intentionally reused.
import { budgets, readinessWindow, remainingBudget } from "../../scripts/cabin-preparation-policy.mjs";
// @ts-expect-error Existing bounded operation contract, no local socket side effects.
import { boundedOperation } from "../../scripts/cabin-preparation-checkpoint.mjs";

declare global { interface Window { __touchUiInput: Array<{type:string;trusted:boolean;pointerType:string;at:number}> } }
export class TouchUiAudit {
  readonly target: TouchViewport;
  readonly startedAt = performance.now();
  actionWindow = readinessWindow(30_000,this.startedAt);
  readonly runtimeBodies: object[] = [];
  readonly frameIds = new WeakMap<Frame,number>();
  nextFrameId = 0;
  cleanupListeners: (()=>void) | undefined;
  readonly captures: object[] = [];
  readonly inputs: object[] = [];
  readonly excludedProviderRequests: object[] = [];
  readonly observations: object[] = [];
  readonly errors: string[] = [];
  evidence!: ReturnType<typeof createTouchRuntimeEvidence>;
  request!: TouchRequest;
  build!: ReturnType<typeof assertTouchBuild>;
  constructor(readonly page: Page, readonly info: TestInfo) {
    this.target = TOUCH_UI_VIEWPORTS.find(value => value.name === info.project.name)!;
    if(!this.target) throw new Error("Unreviewed target");
  }
  async start() {
    this.request = await loadTouchRequest();
    const pins = await readFormulaEAssets(); this.build = assertTouchBuild(pins,this.request);
    // Preserve the existing live UI recorder and its fixed 15s drain windows.
    // The enclosing original action/preparation deadline caps every awaited drain.
    this.evidence = createTouchRuntimeEvidence({page:this.page,origin:this.request.target.origin,pins,receipts:this.runtimeBodies});
    const onRequest = (request:import("@playwright/test").Request) => {
      try {
        const classification=assertTouchRuntimeRequest({url:request.url(),resourceType:request.resourceType(),mainFrame:request.frame()===this.page.mainFrame(),redirected:request.redirectedFrom()!==null},this.request.target.origin,pins);
        if(classification==='provider-frame-outside-app-identity' && this.excludedProviderRequests.length<100) this.excludedProviderRequests.push({origin:new URL(request.url()).origin,path:new URL(request.url()).pathname,resourceType:request.resourceType()});
      } catch(error) { this.errors.push(String(error)); }
    };
    const onError = (error:Error) => this.errors.push(String(error));
    this.page.on('request',onRequest);this.page.on('pageerror',onError);
    this.cleanupListeners=()=>{this.page.off('request',onRequest);this.page.off('pageerror',onError);};
    await this.page.addInitScript(() => {
      window.__touchUiInput = [];
      for(const type of ["touchstart","touchmove","touchend","pointerdown","pointerup"])
        document.addEventListener(type,event => {
          if(window.__touchUiInput.length < 512) window.__touchUiInput.push({type:event.type,trusted:event.isTrusted,pointerType:event instanceof PointerEvent ? event.pointerType : "touch",at:performance.now()});
        },{capture:true,passive:true});
    });
    await this.save("audit-started");
  }
  async navigate(path:string,window=this.actionWindow) {
    await boundedOperation(window,"Source-bound document navigation",()=>this.evidence.navigate(this.request.target.origin+path));
    await boundedOperation(window,"Document fonts",()=>this.page.evaluate(() => document.fonts.ready.then(() => undefined)));
  }
  async tap(locator:Locator) {
    if(this.target.touch) await locator.tap(); else await locator.click();
  }
  async save(label:string, extra:object = {}) {
    const runtime = this.evidence?.snapshot();
    await this.info.attach(label,{contentType:"application/json",body:Buffer.from(JSON.stringify({
      request:this.request,harnessCommit:process.env.GITHUB_SHA,build:this.build,project:this.info.project.name,
      browserEngine:"chromium",browserVersion:this.page.context().browser()?.version(),target:this.target,viewport:this.page.viewportSize(),
      physicalDevice:false,scope:"Actual application UI in a CI Chromium viewport/touch emulator. Not physical iPad/Safari, hardware performance, or hosted video playback proof.",
      modelIdentityScope:"No new GLB body/hash proof. Model identity is prior live release verification; this audit records current frontend bodies and existing preparation observation.",
      actionWindow:this.actionWindow,runtimeBodies:this.runtimeBodies,captures:this.captures,inputs:this.inputs,observations:this.observations,excludedProviderRequests:this.excludedProviderRequests,errors:this.errors,runtime,...extra,
    },null,2))});
  }
  async capture(label:string) {
    if(this.captures.length >= 12) throw new Error("Bounded screenshot count exceeded");
    const path = this.info.outputPath(`${label}.png`);
    const bytes = await this.page.screenshot({path,scale:"css",animations:"allow",timeout:Math.min(budgets.screenshot,remainingBudget(this.actionWindow))});
    this.captures.push({label,file:`${label}.png`,sha256:createHash("sha256").update(bytes).digest("hex"),viewport:this.page.viewportSize()});
    await this.info.attach(label,{path,contentType:"image/png"});
    await this.save(`${label}-receipt`);
  }
  async geometry(label:string, selectors:string[]) {
    const sample = await this.page.evaluate(selectors => {
      const rect = (element:Element) => { const r=element.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
      const visible = (element:Element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
      return {width:innerWidth,height:innerHeight,scrollY,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,
        nodes:selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(visible).map(element=>({selector,text:(element.getAttribute("aria-label")||element.textContent||"").trim().slice(0,100),rect:rect(element),clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,fontSize:getComputedStyle(element).fontSize}))),
        images:[...document.images].filter(visible).map(image=>({src:image.currentSrc,complete:image.complete,naturalWidth:image.naturalWidth,rect:rect(image)})),
        filmStates:[...document.querySelectorAll(".home-film")].map(element=>({state:element.getAttribute("data-film-state"),document:element.getAttribute("data-film-document"),playback:element.getAttribute("data-film-playback")}))};
    },selectors);
    this.observations.push({label,...sample});
    await this.save(`${label}-geometry`);
    expect.soft(sample.documentWidth,`${label}: horizontal document overflow`).toBeLessThanOrEqual(sample.width+1);
    for(const node of sample.nodes) {
      expect.soft(node.rect.x,`${label}: ${node.text} left bound`).toBeGreaterThanOrEqual(-1);
      expect.soft(node.rect.right,`${label}: ${node.text} right bound`).toBeLessThanOrEqual(sample.width+1);
      expect.soft(node.scrollWidth,`${label}: ${node.text} text overflow`).toBeLessThanOrEqual(node.clientWidth+1);
    }
    return sample;
  }
  async inputFrames():Promise<TouchFrameSnapshot[]> {
    const frames=this.page.frames();
    if(frames.length>16)throw new Error("Bounded input frame count exceeded");
    return boundedOperation(this.actionWindow,"Frame-local native input observation",()=>Promise.all(frames.map(async frame=>{
      let id=this.frameIds.get(frame);if(id===undefined){id=++this.nextFrameId;this.frameIds.set(frame,id);}
      try { return {id,...await frame.evaluate(()=>({url:location.href,timeOrigin:performance.timeOrigin,events:window.__touchUiInput?.slice()??[]}))}; }
      catch(error) { return {id,url:frame.url(),timeOrigin:-1,events:[],error:String(error)}; }
    })));
  }
  async swipe(label:string, body?:Locator, direction:"forward"|"backward"="forward") {
    const read = () => body ? body.evaluate(element=>({position:element.scrollTop,max:element.scrollHeight-element.clientHeight,background:scrollY})) : this.page.evaluate(()=>({position:scrollY,max:document.documentElement.scrollHeight-innerHeight,background:scrollY}));
    // Retire previous inertial scrolling before attributing a new gesture.
    let lastPosition = Number.NaN, stable = 0;
    await expect.poll(async()=>{const position=(await read()).position;stable=Math.abs(position-lastPosition)<0.5?stable+1:0;lastPosition=position;return stable;},{timeout:5_000,intervals:[50]}).toBeGreaterThanOrEqual(2);
    const before = await read();
    const canScroll = direction === "forward" ? before.position < before.max-2 : before.position > 2;
    if(!canScroll) { const receipt={label,kind:"no-scroll-required",direction,touch:this.target.touch,before};this.inputs.push(receipt);expect(assessTouchGesture(receipt)).toEqual([]);await this.save(`${label}-input`);return; }
    const viewport = this.page.viewportSize()!;
    const box = body ? await body.boundingBox() : {x:0,y:0,width:viewport.width,height:viewport.height};
    if(!box) throw new Error("Scroll surface absent");
    const x = body ? box.x+box.width*0.7 : viewport.width-12;
    const top = Math.max(box.y+14,76), bottom = Math.min(box.y+box.height-14,viewport.height-18);
    const distance = Math.min((bottom-top)*0.6,380);
    const startY = direction === "forward" ? bottom-8 : top+8;
    const endY = startY+(direction === "forward" ? -distance : distance);
    const inputBefore = await this.inputFrames();
    const attempt:Record<string,unknown>={label,kind:this.target.touch?"native-cdp-touch":"native-wheel",touch:this.target.touch,direction,before,inputBefore,status:"started"};
    this.inputs.push(attempt);
    let after=before,observed:Array<{type:string;trusted:boolean}>=[];
    try {
      if(this.target.touch) {
        const cdp = await this.page.context().newCDPSession(this.page);
        try {
          await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y:startY,id:1}]});
          for(let step=1;step<=12;step++) {
            await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:startY+(endY-startY)*step/12,id:1}]});
            await this.page.waitForTimeout(16);
          }
          await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
        } finally { await cdp.detach(); }
      } else { await this.page.mouse.move(x,startY); await this.page.mouse.wheel(0,direction === "forward" ? distance : -distance); }
      await expect.poll(async()=>((await read()).position-before.position)*(direction === "forward" ? 1 : -1),{timeout:Math.min(5_000,remainingBudget(this.actionWindow))}).toBeGreaterThan(2);
      after=await read();
      const inputAfter=await this.inputFrames(),frameEvidence=collectTouchFrameGesture(inputBefore,inputAfter);
      Object.assign(attempt,{inputAfter,frameEvidence});observed=frameEvidence.observed;
      // Scrolling remains a hard postcondition. Only trust-observation errors
      // are soft so later independent views survive, while the test still fails.
      expect(assessTouchGesture({touch:false,direction,before,after,observed,kind:String(attempt.kind)}),`${label}: directional scroll receipt`).toEqual([]);
      const trustFailures=this.target.touch?[...frameEvidence.failures,...assessTouchGesture({touch:true,direction,before,after,observed,kind:String(attempt.kind)})]:[];
      recordTouchTrustVerdict(attempt,trustFailures,failures=>expect.soft(failures,`${label}: native same-frame trusted input`).toEqual([]));
    } catch(error) { attempt.status="failed";attempt.error=String(error);throw error; }
    finally {
      Object.assign(attempt,{after:await read().catch(()=>null),observed,finalInputFrames:await this.inputFrames().catch(error=>[{error:String(error)}])});
      await this.save(`${label}-input`);
    }
    if(body) expect(Math.abs(after.background-before.background),"Drawer gesture must not scroll its background").toBeLessThan(1);
  }
  async preparedPremium() {
    const originalTimeout = this.info.timeout, initial = readinessWindow(budgets.initial);
    this.info.setTimeout(originalTimeout+budgets.initial);
    await this.page.addInitScript(installFunctionalCaptureObserver);
    let status = "failed";
    try {
      await boundedOperation(initial,"Premium document and original preparation readiness",async()=>{
        await this.navigate("/configurator/premium",initial);
        await expect(this.page.locator("main[data-cabin-preparation]")).toHaveAttribute("data-cabin-preparation","ready",{timeout:remainingBudget(initial)});
        await expect(this.page.locator(".scene-loading, .cabin-preparation-error, .render-error")).toHaveCount(0,{timeout:remainingBudget(initial)});
        await expect(this.page.getByRole("button",{name:"Ultimate Silver",exact:true})).toBeEnabled({timeout:remainingBudget(initial)});
        await waitForFunctionalCapture(this.page,{preset:"hero",quality:"standard",timeout:remainingBudget(initial)});
      });
      await boundedOperation(initial,"Initial app runtime bodies",()=>this.evidence.drain());
      status="ready";
    } finally {
      const elapsed = performance.now()-initial.startedAt;
      this.info.setTimeout(originalTimeout+elapsed);
      // Account only actual preparation time; pre-entry work still consumes the original 30s.
      this.actionWindow=readinessWindow(originalTimeout,this.startedAt+elapsed);
      this.observations.push({label:"premium-preparation",status,initialBudgetMs:budgets.initial,elapsedMs:elapsed,scope:"Existing native-positive readiness contract; not a hardware speed claim"});
      await this.save("premium-preparation");
    }
    await this.capture("premium-ready");
    this.observations.push({label:"premium-native-capture-certificate",certificate:await verifyFunctionalCapture(this.page)});
    await this.save("premium-certified");
  }
  async finish() {
    let failure:unknown;
    try { await boundedOperation(this.actionWindow,"Final app runtime bodies",()=>this.evidence.finish()); assertTouchRuntimeComplete(this.evidence.snapshot()); } catch(error) { failure=error; this.errors.push(String(error)); }
    this.evidence.stop();this.cleanupListeners?.();
    await this.save("audit-final",{testStatus:this.info.status,finalInputEvents:await this.page.evaluate(()=>window.__touchUiInput ?? []).catch(()=>[])});
    if(this.info.status === this.info.expectedStatus) { if(failure) throw failure;expect(this.errors,"App runtime must stay source-bound and error-free").toEqual([]); }
  }
}
