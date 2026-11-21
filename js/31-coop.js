// ═══════════════════════════════════════════════════════════════════════
// v12.0 — CO-OP DUNGEON (the same rules and room as the iPhone app's
// Coop.swift / CoopModel.swift, so web and app players play together)
// 2–4 players through 10 floors of a dungeon, one fight a floor, the boss on
// floor 10. Each round every player picks Attack, Heavy, Defend or Potion;
// when everyone has (or after 30 seconds) it all happens at once and the
// enemy strikes one player back. The downed get up on the next floor with
// 30% HP; if everyone is down, the run is lost. The host's device runs the
// fight in "pvp_rooms/coop_CODE"; everyone sends their choice.
// ═══════════════════════════════════════════════════════════════════════

var COOP = {
  max: 4, floors: 10, roundMs: 30000, potions: 3,
  myId: 'c' + Math.random().toString(36).slice(2, 11),
  code: null, isHost: false, hostId: '', stage: 'choose', status: 'lobby',
  party: [], foe: null, floor: 1, round: 0, roundStart: 0, actions: {}, beats: {},
  dungeon: '', myAction: null, seen: {}, log: [], resolving: false, rewarded: false,
  charIdx: 0, dungeonIdx: 0, ref: null, timer: null,
  dungeons: ['Crypt of Malachar', 'The Ashbound Wastes', 'Frosthold Abyss', 'The Sunken Archives', 'The Hollow', 'The Whispering Forest']
};

function _coRnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function _coNow() { return Date.now(); }

// A character's co-op stats: class HP, attack and defense, +12 HP and +1
// attack a level, and prestige stars on top.
function coopPlayer(ch) {
  var lvl = Math.max(1, ch.persistLevel || 1);
  var s = typeof prestigeStars === 'function' ? prestigeStars(ch) : 0;
  var hp = Math.round(((HP_MAP[ch.cls] || 100) + 12 * (lvl - 1)) * (1 + 0.05 * s));
  var atk = ATK_MAP[ch.cls] || [6, 12], m = 1 + 0.05 * s;
  var lo = Math.round((atk[0] + lvl - 1) * m), hi = Math.round((atk[1] + lvl - 1) * m);
  return { id: COOP.myId, name: s > 0 ? ch.name + ' ★' + s : ch.name, cls: ch.cls, level: lvl, hp: hp, maxHp: hp,
           atkLo: lo, atkHi: Math.max(lo, hi), def: DEF_MAP[ch.cls] || 0, potions: COOP.potions, platform: 'web', ready: false,
           joinedAt: _coNow() };
}

function coopTable(dungeon) {
  return dungeon === 'The Ashbound Wastes' ? ASH_ENEMIES : dungeon === 'Frosthold Abyss' ? FROST_ENEMIES :
    dungeon === 'The Sunken Archives' ? SUNKEN_ENEMIES : dungeon === 'The Hollow' ? HOLLOW_ENEMIES :
    dungeon === 'The Whispering Forest' ? WHISPER_ENEMIES : ENEMIES;
}

// The floor's enemy (the boss on floor 10), scaled like a normal run, with
// 70% more HP for each extra player and 50% more for the boss.
function coopFoe(dungeon, floor, party) {
  var tb = coopTable(dungeon) || ENEMIES;
  var boss = floor >= COOP.floors;
  var t;
  if (boss) t = (tb.bosses && tb.bosses[_coRnd(0, tb.bosses.length - 1)]) || tb.boss || ENEMIES.boss;
  else {
    var pool = (tb[floor <= 3 ? 't1' : floor <= 6 ? 't2' : 't3'] || tb.t1 || ENEMIES.t1).filter(function(e) { return !e.isBoss; });
    t = pool[_coRnd(0, pool.length - 1)];
  }
  var n = Math.max(1, party.length);
  var lvl = Math.max(1, Math.floor(party.reduce(function(a, p) { return a + (p.level || 1); }, 0) / n));
  var lm = lvl > 1 ? 1 + (lvl - 1) * 0.08 : 1, f = floor - 1;
  var hp = Math.round(Math.round(t.hp * (1 + f * 0.09) * lm) * (1 + 0.7 * (n - 1)) * (boss ? 1.5 : 1));
  var lo = Math.round(t.atk[0] * (1 + f * 0.06) * lm), hi = Math.round(t.atk[1] * (1 + f * 0.06) * lm);
  return { name: t.name, icon: t.icon || '💀', hp: hp, maxHp: hp, atkLo: lo, atkHi: Math.max(lo, hi), boss: boss };
}

// Everyone's actions at once, then the enemy's answer (Coop.resolve).
function coopResolve(party, foe, actions) {
  party = party.map(function(p) { return Object.assign({}, p); });
  foe = Object.assign({}, foe);
  var lines = [], defending = {};
  party.forEach(function(p) {
    if (p.hp <= 0) return;
    var a = actions[p.id] || 'attack';
    if (a === 'potion' && p.potions <= 0) a = 'attack';
    if (a === 'potion') {
      var heal = Math.round(p.maxHp * 0.4);
      p.hp = Math.min(p.maxHp, p.hp + heal); p.potions--;
      lines.push('🧪 ' + p.name + ' drinks a potion: +' + heal + ' HP (' + p.hp + ' of ' + p.maxHp + ').');
      return;
    }
    if (a === 'defend') defending[p.id] = true;
    if (foe.hp <= 0) return;
    var dmg = _coRnd(p.atkLo, p.atkHi), line;
    if (a === 'heavy') {
      if (Math.random() < 0.3) { lines.push('💥 ' + p.name + '\'s heavy strike misses!'); return; }
      dmg = Math.round(dmg * 1.8); line = '💥 ' + p.name + ' heavy strikes for ' + dmg;
    } else if (a === 'defend') {
      dmg = Math.max(1, Math.floor(dmg / 2)); line = '🛡 ' + p.name + ' defends and strikes for ' + dmg;
    } else if (Math.random() < 0.1) {
      dmg *= 2; line = '⚔ ' + p.name + ' lands a CRITICAL hit for ' + dmg;
    } else line = '⚔ ' + p.name + ' hits for ' + dmg;
    foe.hp = Math.max(0, foe.hp - dmg);
    lines.push(line + (foe.hp > 0 ? '.' : ' — ' + foe.name + ' falls!'));
  });
  if (foe.hp <= 0) return { party: party, foe: foe, lines: lines, foeDown: true, partyDown: false };
  var standing = party.filter(function(p) { return p.hp > 0; });
  if (standing.length) {
    var t = standing[_coRnd(0, standing.length - 1)];
    var d = Math.max(1, _coRnd(foe.atkLo, foe.atkHi) - Math.floor(t.def / 2));
    if (defending[t.id]) d = Math.max(1, Math.floor(d / 2));
    t.hp = Math.max(0, t.hp - d);
    lines.push(foe.icon + ' ' + foe.name + ' strikes ' + t.name + ' for ' + d + (t.hp > 0 ? ' (' + t.hp + ' of ' + t.maxHp + ' HP).' : ' — ' + t.name + ' is down!'));
  }
  var down = !party.some(function(p) { return p.hp > 0; });
  lines.push(foe.name + ': ' + foe.hp + ' of ' + foe.maxHp + ' HP.');
  return { party: party, foe: foe, lines: lines, foeDown: false, partyDown: down };
}

function coopRest(party) {
  return party.map(function(p) {
    var q = Object.assign({}, p);
    q.hp = p.hp > 0 ? Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.2)) : Math.round(p.maxHp * 0.3);
    return q;
  });
}

function coopCode() {
  var c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', s = '';
  for (var i = 0; i < 4; i++) s += c[_coRnd(0, c.length - 1)];
  return s;
}

function coopRef() { return COOP.code && window._fbRtdb ? window._fbRtdb.ref('pvp_rooms/coop_' + COOP.code) : null; }
function coopMe() { return COOP.party.filter(function(p) { return p.id === COOP.myId; })[0]; }

// ── Rooms ──
function coopHost() {
  var ch = CHARS[COOP.charIdx];
  if (!ch) { say('Choose a character first.'); return; }
  if (!window._fbRtdb) { say('Co-op needs the internet. Check your connection.'); return; }
  COOP.code = coopCode(); COOP.isHost = true; COOP.hostId = COOP.myId; COOP.dungeon = COOP.dungeons[COOP.dungeonIdx];
  var me = coopPlayer(ch), players = {}, beat = {};
  players[COOP.myId] = me; beat[COOP.myId] = _coNow();
  coopRef().set({ kind: 'coop', code: COOP.code, status: 'lobby', host: COOP.myId, dungeon: COOP.dungeon, floor: 1, round: 0,
                  createdAt: _coNow(), players: players, beat: beat }).then(function() {
    COOP.stage = 'lobby';
    try { sfx('sfx-confirm'); } catch (e) {}
    say('Room created. Your code is ' + COOP.code.split('').join(' ') + '. Share it with up to three friends, then press Start when everyone is ready.');
    coopListen();
  }).catch(function() { say('Couldn\'t create the room. Check your connection.'); });
}

function coopJoin() {
  var ch = CHARS[COOP.charIdx];
  if (!ch) { say('Choose a character first.'); return; }
  var c = ((document.getElementById('coop-code') || {}).value || '').trim().toUpperCase();
  if (c.length !== 4) { say('Enter the 4 character room code.'); return; }
  if (!window._fbRtdb) { say('Co-op needs the internet. Check your connection.'); return; }
  COOP.code = c;
  coopRef().once('value').then(function(snap) {
    var r = snap.val();
    if (!r || r.kind !== 'coop') { COOP.code = null; say('No co-op room with that code. Check it and try again.'); return; }
    if (r.status !== 'lobby') { COOP.code = null; say('That run has already started.'); return; }
    if (Object.keys(r.players || {}).length >= COOP.max) { COOP.code = null; say('That room is full.'); return; }
    coopRef().child('players/' + COOP.myId).set(coopPlayer(ch));
    coopRef().child('beat/' + COOP.myId).set(_coNow());
    COOP.stage = 'lobby';
    try { sfx('sfx-confirm'); } catch (e) {}
    say('Joined room ' + c + '. Press Ready when you\'re set. The host starts the run.');
    coopListen();
  }).catch(function() { say('Couldn\'t reach the room. Check your connection.'); });
}

function coopReady() { var r = coopRef(); if (r) r.child('players/' + COOP.myId + '/ready').set(true); say('Ready.'); }

function coopStart() {
  if (!COOP.isHost) return;
  var waiting = COOP.party.filter(function(p) { return !p.ready && p.id !== COOP.myId; });
  if (waiting.length) { say('Waiting for ' + waiting.map(function(p) { return p.name; }).join(', ') + ' to be ready.'); return; }
  var f = coopFoe(COOP.dungeon, 1, COOP.party);
  coopRef().update({ status: 'playing', floor: 1, round: 1, roundStart: _coNow(), foe: f });
  coopLog(['⚔ The party descends into ' + COOP.dungeon + '. Floor 1: ' + f.icon + ' ' + f.name + ' blocks the way, ' + f.hp + ' HP.']);
}

function coopLeave() {
  var r = coopRef();
  if (r) {
    if (COOP.isHost && (COOP.status === 'lobby' || COOP.status === 'playing')) r.child('status').set('closed');
    else if (COOP.status === 'lobby') r.child('players/' + COOP.myId).remove();
  }
  coopStop();
  COOP.stage = 'choose'; COOP.code = null; COOP.isHost = false; COOP.status = 'lobby'; COOP.party = []; COOP.foe = null;
  COOP.log = []; COOP.seen = {}; COOP.rewarded = false; COOP.myAction = null; COOP.round = 0;
  coopRender();
}

function coopStop() {
  if (COOP.timer) { clearInterval(COOP.timer); COOP.timer = null; }
  if (COOP.ref) { try { COOP.ref.off(); } catch (e) {} COOP.ref = null; }
}

function coopAct(a) {
  var m = coopMe();
  if (COOP.status !== 'playing' || !m || m.hp <= 0 || COOP.myAction) return;
  if (a === 'potion' && m.potions <= 0) { say('No potions left.'); return; }
  COOP.myAction = a;
  coopRef().child('actions/' + COOP.myId).set(a);
  try { sfx(a === 'potion' ? 'sfx-potion' : a === 'defend' ? 'sfx-select' : 'sfx-attack'); } catch (e) {}
  say({ attack: 'Attack', heavy: 'Heavy', defend: 'Defend', potion: 'Potion' }[a] + ' chosen. Waiting for the party.');
  coopRender();
}

function coopLog(lines) {
  var r = coopRef();
  if (!r) return;
  lines.forEach(function(l) { r.child('log').push({ text: l, t: _coNow() }); });
}

function coopListen() {
  coopStop();
  COOP.ref = coopRef();
  COOP.ref.on('value', function(snap) { coopReceived(snap.val()); });
  COOP.timer = setInterval(coopTick, 1000);
  coopRender();
}

function coopReceived(r) {
  if (!r) { if (COOP.stage !== 'choose') { say('The room is gone.'); COOP.stage = 'over'; coopStop(); coopRender(); } return; }
  COOP.hostId = r.host || COOP.hostId;
  COOP.dungeon = r.dungeon || COOP.dungeon;
  var nf = r.floor || COOP.floor;
  if (nf !== COOP.floor && nf >= COOP.floors && COOP.status === 'playing') { try { playTrack('boss'); } catch (e) {} }
  COOP.floor = nf;
  if ((r.round || 0) !== COOP.round) { COOP.round = r.round || 0; COOP.myAction = null; }
  COOP.roundStart = r.roundStart || COOP.roundStart;
  var before = {};
  COOP.party.forEach(function(p) { before[p.id] = true; });
  var players = [];
  Object.keys(r.players || {}).forEach(function(k) { var p = r.players[k]; if (p && p.id) players.push(p); });
  players.sort(function(a, b) { return (a.joinedAt || 0) - (b.joinedAt || 0); });
  if (COOP.party.length && COOP.stage === 'lobby') players.forEach(function(p) { if (!before[p.id] && p.id !== COOP.myId) say(p.name + ' joined the party.'); });
  COOP.party = players;
  COOP.foe = r.foe || null;
  COOP.actions = r.actions || {};
  if (COOP.actions[COOP.myId]) COOP.myAction = COOP.actions[COOP.myId];
  COOP.beats = r.beat || {};
  var keys = Object.keys(r.log || {}).sort(), fresh = [];
  keys.forEach(function(k) { if (!COOP.seen[k]) { COOP.seen[k] = true; if (r.log[k] && r.log[k].text) fresh.push(r.log[k].text); } });
  if (fresh.length) { COOP.log = fresh.slice().reverse().concat(COOP.log).slice(0, 40); say(fresh.join(' ')); }
  var st = r.status || 'lobby';
  if (st !== COOP.status) {
    COOP.status = st;
    if (st === 'playing') { COOP.stage = 'playing'; try { playTrack('battle'); } catch (e) {} }
    else if (st === 'won' || st === 'lost') { COOP.stage = 'over'; coopPayOut(st === 'won'); }
    else if (st === 'closed') { COOP.stage = 'over'; say('The host ended the run.'); coopPayOut(false); }
  }
  if (COOP.isHost) coopHostStep();
  coopRender();
}

function coopTick() {
  var r = coopRef();
  if (r) r.child('beat/' + COOP.myId).set(_coNow());
  if (COOP.isHost) coopHostStep();
  var hb = COOP.beats[COOP.hostId];
  if (!COOP.isHost && (COOP.status === 'lobby' || COOP.status === 'playing') && hb && _coNow() - hb > 60000) {
    COOP.status = 'closed'; COOP.stage = 'over';
    say('The host left, so the run is over.');
    coopPayOut(false); coopStop(); coopRender();
  }
}

// ── The host runs the fight ──
function coopHostStep() {
  if (!COOP.isHost || COOP.status !== 'playing' || COOP.resolving || !COOP.foe || COOP.foe.hp <= 0 || COOP.round <= 0) return;
  var standing = COOP.party.filter(function(p) { return p.hp > 0; });
  var allIn = standing.every(function(p) { return COOP.actions[p.id]; });
  var timedOut = _coNow() - COOP.roundStart > COOP.roundMs;
  if (!allIn && !timedOut) return;
  COOP.resolving = true;
  var res = coopResolve(COOP.party, COOP.foe, COOP.actions), lines = res.lines;
  if (timedOut && !allIn) lines.unshift('⏱ Time\'s up — anyone who hadn\'t chosen attacks.');
  var u = { foe: res.foe, actions: null };
  res.party.forEach(function(p) { u['players/' + p.id + '/hp'] = p.hp; u['players/' + p.id + '/potions'] = p.potions; });
  if (res.foeDown) {
    if (COOP.floor >= COOP.floors) {
      lines.push('👑 ' + res.foe.name + ' is defeated! The party has conquered ' + COOP.dungeon + '!');
      u.status = 'won';
    } else {
      lines.push('✨ Floor ' + COOP.floor + ' cleared! Everyone heals, and the fallen get back up.');
      u.round = 0;
      var next = COOP.floor + 1, rested = coopRest(res.party);
      setTimeout(function() {
        if (COOP.status !== 'playing') return;
        var f = coopFoe(COOP.dungeon, next, rested);
        var u2 = { floor: next, round: 1, roundStart: _coNow(), foe: f };
        rested.forEach(function(p) { u2['players/' + p.id + '/hp'] = p.hp; });
        coopRef().update(u2);
        coopLog([f.boss ? '👑 Floor ' + next + ': the boss, ' + f.icon + ' ' + f.name + ', ' + f.hp + ' HP. This is it.'
                        : '⬇ Floor ' + next + ': ' + f.icon + ' ' + f.name + ', ' + f.hp + ' HP.']);
      }, 3000);
    }
  } else if (res.partyDown) {
    lines.push('💀 The whole party has fallen on floor ' + COOP.floor + '.');
    u.status = 'lost';
  } else {
    u.round = COOP.round + 1;
    u.roundStart = _coNow();
  }
  coopRef().update(u).then(function() { COOP.resolving = false; }).catch(function() { COOP.resolving = false; });
  coopLog(lines);
}

// ── Rewards, on each player's own device ──
function coopPayOut(won) {
  if (COOP.rewarded) return;
  COOP.rewarded = true;
  var cleared = won ? COOP.floors : Math.max(0, COOP.floor - 1);
  var gold = 100 * cleared + (won ? 1000 : 0);
  if (gold > 0) addGlobalGold(gold);
  if (typeof bpRecord === 'function') {
    for (var i = 0; i < cleared; i++) { bpRecord('floor'); if (!won || i < cleared - 1) bpRecord('kill', {}); }
    if (won) { bpRecord('kill', { boss: true }); bpRecord('clear'); }
  }
  if (won) { try { sfx('sfx-victory'); } catch (e) {} }
  try { playTrack(getMenuTrack()); } catch (e) {}
  var text = won ? 'Victory! The party cleared all ' + COOP.floors + ' floors. You earn ' + gold + ' gold.'
    : cleared > 0 ? 'The run is over after ' + cleared + ' floor' + (cleared === 1 ? '' : 's') + '. You earn ' + gold + ' gold.' : 'The run is over.';
  COOP.endText = text;
  setTimeout(function() { say(text); }, 1500);
  if (COOP.isHost) { var ref = coopRef(); setTimeout(function() { try { ref.remove(); } catch (e) {} }, 120000); }
}

// ── The screen ──
function openCoop() {
  var el = document.getElementById('screen-coop');
  if (!el) {
    el = document.createElement('div');
    el.id = 'screen-coop'; el.className = 'screen';
    el.setAttribute('role', 'main'); el.setAttribute('aria-label', 'Co-op Dungeon');
    var anchor = document.getElementById('screen-void-reaper');
    (anchor && anchor.parentNode ? anchor.parentNode : document.body).insertBefore(el, anchor || null);
  }
  goTo('coop');
  coopRender();
  say('Co-op Dungeon. Fight through ten floors with up to three friends, on the web or the app. Choose a character, then host a room or join one with its code.');
}

function _coBtn(label, onclick, aria, primary, selected) {
  return '<button class="menu-btn' + (primary ? ' primary' : '') + (selected ? ' selected' : '') + '" style="width:100%;margin-bottom:6px;"' +
    (selected !== undefined ? ' role="radio" aria-checked="' + (selected ? 'true' : 'false') + '"' : '') +
    ' onclick="' + onclick + '" aria-label="' + _u119Esc(aria || label) + '">' + _u119Esc(label) + '</button>';
}
function _coH(t) { return '<h3 style="font-family:Cinzel,serif;font-size:0.7rem;letter-spacing:0.2em;color:var(--gold-dim);margin:14px 0 6px;">' + t + '</h3>'; }
function _coBar(v, c) { return '<div aria-hidden="true" style="background:#111;height:8px;margin:3px 0;"><div style="background:' + c + ';height:100%;width:' + Math.round(Math.max(0, Math.min(1, v)) * 100) + '%;"></div></div>'; }

function coopRender() {
  var el = document.getElementById('screen-coop');
  if (!el) return;
  var h = '<div style="max-width:440px;margin:0 auto;padding:20px 16px;">' +
    '<div class="screen-header"><button class="back-btn" onclick="coopLeave();goTo(\'menu\')" aria-label="Leave co-op and go back to the main menu">← Menu</button>' +
    '<h2 class="screen-title" style="color:#66ddcc;">🤝 Co-op Dungeon</h2></div>';
  if (COOP.stage === 'choose') {
    if (!CHARS.length) h += '<p style="color:#aaa;">Create a character first.</p>';
    else {
      h += _coH('YOUR CHARACTER');
      CHARS.forEach(function(ch, i) {
        var s = typeof prestigeStars === 'function' ? prestigeStars(ch) : 0;
        h += _coBtn(ch.name + (s ? ' ★' + s : '') + ' — ' + ch.cls + ' (Lv ' + (ch.persistLevel || 1) + ')', 'COOP.charIdx=' + i + ';say(\'' + _u119Esc(ch.name).replace(/'/g, '') + ' selected.\');coopRender()', null, false, i === COOP.charIdx);
      });
      h += _coH('HOST A ROOM');
      COOP.dungeons.forEach(function(d, i) { h += _coBtn(d, 'COOP.dungeonIdx=' + i + ';say(\'' + d.replace(/'/g, '') + ' selected.\');coopRender()', null, false, i === COOP.dungeonIdx); });
      h += _coBtn('🤝 Host a Room', 'coopHost()', 'Host a co-op room in ' + COOP.dungeons[COOP.dungeonIdx], true);
      h += _coH('JOIN A FRIEND') + '<div style="display:flex;gap:6px;"><input id="coop-code" maxlength="4" autocapitalize="characters" aria-label="Room code, 4 letters" placeholder="Room code" style="flex:1;background:#111;border:1px solid #333;color:#ddd;font-family:Cinzel,serif;padding:8px;text-transform:uppercase;">' +
        '<button class="menu-btn primary" onclick="coopJoin()" aria-label="Join the room">Join</button></div>';
    }
  } else if (COOP.stage === 'lobby') {
    h += '<p style="font-family:Cinzel,serif;font-size:1.1rem;color:#66ddcc;" aria-label="Room code: ' + (COOP.code || '').split('').join(' ') + '">Room code: ' + COOP.code + '</p>' +
      '<p style="font-family:\'Crimson Text\',serif;font-style:italic;color:#aaa;">' + _u119Esc(COOP.dungeon) + ' · up to ' + COOP.max + ' players</p>' + _coH('THE PARTY');
    COOP.party.forEach(function(p) {
      var ok = p.ready || (COOP.isHost && p.id === COOP.myId);
      h += '<p style="font-family:\'Crimson Text\',serif;color:#bbb;">' + (ok ? '✓ ' : '… ') + _u119Esc(p.name) + ' — ' + _u119Esc(p.cls) + ', Lv ' + p.level + ', ' + p.maxHp + ' HP' + (p.id === COOP.myId ? ' (you)' : '') + '</p>';
    });
    var me = coopMe();
    if (COOP.isHost) h += _coBtn('⚔ Start the Run', 'coopStart()', null, true);
    else if (!(me && me.ready)) h += _coBtn('✓ Ready', 'coopReady()', null, true);
    else h += '<p style="color:#666;font-style:italic;">Waiting for the host to start.</p>';
    h += _coBtn('Leave the Room', 'coopLeave()');
  } else if (COOP.stage === 'playing') {
    var f = COOP.foe;
    h += '<p style="font-family:Cinzel,serif;font-size:0.75rem;color:#ffdd44;">Floor ' + COOP.floor + ' of ' + COOP.floors + ' · ' + _u119Esc(COOP.dungeon) + '</p>';
    if (f) h += '<div tabindex="0" aria-label="' + _u119Esc(f.name + (f.boss ? ', the boss' : '') + '. ' + f.hp + ' of ' + f.maxHp + ' HP.') + '" style="border:1px solid #5a2020;padding:10px;margin-bottom:10px;">' +
      '<div aria-hidden="true" style="font-family:Cinzel,serif;color:#e08080;">' + f.icon + ' ' + _u119Esc(f.name) + (f.boss ? ' — BOSS' : '') + '</div>' + _coBar(f.hp / f.maxHp, '#cc3333') +
      '<div aria-hidden="true" style="font-family:Cinzel,serif;font-size:0.7rem;color:#aaa;">' + f.hp + ' / ' + f.maxHp + ' HP</div></div>';
    h += _coH('THE PARTY');
    COOP.party.forEach(function(p) {
      var you = p.id === COOP.myId ? ', you' : '';
      h += '<div tabindex="0" aria-label="' + _u119Esc(p.name + you + '. ' + (p.hp > 0 ? p.hp + ' of ' + p.maxHp + ' HP. ' + p.potions + ' potions.' : 'Down until the next floor.')) + '">' +
        '<div aria-hidden="true" style="font-family:Cinzel,serif;font-size:0.75rem;color:' + (p.hp > 0 ? '#ddd' : '#885555') + ';">' + _u119Esc(p.name) + (you ? ' (you)' : '') + (p.hp > 0 ? '' : ' — DOWN') + '</div>' + _coBar(p.hp / p.maxHp, '#44cc44') + '</div>';
    });
    var m = coopMe();
    if (m && m.hp > 0) {
      // The buttons stay after you choose (disabled), so the screen reader
      // stays on the one you pressed instead of jumping away.
      var picked = COOP.myAction;
      function act(id, label, aria, primary) {
        var b = _coBtn(label, picked ? '' : "coopAct('" + id + "')", aria + (picked === id ? '. Chosen.' : ''), primary);
        return picked ? b.replace('<button ', '<button aria-disabled="true" ') : b;
      }
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;">' +
        act('attack', '⚔ Attack', 'Attack, ' + m.atkLo + ' to ' + m.atkHi + ' damage', true) +
        act('heavy', '💥 Heavy', 'Heavy strike, much harder but can miss', true) +
        act('defend', '🛡 Defend', 'Defend: strike for half and take half') +
        act('potion', '🧪 Potion (' + m.potions + ')', 'Potion, heal 40 percent. ' + m.potions + ' left.') + '</div>';
      if (picked) {
        var waiting = COOP.party.filter(function(p) { return p.hp > 0 && !COOP.actions[p.id]; }).map(function(p) { return p.name; });
        h += '<p style="font-style:italic;color:#888;margin-top:10px;">You chose ' + picked + '. Waiting for ' + (waiting.length ? _u119Esc(waiting.join(', ')) : 'the round') + '.</p>';
      }
    } else h += '<p style="font-style:italic;color:#888;">You\'re down. You get back up on the next floor.</p>';
    h += _coH('WHAT HAPPENED') + '<div aria-label="Co-op log">' + COOP.log.slice(0, 12).map(function(l) {
      return '<div style="font-family:\'Crimson Text\',serif;font-size:0.85rem;color:#aaa;">' + _u119Esc(l) + '</div>'; }).join('') + '</div>';
    h += _coBtn('Leave the Run', 'coopLeave()');
  } else {
    var won = COOP.status === 'won';
    h += '<h3 style="font-family:\'Cinzel Decorative\',cursive;color:' + (won ? '#44ff88' : '#aa4444') + ';">' + (won ? '👑 VICTORY' : 'The run is over') + '</h3>' +
      (COOP.endText ? '<p style="color:#bbb;">' + _u119Esc(COOP.endText) + '</p>' : '') +
      _coBtn('🤝 Play Again', 'coopLeave()', null, true) + _coBtn('← Main Menu', "coopLeave();goTo('menu')");
  }
  // Nothing changed (most room updates are only heartbeats): don't redraw,
  // or the screen reader loses its place.
  if (h === COOP._lastHtml && el.innerHTML) return;
  COOP._lastHtml = h;
  // Keep focus where it was when the screen redraws.
  var focusedLabel = document.activeElement && document.activeElement.closest && document.activeElement.closest('#screen-coop') ? document.activeElement.getAttribute('aria-label') : null;
  var typed = (document.getElementById('coop-code') || {}).value;
  el.innerHTML = h + '</div>';
  if (typed) { var inp = document.getElementById('coop-code'); if (inp) inp.value = typed; }
  if (focusedLabel) {
    var again = Array.prototype.filter.call(el.querySelectorAll('[aria-label]'), function(n) { return n.getAttribute('aria-label') === focusedLabel; })[0];
    if (again) try { again.focus(); } catch (e) {}
  }
}
