const {test}=require('node:test');
const assert=require('node:assert/strict');
const {analyzeCSV,parseCSV}=require('../app/core/benchmark.cjs');
const csv=values=>'ProcessID,MsBetweenPresents\n'+values.map(t=>'77,'+t).join('\n');
test('averages use total elapsed time; 1% low uses slowest frame times',()=>{
  const b=analyzeCSV(csv([...Array(198).fill(10),100,100]));
  assert.equal(b.frames,200);assert.equal(b.seconds,2.18);assert.equal(b.average,200000/2180);assert.equal(b.low1,10);assert.equal(b.p99Ms,10);
});
test('CSV supports BOM, CRLF, quoted commas and escaped quotes',()=>{
  assert.deepEqual(parseCSV('"a,b",c\r\n"d""e",2'),[['a,b','c'],['d"e','2']]);
  assert.equal(analyzeCSV('\uFEFFFrameTime\r\n'+Array(120).fill('20').join('\r\n')).average,50);
});
test('cannot mix process timelines or silently pass zero frames',()=>{
  assert.throws(()=>analyzeCSV(csv(Array(119).fill(10))),/120/);
  assert.throws(()=>analyzeCSV('ProcessID,FrameTime\n1,10\n2,10'),/mezcla/);
  assert.throws(()=>analyzeCSV('FPS\n144'),/columna/);
  assert.throws(()=>analyzeCSV('FrameTime\n"10'),/incompleto/);
});
test('invalid samples excluded but long stalls retained',()=>{
  const result=analyzeCSV('FrameTime\n'+[...Array(120).fill(10),-1,0,'NaN','',20000].join('\n'));
  assert.equal(result.frames,121);assert.equal(result.seconds,21.2);assert.ok(result.low1<1);
});
test('multiple swapchains or applications cannot inflate the frame count',()=>{
  assert.throws(()=>analyzeCSV('FrameTime,SwapChainAddress\n10,0x01\n10,0x02'),/swapchains/);
  assert.throws(()=>analyzeCSV('FrameTime,Application\n10,game.exe\n10,other.exe'),/aplicaciones/);
});
