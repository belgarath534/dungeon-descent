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
