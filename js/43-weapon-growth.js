//═════════════════
// ENDLESS WEAPON UPGRADES (12.2, the same as the apps)
//═════════════════
// Weapons upgrade past level 10 at the Blacksmith (each level 40% dearer),
// and the dungeon answers: for every weapon level past 10, enemies have 4%
// more HP and hit 3% harder. A level still adds 2.5 attack, so upgrading
// always helps, but the dungeon keeps up.

function _weaponLevelsPast() { var w = DS && DS.equippedWeapon; return Math.max(0, ((w && w.level) || 1) - 10); }
function weaponGrowthPercent(level) { return Math.round(Math.max(0, level - 10) * 4); }

// An enemy grown to meet your weapon (once).
function weaponGrowEnemy(e) {
  var n = _weaponLevelsPast();
  if (!e || n <= 0 || e._weaponGrown) return e;
  var hp = 1 + n * 0.04, atk = 1 + n * 0.03;
  e.maxHp = Math.round((e.maxHp || e.hp) * hp);
  e.hp = Math.round(e.hp * hp);
  ['phase1Hp', 'phase2Hp', 'phase3Hp'].forEach(function(k) { if (typeof e[k] === 'number') e[k] = Math.round(e[k] * hp); });
  if (Array.isArray(e.atk)) e.atk = [Math.round(e.atk[0] * atk), Math.max(Math.round(e.atk[0] * atk), Math.round(e.atk[1] * atk))];
  e._weaponGrown = true;
  return e;
}

(function() {
  var _start = startCombat;
  window.startCombat = startCombat = function() {
    var r = _start.apply(this, arguments);
    if (DS.enemy) { weaponGrowEnemy(DS.enemy); try { updateEnemyBar(); } catch (e) {} }
    return r;
  };
  if (typeof startMultiCombat === 'function') {
    var _multi = startMultiCombat;
    window.startMultiCombat = startMultiCombat = function(enemies) {
      (enemies || []).forEach(weaponGrowEnemy);
      return _multi.apply(this, arguments);
    };
  }
})();

// ── Bosses that stand up to strong characters (12.2, the same as the apps) ──
// When a dungeon boss appears it measures you: its HP is at least 15 of your
// average hits (weapon and prestige included), 1.5 more for each prestige
// star and 1 more for each weapon level past 10, up to 40; each of its hits
// takes at least a tenth of your max HP. Its phases keep their places.
function bossHitsToKill() {
  return Math.min(40, 15 + 1.5 * (DS._prestige || 0) + _weaponLevelsPast());
}
function bossPowerUp(b) {
  if (!b || !b.isBoss || b._bossPower) return b;
  b._bossPower = true;
  var atk = Array.isArray(DS.atk) ? (DS.atk[0] + DS.atk[1]) / 2 : 10;
  var avg = Math.max(1, Math.round(atk + (DS.atkBonus || 0)));
  if (typeof prestigeHit === 'function') avg = prestigeHit(avg);
  var want = Math.round(avg * bossHitsToKill());
  var max = b.maxHp || b.hp;
  if (want > max) {
    var f = want / max;
    b.hp = Math.round(b.hp * f); b.maxHp = want;
    ['phase1Hp', 'phase2Hp', 'phase3Hp'].forEach(function(k) { if (typeof b[k] === 'number') b[k] = Math.round(b[k] * f); });
  }
  var hit = Math.round((DS.maxHp || 100) * 0.10);
  if (Array.isArray(b.atk) && hit > (b.atk[0] + b.atk[1]) / 2) b.atk = [Math.round(hit * 0.8), Math.round(hit * 1.4)];
  return b;
}
(function() {
  var _start = startCombat;
  window.startCombat = startCombat = function() {
    var r = _start.apply(this, arguments);
    if (DS.enemy && DS.enemy.isBoss) { bossPowerUp(DS.enemy); try { updateEnemyBar(); } catch (e) {} }
    return r;
  };
})();
