export interface TouchViewport { name: string; width: number; height: number; deviceScaleFactor: number; touch: boolean }
export interface TouchRequest { version: 1; allow: true; contract: string; mode: 'baseline-live' | 'candidate-ci'; target: {origin: string; sourceTree: string; sourceFiles: number; expectedDeployedCommit?: string; railwayDeploymentId?: string; buildSha256?: string} }
export const TOUCH_UI_CONTRACT: string;
export const TOUCH_UI_REQUEST: string;
export const TOUCH_UI_BASELINE: Readonly<TouchRequest['target']>;
export const TOUCH_UI_VIEWPORTS: ReadonlyArray<TouchViewport>;
export function validateTouchRequest(value: unknown): TouchRequest;
export function validateTouchCI(request: TouchRequest, env?: Record<string,string | undefined>): void;
export function loadTouchRequest(env?: Record<string,string | undefined>): Promise<TouchRequest>;
export function assertTouchSource(identity: unknown, request: TouchRequest): void;
export function assertTouchBuild(assets: Map<string,{bytes:number;sha256:string}>, request: TouchRequest): {sha256:string;files:unknown[]};
export function verifyTouchCheckout(env?: Record<string,string | undefined>): Promise<{request:TouchRequest;source:unknown;harnessCommit:string}>;
export function assessTouchGesture(input:{touch:boolean;direction:string;before:{position:number;max:number};after?:{position:number};observed?:Array<{type:string;trusted:boolean}>;kind:string}):string[];

export function createTouchRuntimeEvidence(options:{page:import('@playwright/test').Page;origin:string;pins:Map<string,{bytes:number;sha256:string}>;receipts:object[]}): {navigate(url:string):Promise<void>;drain():Promise<unknown>;finish():Promise<unknown>;snapshot():unknown;stop():void};
export function assertTouchRuntimeRequest(request:{url:string;resourceType:string;mainFrame:boolean;redirected:boolean},origin:string,pins:Map<string,{bytes:number;sha256:string}>):string;
export function assertTouchRuntimeComplete(snapshot:unknown):unknown;
