import {build} from 'esbuild';
import {gzipSync} from 'node:zlib';
import {readFile,readdir,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
const framework={};const libs={};
const walk=async(dir,visit)=>{for(const e of await readdir(dir,{withFileTypes:true})){const path=join(dir,e.name);if(e.isDirectory())await walk(path,visit);else await visit(path);}};
const selected=['@types/react','csstype','vue/dist','vue/jsx-runtime','@vue/runtime-core/dist','@vue/runtime-dom/dist','@vue/reactivity/dist','@vue/shared/dist','@vue/language-core/types'];
for(const dir of selected){await walk('node_modules/'+dir,async path=>{if(path.endsWith('.d.ts')&&!path.includes('/ts5.0/')&&!/\/(canary|experimental)\.d\.ts$/.test(path))framework['/'+path]=await readFile(path,'utf8');});}
for(const dir of ['@types/react','csstype','vue','@vue/runtime-core','@vue/runtime-dom','@vue/reactivity','@vue/shared'])framework['/node_modules/'+dir+'/package.json']=await readFile('node_modules/'+dir+'/package.json','utf8');
for(const [path,text]of Object.entries(framework))if(path.startsWith('/node_modules/@types/react/'))framework[path.replace('/@types/react/','/react/')]=text;
for(const file of await readdir('node_modules/typescript/lib'))if(/^lib.*\.d\.ts$/.test(file))libs['/node_modules/typescript/lib/'+file]=await readFile('node_modules/typescript/lib/'+file,'utf8');
await writeFile('src/framework-types.ts','export const frameworkTypes='+JSON.stringify(framework)+';\n');
await writeFile('src/typescript-libs.ts','export const typescriptLibs='+JSON.stringify(libs)+';\n');
const worker=await build({entryPoints:['src/vue.worker.ts'],write:false,bundle:true,format:'iife',mainFields:['browser','module','main'],platform:'browser',target:'es2022',minify:true,legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'}});
await writeFile('src/worker-source.ts','export const workerSource='+JSON.stringify(gzipSync(worker.outputFiles[0].text,{level:9}).toString('base64'))+';\n');
await build({entryPoints:['src/index.ts'],outfile:'workbench.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
