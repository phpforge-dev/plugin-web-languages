import {create,initialize} from 'monaco-editor/language/typescript/ts.worker.js';
self.onmessage=(event)=>{const options=event.data;self.onmessage=()=>initialize(context=>create(context,options));};
