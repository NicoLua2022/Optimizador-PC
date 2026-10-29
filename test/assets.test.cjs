const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const{createHash}=require('node:crypto');
test('seven locally bundled logos match their recorded trusted sources and contain no active content',()=>{
 const sources=require('../docs/game-art-sources.json');assert.equal(sources.length,7);
 for(const item of sources){const data=fs.readFileSync('app/ui/assets/games/'+item.id+'.svg');assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256);const svg=data.toString();assert.ok(svg.includes('<svg'));assert.ok(!/<script|foreignObject|\bon\w+\s*=|href\s*=/i.test(svg));}
});
