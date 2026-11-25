//═════════════════
// MYSTERY COIN SHOP ADDITIONS AND MASTERY (12.2, the same as the apps)
//═════════════════
// A player bought out the Coin Shop in a day. Eight more upgrades, and
// Mastery: ranks that never run out, each costing half again as much as
// the last (50, 75, 113, 169 …). Saved in "dd_coin_mastery" as {id: rank}.

COIN_UPGRADES.push(
  { id:'cu-whetstone',      name:'Whetstone',        icon:'🪨', desc:'+1 attack on every run.',                    cost:15 },
  { id:'cu-thick-hide',     name:'Thick Hide',       icon:'🐻', desc:'+15 max HP on every run.',                   cost:25 },
  { id:'cu-guardian',       name:"Guardian's Oath",  icon:'🛡', desc:'+1 defense on every run.',                   cost:20 },
  { id:'cu-steady-mind',    name:'Steady Mind',      icon:'🧠', desc:'+10 max SP on every run.',                   cost:25 },
  { id:'cu-spirit-satchel', name:'Spirit Satchel',   icon:'🔵', desc:'Start every run with 2 Spirit Tonics.',      cost:20 },
  { id:'cu-healers-cache',  name:"Healer's Cache",   icon:'💊', desc:'Start every run with a Greater Potion.',     cost:30 },
  { id:'cu-keen-eye',       name:'Keen Eye',         icon:'🎯', desc:'+3% critical hit chance on every run.',      cost:35 },
  { id:'cu-fortune-purse',  name:"Fortune's Purse",  icon:'👛', desc:'Start every run with 50 extra gold.',        cost:30 }
);

var COIN_MASTERIES = [
  { id:'vigor', name:'Mastery of Vigor',    icon:'❤️', perRank:'+5 max HP' },
  { id:'might', name:'Mastery of Might',    icon:'⚔️', perRank:'+1 attack' },
  { id:'ward',  name:'Mastery of the Ward', icon:'🛡', perRank:'+1 defense' },
  { id:'focus', name:'Mastery of Focus',    icon:'🔮', perRank:'+3 max SP' },
];
function getMasteryRanks() { return _jsonParseSafe(DDStore.getItem('dd_coin_mastery'), '{}'); }
function masteryRank(id) { return getMasteryRanks()[id] || 0; }
function masteryCost(rank) { return Math.round(50 * Math.pow(1.5, rank)); }

function buyMasteryRank(id) {
  var m = COIN_MASTERIES.filter(function(x) { return x.id === id; })[0]; if (!m) return;
  var coins = parseInt(DDStore.getItem('dd_mystery_coins') || '0'), r = masteryRank(id), cost = masteryCost(r);
  if (coins < cost) { say('Not enough Mystery Coins.'); return; }
  DDStore.setItem('dd_mystery_coins', String(coins - cost));
  var save = getRaidSave(); save.mysteryCoins = coins - cost; setRaidSave(save);
  var all = getMasteryRanks(); all[id] = r + 1; DDStore.setItem('dd_coin_mastery', JSON.stringify(all));
  sfx('sfx-unlock');
  var msg = m.name + ' rank ' + (r + 1) + '! ' + m.perRank + ' more on every run.';
  renderCoinShop();
  document.getElementById('coinshop-msg').textContent = msg;
  say(msg);
}

(function() {
  // The Mastery section, at the top of the shop.
  var _render = renderCoinShop;
  window.renderCoinShop = renderCoinShop = function() {
    _render.apply(this, arguments);
    var grid = document.getElementById('coinshop-grid'); if (!grid) return;
    var coins = parseInt(DDStore.getItem('dd_mystery_coins') || '0');
    var box = document.createElement('div');
    box.innerHTML = '<h3 style="font-family:Cinzel,serif;font-size:0.65rem;letter-spacing:0.2em;color:var(--gold-dim);margin:4px 0 2px;">MASTERY — RANKS THAT NEVER RUN OUT</h3>' +
      '<p style="font-family:\'Crimson Text\',serif;font-style:italic;color:#aaa;margin:0 0 8px;">Each rank costs half again as much as the last.</p>';
    COIN_MASTERIES.forEach(function(m) {
      var r = masteryRank(m.id), cost = masteryCost(r), can = coins >= cost;
      var div = document.createElement('div');
      div.className = 'coinshop-item ' + (can ? 'affordable' : 'cant-afford');
      div.setAttribute('role', 'button'); div.setAttribute('tabindex', '0');
      div.setAttribute('aria-label', m.name + ', rank ' + r + '. ' + m.perRank + ' a rank on every run. Next rank costs ' + cost + ' coins.' + (can ? '' : ' Not enough coins.'));
      div.innerHTML = '<span class="coinshop-item-icon" aria-hidden="true">' + m.icon + '</span>' +
        '<div class="coinshop-item-info"><div class="coinshop-item-name">' + m.name + ' — Rank ' + r + '</div><div class="coinshop-item-desc">' + m.perRank + ' a rank on every run. Now: ' + r + ' rank' + (r === 1 ? '' : 's') + '.</div></div>' +
        '<span class="coinshop-item-cost">' + cost + ' 🪙</span>';
      if (can) {
        div.onclick = function() { buyMasteryRank(m.id); };
        div.onkeydown = function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); buyMasteryRank(m.id); } };
      }
      box.appendChild(div);
    });
    var head = document.createElement('h3');
    head.style.cssText = 'font-family:Cinzel,serif;font-size:0.65rem;letter-spacing:0.2em;color:var(--gold-dim);margin:14px 0 6px;';
    head.textContent = 'UPGRADES';
    box.appendChild(head);
    grid.insertBefore(box, grid.querySelector('.coinshop-item'));
  };

  // The new upgrades and the ranks, after the run is set up (it resets crit chance).
  var _init = initDungeon;
  window.initDungeon = initDungeon = function() {
    var r = _init.apply(this, arguments);
    try {
      if (hasUpgrade('cu-whetstone'))      DS.atkBonus = (DS.atkBonus || 0) + 1;
      if (hasUpgrade('cu-thick-hide'))     { DS.maxHp += 15; DS.hp = Math.min(DS.maxHp, DS.hp + 15); }
      if (hasUpgrade('cu-guardian'))       DS.defBonus = (DS.defBonus || 0) + 1;
      if (hasUpgrade('cu-steady-mind'))    { DS.maxSp = (DS.maxSp || 20) + 10; DS.sp = Math.min(DS.maxSp, (DS.sp || 0) + 10); }
      if (hasUpgrade('cu-spirit-satchel')) for (var i = 0; i < 2; i++) DS.inventory.push({ name:'Spirit Tonic', icon:'🔵', type:'sp-potion', sp:15, desc:'Restores 15 SP.' });
      if (hasUpgrade('cu-healers-cache'))  DS.inventory.push({ name:'Greater Potion', icon:'💊', type:'potion', heal:80, desc:'Restores 80 HP.' });
      if (hasUpgrade('cu-keen-eye'))       DS.critBonus = (DS.critBonus || 0) + 0.03;
      if (hasUpgrade('cu-fortune-purse'))  { DS.gold = (DS.gold || 0) + 50; addGlobalGold(50); }
      var ranks = getMasteryRanks();
      if (ranks.vigor) { DS.maxHp += 5 * ranks.vigor; DS.hp = Math.min(DS.maxHp, DS.hp + 5 * ranks.vigor); }
      if (ranks.might) DS.atkBonus = (DS.atkBonus || 0) + ranks.might;
      if (ranks.ward)  DS.defBonus = (DS.defBonus || 0) + ranks.ward;
      if (ranks.focus) { DS.maxSp = (DS.maxSp || 20) + 3 * ranks.focus; DS.sp = Math.min(DS.maxSp, (DS.sp || 0) + 3 * ranks.focus); }
    } catch (e) { console.warn('[coin mastery]', e); }
    return r;
  };
})();
