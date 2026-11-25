//═════════════════
// CHOOSE A DUNGEON (12.1, the same as the apps)
//═════════════════
// After a win, next to Continue Journey and New Game+: any dungeon you've
// unlocked, as a normal run (your level carries over, New Game+ off) or as
// New Game+ in that dungeon.

function _cdEsc(s) { return String(s).replace(/[&<>"']/g, function(c) { return '&#' + c.charCodeAt(0) + ';'; }); }

function openChooseDungeon(picked) {
  closeOv('ov-ngplus-choice');
  var ch = _charIdx !== null ? CHARS[_charIdx] : null;
  var list = getUnlockedDungeons();
  var ov = document.getElementById('ov-choose-dungeon');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'overlay'; ov.id = 'ov-choose-dungeon';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'cd-title');
    document.body.appendChild(ov);
  }
  window._cdPicked = picked || null;
  var h = '<div class="ov-box" style="max-width:460px;">';
  if (picked) {
    h += '<h2 class="ov-title" id="cd-title" style="color:var(--gold);">🗺 ' + _cdEsc(picked) + '</h2>' +
      '<p class="ov-text">How do you want to face it?</p>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
      '<button class="btn-gold" onclick="chooseDungeonGo(window._cdPicked, false)" aria-label="Normal — enter ' + _cdEsc(picked) + ' with your current level">⚔ Normal</button>' +
      '<button class="btn-gold" onclick="chooseDungeonGo(window._cdPicked, true)" aria-label="New Game Plus — enter ' + _cdEsc(picked) + ' with harder enemies">🔄 New Game+</button>' +
      '<button class="btn-ghost" onclick="openChooseDungeon()" aria-label="Back to the dungeon list">← Back</button></div>';
  } else {
    h += '<h2 class="ov-title" id="cd-title" style="color:var(--gold);">🗺 Choose a Dungeon</h2><div style="display:flex;flex-direction:column;gap:6px;">';
    list.forEach(function(d, i) {
      var here = ch && d === ch.dungeon;
      h += '<button class="' + (here ? 'btn-ghost' : 'btn-gold') + '" onclick="openChooseDungeon(getUnlockedDungeons()[' + i + '])" aria-label="' +
        _cdEsc(here ? d + ', the dungeon you just cleared' : d) + '">' + _cdEsc(here ? d + ' · just cleared' : d) + '</button>';
    });
    h += '<button class="btn-ghost" style="margin-top:8px;" onclick="closeOv(\'ov-choose-dungeon\');openNGPlusChoice()" aria-label="Cancel and return to the end screen">← Cancel</button></div>';
  }
  ov.innerHTML = h + '</div>';
  openOv('ov-choose-dungeon');
  try { sfx('sfx-select'); } catch (e) {}
  say(picked ? picked + '. Normal or New Game Plus?' : 'Choose a dungeon. ' + list.length + ' unlocked.');
  setTimeout(function() { var b = ov.querySelector('button'); if (b) b.focus(); }, 80);
}

function chooseDungeonGo(dungeon, newGamePlus) {
  closeOv('ov-choose-dungeon');
  if (_charIdx === null) return;
  var ch = CHARS[_charIdx];
  if (newGamePlus) {
    ch.dungeon = dungeon;
    startNGPlus();
    say('New Game Plus ' + ch.ngPlusCount + ' in ' + dungeon + '! Enemies are stronger. The dungeon has not forgotten you.');
    return;
  }
  // Like Continue Journey, to the dungeon you chose, with New Game+ off.
  var savedXp = DS.xp || ch.xp || 0, savedLevel = DS.level || ch.level || 1;
  trackGlobalStat('runsCompleted', 1);
  ch.dungeon = dungeon; ch.floor = 1; ch.completed = false; ch.midRunSave = null; ch.marketSpriteUsed = false;
  ch.ngPlus = false; ch.ngPlusActive = false;
  saveChars();
  document.getElementById('dg-end').style.display = 'none';
  var ngBtn = document.getElementById('dg-ngplus-btn'); if (ngBtn) ngBtn.style.display = 'none';
  initDungeon(ch);
  DS.xp = savedXp; DS.level = savedLevel;
  updatePlayerBar(); updateTopBar();
  goTo('dungeon');
  setTimeout(function() { enterRoom(); }, 400);
  say('Entering ' + dungeon + '. Your character carries all their strength forward.');
}

// The button, in the "Your Journey Continues" choice, before Decide Later.
(function() {
  function addButton() {
    if (document.getElementById('ngplus-choice-pick')) return;
    var ng = document.getElementById('ngplus-choice-ng');
    if (!ng || !ng.parentNode) return;
    var b = document.createElement('button');
    b.className = 'btn-gold'; b.id = 'ngplus-choice-pick';
    b.setAttribute('aria-label', 'Choose a Dungeon — pick any dungeon you\'ve unlocked, normal or New Game Plus');
    b.innerHTML = '🗺 Choose a Dungeon<br><span style="font-size:0.7em;font-style:italic;text-transform:none;">Pick any dungeon you\'ve unlocked — normal or New Game+</span>';
    b.onclick = function() { openChooseDungeon(); };
    ng.parentNode.insertBefore(b, ng.nextSibling);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
})();
