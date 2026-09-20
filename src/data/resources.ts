import { statSync } from 'node:fs';
import { join } from 'node:path';
const entries = [
  {title:'Markdown 写作模板',description:'从标题、段落到发布信息，一份干净的写作起点。',file:'downloads/writing-template.md',format:'MD'},
  {title:'PDF 预览示例',description:'用于验证在线预览与文件下载的示例文档。',file:'downloads/bluehour-sample.pdf',format:'PDF'},
  {title:'Bluehour 资源示例包',description:'包含写作模板与 JSON 示例，不是项目完整源码。',file:'downloads/bluehour-starter.zip',format:'ZIP'},
  {title:'JSON 数据示例',description:'可用于文章内展示或下载的数据格式示例。',file:'downloads/example.json',format:'JSON'}
];
export const resources=entries.map(item=>{
  const bytes=statSync(join(process.cwd(),'public',item.file)).size;
  return {...item,size:bytes<1024?`${bytes} B`:`${(bytes/1024).toFixed(1)} KB`};
});
