//═════════════════
// COMMUNITY DUNGEONS (12.1, the same as the apps)
//═════════════════
// A player builds a dungeon on top of one of the game's own (its rooms, loot
// and strength): a name, up to four community enemies that roam it, one of
// them (or none) as the floor 10 boss, one special rule and its music.
// Others play it like a challenge: the character's own dungeon and floor are
// put back afterwards, and it never unlocks anything. Community enemies take
// the place of the dungeon's own in 45% of fights at the same strength (only
// the name, look and story change), so a dungeon can't be made trivially easy.
// Stored where the apps keep them: the Realtime Database, "pvp_rooms/cdun_<id>",
// kind "cdungeon". Plays, clears and likes are counted with transactions.

var CDUN = { all: [], loading: false, failed: false, page: 'list', msg: '', pick: null, charIdx: 0,
  form: { name: '', desc: '', creator: '', base: 'Crypt of Malachar', enemies: [], boss: null, rule: null, music: null } };
var CDUN_MAX_ENEMIES = 4, CDUN_SHARE = 0.45;
var CDUN_MUSIC = [['spire', 'The Spire'], ['graveyard', 'The Graveyard'], ['chronicles', 'The Chronicles'], ['bestiary', 'The Bestiary'],
  ['hunter-theme', 'The Hunter'], ['shadow-stalker', 'The Darkness Swallower'], ['boss', 'Boss Battle'], ['raid', 'The Raid'],
  ['mine-explore', 'The Mine'], ['tavern', 'Tavern Songs'], ['help', 'The Guide']];

function _cdE(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return '&#' + c.charCodeAt(0) + ';'; }); }
function _cdRoot() { return window._fbRtdb ? window._fbRtdb.ref('pvp_rooms') : null; }
function _cdLs(k) { try { return JSON.parse(DDStore.getItem(k) || '[]'); } catch (e) { return []; } }
function _cdLsAdd(k, v) { var l = _cdLs(k); if (l.indexOf(v) === -1) { l.push(v); DDStore.setItem(k, JSON.stringify(l)); } }
function cdMusicChoices() { return CDUN_MUSIC.filter(function(m) { return typeof TRACK_FILES !== 'undefined' && TRACK_FILES[m[0]]; }); }

function cdLoad() {
  var root = _cdRoot();
  if (!root) { CDUN.failed = true; return Promise.resolve(); }
  CDUN.loading = true;
  return root.orderByChild('kind').equalTo('cdungeon').once('value').then(function(snap) {
    var list = [], blocked = _cdLs('dd_blocked_players'), hidden = _cdLs('dd_hidden_dungeons');
    snap.forEach(function(c) {
      var v = c.val() || {};
      if (v.kind !== 'cdungeon' || !v.name || !v.base || v.approved === false) return;
      if (blocked.indexOf(String(v.creator || '').trim().toLowerCase()) !== -1 || hidden.indexOf(c.key) !== -1) return;
      list.push({ id: c.key, name: v.name, desc: v.desc || '', creator: v.creator || 'Unknown', base: v.base,
        enemies: v.enemies || [], boss: v.boss || null, rule: v.rule || null, music: v.music || null,
        likes: v.likes || 0, plays: v.plays || 0, clears: v.clears || 0, createdAt: v.createdAt || 0 });
    });
    CDUN.all = list.sort(function(a, b) { return (b.plays + 3 * b.likes) - (a.plays + 3 * a.likes) || b.createdAt - a.createdAt; });
    CDUN.loading = false; CDUN.failed = false;
  }).catch(function() { CDUN.loading = false; CDUN.failed = true; });
}

function cdBump(id, key) {
  var root = _cdRoot(); if (!root) return;
  root.child(id).child(key).transaction(function(n) { return (n || 0) + 1; }).catch(function() {});
}

function cdSummary(d) {
  function p(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  return d.name + ', by ' + d.creator + '. Built on ' + d.base + '. ' + p(d.plays, 'play') + ', ' + p(d.clears, 'clear') + ', ' + p(d.likes, 'like') + '.';
}

// ── The screen ──
function cdEnsureScreen() {
  if (document.getElementById('screen-community-dungeons')) return;
  var el = document.createElement('div');
  el.id = 'screen-community-dungeons'; el.className = 'screen';
  el.setAttribute('role', 'main'); el.setAttribute('aria-label', 'Community Dungeons');
  el.innerHTML = '<div id="cdun-body" style="max-width:540px;margin:0 auto;padding:20px 16px;"></div>';
  document.body.appendChild(el);
}

function _cdBtn(label, onclick, aria, primary) {
  return '<button class="' + (primary ? 'menu-btn primary' : 'btn-ghost') + '" style="width:100%;margin-top:8px;" onclick="' + onclick + '" aria-label="' + _cdE(aria || label) + '">' + _cdE(label) + '</button>';
}
function _cdChoice(label, selected, onclick, aria) {
  return '<button class="btn-ghost" role="radio" aria-checked="' + (selected ? 'true' : 'false') + '" style="width:100%;margin-top:4px;text-align:left;' +
    (selected ? 'border-color:#c8a832;color:#ffdd88;' : '') + '" onclick="' + onclick + '" aria-label="' + _cdE(aria || label) + '">' + (selected ? '✓ ' : '') + _cdE(label) + '</button>';
}
function _cdHead(title, sub, back, backAria) {
  return '<div class="screen-header"><button class="back-btn" onclick="' + back + '" aria-label="' + _cdE(backAria) + '">' + (back.indexOf('menu') !== -1 ? '← Menu' : '← Back') + '</button></div>' +
    '<h2 class="screen-title" style="color:#d0a060;">' + _cdE(title) + '</h2>' + (sub ? '<p style="font-family:\'Crimson Text\',serif;font-style:italic;color:#aaa;">' + _cdE(sub) + '</p>' : '');
}

function cdRender() {
  var b = document.getElementById('cdun-body'); if (!b) return;
  var h = '';
  if (CDUN.page === 'list') {
    h += _cdHead('🏰 Community Dungeons', 'Dungeons built by players. Playing one never moves your character\'s own progress.', "goTo('menu')", 'Back to main menu');
    h += _cdBtn('🛠 Build a Dungeon', "cdGo('build')", 'Build your own dungeon', true);
    if (CDUN.loading) h += '<p style="color:#777;margin-top:12px;">Loading dungeons...</p>';
    else if (CDUN.failed) h += '<p style="color:#aaa;margin-top:12px;">Couldn\'t load the dungeons. Check your connection.</p>';
    else if (!CDUN.all.length) h += '<p style="color:#aaa;font-style:italic;margin-top:12px;">No community dungeons yet. Build the first one!</p>';
    CDUN.all.forEach(function(d, i) {
      h += '<button class="btn-ghost" style="display:block;width:100%;text-align:left;margin-top:8px;padding:12px;" onclick="cdOpen(' + i + ')" aria-label="' + _cdE(cdSummary(d)) + '">' +
        '<div style="font-family:Cinzel,serif;font-size:0.78rem;color:#e0c080;">🏰 ' + _cdE(d.name) + '</div>' +
        '<div style="font-family:Cinzel,serif;font-size:0.58rem;color:#909090;">by ' + _cdE(d.creator) + ' · ' + _cdE(d.base) + ' · ▶ ' + d.plays + ' · ✓ ' + d.clears + ' · ♥ ' + d.likes + '</div></button>';
    });
  } else if (CDUN.page === 'detail') {
    var d = CDUN.pick, rule = d.rule && RUN_MODIFIERS.filter(function(m) { return m.id === d.rule; })[0];
    var mus = d.music && CDUN_MUSIC.filter(function(m) { return m[0] === d.music; })[0];
    h += _cdHead('🏰 ' + d.name, d.desc, "cdGo('list')", 'Back to community dungeons');
    h += '<p style="font-family:\'Crimson Text\',serif;color:#ccc;">By ' + _cdE(d.creator) + '. Built on ' + _cdE(d.base) + '. ' + d.enemies.length + ' community enemies roam it' + (d.boss ? ', and one of them waits as the boss.' : '.') + '</p>';
    if (rule) h += '<p style="font-family:\'Crimson Text\',serif;color:#ccc;">Rule: ' + _cdE(rule.icon + ' ' + rule.name + ' — ' + rule.desc) + '</p>';
    if (mus) h += '<p style="font-family:\'Crimson Text\',serif;color:#ccc;">Music: ' + _cdE(mus[1]) + '</p>';
    h += '<p style="font-family:Cinzel,serif;font-size:0.62rem;color:var(--gold-dim);letter-spacing:0.15em;margin-top:12px;">CHOOSE YOUR CHAMPION</p>';
    (CHARS || []).forEach(function(c, i) {
      h += _cdChoice(c.name + ' — ' + c.cls + ' (Lv ' + (c.persistLevel || c.level || 1) + ')', i === CDUN.charIdx, 'cdPickChar(' + i + ')');
    });
    if (!(CHARS || []).length) h += '<p style="color:#aaa;">Create a character first.</p>';
    else h += _cdBtn('⚔ Play ' + d.name, 'cdPlay()', 'Play ' + d.name, true);
    var liked = _cdLs('dd_liked_dungeons').indexOf(d.id) !== -1;
    h += _cdBtn(liked ? '♥ Liked' : '♥ Like', 'cdLike()', liked ? 'You already liked ' + d.name : 'Like ' + d.name);
    h += _cdBtn('Report', 'cdReport()', 'Report ' + d.name);
    if (window._fbAuth && window._fbAuth.currentUser && window._fbAuth.currentUser.uid === 'WgqZGmnPKeYIymlMkx0aAg8G2T52')
      h += _cdBtn('Developer: remove for everyone', 'cdDevRemove()', 'Developer: remove ' + d.name + ' for everyone');
  } else if (CDUN.page === 'build') {
    var f = CDUN.form, dungeons = getUnlockedDungeons(), pool = _communityEnemyCache || [];
    h += _cdHead('🛠 Build a Dungeon', 'Pick a dungeon to build on, the community enemies that roam it, a boss, a rule and music. Enemies fight at the dungeon\'s own strength.', "cdGo('list')", 'Back to community dungeons');
    h += '<label for="cd-name" style="font-family:Cinzel,serif;font-size:0.6rem;color:var(--gold-dim);">NAME</label><input id="cd-name" maxlength="30" value="' + _cdE(f.name) + '" aria-label="Dungeon name, up to 30 letters" style="width:100%;padding:10px;margin:4px 0 8px;background:#0a0800;border:1px solid #443300;color:#ddd;">' +
      '<label for="cd-desc" style="font-family:Cinzel,serif;font-size:0.6rem;color:var(--gold-dim);">DESCRIPTION</label><textarea id="cd-desc" maxlength="160" rows="2" aria-label="Description, up to 160 letters" style="width:100%;padding:10px;margin:4px 0 8px;background:#0a0800;border:1px solid #443300;color:#ddd;">' + _cdE(f.desc) + '</textarea>' +
      '<label for="cd-creator" style="font-family:Cinzel,serif;font-size:0.6rem;color:var(--gold-dim);">YOUR NAME</label><input id="cd-creator" maxlength="20" value="' + _cdE(f.creator || DDStore.getItem('dd_chat_username') || '') + '" aria-label="Your creator name" style="width:100%;padding:10px;margin:4px 0 8px;background:#0a0800;border:1px solid #443300;color:#ddd;">';
    h += '<h3 style="font-family:Cinzel,serif;font-size:0.65rem;color:var(--gold-dim);margin-top:10px;">BUILT ON</h3><div role="radiogroup" aria-label="Dungeon to build on">';
    dungeons.forEach(function(d, i) { h += _cdChoice(d, f.base === d, 'cdSet(\'base\',' + i + ')'); });
    h += '</div><h3 style="font-family:Cinzel,serif;font-size:0.65rem;color:var(--gold-dim);margin-top:10px;">ENEMIES (' + f.enemies.length + ' of ' + CDUN_MAX_ENEMIES + ')</h3>';
    if (!pool.length) h += '<p style="color:#aaa;">Loading community enemies...</p>';
    pool.forEach(function(e, i) {
      var on = f.enemies.indexOf(e._id) !== -1;
      h += '<button class="btn-ghost" role="checkbox" aria-checked="' + on + '" style="width:100%;margin-top:4px;text-align:left;' + (on ? 'border-color:#c8a832;color:#ffdd88;' : '') + '" onclick="cdToggleEnemy(' + i + ')" aria-label="' +
        _cdE(e.name + ', ' + e.type + ', by ' + e.creator) + '">' + (on ? '✓ ' : '') + _cdE((e.icon || '👤') + ' ' + e.name + ' · ' + e.type + ' · by ' + e.creator) + '</button>';
    });
    h += '<h3 style="font-family:Cinzel,serif;font-size:0.65rem;color:var(--gold-dim);margin-top:10px;">BOSS</h3><div role="radiogroup" aria-label="Boss">' +
      _cdChoice(f.base + '\'s own boss', !f.boss, 'cdSet(\'boss\',-1)');
    pool.forEach(function(e, i) { if (f.enemies.indexOf(e._id) !== -1) h += _cdChoice(e.name + ' as the boss', f.boss === e._id, 'cdSet(\'boss\',' + i + ')'); });
    h += '</div><h3 style="font-family:Cinzel,serif;font-size:0.65rem;color:var(--gold-dim);margin-top:10px;">RULE</h3><div role="radiogroup" aria-label="Rule">' + _cdChoice('No rule', !f.rule, 'cdSet(\'rule\',-1)');
    RUN_MODIFIERS.forEach(function(m, i) { h += _cdChoice(m.icon + ' ' + m.name + ' — ' + m.desc, f.rule === m.id, 'cdSet(\'rule\',' + i + ')'); });
    h += '</div><h3 style="font-family:Cinzel,serif;font-size:0.65rem;color:var(--gold-dim);margin-top:10px;">MUSIC</h3><div role="radiogroup" aria-label="Music">' + _cdChoice(f.base + '\'s own music', !f.music, 'cdSet(\'music\',-1)');
    cdMusicChoices().forEach(function(m, i) { h += _cdChoice(m[1], f.music === m[0], 'cdSet(\'music\',' + i + ')', m[1] + '. Plays a preview.'); });
    h += '</div>' + _cdBtn('🏰 Publish Dungeon', 'cdPublish()', 'Publish dungeon', true);
  }
  if (CDUN.msg) h += '<p role="status" style="font-family:Cinzel,serif;font-size:0.7rem;color:#a0d4a0;text-align:center;margin-top:10px;">' + _cdE(CDUN.msg) + '</p>';
  b.innerHTML = h;
}

function _cdKeepForm() {
  var f = CDUN.form, g = function(id) { var e = document.getElementById(id); return e ? e.value : null; };
  if (g('cd-name') != null) f.name = g('cd-name'); if (g('cd-desc') != null) f.desc = g('cd-desc'); if (g('cd-creator') != null) f.creator = g('cd-creator');
}

function cdGo(page) {
  _cdKeepForm();
  CDUN.page = page; CDUN.msg = '';
  try { sfx('sfx-select'); } catch (e) {}
  cdRender(); window.scrollTo(0, 0);
  if (page === 'list') {
    say('Community Dungeons. Loading.');
    cdLoad().then(function() {
      if (CDUN.page !== 'list') return;
      cdRender();
      say(CDUN.failed ? 'Couldn\'t load the dungeons. Check your connection.' : CDUN.all.length ? CDUN.all.length + ' community dungeons.' : 'No community dungeons yet. Build the first one!');
    });
  } else if (page === 'build') {
    say('Build a Dungeon. Name it, pick what it\'s built on, its enemies, a boss, a rule and music.');
    loadCommunityEnemies().then(function() { if (CDUN.page === 'build') { _cdKeepForm(); cdRender(); } });
  }
  setTimeout(function() { var x = document.querySelector('#cdun-body button'); if (x) x.focus(); }, 80);
}

function cdOpen(i) { CDUN.pick = CDUN.all[i]; if (!CDUN.pick) return; cdGo('detail'); say(cdSummary(CDUN.pick) + ' ' + (CDUN.pick.desc || '')); }
function cdPickChar(i) { CDUN.charIdx = i; cdRender(); say((CHARS[i] || {}).name + ' selected.'); }

function cdSet(key, i) {
  _cdKeepForm();
  var f = CDUN.form, pool = _communityEnemyCache || [];
  if (key === 'base') { f.base = getUnlockedDungeons()[i] || f.base; say('Built on ' + f.base + '.'); }
  if (key === 'boss') { f.boss = i < 0 ? null : (pool[i] && pool[i]._id); say(i < 0 ? 'The dungeon\'s own boss.' : pool[i].name + ' is the boss.'); }
  if (key === 'rule') { var m = RUN_MODIFIERS[i]; f.rule = i < 0 ? null : m.id; say(i < 0 ? 'No rule.' : m.name + '.'); }
  if (key === 'music') { var mu = cdMusicChoices()[i]; f.music = i < 0 ? null : mu[0]; try { playTrack(i < 0 ? getMenuTrack() : mu[0]); } catch (e) {} say(i < 0 ? 'The dungeon\'s own music.' : mu[1] + '.'); }
  cdRender();
}

function cdToggleEnemy(i) {
  _cdKeepForm();
  var f = CDUN.form, e = (_communityEnemyCache || [])[i]; if (!e) return;
  var at = f.enemies.indexOf(e._id);
  if (at !== -1) { f.enemies.splice(at, 1); if (f.boss === e._id) f.boss = null; say(e.name + ' removed.'); }
  else if (f.enemies.length >= CDUN_MAX_ENEMIES) { say('Choose up to ' + CDUN_MAX_ENEMIES + ' enemies.'); return; }
  else { f.enemies.push(e._id); say(e.name + ' added. ' + f.enemies.length + ' of ' + CDUN_MAX_ENEMIES + '.'); }
  cdRender();
}

function cdPublish() {
  _cdKeepForm();
  var f = CDUN.form, name = f.name.trim(), desc = f.desc.trim(), creator = f.creator.trim();
  var problem = !name ? 'Please give your dungeon a name.' : name.length < 2 ? 'The name is too short.' : !desc ? 'Please add a description.'
    : !creator ? 'Please enter your creator name.' : creator.length < 2 ? 'Creator name is too short.'
    : (ecContainsBadWord(name) || ecContainsBadWord(desc) || ecContainsBadWord(creator)) ? 'Your submission contains inappropriate content. Please revise and try again.'
    : !f.enemies.length ? 'Choose at least one enemy to roam your dungeon.' : null;
  if (problem) { CDUN.msg = problem; cdRender(); say(problem); return; }
  var id = 'cdun_' + (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 12);
  var data = { kind: 'cdungeon', name: name.slice(0, 30), desc: desc.slice(0, 160), creator: creator, base: f.base, enemies: f.enemies.slice(0, CDUN_MAX_ENEMIES),
    likes: 0, plays: 0, clears: 0, createdAt: Date.now(), approved: true };
  if (f.boss) data.boss = f.boss; if (f.rule) data.rule = f.rule; if (f.music) data.music = f.music;
  _cdRoot().child(id).set(data).then(function() {
    _cdLsAdd('dd_my_dungeons', id);
    try { sfx('sfx-victory'); } catch (e) {}
    CDUN.form = { name: '', desc: '', creator: creator, base: 'Crypt of Malachar', enemies: [], boss: null, rule: null, music: null };
    cdGo('list');
    say(name + ' is published. Players can find it in Community Dungeons.');
  }).catch(function() { CDUN.msg = 'Couldn\'t publish it. Check your connection and try again.'; cdRender(); say(CDUN.msg); });
}

function cdLike() {
  var d = CDUN.pick; if (!d) return;
  if (_cdLs('dd_liked_dungeons').indexOf(d.id) !== -1) { say('You already liked ' + d.name + '.'); return; }
  _cdLsAdd('dd_liked_dungeons', d.id); cdBump(d.id, 'likes'); d.likes++;
  try { sfx('sfx-confirm'); } catch (e) {}
  cdRender(); say('You liked ' + d.name + '.');
}

function cdReport() {
  var d = CDUN.pick; if (!d) return;
  _cdLsAdd('dd_hidden_dungeons', d.id);
  fetch('https://formspree.io/f/mkjnkenn', { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'Content report: dungeon', platform: 'web', email: 'no-reply@dungen-descent.org',
      message: 'REPORTED DUNGEON\nAuthor: ' + d.creator + '\nContent: ' + d.name + ': ' + d.desc + '\nID: ' + d.id + '\nTime: ' + new Date().toISOString() }) })
    .then(function(r) { say(r.ok ? 'Report sent. Thank you. It is hidden for you now.' : 'The report could not be sent. It is hidden for you now.'); })
    .catch(function() { say('The report could not be sent. It is hidden for you now.'); });
  CDUN.all = CDUN.all.filter(function(x) { return x.id !== d.id; });
  CDUN.page = 'list'; cdRender();
}

function cdDevRemove() {
  var d = CDUN.pick; if (!d || !confirm('Remove ' + d.name + ' for everyone?')) return;
  _cdRoot().child(d.id).update({ approved: false, moderatedAt: Date.now() }).then(function() { say('The dungeon is removed for everyone.'); cdGo('list'); })
    .catch(function(e) { say('Couldn\'t change it.'); });
}

// ── Playing one ──
function cdPlay() {
  var d = CDUN.pick, ch = CHARS[CDUN.charIdx];
  if (!d || !ch) { say('Please select a character.'); return; }
  say('Gathering ' + d.name + '\'s enemies.');
  var db = window._fbDb, ids = (d.enemies || []).concat(d.boss && d.enemies.indexOf(d.boss) === -1 ? [d.boss] : []);
  Promise.all(ids.map(function(id) { return db ? db.collection('community_enemies').doc(id).get().then(function(s) { return s.exists && s.data().approved !== false ? Object.assign({ _id: id }, s.data()) : null; }).catch(function() { return null; }) : null; }))
    .then(function(found) {
      var roster = found.filter(Boolean);
      _charIdx = CDUN.charIdx;
      // Put back afterwards: playing someone's dungeon never moves your own progress.
      ch._cdOrig = { dungeon: ch.dungeon, floor: ch.floor, completed: !!ch.completed, ngPlusActive: !!ch.ngPlusActive, midRunSave: ch.midRunSave || null };
      ch.dungeon = d.base; ch.floor = 1; ch.midRunSave = null; ch.completed = false; ch.ngPlusActive = false;
      saveChars();
      initDungeon(ch);
      DS._communityDungeon = d;
      DS._cdRoster = roster;
      if (d.rule) { var m = RUN_MODIFIERS.filter(function(x) { return x.id === d.rule; })[0]; if (m) { try { m.apply(); } catch (e) {} } }
      cdBump(d.id, 'plays');
      goTo('dungeon');
      say(d.name + ', by ' + d.creator + '. Built on ' + d.base + '. ' + (roster.length ? roster.map(function(e) { return e.name; }).join(', ') + ' roam its halls.' : '') +
        (d.rule ? ' Rule: ' + d.rule + '.' : '') + ' Your character\'s own progress is kept safe.');
    });
}

// A normal enemy of the base dungeon wearing a community enemy's name, look and story (45% of fights).
function cdDress(enemy) {
  var r = DS._cdRoster || [];
  if (!DS._communityDungeon || !r.length || !enemy || Math.random() >= CDUN_SHARE) return enemy;
  var ce = r[Math.floor(Math.random() * r.length)];
  enemy.name = ce.name; enemy.icon = ce.icon || '👤'; enemy.desc = ce.desc; enemy._communityId = ce._id; enemy._creator = ce.creator;
  return enemy;
}
function cdDressBoss(boss) {
  var d = DS._communityDungeon; if (!d || !d.boss || !boss) return;
  var ce = (DS._cdRoster || []).filter(function(e) { return e._id === d.boss; })[0]; if (!ce) return;
  boss.name = ce.name; boss.icon = ce.icon || '👤'; boss.desc = ce.desc; boss._communityId = ce._id; boss._creator = ce.creator;
}

// Puts a character's own dungeon and floor back after a community run.
function cdRestore(ch) {
  if (!ch || !ch._cdOrig) return;
  var o = ch._cdOrig;
  ch.dungeon = o.dungeon; ch.floor = o.floor; ch.completed = o.completed; ch.ngPlusActive = o.ngPlusActive; ch.midRunSave = o.midRunSave;
  delete ch._cdOrig;
  saveChars();
}
function cdRestoreAll() { (CHARS || []).forEach(function(c) { if (c && c._cdOrig && !(DS && DS._communityDungeon && CHARS[_charIdx] === c)) cdRestore(c); }); }

(function() {
  // Its music on its floors.
  if (typeof exploTrackForFloor === 'function') {
    var _track = exploTrackForFloor;
    window.exploTrackForFloor = exploTrackForFloor = function(floor) {
      var d = DS && DS._communityDungeon;
      if (d && d.music && floor < 10 && TRACK_FILES[d.music]) return d.music;
      return _track.apply(this, arguments);
    };
  }
  // The end of a community run: count the clear, put the character back, no
  // Continue Journey or New Game+ from someone else's dungeon.
  var _victory = showVictory;
  window.showVictory = showVictory = function() {
    var d = DS._communityDungeon;
    if (d) cdBump(d.id, 'clears');
    var r = _victory.apply(this, arguments);
    if (d) {
      DS._communityDungeon = null; DS._cdRoster = null;
      cdRestore(CHARS[_charIdx]);
      var ng = document.getElementById('dg-ngplus-btn'); if (ng) ng.style.display = 'none';
      setTimeout(function() { say('You cleared ' + d.name + '. Your character is back where they were.'); }, 1500);
    }
    return r;
  };
  var _death = handleDeath;
  window.handleDeath = handleDeath = function() {
    var d = DS._communityDungeon, idx = _charIdx;
    var r = _death.apply(this, arguments);
    if (d) { DS._communityDungeon = null; DS._cdRoster = null; if (CHARS[idx]) cdRestore(CHARS[idx]); }
    return r;
  };
  var _return = endReturn;
  window.endReturn = endReturn = function() {
    var r = _return.apply(this, arguments);
    DS._communityDungeon = null; DS._cdRoster = null;
    cdRestoreAll();
    return r;
  };
  // Closed the game in the middle of one: the character is put back next time.
  setTimeout(cdRestoreAll, 1500);
  var _goTo = goTo;
  window.goTo = goTo = function(id) {
    if (id === 'community-dungeons') cdEnsureScreen();
    if (id === 'charlist' || id === 'menu') { if (DS) { DS._communityDungeon = null; DS._cdRoster = null; } cdRestoreAll(); }
    return _goTo.apply(this, arguments);
  };
})();

function openCommunityDungeons() {
  cdEnsureScreen();
  goTo('community-dungeons');
  cdGo('list');
}

// The menu button, after the Enemy Creator.
(function() {
  function addButton() {
    if (document.getElementById('menu-btn-cdungeons')) return;
    var ec = document.getElementById('menu-btn-enemy-creator'); if (!ec || !ec.parentNode) return;
    var b = document.createElement('button');
    b.className = 'menu-btn'; b.id = 'menu-btn-cdungeons';
    b.setAttribute('aria-label', 'Community Dungeons, play dungeons built by players or build your own');
    b.style.cssText = 'color:#d0a060;border-color:#6a5030;';
    b.innerHTML = '<span>🏰 Community Dungeons</span>';
    b.onclick = openCommunityDungeons;
    ec.parentNode.insertBefore(b, ec);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
})();
