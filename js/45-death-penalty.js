//═════════════════
// LOSING A RUN COSTS HALF THE GOLD YOU CARRY (12.2, the same as the apps)
//═════════════════
// Leo's idea, which also gives the Home safe its purpose: when a normal
// dungeon run is lost, half the gold you carry is dropped in the dungeon.
// Gold in the Home safe is never touched. Challenges (the Gauntlet, the Daily
// Dungeon, the Weekly Ladder, community dungeons) and co-op don't count.

(function() {
  // Their flags are cleared just before the defeat screen; remember them.
  function mark() { if (typeof DS !== 'undefined' && DS) DS._challengeEnded = true; }
  if (typeof endGauntlet === 'function') { var _eg = endGauntlet; window.endGauntlet = endGauntlet = function() { mark(); return _eg.apply(this, arguments); }; }
  if (typeof weeklyDone === 'function') { var _wd = weeklyDone; window.weeklyDone = weeklyDone = function() { if (DS && DS._weeklyRun) mark(); return _wd.apply(this, arguments); }; }
  var _init = initDungeon;
  window.initDungeon = initDungeon = function() { var r = _init.apply(this, arguments); DS._challengeEnded = false; DS._deathPenaltyPaid = false; return r; };

  var _defeat = showDefeat;
  window.showDefeat = showDefeat = function() {
    try {
      var challenge = DS._challengeEnded || (typeof _gauntletActive !== 'undefined' && _gauntletActive) ||
        DS._dailyRun || DS._weeklyRun || DS._communityDungeon;
      if (!challenge && !DS._deathPenaltyPaid) {
        DS._deathPenaltyPaid = true;
        var lost = Math.floor(getGlobalGold() * 0.5);
        if (lost > 0 && spendGlobalGold(lost)) {
          DS.gold = getGlobalGold();
          var safe = (getHomeSave() || {}).safe || 0;
          var msg = '💰 You drop half the gold you carried: ' + lost + ' gold is lost in the dungeon.' +
            (safe > 0 ? ' The ' + safe + ' gold in your Home safe is safe.' : ' Gold kept in your Home safe is never lost.');
          addLog(msg);
          setTimeout(function() { say(msg); }, 2500);
        }
      }
    } catch (e) { console.warn('[death penalty]', e); }
    return _defeat.apply(this, arguments);
  };
})();
