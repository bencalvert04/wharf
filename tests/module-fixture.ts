import {readFileSync} from 'node:fs';
import ts from 'typescript';

/** Execute the real module with explicit mocks only; never load server services. */
export function loadWithMocks<T>(path:URL,mocks:Record<string,unknown>):T{
 const source=readFileSync(path,'utf8');
 const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 const module={exports:{}};
 const require=(name:string)=>{
  if(!Object.hasOwn(mocks,name))throw Error(`Missing isolated module mock: ${name}`);
  return mocks[name];
 };
 new Function('require','module','exports',outputText)(require,module,module.exports);
 return module.exports as T;
}
