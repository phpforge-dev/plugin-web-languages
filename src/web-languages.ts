
import {activateMarkers,activateAutoInsertion,registerProviders} from '@volar/monaco';
import type {WorkerLanguageService} from '@volar/monaco/worker';
import {frameworkTypes} from './framework-types';
import {workerSource} from './worker-source';
import {typescriptWorkerSource} from './typescript-worker-source';

export const webLanguage=(language:string)=>['javascript','typescript','vue'].includes(language);
export function createWebLanguages(monaco:any,own:(dispose:()=>void)=>void){
 return function installWebLanguages(){
 let disposed=false;const disposables:any[]=[];const compilerSnapshots:any[]=[];
 const ts=monaco.typescript;
 const previousEnvironment=(globalThis as any).MonacoEnvironment;
 const ownedWorkers=new Set<Worker>();
 const createTypeScriptWorker=async()=>{
  const compressed=Uint8Array.from(atob(typescriptWorkerSource),c=>c.charCodeAt(0));
  const code=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  if(disposed)throw Error('Web language plugin is disabled');
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
  const worker=new Worker(url);const terminate=worker.terminate.bind(worker);
  worker.terminate=()=>{terminate();ownedWorkers.delete(worker);URL.revokeObjectURL(url);};ownedWorkers.add(worker);return worker;
 };
 const environment={...previousEnvironment,getWorker(module:string,label:string){
  if(label==='typescript'||label==='javascript')return createTypeScriptWorker();
  return previousEnvironment?.getWorker?.(module,label);
 }};(globalThis as any).MonacoEnvironment=environment;
 own(()=>{if((globalThis as any).MonacoEnvironment===environment)(globalThis as any).MonacoEnvironment=previousEnvironment;for(const worker of ownedWorkers)worker.terminate();});
 for(const defaults of [ts.javascriptDefaults,ts.typescriptDefaults]){
  compilerSnapshots.push([defaults,defaults.getCompilerOptions()]);
  defaults.setCompilerOptions({allowJs:true,checkJs:false,allowNonTsExtensions:true,noEmit:true,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.NodeJs,esModuleInterop:true,skipLibCheck:true});
  defaults.setEagerModelSync(true);
  for(const [path,text]of Object.entries(frameworkTypes))if(!path.startsWith('/node_modules/@vue/language-core/'))disposables.push(defaults.addExtraLib(text,'file://'+path));
 }
 disposables.push(monaco.languages.register({id:'vue',extensions:['.vue'],aliases:['Vue']}));
 disposables.push(monaco.languages.setLanguageConfiguration('vue',{comments:{blockComment:['<!--','-->']},brackets:[['{','}'],['[',']'],['(',')']],autoClosingPairs:[{open:'{',close:'}'},{open:'(',close:')'},{open:'[',close:']'},{open:'"',close:'"'},{open:"'",close:"'"}]}));
 disposables.push(monaco.languages.setMonarchTokensProvider('vue',{defaultToken:'',tokenizer:{
  root:[[/<!--/,'comment','@comment'],[/<script\b/,'tag','@scriptTag'],[/<style\b/,'tag','@styleTag'],[/\{\{/,'delimiter','@expression'],[/<\/?[\w.-]+/,'tag'],[/\/?\s*>/,'tag'],[/[\w:@#.-]+(?=\s*=)/,'attribute.name'],[/"[^"]*"|'[^']*'/,'attribute.value']],
  comment:[[/-->/,'comment','@pop'],[/./,'comment']],
  scriptTag:[[/[^>]+/,'attribute.name'],[/>/,{token:'tag',next:'@script',nextEmbedded:'typescript'}]],
  script:[[/<\/script\s*>/,{token:'tag',next:'@popall',nextEmbedded:'@pop'}]],
  styleTag:[[/[^>]+/,'attribute.name'],[/>/,{token:'tag',next:'@style',nextEmbedded:'css'}]],
  style:[[/<\/style\s*>/,{token:'tag',next:'@popall',nextEmbedded:'@pop'}]],
  expression:[[/\}\}/,'delimiter','@pop'],[/[A-Za-z_]\w*/,'variable'],[/./,'']],
 }}));
 let vueWorker:monaco.editor.MonacoWebWorker<WorkerLanguageService>;
 let ready:Promise<monaco.IDisposable>|undefined;let requestId=0;
 const sync=()=>monaco.editor.getModels().filter(m=>webLanguage(m.getLanguageId())||m.uri.path.includes('/node_modules/')&&m.uri.path.endsWith('/package.json')).map(m=>m.uri);
 const ensureVue=()=>{if(!ready){ready=(async()=>{
  if(disposed)throw Error('Web language plugin is disabled');
  const compressed=Uint8Array.from(atob(workerSource),c=>c.charCodeAt(0));const code=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();if(disposed)throw Error('Web language plugin is disabled');
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));const worker=new Worker(url,{type:'module'});disposables.push({dispose:()=>URL.revokeObjectURL(url)});
  // Monaco 0.57's explicit-worker API expects the same bootstrap messages as its bundled services.
  worker.postMessage('ignore');worker.postMessage({});
  vueWorker=monaco.editor.createWebWorker<WorkerLanguageService>({worker,keepIdleModels:true});
  const providers=registerProviders(vueWorker,'vue',sync,monaco.languages as any).then(value=>{if(disposed)value.dispose();else disposables.push(value);return value;});
  disposables.push(activateMarkers(vueWorker,['vue'],'vue',sync,{...monaco.editor,setModelMarkers:(model:any,owner:string,markers:any[])=>{if(!disposed)monaco.editor.setModelMarkers(model,owner,markers);}} as any));
  disposables.push(activateAutoInsertion(vueWorker,['vue'],sync,monaco.editor as any));
 return await providers;})();}return ready;};
 disposables.push(monaco.languages.onLanguage('vue',()=>{void ensureVue().catch(error=>console.error('Vue language service',error));}));
 own(()=>{disposed=true;for(const d of disposables)d?.dispose?.();vueWorker?.dispose();for(const [defaults,options]of compilerSnapshots)defaults.setCompilerOptions(options);for(const model of monaco.editor.getModels())monaco.editor.setModelMarkers(model,'vue',[]);});
 async function typeScriptWorker(model:monaco.editor.ITextModel){
  for(let attempt=0;;attempt++){try{const factory=await(model.getLanguageId()==='javascript'?ts.getJavaScriptWorker():ts.getTypeScriptWorker());return await factory(model.uri);}catch(error){if(attempt>=100||!String(error).includes('not registered'))throw error;await new Promise(resolve=>setTimeout(resolve,20));}}
 }
 return {ensureVue,typeScriptWorker,async locations(model:monaco.editor.ITextModel,position:monaco.Position,method:string){
  if(model.getLanguageId()==='vue'){
   await ensureVue();const service=await vueWorker.withSyncedResources(sync());
   const p={line:position.lineNumber-1,character:position.column-1};
   if(method==='textDocument/references')return await service.getReferences(++requestId,model.uri,p,{includeDeclaration:false})??[];
   const result=method==='textDocument/implementation'?await service.getImplementations(++requestId,model.uri,p):await service.getDefinition(++requestId,model.uri,p);
   return (result??[]).map(v=>({uri:v.targetUri,range:v.targetSelectionRange}));
  }
  const worker=await typeScriptWorker(model);
  const result=method==='textDocument/references'?await worker.getReferencesAtPosition(model.uri.toString(),model.getOffsetAt(position)):await worker.getDefinitionAtPosition(model.uri.toString(),model.getOffsetAt(position));
  return (await Promise.all((result??[]).filter(r=>!r.isDefinition||method!=='textDocument/references').map(async r=>{
   const uri=monaco.Uri.parse(r.fileName);let target=monaco.editor.getModel(uri);const text=target?undefined:await worker.getScriptText(r.fileName);
   const offset=r.textSpan;const at=(n:number)=>{if(target){const p=target.getPositionAt(n);return {line:p.lineNumber-1,character:p.column-1};}const prefix=(text??'').slice(0,n).split('\n');return {line:prefix.length-1,character:prefix.at(-1)!.length};};
   return {uri:uri.toString(),range:{start:at(offset.start),end:at(offset.start+offset.length)}};
  })));
 }};
}

}
