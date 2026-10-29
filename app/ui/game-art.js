export const popularGames=[
 {key:'cs2',name:'Counter-Strike 2',test:/counter.?strike|^cs2$/i,logo:'counterstrike',color:'gold',tag:'TACTICAL FPS'},
 {key:'valorant',name:'VALORANT',test:/valorant/i,logo:'valorant',color:'rose',tag:'TACTICAL FPS'},
 {key:'fortnite',name:'Fortnite',test:/fortnite/i,logo:'fortnite',color:'violet',tag:'BATTLE ROYALE'},
 {key:'league',name:'League of Legends',test:/league of legends|^lol$/i,logo:'leagueoflegends',color:'teal',tag:'MOBA'},
 {key:'dota',name:'Dota 2',test:/dota\s*2/i,logo:'dota2',color:'ember',tag:'MOBA'},
 {key:'roblox',name:'Roblox',test:/roblox/i,logo:'roblox',color:'blue',tag:'SANDBOX'},
 {key:'pubg',name:'PUBG',test:/pubg|playerunknown/i,logo:'pubg',color:'gold',tag:'BATTLE ROYALE'}
];
export function identifyGame(name){return popularGames.find(g=>g.test.test(name));}
export function gameArtwork(game,escape){
 const known=identifyGame(game.name);
 return `<div class="game-art branded-art tone-${known?.color||'slate'}" aria-hidden="true"><div class="art-beams"></div><div class="art-grain"></div><span class="art-number">${known?'N / PLAY':'N / LIBRARY'}</span>${known?`<img class="game-logo" src="assets/games/${known.logo}.svg" alt="" loading="lazy" decoding="async"><span class="brand-game-title">${escape(known.name)}</span><span class="game-genre">${known.tag}</span>`:`<span class="fallback-monogram">${escape(game.name.slice(0,2).toUpperCase())}</span><span class="brand-game-title">${escape(game.name.slice(0,40))}</span>`}<span class="art-glow"></span></div>`;
}
