// Generate small, inspectable sample attachments. Existing files are never overwritten.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const directory = 'public/downloads';
await mkdir(directory, {recursive:true});
async function createIfMissing(name, data) {
  try { await writeFile(`${directory}/${name}`, data, {flag:'wx'}); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
const stream = [
  '0.043 0.055 0.106 rg 0 0 595 842 re f',
  '0.447 0.647 1 rg 48 738 40 4 re f',
  'BT /F1 12 Tf 48 765 Td (BLUEHOUR / RESOURCE SAMPLE) Tj ET',
  '0.93 0.94 1 rg BT /F2 34 Tf 48 662 Td (Ideas worth keeping.) Tj ET',
  '0.67 0.56 0.96 rg BT /F1 14 Tf 48 621 Td (Build. Write. Share.) Tj ET',
  '0.68 0.73 0.84 rg',
  'BT /F1 12 Tf 48 551 Td (This is a real PDF file included with the Bluehour blog.) Tj ET',
  'BT /F1 12 Tf 48 526 Td (Use it to verify the preview and download components.) Tj ET',
  'BT /F1 12 Tf 48 501 Td (Replace it with your own public document when ready.) Tj ET',
  '0.5 0.55 0.68 rg BT /F1 10 Tf 48 75 Td (Sample content only. No personal information is included.) Tj ET'
].join('\n');
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
];
let pdf = '%PDF-1.4\n';
const offsets=[0];
objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
const xref=Buffer.byteLength(pdf);
pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
pdf+=offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('');
pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
await createIfMissing('bluehour-sample.pdf',pdf);
function crc32(buffer) {
  let crc=0xffffffff;
  for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
const local=[],central=[];let offset=0;
for(const name of ['writing-template.md','example.json']) {
  const data=await readFile(`${directory}/${name}`),filename=Buffer.from(name),crc=crc32(data);
  const header=Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x5d34,12);
  header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);
  const entry=Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x5d34,14);
  entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);
  local.push(header,filename,data);central.push(entry,filename);offset+=header.length+filename.length+data.length;
}
const centralBuffer=Buffer.concat(central),end=Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);end.writeUInt16LE(2,8);end.writeUInt16LE(2,10);end.writeUInt32LE(centralBuffer.length,12);end.writeUInt32LE(offset,16);
await createIfMissing('bluehour-starter.zip',Buffer.concat([...local,centralBuffer,end]));
