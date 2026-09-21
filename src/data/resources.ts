import { statSync } from 'node:fs';
import { join } from 'node:path';

const entries = [
  {title:'PDF 预览示例',description:'用于验证在线预览与文件下载的示例文档。',file:'downloads/bluehour-sample.pdf',format:'PDF'}
];

export const resources=entries.map(item=>{
  const bytes=statSync(join(process.cwd(),'public',item.file)).size;
  return {...item,size:bytes<1024?`${bytes} B`:`${(bytes/1024).toFixed(1)} KB`};
});
