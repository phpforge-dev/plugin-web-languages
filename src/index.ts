import {createWebLanguages,webLanguage} from './web-languages';
import {createWebProject} from './web-project';
import {frameworkTypes} from './framework-types';
export function activate(sdk:any){const installWebLanguages=createWebLanguages(sdk.monaco,sdk.own);const WebProject=createWebProject(sdk.monaco,sdk.msg,sdk.own);sdk.provide('webLanguages',{installWebLanguages,WebProject,frameworkTypes,webLanguage});}
