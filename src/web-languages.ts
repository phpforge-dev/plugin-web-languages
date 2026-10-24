
import {activateMarkers,activateAutoInsertion,registerProviders} from '@volar/monaco';
import type {WorkerLanguageService} from '@volar/monaco/worker';
import {frameworkTypes} from './framework-types';
import {workerSource} from './worker-source';
import {typescriptWorkerSource} from './typescript-worker-source';
import {createTypeScriptAdapters} from './typescript-adapters';

export const webLanguage=(language:string)=>['javascript','typescript','vue'].includes(language);
export function createWebLanguages(monaco:any,own:(dispose:()=>void)=>void){
 return function installWebLanguages(){
 let disposed=false;const disposables:any[]=[];const compilerSnapshots:any[]=[];
 const ts=monaco.typescript;
 const previousEnvironment=(globalThis as any).MonacoEnvironment;
 const ownedWorkers=new Set<Worker>();
 const createTypeScriptWorker=async(options:any)=>{
  const compressed=Uint8Array.from(atob(typescriptWorkerSource),c=>c.charCodeAt(0));
  const code=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  if(disposed)throw Error('Web language plugin is disabled');
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
  const worker=new Worker(url);worker.postMessage(options);const terminate=worker.terminate.bind(worker);
  worker.terminate=()=>{terminate();ownedWorkers.delete(worker);URL.revokeObjectURL(url);};ownedWorkers.add(worker);return worker;
 };
 const environment={...previousEnvironment,getWorker(module:string,label:string){
  if(label==='typescript'||label==='javascript'){const defaults=label==='javascript'?ts.javascriptDefaults:ts.typescriptDefaults;return createTypeScriptWorker({compilerOptions:defaults.getCompilerOptions(),extraLibs:defaults.getExtraLibs(),inlayHintsOptions:defaults.inlayHintsOptions});}
  return previousEnvironment?.getWorker?.(module,label);
 }};(globalThis as any).MonacoEnvironment=environment;

 for(const defaults of [ts.javascriptDefaults,ts.typescriptDefaults]){
  const modeKey=Symbol.for('phpforge.webLanguages.modeConfiguration');const modeSnapshot=defaults[modeKey]??{...defaults.modeConfiguration};defaults[modeKey]=modeSnapshot;defaults.setModeConfiguration(Object.fromEntries(Object.keys(modeSnapshot).map(key=>[key,false])));
  compilerSnapshots.push([defaults,defaults.getCompilerOptions(),modeSnapshot]);
  defaults.setCompilerOptions({allowJs:true,checkJs:false,allowNonTsExtensions:true,noEmit:true,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.NodeJs,esModuleInterop:true,skipLibCheck:true});
  defaults.setEagerModelSync(true);
  for(const [path,text]of Object.entries(frameworkTypes))if(!path.startsWith('/node_modules/@vue/language-core/'))disposables.push(defaults.addExtraLib(text,'file://'+path));
 }
 const tsWorkers=new Map<string,(...uris:any[])=>Promise<any>>();
 const adapters=createTypeScriptAdapters(monaco,ts.typescriptDefaults);
 for(const [language,defaults]of [['javascript',ts.javascriptDefaults],['typescript',ts.typescriptDefaults]] as const){
  let managed:any,client:Promise<any>|undefined;
  const stop=()=>{managed?.dispose();managed=undefined;client=undefined;};
  const getWorker=async(...uris:any[])=>{
   if(disposed)throw Error('Web language plugin is disabled');
   client??=(async()=>{const worker=await createTypeScriptWorker({compilerOptions:defaults.getCompilerOptions(),extraLibs:defaults.getExtraLibs(),inlayHintsOptions:defaults.inlayHintsOptions});worker.postMessage('ignore');worker.postMessage({});
    managed=monaco.editor.createWebWorker({worker,keepIdleModels:true,createData:{compilerOptions:defaults.getCompilerOptions(),extraLibs:defaults.getExtraLibs(),inlayHintsOptions:defaults.inlayHintsOptions}});
    return await managed.getProxy();})();const proxy=await client;if(disposed)throw Error('Web language plugin is disabled');await managed.withSyncedResources([...monaco.editor.getModels().filter((m:any)=>webLanguage(m.getLanguageId())).map((m:any)=>m.uri),...uris]);return proxy;
  };tsWorkers.set(language,getWorker);
  disposables.push(defaults.onDidChange(stop),defaults.onDidExtraLibsChange(()=>{if(client)void client.then(proxy=>{if(!disposed)return proxy.updateExtraLibs(defaults.getExtraLibs());}).catch(()=>{});}),{dispose:stop});
  const libs=new adapters.LibFiles(getWorker);const mode=defaults[Symbol.for('phpforge.webLanguages.modeConfiguration')];
  const register=(flag:string,method:string,adapter:any,args:any[]=[])=>{if(mode[flag]){const instance=new adapter(...args,getWorker);const provider=new Proxy(instance,{get(target,key){const value=Reflect.get(target,key);if(typeof value!=='function'||!String(key).match(/^(provide|resolve)/))return value;return(...values:any[])=>{if(disposed)return undefined;try{const result=value.apply(target,values);return result?.then?result.catch((error:any)=>{if(!disposed)throw error;}):result;}catch(error){if(!disposed)throw error;}};}});disposables.push(monaco.languages[method](language,provider));}};
  register('completionItems','registerCompletionItemProvider',adapters.SuggestAdapter);
  register('signatureHelp','registerSignatureHelpProvider',adapters.SignatureHelpAdapter);
  register('hovers','registerHoverProvider',adapters.QuickInfoAdapter);
  register('documentHighlights','registerDocumentHighlightProvider',adapters.DocumentHighlightAdapter);
  register('definitions','registerDefinitionProvider',adapters.DefinitionAdapter,[libs]);
  register('references','registerReferenceProvider',adapters.ReferenceAdapter,[libs]);
  register('documentSymbols','registerDocumentSymbolProvider',adapters.OutlineAdapter);
  register('rename','registerRenameProvider',adapters.RenameAdapter,[libs]);
  register('documentRangeFormattingEdits','registerDocumentRangeFormattingEditProvider',adapters.FormatAdapter);
  register('onTypeFormattingEdits','registerOnTypeFormattingEditProvider',adapters.FormatOnTypeAdapter);
  register('codeActions','registerCodeActionProvider',adapters.CodeActionAdaptor);
  register('inlayHints','registerInlayHintsProvider',adapters.InlayHintsAdapter);
  if(mode.diagnostics)disposables.push(new adapters.DiagnosticsAdapter(libs,defaults,language,getWorker));
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
 own(()=>{disposed=true;for(const d of disposables)d?.dispose?.();vueWorker?.dispose();for(const [defaults,options,mode]of compilerSnapshots){defaults.setModeConfiguration(Object.fromEntries(Object.keys(mode).map(key=>[key,false])));defaults.setCompilerOptions(options);}for(const model of monaco.editor.getModels()){monaco.editor.setModelMarkers(model,'vue',[]);monaco.editor.setModelMarkers(model,'typescript',[]);monaco.editor.setModelMarkers(model,'javascript',[]);}if((globalThis as any).MonacoEnvironment===environment)(globalThis as any).MonacoEnvironment=previousEnvironment;for(const worker of ownedWorkers)worker.terminate();});
 async function typeScriptWorker(model:any){return tsWorkers.get(model.getLanguageId()==='javascript'?'javascript':'typescript')!(model.uri);}

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
