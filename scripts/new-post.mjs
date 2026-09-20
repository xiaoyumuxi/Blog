import { mkdir, writeFile } from 'node:fs/promises';
const slug=process.argv[2];
if(!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){
  console.error('Usage: npm run new -- my-first-post (lowercase letters, digits and hyphens)');process.exit(1);
}
const date=new Date().toISOString().slice(0,10);
const path=`src/content/blog/${slug}.mdx`;
const content=`---\ntitle: "${slug}"\ndescription: "用一句话介绍这篇文章。"\ndate: ${date}\ntags: [笔记]\ndraft: true\nart: orbit\n---\n\n## 从这里开始\n\n写下你的第一个想法。\n`;
try{await mkdir('src/content/blog',{recursive:true});await writeFile(path,content,{flag:'wx'});console.log(`Created ${path}\nPreview after setting draft: false. Drafts are intentionally not published.`);}
catch(error){console.error(error.code==='EEXIST'?'This post already exists; no file was overwritten.':error.message);process.exit(1);}
