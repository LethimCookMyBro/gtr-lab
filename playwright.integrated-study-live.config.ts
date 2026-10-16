import {defineConfig,devices} from '@playwright/test';
import vehicle from './playwright.vehicle.config';
// @ts-expect-error Closed Node-only live contract.
import {validateStudyLiveEnvironment,ORIGIN} from './scripts/integrated-study-live-contract.mjs';
validateStudyLiveEnvironment(process.env);
export default defineConfig({
  ...vehicle,
  testMatch:'integrated-r35-study-live.spec.ts',
  grep:/\[resident\]/,
  retries:0,
  outputDir:'test-results/integrated-study-live',
  reporter:[['list'],['html',{outputFolder:'playwright-integrated-study-live-report',open:'never'}]],
  globalSetup:'./scripts/integrated-study-live-setup.mjs',
  use:{...vehicle.use,baseURL:ORIGIN,reducedMotion:'no-preference',serviceWorkers:'block'},
  projects:[
    {name:'desktop-1440',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900},deviceScaleFactor:1}},
    {name:'mobile-390',use:{...devices['iPhone 13'],browserName:'chromium',viewport:{width:390,height:844}}},
  ],
  webServer:undefined,
});
