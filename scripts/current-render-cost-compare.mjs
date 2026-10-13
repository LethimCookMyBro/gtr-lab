import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';import {resolve,dirname} from 'node:path';import {pathToFileURL} from 'node:url';
import {expectedRequest,comparePair} from './current-render-cost-policy.mjs';
export async function aggregateReports(directory){
 const rows=[],errors=[];const walk=async path=>{let entries;try{entries=await readdir(path,{withFileTypes:true});}catch(error){errors.push({path,error:String(error)});return;}
  for(const entry of entries){const file=resolve(path,entry.name);if(entry.isSymbolicLink()){errors.push({path:file,error:'Symlink refused'});continue;}if(entry.isDirectory())await walk(file);else if(entry.name==='report.json')try{rows.push({path:file,report:JSON.parse(await readFile(file,'utf8'))});}catch(error){errors.push({path:file,error:String(error)});}}
 };
 await walk(resolve(directory));
 const cells=expectedRequest.cells.map(cell=>{const found=rows.filter(row=>row.report.cell===cell);return found.length===1?{cell,status:'present',...found[0]}:{cell,status:found.length?'duplicate':'missing',reports:found};});
 for(const row of rows)if(!expectedRequest.cells.includes(row.report.cell))errors.push({path:row.path,error:'Unknown cell report'});
 const get=cell=>cells.find(x=>x.cell===cell)?.report??{cell,status:'missing-or-duplicate',steps:[]};
 const pairs=['studio','night'].map(environment=>({environment,...comparePair(get(environment+'-standard'),get(environment+'-reduced'))}));
 return {version:1,status:errors.length===0&&cells.every(c=>c.status==='present')&&pairs.every(p=>p.comparable)?'comparable-observations':'insufficient',cells,pairs,errors,claim:'Bounded current-source software-renderer observations only; no GPU time, hardware FPS, root-cause or causal benefit claim.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const result=await aggregateReports(process.argv[2]);await mkdir(dirname(resolve(process.argv[3])),{recursive:true});await writeFile(resolve(process.argv[3]),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,cells:result.cells.map(({cell,status})=>({cell,status})),pairs:result.pairs.map(({environment,comparable,reasons})=>({environment,comparable,reasons}))},null,2));}
