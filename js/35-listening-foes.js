//═════════════════
// FOUR ENEMIES BUILT AROUND LISTENING (12.1, the same as the apps)
//═════════════════
// - The Liar (The Hollow): half its hits are announced wrong. Your HP never lies.
// - The Bell Choir (The Sunken Archives): a bell before each move; low, middle
//   and high mean strike, heal or flee, shuffled every fight.
// - The Counting Thing (Crypt of Malachar): counts down every turn and hits for
//   triple at zero. Defending makes it lose count.
// - The Silent One (The Shadow World): no music, and its hits aren't announced
//   unless you hit it that turn.
// Each is a rare spawn (5% of normal fights from floor 3) in its own dungeon.

var LISTENING_FOES = [
  { flag:'liar', dungeon:'The Hollow', name:'The Liar', icon:'🎭', hp:40, atk:[8,14], gold:[12,22],
    desc:'It smiles while it talks. Half of what it says about the fight is a lie. Your HP never lies.' },
  { flag:'bells', dungeon:'The Sunken Archives', name:'The Bell Choir', icon:'🔔', hp:50, atk:[7,12], gold:[15,25],
    desc:'Three drowned bells ring before it moves. Low, middle and high: one means a crushing strike, one means it heals, one means it runs. Learn which, every fight.' },
  { flag:'counting', dungeon:'Crypt of Malachar', name:'The Counting Thing', icon:'🔢', hp:45, atk:[7,12], gold:[12,22],
    desc:'It counts down out loud. At zero it strikes with everything it has. Defending makes it lose count.' },
  { flag:'silent', dungeon:'The Shadow World', name:'The Silent One', icon:'🤫', hp:38, atk:[6,11], gold:[15,25],
    desc:'It makes no sound at all. The music stops. You only learn it hit you by checking your HP, unless you strike it, and it cries out.' },
];
var _BELL_PITCHES = ['low', 'middle', 'high'];

// The template for this room, or null (5% of normal fights from floor 3, in its dungeon).
function listeningFoeRoll(isElite) {
  if (isElite || (DS.floor || 1) < 3 || DS._communityDungeon) return null;
  var d = LISTENING_FOES.filter(function(f) { return f.dungeon === DS.dungeon; })[0];
  if (!d || Math.random() >= 0.05) return null;
  return d;
}

// Turns a freshly scaled enemy into one of the four.
function makeListeningFoe(enemy, d) {
  enemy.name = d.name; enemy.icon = d.icon; enemy.desc = d.desc; enemy.gold = d.gold;
  enemy._nf = d.flag;
  if (d.flag === 'counting') enemy._count = 6;
  if (d.flag === 'bells') {
    var moves = ['strike', 'heal', 'flee'];
    for (var i = moves.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = moves[i]; moves[i] = moves[j]; moves[j] = t; }
    enemy._bellMap = moves;
    enemy._turns = 0;
  }
  return enemy;
}

function _bellPitch(e, move) { return _BELL_PITCHES[Math.max(0, (e._bellMap || []).indexOf(move))]; }

// Picks the Bell Choir's next move and rings its bell.
function _ringBell(e) {
  var roll = Math.floor(Math.random() * 100) + 1;
  e._bellNext = roll <= 55 ? 'strike' : (roll <= 85 || (e._turns || 0) < 2) ? 'heal' : 'flee';
  addLog('🔔 A ' + _bellPitch(e, e._bellNext) + ' bell rings.');
}

// From startCombat.
function listeningFoeBegin(e) {
  if (!e || !e._nf) return;
  if (e._nf === 'liar') addLog('🎭 It smiles. Nothing it says about this fight can be trusted. Your HP never lies.');
  else if (e._nf === 'bells') { addLog('🔔 Three drowned bells hang in the dark. Low, middle and high. Each one means something different, and the meaning changes every fight.'); _ringBell(e); }
  else if (e._nf === 'counting') addLog('🔢 It starts counting, slowly, out loud. When it reaches zero it strikes with everything. Defending makes it lose count.');
  else if (e._nf === 'silent') {
    addLog('🤫 The music stops. Something is here, and it makes no sound. Its hits will not be announced. Strike it and it cries out.');
    setTimeout(function() { if (DS.enemy === e && DS.inCombat) playTrack('silence'); }, 50);
  }
}

// Before its attack: the count, or the bell's move. Returns
// { mult, skip, flee } for the rest of the enemy turn.
function listeningFoeBeforeAttack(e) {
  var r = { mult: 1, skip: false, flee: false };
  if (!e || !e._nf) return r;
  if (e._nf === 'counting') {
    if (DS.defending) {
      e._count = 5;
      addLog('🔢 You brace yourself. It loses count, and starts again: five.');
    } else {
      var n = (e._count || 5) - 1;
      if (n <= 0) { e._count = 5; r.mult = 3; addLog('🔢 ZERO. It strikes with everything it has!'); }
      else { e._count = n; addLog('🔢 ' + (['', 'One', 'Two', 'Three', 'Four', 'Five'][n] || n) + '…'); }
    }
  }
  if (e._nf === 'bells' && e._bellNext) {
    var move = e._bellNext, pitch = _bellPitch(e, move);
    e._turns = (e._turns || 0) + 1;
    if (move === 'flee') {
      addLog('🔔 The ' + pitch + ' bell meant escape. The Bell Choir sinks back into the water, and its gold goes with it.');
      r.flee = true;
      return r;
    }
    if (move === 'strike') { r.mult = 2; addLog('🔔 The ' + pitch + ' bell meant a strike. It hits with double force!'); }
    else if (move === 'heal') {
      var heal = Math.max(1, Math.floor((e.maxHp || e.hp) / 5));
      e.hp = Math.min(e.maxHp || e.hp, e.hp + heal);
      r.skip = true;
      addLog('🔔 The ' + pitch + ' bell meant healing. It mends ' + heal + ' HP.');
      try { updateEnemyBar(); } catch (x) {}
    }
    _ringBell(e);
  }
  return r;
}

// The Bell Choir leaves (no gold), back to exploring.
function listeningFoeFled(e) {
  DS.inCombat = false; DS.enemy = null;
  try { fxReset(); } catch (x) {}
  playTrack(exploTrackForFloor(DS.floor));
  showDgPanels(true, false, false);
  setEvent('', 'The Bell Choir is gone. The water is still.');
  say('The bell meant escape. The Bell Choir sinks back into the water, and its gold goes with it.');
  setCombatBtns(true);
  saveProgress();
}

// Whether the real damage line should stay out of the combat log (the log is
// read aloud, so the Liar and the Silent One would give themselves away).
function listeningFoeHidesHit(e) { return !!(e && (e._nf === 'liar' || e._nf === 'silent')); }

// What VoiceOver hears after its turn; null for any other enemy.
function listeningFoeAnnouncement(e, taken, playerDmg) {
  if (!e || !e._nf) return null;
  var hp = 'Your HP: ' + DS.hp + ' of ' + DS.maxHp + '.';
  if (e._nf === 'liar' && Math.random() < 0.5) {
    var lie = taken > 0
      ? (Math.random() < 0.5 ? 'The Liar misses you completely!' : 'The Liar hits you for ' + (taken * 3) + ' damage!')
      : 'The Liar hits you for ' + (15 + Math.floor(Math.random() * 16)) + ' damage!';
    return lie + ' ' + hp;
  }
  if (e._nf === 'silent' && !(playerDmg > 0)) return 'Silence. ' + hp;
  if (e._nf === 'silent') return 'It cries out when you strike it. For a moment you can hear it. ' + (taken > 0 ? 'It dealt ' + taken + ' damage. ' : '') + hp;
  return (taken > 0 ? e.name + ' dealt ' + taken + ' damage. ' : '') + hp;
}
