//═════════════════
// THE MOUNTAINBREAKER (12.2, the same as the apps)
//═════════════════
// The Mine's legendary warhammer, forged once at the Blacksmith from 5
// Heartstone Shards (Mine bosses from depth 100 drop one, and below depth 50
// a dig sometimes finds one; they're kept when you surface).
// - Quake: every 3rd hit in a fight is double damage, and the enemy loses its next turn.
// - Stone Memory: +1 damage for every 25 kills with it, up to +10.

var MOUNTAINBREAKER_SHARDS = 5;

function mountainbreakerItem() {
  return { id:'mountainbreaker', name:'Mountainbreaker', icon:'🔨', type:'weapon', weaponType:'hammer', level:1,
    atkBase:[17, 25], isEquippable:true, legendary:true, stoneKills:0,
    desc:'A warhammer forged from the heart of the mountain. Every third hit is a Quake: double damage, and the enemy loses its next turn. It remembers every kill: +1 damage for every 25, up to +10.' };
}

function isMountainbreaker(w) { return !!(w && w.id === 'mountainbreaker'); }
function mountainbreakerForged() { return DDStore.getItem('dd_mountainbreaker_forged') === '1'; }
function mountainbreakerMemory(w) { return isMountainbreaker(w) ? Math.min(10, Math.floor((w.stoneKills || 0) / 25)) : 0; }

// Every hit with it: Stone Memory, and the Quake on every 3rd.
function mountainbreakerOnHit(e, dmg) {
  if (!isMountainbreaker(DS.equippedWeapon) || !(dmg > 0) || !e) return dmg;
  var d = dmg + mountainbreakerMemory(DS.equippedWeapon);
  e._quakeHits = (e._quakeHits || 0) + 1;
  if (e._quakeHits % 3 === 0) {
    d *= 2;
    e._stunned = true;
    addLog('🔨 QUAKE! The ground splits. Double damage, and the enemy loses its next turn.');
    try { sfx('sfx-heavy-hit'); vibe(VIBE.bigDamage); } catch (x) {}
  }
  return d;
}

// A kill with it: Stone Memory grows.
function mountainbreakerOnKill() {
  var w = DS.equippedWeapon;
  if (!isMountainbreaker(w)) return;
  var before = mountainbreakerMemory(w);
  w.stoneKills = (w.stoneKills || 0) + 1;
  var after = mountainbreakerMemory(w);
  if (after > before) addLog('🔨 The Mountainbreaker remembers. Stone Memory +' + after + ' damage.');
}

function forgeMountainbreaker() {
  if (mountainbreakerForged()) { say('You already forged the Mountainbreaker. There is only one.'); return; }
  var have = getHeartstones();
  if (have < MOUNTAINBREAKER_SHARDS) {
    say('The Blacksmith needs ' + MOUNTAINBREAKER_SHARDS + ' Heartstone Shards. You have ' + have + '. Mine bosses from depth 100 drop them, and below depth 50 you can dig them up.');
    return;
  }
  DDStore.setItem('dd_heartstones', String(have - MOUNTAINBREAKER_SHARDS));
  DDStore.setItem('dd_mountainbreaker_forged', '1');
  var item = mountainbreakerItem();
  // In a run it goes in the bag too (like buying a weapon); it's always saved to your items.
  if (!DS._fromMenu && DS.inventory && !(typeof SPIRE !== 'undefined' && SPIRE && SPIRE.active)) DS.inventory.push(Object.assign({}, item));
  addToGlobalInventory(item);
  sfx('sfx-purchase');
  try { saveProgress(); } catch (x) {}
  say('The Blacksmith works through the night. The shards glow, melt and ring like a bell. The Mountainbreaker is yours. Equip it from your items.');
  renderBlacksmithShop();
}

(function() {
  // The forge, under the Blacksmith's weapons.
  var _render = renderBlacksmithShop;
  window.renderBlacksmithShop = renderBlacksmithShop = function() {
    _render.apply(this, arguments);
    var content = document.getElementById('blacksmith-shop-content');
    if (!content) return;
    var have = getHeartstones(), done = mountainbreakerForged(), can = !done && have >= MOUNTAINBREAKER_SHARDS;
    var div = document.createElement('div');
    div.style.cssText = 'background:#120a00;border:1px solid #aa6622;padding:12px;margin:14px 0 8px;display:flex;align-items:center;gap:12px;';
    div.innerHTML = '<div style="flex:1;"><div style="font-family:Cinzel,serif;font-size:0.78rem;color:#ffaa44;margin-bottom:2px;">🔨 Mountainbreaker <span style="color:#ff9944;font-size:0.62rem;">(17-25 atk) LEGENDARY</span></div>' +
      '<div style="font-size:0.68rem;color:#998866;font-style:italic;">Forged from ' + MOUNTAINBREAKER_SHARDS + ' Heartstone Shards from deep in the Mine. Every third hit is a Quake. It grows stronger with every kill.</div>' +
      '<div style="font-family:Cinzel,serif;font-size:0.62rem;color:#ccaa77;margin-top:4px;">' + (done ? 'Forged. There is only one.' : '🔶 Heartstone Shards: ' + have + ' of ' + MOUNTAINBREAKER_SHARDS) + '</div></div>';
    var btn = document.createElement('button');
    btn.style.cssText = 'font-family:Cinzel,serif;font-size:0.65rem;padding:6px 12px;background:' + (can ? '#1a1000' : '#0a0a0a') + ';border:1px solid ' + (can ? '#ffaa00' : '#333') + ';color:' + (can ? '#ffaa00' : '#666') + ';white-space:nowrap;';
    btn.textContent = done ? 'Forged' : 'Forge';
    btn.setAttribute('aria-label', done ? 'The Mountainbreaker is already forged'
      : 'Forge the Mountainbreaker. You have ' + have + ' of ' + MOUNTAINBREAKER_SHARDS + ' Heartstone Shards. Mine bosses from depth 100 drop them.');
    btn.onclick = forgeMountainbreaker;
    div.appendChild(btn);
    content.appendChild(div);
  };
})();
