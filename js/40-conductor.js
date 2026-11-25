//═════════════════
// THE CONDUCTOR, ANOMALY 0-17 (12.1, the same as the apps)
//═════════════════
// A long hall with a door at the far end and something at the front
// conducting a lullaby. You may only move while the music plays. When it
// stops, stand still: it listens for you. The song slows and goes out of tune
// before it stops, but sometimes that's a fake-out and it plays on.
// From floor 3, 3% of rooms, once a floor, never on a boss floor.
// Heard: a quarter of your max HP and dragged back 2 steps; the third time it
// keeps you (half your max HP, some gold) and you wake up outside. Through
// the door: gold, a piece of this dungeon's gear, and a page of its file.

var CONDUCTOR_FILES = [
  'Anomaly 0-17, "The Conductor". Threat Class: Unknown. It appears in a hall that was not there before. It faces away from you and conducts a lullaby no one is playing. Do not move without music.',
  'Addendum 1: It has never been seen to turn around. Every report says it knew exactly where the explorer was standing when the music stopped.',
  'Addendum 2: The lullaby slows and goes out of tune before it ends. Explorers learned to stop when it drags. Then, sometimes, it played on. It is learning too.',
  'Addendum 3: Explorers it kept were found outside the hall the next morning, unharmed but for the ears. They hum the song. They do not know the words. There are no words.',
  'Addendum 4: Recovered sheet music, one page, unsigned. The final bar is a rest that goes on forever. Someone has written in the margin: \'not yet\'.',
  'Final entry: The hall has a door at each end. No one has ever used the one behind it. Do not try. Do not move without music.',
];
var CONDUCTOR_CATCHES = 3, CONDUCTOR_PUSHBACK = 2, CONDUCTOR_GRACE = 600;
var COND = { hall: null, clock: 0, silentSince: 0, ctx: null, gain: null, buffers: {}, src: null, song: null, offset: 0, startedAt: 0, tempo: 1 };

function condHall() { return DS._conductor || null; }
function condLeft(h) { return h.length - h.step; }
function condNear(h) { return condLeft(h) <= 3; }
function condTempo(h) { return 1 + Math.min(0.25, Math.max(0, h.floor - 3) * 0.03); }

function condShouldStart() {
  var bossFloor = DS.floor === 10 && DS.diff !== 'Endless';
  return (DS.floor || 1) >= 3 && !bossFloor && !DS.inCombat && !condHall() && DS._conductorFloor !== DS.floor
    && !(typeof _eventPending === 'function' && _eventPending()) && Math.random() < 0.03;
}

// ── The lullaby: it stops on any note, drags slower and flatter, and picks up where it stopped ──
function _condCtx() {
  if (!COND.ctx) {
    var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    COND.ctx = (typeof AUD !== 'undefined' && AUD.ctx) ? AUD.ctx : new C();
    COND.gain = COND.ctx.createGain(); COND.gain.connect(COND.ctx.destination);
  }
  if (COND.ctx.state === 'suspended') COND.ctx.resume();
  // Louder than nothing even with the music turned off: you can't play this room without hearing it.
  var v = (typeof AUD !== 'undefined') ? (AUD.musicOn ? Math.max(0.35, AUD.musicVol || 0.5) : Math.max(0.35, AUD.sfxVol || 0.5)) : 0.6;
  COND.gain.gain.value = v;
  return COND.ctx;
}
function _condLoad(name) {
  if (COND.buffers[name]) return Promise.resolve(COND.buffers[name]);
  var ctx = _condCtx(); if (!ctx) return Promise.resolve(null);
  return fetch('audio/' + name).then(function(r) { return r.arrayBuffer(); })
    .then(function(b) { return new Promise(function(ok, no) { ctx.decodeAudioData(b, ok, no); }); })
    .then(function(buf) { COND.buffers[name] = buf; return buf; }).catch(function() { return null; });
}
function condPlay(near, tempo) {
  var name = near ? 'conductor-near.mp3' : 'conductor-far.mp3';
  COND.tempo = tempo;
  if (name !== COND.song) { COND.offset = 0; COND.song = name; }
  var want = COND.song;
  _condLoad(name).then(function(buf) {
    if (!buf || COND.song !== want || !condHall()) return;
    _condStopSource();
    var ctx = _condCtx(), s = ctx.createBufferSource();
    s.buffer = buf; s.loop = true; s.playbackRate.value = tempo; s.connect(COND.gain);
    s.start(0, COND.offset % buf.duration);
    COND.src = s; COND.startedAt = ctx.currentTime;
  });
}
function _condStopSource() {
  if (!COND.src) return;
  try { COND.offset += (COND.ctx.currentTime - COND.startedAt) * COND.src.playbackRate.value; COND.src.stop(); } catch (e) {}
  COND.src = null;
}
function condDrag(seconds) {
  if (!COND.src) return;
  var t = COND.ctx.currentTime;
  COND.src.playbackRate.setValueAtTime(COND.tempo, t);
  COND.src.playbackRate.linearRampToValueAtTime(COND.tempo * 0.55, t + seconds);
}
function condRecover() { if (COND.src) { COND.src.playbackRate.cancelScheduledValues(COND.ctx.currentTime); COND.src.playbackRate.value = COND.tempo; } }
function condPause() { _condStopSource(); }
function condStopSong() { _condStopSource(); COND.song = null; COND.offset = 0; }

// ── The clock ──
function _condAfter(sec, fn) { var tick = COND.clock; setTimeout(function() { if (COND.clock === tick && condHall()) fn(); }, sec * 1000); }
function condVerse(extra) {
  var h = condHall(); if (!h) return;
  var deep = Math.min(1, Math.max(0, h.floor - 3) / 7);
  var play = (30 + Math.floor(Math.random() * 51)) / 10 * (1 - 0.35 * deep);
  var drag = Math.random() < 0.75, stops = drag ? !(Math.random() < 0.33) : true;
  var silence = (25 + Math.floor(Math.random() * 21)) / 10 * (1 + 0.4 * deep);
  _condAfter(play + (extra || 0), function() {
    if (!drag) { condSilence(silence); return; }
    condDrag(1.8);
    _condAfter(1.8, function() { if (stops) condSilence(silence); else { condRecover(); condVerse(); } });
  });
}
function condSilence(sec) {
  var h = condHall(); if (!h) return;
  h.silent = true; COND.silentSince = Date.now();
  condPause();
  try { vibe([60, 80, 60]); } catch (e) {}
  _condAfter(Math.min(1.6, sec / 2), function() { try { var a = new Audio(_audioUrl('ambient-whisper.mp3')); a.volume = 0.35; a.play().catch(function() {}); } catch (e) {} });
  _condAfter(sec, function() {
    var g = condHall(); if (!g) return;
    g.silent = false;
    condPlay(condNear(g), condTempo(g));
    try { vibe(30); } catch (e) {}
    condVerse();
  });
  condRender();
}

// ── The hall on screen: it covers the dungeon until you're out ──
function condRender() {
  var h = condHall(), ov = document.getElementById('conductor-overlay');
  if (!h) { if (ov) ov.remove(); return; }
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'conductor-overlay';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'The Conductor');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9500;background:#050302;display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.innerHTML = '<div style="max-width:440px;width:100%;text-align:center;">' +
      '<h2 style="font-family:\'Cinzel Decorative\',cursive;color:#e8c890;font-size:1.2rem;margin-bottom:8px;">🎻 The Conductor</h2>' +
      '<p style="font-family:\'Crimson Text\',serif;font-style:italic;color:#998877;margin-bottom:14px;">Step forward only while the music plays. When it stops, don\'t move.</p>' +
      '<div id="cond-status" tabindex="0" style="font-family:Cinzel,serif;font-size:0.78rem;color:#ccbb99;margin-bottom:16px;"></div>' +
      '<button id="cond-step" class="menu-btn primary" style="width:100%;padding:22px;font-size:1rem;" onclick="condStep()">👣 Step Forward</button>' +
      '<button class="btn-ghost" style="width:100%;margin-top:10px;" onclick="condListen()">👂 Hold Still and Listen</button></div>';
    document.body.appendChild(ov);
    setTimeout(function() { var b = document.getElementById('cond-step'); if (b) b.focus(); }, 80);
  }
  var st = document.getElementById('cond-status');
  st.textContent = '🎻 Step ' + h.step + ' of ' + h.length + '. ' + (h.silent ? 'SILENCE — don\'t move.' : 'The music plays — move.') + '  Heard: ' + h.caught + ' / ' + CONDUCTOR_CATCHES;
  st.setAttribute('aria-label', 'Step ' + h.step + ' of ' + h.length + '. Heard ' + h.caught + ' of ' + CONDUCTOR_CATCHES + ' times.');
}

function condStart() {
  var h = { floor: DS.floor, length: DS.floor >= 8 ? 8 : 7, step: 0, caught: 0, silent: false };
  DS._conductor = h; DS._conductorFloor = DS.floor;
  var first = DDStore.getItem('dd_conductor_met') !== '1';
  DDStore.setItem('dd_conductor_met', '1');
  try { playTrack('silence'); } catch (e) {}
  try { vibe([80, 60, 80]); } catch (e) {}
  addLog('🎻 A hall that wasn\'t there before. At the far end, something with its back to you is conducting a lullaby no one is playing.');
  condRender();
  say('A hall that wasn\'t there before. At the far end, something is conducting a lullaby. The Conductor. The door out is ' + h.length +
    ' steps away. Step forward only while the music plays. When it stops, don\'t move: it listens. If the song slows down and goes out of tune, it\'s about to stop, but not always.' +
    (first ? ' ' + CONDUCTOR_FILES[0] : ''));
  if (first) addLog('📄 ' + CONDUCTOR_FILES[0]);
  COND.clock++;
  condPlay(false, condTempo(h));
  condVerse(first ? 22 : 12);
}

function condEnd() {
  COND.clock++;
  condStopSong();
  DS._conductor = null;
  condRender();
  try { playTrack(exploTrackForFloor(DS.floor)); } catch (e) {}
  showDgPanels(true, false, false);
  updateTopBar(); updatePlayerBar();
  saveProgress();
}

function condListen() {
  var h = condHall(); if (!h) return;
  say(h.silent ? 'Silence. Don\'t move. ' + condLeft(h) + ' steps to the door.' : 'The music plays. ' + condLeft(h) + ' steps to the door.');
}

function condStep() {
  var h = condHall(); if (!h) return;
  // A step right as the music stops still counts as in time.
  var forgiven = h.silent && Date.now() - COND.silentSince < CONDUCTOR_GRACE;
  var wasNear = condNear(h);
  if (h.silent && !forgiven) {
    h.caught++;
    if (h.caught >= CONDUCTOR_CATCHES) {
      try { new Audio(_audioUrl('hunter-jumpscare.mp3')).play().catch(function() {}); } catch (e) {}
      var dmg = Math.round(DS.maxHp * 0.5); DS.hp = Math.max(1, DS.hp - dmg);
      var gold = Math.min(DS.gold, 25 * DS.floor); DS.gold -= gold;
      var msg = 'The Conductor turns around. Everything goes quiet. You wake up outside the hall, humming its song. ' + dmg + ' damage' + (gold > 0 ? ', and ' + gold + ' gold is gone.' : '.');
      addLog('💀 ' + msg); condEnd(); setEvent('danger', msg); say(msg);
      return;
    }
    h.step = Math.max(0, h.step - CONDUCTOR_PUSHBACK);
    try { new Audio(_audioUrl('jump-scare-v3.mp3')).play().catch(function() {}); } catch (e) {}
    try { vibe([200, 100, 200]); } catch (e) {}
    var d = Math.round(DS.maxHp * 0.25); DS.hp = Math.max(1, DS.hp - d); updatePlayerBar();
    var left = CONDUCTOR_CATCHES - h.caught;
    addLog('💀 IT HEARD YOU. ' + d + ' damage. You\'re dragged back to step ' + h.step + '.');
    say('It heard you. ' + d + ' damage, and you\'re dragged back. ' + condLeft(h) + ' steps to the door. ' + (left === 1 ? 'Once more and it keeps you.' : left + ' more and it keeps you.'));
    condRender(); saveProgress();
    return;
  }
  h.step++;
  try { sfx('sfx-footstep'); } catch (e) {}
  if (h.step >= h.length) {
    var g2 = 100 + 20 * DS.floor - 15 * h.caught;
    DS.gold += g2; addGlobalGold(g2);
    var tables = { 'The Ashbound Wastes': 'ASH_LOOT', 'Frosthold Abyss': 'FROST_LOOT', 'The Sunken Archives': 'SUNKEN_LOOT', 'The Hollow': 'HOLLOW_LOOT',
                   'The Infernal Descent': 'INFERNAL_LOOT', 'The Whispering Forest': 'WHISPER_LOOT', 'The Shadow World': 'SHADOW_LOOT' };
    var table = window[tables[DS.dungeon] || 'LOOT'] || (typeof LOOT !== 'undefined' ? LOOT : []);
    var gear = (table || []).filter(function(i) { return i && (i.type === 'weapon' || i.type === 'armor'); });
    var item = gear.length ? Object.assign({}, gear[Math.floor(Math.random() * gear.length)]) : null;
    if (item) { DS.inventory.push(item); try { renderInv(); } catch (e) {} }
    var pages = parseInt(DDStore.getItem('dd_conductor_pages') || '0', 10) || 0, page = '';
    if (pages < CONDUCTOR_FILES.length - 1) { page = CONDUCTOR_FILES[pages + 1]; DDStore.setItem('dd_conductor_pages', String(pages + 1)); }
    addLog('✨ You reach the door. The music stops behind you, and does not start again. ' + g2 + ' gold.');
    if (item) addLog('📦 Found: ' + item.name + '!');
    if (page) addLog('📄 ' + page);
    try { sfx('sfx-victory'); vibe(VIBE.loot); } catch (e) {}
    condEnd();
    var m = 'You reach the door. The music stops behind you, and does not start again. ' + g2 + ' gold' + (item ? ' and ' + item.name : '') + '.' + (page ? ' A page of its containment file was by the door. ' + page : '');
    setEvent('good', m); say(m);
    return;
  }
  if (condNear(h) && !wasNear) {
    if (!h.silent) condPlay(true, condTempo(h));
    addLog('🎻 The song changes. You\'re close to it now.');
    say('The song changes. You\'re close now. ' + condLeft(h) + ' steps to the door.');
  } else {
    say(condLeft(h) === 1 ? '1 step to the door.' : condLeft(h) + ' steps to the door.');
  }
  condRender();
}

(function() {
  if (typeof enterRoom !== 'function') return;
  var _enter = enterRoom;
  window.enterRoom = enterRoom = function() {
    if (condHall()) { say('Step forward only while the music plays.'); condRender(); return; }
    if (DS && DS.dungeon && !DS._communityDungeon && condShouldStart()) { condStart(); return; }
    return _enter.apply(this, arguments);
  };
})();
