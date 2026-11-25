//═════════════════
// GUILDS (12.2, the same as the apps)
//═════════════════
// Up to 20 players under one name, with their own chat and a Guild Boss every
// week. A guild is one Firestore document ("guilds", in the dungeon-descent
// database, the same one the apps use); its chat and each member's boss
// damage are under it. The Firestore rules (firebase/firestore.rules in the
// app repo) say who may change what. Guilds need an account.
//
// The Guild Boss: one boss a week (a UTC week from Monday, the same for every
// guild), 10,000 HP plus 6,000 a member. Every member gets 5 strikes a day;
// if the guild brings it down before the week ends, everyone who struck it
// collects 1,500 gold and 5 Soul Fragments, that week or the next.

var GUILD = {
  max: 20, strikes: 5, gold: 1500, fragments: 5,
  mine: null, checked: false, all: [], chat: [], hits: [], bossTotal: null,
  page: 'home', busy: false, msg: '', loadingList: false, listFailed: false,
  charIdx: 0, log: [], chatUnsub: null, chatSeen: {}, chatFirst: true,
};

var GUILD_BOSSES = [
  { name:'The Siege Engine', intro:'A war machine with no crew rolls out of the dark. It was built to break guilds.',
    taunts:['Its gears shriek.', 'A plank tears loose and it keeps coming.', 'Chains rattle somewhere inside it.'] },
  { name:'The Twin Wardens', intro:'Two guards who never sleep, sharing one shield and one grudge.',
    taunts:['One guards while the other swings.', 'They trade places. You barely see it.', 'The shield rings like a bell.'] },
  { name:'The Swarm Queen', intro:'The walls hum. Every crack in the stone is a door for her children.',
    taunts:['The humming gets louder.', 'Wings, everywhere.', 'Something crawls up your sleeve.'] },
  { name:'The Iron Abbot', intro:'A monk in rusted armour, praying to something that answers.',
    taunts:['He mutters a prayer. The room goes cold.', 'His censer swings, trailing black smoke.', 'Iron creaks as he kneels and rises.'] },
  { name:'The Tide Beneath', intro:'The floor is wet. Then it is water. Then it is looking at you.',
    taunts:['A wave crashes over your feet.', 'The water pulls back, gathering.', 'Salt stings your eyes.'] },
  { name:'The Ember Choir', intro:'A hundred burning voices, singing one note that never ends.',
    taunts:['The note gets higher.', 'Sparks fall like snow.', 'One voice drops out. Two more join.'] },
];

var GUILD_BAD_WORDS = ['fuck','shit','ass','bitch','cunt','dick','cock','pussy','nigger','nigga','faggot','fag','retard','whore','slut','bastard','piss','asshole','motherfucker','bullshit'];
function guildBadWord(text) {
  var words = String(text || '').toLowerCase().split(/[^a-z0-9]+/);
  return GUILD_BAD_WORDS.some(function(w) { return words.indexOf(w) !== -1; });
}

// ── The week (the same numbers as the apps) ──
function _guildUtcDate(d) { return d.toISOString().slice(0, 10); }
function guildWeek(date) {
  date = date || new Date();
  var d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  var day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var wk = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  var n = Math.floor(Math.floor(date.getTime() / 86400000 + 3) / 7);
  return { key: d.getUTCFullYear() + '-W' + (wk < 10 ? '0' : '') + wk,
           boss: GUILD_BOSSES[((n % GUILD_BOSSES.length) + GUILD_BOSSES.length) % GUILD_BOSSES.length] };
}
function guildLastWeek() { return guildWeek(new Date(Date.now() - 7 * 86400000)); }
function guildDaysLeft() { var into = (Date.now() / 86400000 + 3) % 7; return Math.max(1, Math.ceil(7 - into)); }
function guildHp(members) { return 10000 + 6000 * Math.min(GUILD.max, Math.max(1, members || 1)); }
function guildMyDamage(w) { return parseInt(DDStore.getItem('dd_guild_dmg_' + w.key) || '0', 10) || 0; }
function guildStrikesUsed() { return parseInt(DDStore.getItem('dd_guild_strikes_' + _guildUtcDate(new Date())) || '0', 10) || 0; }
function guildStrikesLeft() { return Math.max(0, GUILD.strikes - guildStrikesUsed()); }
function guildStatus(w, total, members) {
  var d = guildDaysLeft(), time = d + ' day' + (d === 1 ? '' : 's') + ' until the next boss.';
  if (total == null) return w.boss.name + '. The guild\'s damage can\'t be reached right now. ' + time;
  var left = Math.max(0, guildHp(members) - total);
  if (left === 0) return w.boss.name + ' has fallen this week. ' + time;
  return w.boss.name + ': ' + left.toLocaleString() + ' of ' + guildHp(members).toLocaleString() + ' HP left. ' + time;
}

// ── Online ──
function _gdb() { return window._fbDb; }
function _guid() { return window._fbAuth && window._fbAuth.currentUser ? window._fbAuth.currentUser.uid : null; }
function _gFV() { return firebase.firestore.FieldValue; }
function _gPath(a, b) { return new firebase.firestore.FieldPath(a, b); }
function guildMyName() {
  var n = (DDStore.getItem('dd_chat_username') || DDStore.getItem('dd_username') || '').trim() || 'Adventurer';
  return n.slice(0, 20);
}
function guildIsLeader() { return !!(GUILD.mine && GUILD.mine.leader === _guid()); }
function guildThisWeek(g) { return g.week === guildWeek().key ? (g.weekDamage || 0) : 0; }
function _guildFrom(doc) {
  var v = doc.data() || {};
  if (!v.name || !v.leader) return null;
  return { id: doc.id, name: v.name, desc: v.desc || '', leader: v.leader, leaderName: v.leaderName || '',
           members: v.members || {}, week: v.week || '', weekDamage: v.weekDamage || 0 };
}
function guildCount(g) { return Object.keys(g.members || {}).length; }

async function guildLoadMine() {
  var uid = _guid();
  try {
    if (!uid || !_gdb()) { GUILD.mine = null; return; }
    var snap = await _gdb().collection('guilds').where(_gPath('members', uid), '>', '').limit(1).get();
    GUILD.mine = snap.empty ? null : _guildFrom(snap.docs[0]);
  } catch (e) { console.warn('[Guilds]', e); }
  finally { GUILD.checked = true; }
}

async function guildLoadAll() {
  try {
    var snap = await _gdb().collection('guilds').limit(300).get();
    GUILD.all = snap.docs.map(_guildFrom).filter(Boolean).sort(function(a, b) {
      return (guildThisWeek(b) - guildThisWeek(a)) || (guildCount(b) - guildCount(a)) || a.name.localeCompare(b.name);
    });
    return true;
  } catch (e) { return false; }
}

function guildNameProblem(raw) {
  var name = String(raw || '').trim();
  if (name.length < 3) return 'A guild name needs at least 3 characters.';
  if (name.length > 24) return 'A guild name can be at most 24 characters.';
  if (!/^[A-Za-z0-9 '\-]+$/.test(name)) return 'Use only letters, numbers, spaces, apostrophes and hyphens in a guild name.';
  if (name.indexOf('  ') !== -1) return 'Use only one space between words.';
  if (guildBadWord(name)) return 'That guild name is not allowed. Please choose another.';
  return null;
}
function guildDescProblem(raw) {
  if (String(raw || '').length > 120) return 'The description can be at most 120 characters.';
  if (guildBadWord(raw)) return 'The description contains inappropriate content.';
  return null;
}

async function guildCreate(rawName, rawDesc) {
  var uid = _guid();
  if (!uid) return 'Sign in first (Settings, Account). Guilds need an account.';
  var name = String(rawName || '').trim(), desc = String(rawDesc || '').trim();
  var p = guildNameProblem(name) || guildDescProblem(desc);
  if (p) return p;
  await guildLoadMine();
  if (GUILD.mine) return 'You\'re already in a guild. Leave it first.';
  var key = name.toLowerCase();
  try { if ((await _gdb().collection('guildNames').doc(key).get()).exists) return 'A guild called ' + name + ' already exists. Choose another name.'; } catch (e) {}
  var ref = _gdb().collection('guilds').doc(), me = guildMyName(), members = {};
  members[uid] = me;
  var b = _gdb().batch();
  b.set(_gdb().collection('guildNames').doc(key), { gid: ref.id, uid: uid });
  b.set(ref, { name: name, nameKey: key, desc: desc, leader: uid, leaderName: me, members: members,
               createdAt: Date.now(), week: guildWeek().key, weekDamage: 0 });
  try { await b.commit(); } catch (e) { return 'Couldn\'t create the guild. The name may have just been taken, or you\'re offline. Try again.'; }
  GUILD.mine = { id: ref.id, name: name, desc: desc, leader: uid, leaderName: me, members: members, week: guildWeek().key, weekDamage: 0 };
  return null;
}

async function guildJoin(g) {
  var uid = _guid();
  if (!uid) return 'Sign in first (Settings, Account). Guilds need an account.';
  await guildLoadMine();
  if (GUILD.mine) return 'You\'re already in a guild. Leave it first.';
  if (guildCount(g) >= GUILD.max) return g.name + ' is full: ' + GUILD.max + ' members.';
  try { await _gdb().collection('guilds').doc(g.id).update(_gPath('members', uid), guildMyName()); }
  catch (e) { return 'Couldn\'t join ' + g.name + '. It may have just filled up, or you\'re offline.'; }
  await guildLoadMine();
  return null;
}

async function guildLeave() {
  var uid = _guid(), g = GUILD.mine;
  if (!uid || !g) return null;
  if (g.leader === uid) {
    if (guildCount(g) > 1) return 'You lead ' + g.name + '. Make another member the leader first, or disband the guild.';
    return await guildDisband();
  }
  try { await _gdb().collection('guilds').doc(g.id).update(_gPath('members', uid), _gFV().delete()); }
  catch (e) { return 'Couldn\'t leave the guild. Check your connection.'; }
  guildCloseChat(); GUILD.mine = null;
  return null;
}

async function guildRemove(member) {
  var g = GUILD.mine;
  if (!guildIsLeader() || !g || member === _guid()) return null;
  try { await _gdb().collection('guilds').doc(g.id).update(_gPath('members', member), _gFV().delete()); }
  catch (e) { return 'Couldn\'t remove them. Check your connection.'; }
  delete g.members[member];
  return null;
}

async function guildMakeLeader(member) {
  var g = GUILD.mine;
  if (!guildIsLeader() || !g || !g.members[member]) return null;
  try { await _gdb().collection('guilds').doc(g.id).update({ leader: member, leaderName: g.members[member] }); }
  catch (e) { return 'Couldn\'t change the leader. Check your connection.'; }
  g.leader = member; g.leaderName = g.members[member];
  return null;
}

async function guildSetDesc(raw) {
  var g = GUILD.mine, desc = String(raw || '').trim();
  if (!guildIsLeader() || !g) return null;
  var p = guildDescProblem(desc); if (p) return p;
  try { await _gdb().collection('guilds').doc(g.id).update({ desc: desc }); } catch (e) { return 'Couldn\'t save it. Check your connection.'; }
  g.desc = desc;
  return null;
}

async function guildDisband(target) {
  var g = target || GUILD.mine;
  if (!g) return null;
  var b = _gdb().batch();
  b.delete(_gdb().collection('guildNames').doc(g.name.toLowerCase()));
  b.delete(_gdb().collection('guilds').doc(g.id));
  try { await b.commit(); } catch (e) { return 'Couldn\'t disband the guild. Check your connection.'; }
  if (GUILD.mine && g.id === GUILD.mine.id) { guildCloseChat(); GUILD.mine = null; }
  GUILD.all = GUILD.all.filter(function(x) { return x.id !== g.id; });
  return null;
}

// ── Guild chat ──
function _guildBlocked() { try { return JSON.parse(DDStore.getItem('dd_blocked_players') || '[]'); } catch (e) { return []; } }
function guildIsBlocked(name) { return _guildBlocked().indexOf(String(name || '').trim().toLowerCase()) !== -1; }
function guildBlock(name) {
  var l = _guildBlocked(), k = String(name || '').trim().toLowerCase();
  if (l.indexOf(k) === -1) { l.push(k); DDStore.setItem('dd_blocked_players', JSON.stringify(l)); }
  say(name + ' is blocked. You will not see their messages anymore.');
  guildCloseChat(); guildOpenChat();
}

function guildOpenChat() {
  var g = GUILD.mine;
  if (GUILD.chatUnsub || !g) return;
  GUILD.chatFirst = true;
  GUILD.chatUnsub = _gdb().collection('guilds').doc(g.id).collection('chat').orderBy('timestamp').limitToLast(60)
    .onSnapshot(function(snap) {
      var me = _guid();
      var list = snap.docs.map(function(d) { var v = d.data(); return { id: d.id, uid: v.uid || '', username: v.username || 'Unknown', message: v.message || '', timestamp: v.timestamp || 0 }; })
        .filter(function(m) { return !guildIsBlocked(m.username); });
      if (!GUILD.chatFirst) list.forEach(function(m) { if (!GUILD.chatSeen[m.id] && m.uid !== me) say('Guild. ' + m.username + ' said ' + m.message); });
      GUILD.chatFirst = false;
      list.forEach(function(m) { GUILD.chatSeen[m.id] = true; });
      GUILD.chat = list;
      if (GUILD.page === 'chat') guildRenderChatList();
    }, function() {});
}

function guildCloseChat() {
  if (GUILD.chatUnsub) { try { GUILD.chatUnsub(); } catch (e) {} }
  GUILD.chatUnsub = null; GUILD.chat = []; GUILD.chatSeen = {};
}

function guildSend() {
  var input = document.getElementById('guild-chat-input');
  var text = (input ? input.value : '').trim(), uid = _guid(), g = GUILD.mine;
  if (!uid || !g) { say('Join a guild first.'); return; }
  if (!text) { say('Please type a message first.'); return; }
  if (text.length > 200) { say('Message too long. Maximum 200 characters.'); return; }
  if (guildBadWord(text)) { say('Your message contains inappropriate content and was not sent.'); if (input) input.value = ''; return; }
  if (DDStore.getItem('dd_ugc_terms_ok') !== '1') {
    if (!confirm('Guild chat is seen by every member of your guild. By continuing you agree to the Dungeon Descent Terms of Service at dungen-descent.org/terms. There is no tolerance for objectionable content or abusive players. You can report or block anyone. Do you agree?')) {
      say('You need to agree to the Terms of Service to post.'); return;
    }
    DDStore.setItem('dd_ugc_terms_ok', '1');
  }
  _gdb().collection('guilds').doc(g.id).collection('chat').add({ uid: uid, username: guildMyName(), message: text, timestamp: Date.now() })
    .catch(function() { say('Failed to send message. Check your connection.'); });
  if (input) input.value = '';
}

function guildDeleteMsg(id) {
  var g = GUILD.mine; if (!g) return;
  _gdb().collection('guilds').doc(g.id).collection('chat').doc(id).delete().catch(function() {});
  say('Message deleted.');
}

function guildReport(kind, id, author, content) {
  var reason = prompt('What is wrong with it? For example: offensive, harassment, spam. You can also leave this empty.', '');
  if (reason === null) { say('Report cancelled.'); return; }
  fetch('https://formspree.io/f/mkjnkenn', { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'Content report: ' + kind, platform: 'web',
      message: 'REPORTED ' + kind.toUpperCase() + '\nAuthor: ' + author + '\nContent: ' + String(content).slice(0, 300) + '\nID: ' + id +
        '\nReason: ' + (reason || 'not given') + '\nReported by: ' + guildMyName() + '\nTime: ' + new Date().toISOString(),
      email: 'no-reply@dungen-descent.org' }) })
    .then(function(r) { say(r.ok ? 'Report sent. Thank you. The developer reviews reports within 24 hours.' : 'The report could not be sent. Check your connection.'); })
    .catch(function() { say('The report could not be sent. Check your connection.'); });
  if (kind === 'guild message') { GUILD.chat = GUILD.chat.filter(function(m) { return m.id !== id; }); guildRenderChatList(); }
}

// ── The Guild Boss ──
function _guildHits(g, wk) { return _gdb().collection('guilds').doc(g.id).collection('boss').doc(wk).collection('hits'); }

async function guildLoadBoss(w) {
  var g = GUILD.mine;
  if (!g) { GUILD.bossTotal = null; return; }
  try {
    var snap = await _guildHits(g, w.key).get();
    GUILD.hits = snap.docs.map(function(d) { return { uid: d.id, name: d.data().name || 'Unknown', damage: d.data().damage || 0 }; })
      .sort(function(a, b) { return b.damage - a.damage; });
    GUILD.bossTotal = GUILD.hits.reduce(function(s, h) { return s + h.damage; }, 0);
  } catch (e) { GUILD.bossTotal = null; }
}

async function guildTotal(w) {
  var g = GUILD.mine;
  if (!g) return null;
  try { var snap = await _guildHits(g, w.key).get(); return snap.docs.reduce(function(s, d) { return s + (d.data().damage || 0); }, 0); }
  catch (e) { return null; }
}

async function guildRecord(dmg, w) {
  var uid = _guid(), g = GUILD.mine;
  if (!uid || !g) return;
  try { await _guildHits(g, w.key).doc(uid).set({ damage: _gFV().increment(dmg), name: guildMyName(), updatedAt: Date.now() }, { merge: true }); } catch (e) {}
  var ref = _gdb().collection('guilds').doc(g.id);
  try {
    var cur = (await ref.get()).data() || {};
    if (cur.week === w.key) await ref.update({ weekDamage: _gFV().increment(dmg) });
    else await ref.update({ week: w.key, weekDamage: dmg });
  } catch (e) {}
}

function guildClaim(w, total, members) {
  if (total == null || total < guildHp(members) || guildMyDamage(w) <= 0 || DDStore.getItem('dd_guild_claimed_' + w.key)) return;
  DDStore.setItem('dd_guild_claimed_' + w.key, '1');
  addGlobalGold(GUILD.gold);
  var frags = parseInt(DDStore.getItem('dd_soul_fragments') || '0', 10) || 0;
  DDStore.setItem('dd_soul_fragments', String(frags + GUILD.fragments));
  try { sfx('sfx-victory'); } catch (e) {}
  setTimeout(function() { say(w.boss.name + ' has fallen! Your guild did it. You earn ' + GUILD.gold + ' gold and ' + GUILD.fragments + ' Soul Fragments.'); }, 1000);
}

async function guildBossRefresh(announce) {
  var w = guildWeek(), members = GUILD.mine ? guildCount(GUILD.mine) : 1;
  await guildLoadBoss(w);
  if (GUILD.page !== 'boss') return;
  guildRender();
  if (announce) say(w.boss.intro + ' ' + guildStatus(w, GUILD.bossTotal, members) + ' You have ' + guildStrikesLeft() + ' strikes left today.');
  guildClaim(w, GUILD.bossTotal, members);
  var last = guildLastWeek();
  if (guildMyDamage(last) > 0 && !DDStore.getItem('dd_guild_claimed_' + last.key)) guildClaim(last, await guildTotal(last), members);
}

function guildStrike() {
  var w = guildWeek(), ch = CHARS && CHARS[GUILD.charIdx];
  if (!ch) { say('Please select a character.'); return; }
  var used = guildStrikesUsed();
  if (used >= GUILD.strikes) { say('No strikes left today.'); return; }
  var base = 100 + 15 * Math.max(1, ch.persistLevel || 1);
  var lo = Math.floor(base * 4 / 5), hi = Math.floor(base * 6 / 5);
  var dmg = lo + Math.floor(Math.random() * (hi - lo + 1));
  var crit = Math.random() < 0.15;
  if (crit) dmg *= 2;
  dmg = Math.min(5000, dmg);
  DDStore.setItem('dd_guild_dmg_' + w.key, String(guildMyDamage(w) + dmg));
  DDStore.setItem('dd_guild_strikes_' + _guildUtcDate(new Date()), String(used + 1));
  var taunt = w.boss.taunts[Math.floor(Math.random() * w.boss.taunts.length)];
  try { sfx(crit ? 'sfx-heavy-hit' : 'sfx-attack'); } catch (e) {}
  var line = (crit ? '💥 Critical! ' : '⚔ ') + ch.name + ' deals ' + dmg + ' damage. ' + taunt;
  GUILD.log.unshift(line);
  var members = GUILD.mine ? guildCount(GUILD.mine) : 1;
  var hp = Math.max(0, guildHp(members) - ((GUILD.bossTotal || 0) + dmg));
  say(line + ' ' + hp.toLocaleString() + ' HP left. ' + guildStrikesLeft() + ' strikes left today.');
  (async function() { await guildRecord(dmg, w); await guildBossRefresh(false); })();
}

// ── The screen: each part is its own page ──
function guildEnsureScreen() {
  if (document.getElementById('screen-guilds')) return;
  var el = document.createElement('div');
  el.id = 'screen-guilds'; el.className = 'screen';
  el.setAttribute('role', 'main'); el.setAttribute('aria-label', 'Guilds');
  el.innerHTML = '<div id="guild-body" style="max-width:520px;margin:0 auto;padding:20px 16px;"></div>';
  document.body.appendChild(el);
}

function _ge(s) { return typeof _u119Esc === 'function' ? _u119Esc(s) : String(s).replace(/[&<>"']/g, function(c) { return '&#' + c.charCodeAt(0) + ';'; }); }
function _gBtn(label, onclick, aria, color) {
  return '<button class="menu-btn' + (color === 'gold' ? ' primary' : '') + '" style="width:100%;margin-top:8px;' + (color === 'red' ? 'border-color:#882222;color:#ff8866;' : '') +
    '" onclick="' + onclick + '" aria-label="' + _ge(aria || label) + '">' + _ge(label) + '</button>';
}
function _gHeading(title, sub) {
  return '<h2 class="screen-title" style="color:#66ddcc;margin-top:10px;">' + _ge(title) + '</h2>' +
    (sub ? '<p style="font-family:\'Crimson Text\',serif;font-style:italic;color:#aaa;margin:6px 0 12px;">' + _ge(sub) + '</p>' : '');
}
function _gBack(label) {
  label = label || (GUILD.mine ? '← Back to Your Guild' : '← Back to Guilds');
  return '<div class="screen-header"><button class="back-btn" onclick="guildGo(\'home\')">' + _ge(label) + '</button></div>';
}
function _gMsg() { return GUILD.msg ? '<p role="status" style="font-family:Cinzel,serif;font-size:0.7rem;color:#a0d4a0;text-align:center;margin-top:10px;">' + _ge(GUILD.msg) + '</p>' : ''; }

function guildRender() {
  var body = document.getElementById('guild-body');
  if (!body) return;
  var g = GUILD.mine, w = guildWeek(), h = '';
  switch (GUILD.page) {
  case 'home':
    h += '<div class="screen-header"><button class="back-btn" onclick="guildCloseChat();goTo(\'menu\')" aria-label="Back to main menu">← Menu</button></div>';
    if (g) {
      h += _gHeading('🛡 ' + g.name, g.desc || null);
      h += '<p style="font-family:Cinzel,serif;font-size:0.72rem;color:var(--gold);">' + guildCount(g) + ' of ' + GUILD.max + ' members · Leader: ' + _ge(g.leaderName) + '</p>';
      h += '<p style="font-family:Cinzel,serif;font-size:0.66rem;color:#999;">This week: ' + _ge(w.boss.name) + ' · ' + guildThisWeek(g).toLocaleString() + ' damage</p>';
      h += _gBtn('💬 Guild Chat', "guildGo('chat')", 'Guild chat, talk to your guild', 'gold');
      h += _gBtn('🐉 Guild Boss', "guildGo('boss')", 'Guild Boss, this week\'s boss: ' + w.boss.name, 'red');
      h += _gBtn('👥 Members (' + guildCount(g) + ')', "guildGo('members')", 'Members, ' + guildCount(g) + ' of ' + GUILD.max);
      h += _gBtn('🏆 Guild Rankings', "guildGo('rankings')", 'Guild rankings, the strongest guilds this week');
      if (guildIsLeader()) h += _gBtn('⚙ Manage Guild', "guildGo('manage')", 'Manage guild: description, or disband it');
      h += _gBtn('🚪 Leave Guild', 'guildLeaveAsk()', 'Leave guild');
    } else {
      h += _gHeading('🛡 Guilds', 'Up to ' + GUILD.max + ' players under one banner, with their own chat and a Guild Boss every week.');
      if (!_guid()) {
        h += '<p style="font-family:\'Crimson Text\',serif;color:#aaa;">Guilds need an account, so everyone knows who\'s who. Sign in under Settings, Account, then come back.</p>';
      } else if (!GUILD.checked) {
        h += '<p style="font-family:Cinzel,serif;font-size:0.7rem;color:#777;">Looking for your guild...</p>';
      } else {
        h += _gBtn('🔍 Find a Guild', "guildGo('browse')", 'Find a guild to join', 'gold');
        h += _gBtn('➕ Create a Guild', "guildGo('create')", 'Create a guild and lead it');
        h += _gBtn('🏆 Guild Rankings', "guildGo('rankings')", 'Guild rankings, the strongest guilds this week');
      }
    }
    break;
  case 'create':
    h += _gBack('← Back to Guilds') + _gHeading('➕ Create a Guild', 'You\'ll be its leader. 3 to 24 letters, numbers, spaces, apostrophes or hyphens.');
    h += '<label for="guild-name" style="font-family:Cinzel,serif;font-size:0.6rem;color:var(--gold-dim);letter-spacing:0.15em;">GUILD NAME</label>' +
      '<input id="guild-name" maxlength="24" aria-label="Guild name, 3 to 24 characters" style="width:100%;padding:10px;margin:4px 0 10px;background:#0a0800;border:1px solid #443300;color:#ddd;">' +
      '<label for="guild-desc" style="font-family:Cinzel,serif;font-size:0.6rem;color:var(--gold-dim);letter-spacing:0.15em;">DESCRIPTION</label>' +
      '<textarea id="guild-desc" maxlength="120" rows="3" aria-label="Guild description, optional, up to 120 characters" placeholder="What is your guild about? (optional)" style="width:100%;padding:10px;margin-top:4px;background:#0a0800;border:1px solid #443300;color:#ddd;"></textarea>';
    h += _gBtn(GUILD.busy ? 'Creating...' : '🛡 Create Guild', 'guildCreateClick()', 'Create guild', 'gold');
    break;
  case 'browse':
    h += _gBack('← Back to Guilds') + _gHeading('🔍 Find a Guild', 'Choose one to join. The strongest this week are first.');
    if (GUILD.loadingList) h += '<p style="color:#777;">Loading guilds...</p>';
    else if (GUILD.listFailed) h += '<p style="color:#aaa;">Couldn\'t load the guilds. Check your connection.</p>';
    else if (!GUILD.all.length) h += '<p style="color:#aaa;font-style:italic;">No guilds yet. Create the first one!</p>';
    GUILD.all.forEach(function(x, i) {
      var full = guildCount(x) >= GUILD.max;
      h += '<div style="border-bottom:1px solid #1a1a1a;padding:10px 0;"><div style="font-family:Cinzel,serif;font-size:0.8rem;color:#ddd;">🛡 ' + _ge(x.name) + '</div>' +
        (x.desc ? '<div style="font-family:\'Crimson Text\',serif;color:#aaa;">' + _ge(x.desc) + '</div>' : '') +
        '<div style="font-family:Cinzel,serif;font-size:0.58rem;color:#909090;">' + guildCount(x) + ' of ' + GUILD.max + ' members · Leader: ' + _ge(x.leaderName) + ' · ' + guildThisWeek(x).toLocaleString() + ' damage this week</div>' +
        '<div style="display:flex;gap:8px;margin-top:6px;">' +
        '<button class="btn-ghost" ' + (full ? 'disabled' : '') + ' onclick="guildJoinClick(' + i + ')" aria-label="' + _ge(full ? x.name + ' is full' : 'Join ' + x.name) + '">' + (full ? 'Full' : 'Join') + '</button>' +
        '<button class="btn-ghost" onclick="guildReportGuild(' + i + ')" aria-label="Report ' + _ge(x.name) + '">Report</button>' +
        (_guid() === 'WgqZGmnPKeYIymlMkx0aAg8G2T52' ? '<button class="btn-ghost" style="color:#ff8866;" onclick="guildDevRemove(' + i + ')" aria-label="Developer: remove ' + _ge(x.name) + '">Remove</button>' : '') +
        '</div></div>';
    });
    break;
  case 'chat':
    h += _gBack() + _gHeading('💬 Guild Chat', 'Only members of ' + (g ? g.name : 'your guild') + ' see these messages. Every message has Report and Block.');
    h += '<div id="guild-chat-list" role="log" aria-label="Guild messages" style="background:#060600;border:1px solid #113322;padding:10px;max-height:50vh;overflow-y:auto;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;"><input id="guild-chat-input" maxlength="200" aria-label="Guild message, maximum 200 characters" placeholder="Type a message..." onkeydown="if(event.key===\'Enter\')guildSend()" style="flex:1;padding:10px;background:#0a0800;border:1px solid #224433;color:#ccc;">' +
      '<button class="btn-ghost" onclick="guildSend()" aria-label="Send message">Send</button></div>';
    break;
  case 'boss':
    var members = g ? guildCount(g) : 1, total = GUILD.bossTotal, left = Math.max(0, guildHp(members) - (total || 0)), strikes = guildStrikesLeft();
    var pct = total == null ? 100 : Math.round(left / guildHp(members) * 100);
    h += _gBack() + _gHeading('🐉 ' + w.boss.name, w.boss.intro);
    h += '<div tabindex="0" aria-label="' + _ge(guildStatus(w, total, members) + ' Your damage this week: ' + guildMyDamage(w) + '. ' + strikes + ' strikes left today.') + '" style="border:1px solid #4a1a1a;padding:12px;margin-bottom:12px;">' +
      '<div aria-hidden="true"><div style="font-family:Cinzel,serif;font-size:0.6rem;letter-spacing:0.2em;color:#909090;">GUILD BOSS — THIS WEEK</div>' +
      '<div style="background:#111;height:10px;margin:6px 0;"><div style="background:#cc4422;height:100%;width:' + pct + '%;"></div></div>' +
      '<div style="font-family:Cinzel,serif;font-size:0.8rem;color:#ff8866;">' + (total == null ? 'Loading...' : left.toLocaleString() + ' / ' + guildHp(members).toLocaleString() + ' HP') + '</div>' +
      '<div style="font-family:\'Crimson Text\',serif;font-size:0.85rem;color:#888;">Your damage this week: ' + guildMyDamage(w).toLocaleString() + ' · ' + strikes + ' of ' + GUILD.strikes + ' strikes left today · ' + guildDaysLeft() + ' days until the next boss</div>' +
      '<div style="font-family:\'Crimson Text\',serif;font-size:0.85rem;color:#44cc88;">Kill reward: ' + GUILD.gold.toLocaleString() + ' gold + ' + GUILD.fragments + ' Soul Fragments for every member who struck. Its HP grows with the guild.</div></div></div>';
    if (total != null && left === 0) {
      h += '<p style="color:#44cc88;font-family:\'Crimson Text\',serif;">It has fallen. Every member who struck it collects the reward. A new boss comes on Monday (UTC).</p>';
    } else if (strikes > 0) {
      h += '<p style="font-family:Cinzel,serif;font-size:0.7rem;color:var(--gold-dim);text-transform:uppercase;letter-spacing:0.2em;">Choose your champion</p>' +
        '<div id="guild-char-list" role="radiogroup" aria-label="Select a character" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>' +
        '<button class="menu-btn primary" style="width:100%;" ' + (total == null ? 'disabled' : '') + ' onclick="guildStrike()" aria-label="Strike ' + _ge(w.boss.name) + '. ' + strikes + ' strikes left today.">⚔ Strike (' + strikes + ' left today)</button>';
    } else {
      h += '<p style="font-family:\'Crimson Text\',serif;color:#aaa;">You\'ve used all ' + GUILD.strikes + ' strikes today. Come back tomorrow.</p>';
    }
    if (GUILD.log.length) h += '<div aria-label="Strike log" style="font-family:Cinzel,serif;font-size:0.65rem;color:#999;line-height:1.7;margin:12px 0;">' + GUILD.log.slice(0, 10).map(function(l) { return '<div>' + _ge(l) + '</div>'; }).join('') + '</div>';
    if (GUILD.hits.length) h += '<h3 style="font-family:Cinzel,serif;font-size:0.65rem;letter-spacing:0.2em;color:var(--gold-dim);margin-top:10px;">⚔ THIS WEEK\'S DAMAGE</h3>' +
      GUILD.hits.map(function(x, i) { return '<div style="font-family:Cinzel,serif;font-size:0.7rem;color:' + (i ? '#aaa' : '#ffdd44') + ';">' + (i + 1) + '. ' + _ge(x.name) + ' — ' + x.damage.toLocaleString() + '</div>'; }).join('');
    break;
  case 'members':
    h += _gBack() + _gHeading('👥 Members', (g ? guildCount(g) : 0) + ' of ' + GUILD.max + '.' + (guildIsLeader() ? ' As leader you can remove a member or make them the leader.' : ''));
    if (g) Object.keys(g.members).sort(function(a, b) { return a === g.leader ? -1 : b === g.leader ? 1 : g.members[a].localeCompare(g.members[b]); }).forEach(function(uid) {
      var name = g.members[uid], lead = uid === g.leader, me = uid === _guid();
      h += '<div style="padding:8px 0;border-bottom:1px solid #1a1a1a;"><div style="font-family:Cinzel,serif;font-size:0.75rem;color:' + (lead ? 'var(--gold)' : '#ddd') + ';">' + (lead ? '👑 ' : '') + _ge(name) + (me ? ' (you)' : '') + '</div>';
      if (guildIsLeader() && !me) h += '<div style="display:flex;gap:8px;margin-top:6px;">' +
        '<button class="btn-ghost" onclick="guildPromoteAsk(\'' + uid + '\')" aria-label="Make ' + _ge(name) + ' the leader">Make Leader</button>' +
        '<button class="btn-ghost" style="color:#ff8866;" onclick="guildRemoveAsk(\'' + uid + '\')" aria-label="Remove ' + _ge(name) + ' from the guild">Remove</button></div>';
      h += '</div>';
    });
    break;
  case 'rankings':
    h += _gBack() + _gHeading('🏆 Guild Rankings', 'Guild Boss damage this week (' + w.key + '), every member\'s strikes added up.');
    var ranked = GUILD.all.filter(function(x) { return guildThisWeek(x) > 0; });
    if (GUILD.loadingList) h += '<p style="color:#777;">Loading guilds...</p>';
    else if (GUILD.listFailed) h += '<p style="color:#aaa;">Couldn\'t load the rankings. Check your connection.</p>';
    else if (!ranked.length) h += '<p style="color:#aaa;font-style:italic;">No guild has struck this week\'s boss yet.</p>';
    ranked.slice(0, 50).forEach(function(x, i) {
      h += '<div style="font-family:Cinzel,serif;font-size:0.72rem;color:' + (g && x.id === g.id ? 'var(--gold)' : '#aaa') + ';padding:3px 0;">' + (i + 1) + '. ' + _ge(x.name) + ' — ' + guildThisWeek(x).toLocaleString() + ' damage · ' + guildCount(x) + ' members</div>';
    });
    break;
  case 'manage':
    h += _gBack() + _gHeading('⚙ Manage Guild', g ? g.name : '');
    h += '<label for="guild-desc" style="font-family:Cinzel,serif;font-size:0.6rem;color:var(--gold-dim);letter-spacing:0.15em;">DESCRIPTION</label>' +
      '<textarea id="guild-desc" maxlength="120" rows="3" aria-label="Guild description, up to 120 characters" style="width:100%;padding:10px;margin-top:4px;background:#0a0800;border:1px solid #443300;color:#ddd;">' + _ge(g ? g.desc : '') + '</textarea>';
    h += _gBtn('💾 Save Description', 'guildSaveDesc()', 'Save description', 'gold');
    h += '<p style="font-family:\'Crimson Text\',serif;font-style:italic;color:#aaa;margin-top:10px;">To hand the guild to someone else, open Members and choose Make Leader.</p>';
    h += _gBtn('🗑 Disband Guild', 'guildDisbandAsk()', 'Disband ' + (g ? g.name : 'the guild') + ' for every member', 'red');
    break;
  }
  body.innerHTML = h + _gMsg();
  if (GUILD.page === 'chat') guildRenderChatList();
  if (GUILD.page === 'boss' && document.getElementById('guild-char-list') && typeof _u119CharButtons === 'function') {
    _u119CharButtons('guild-char-list', GUILD.charIdx, function(i) { GUILD.charIdx = i; });
  }
}

function guildRenderChatList() {
  var el = document.getElementById('guild-chat-list');
  if (!el) return;
  var me = _guid();
  if (!GUILD.chat.length) { el.innerHTML = '<div style="color:#909090;font-family:Cinzel,serif;font-size:0.65rem;padding:20px;text-align:center;">No messages yet. Say hello!</div>'; return; }
  el.innerHTML = GUILD.chat.map(function(m) {
    var mine = m.uid === me, canDel = mine || guildIsLeader();
    var ago = typeof chatFormatTime === 'function' ? chatFormatTime(m.timestamp) : '';
    var safe = _ge(m.username), idEsc = _ge(m.id);
    return '<div style="padding:6px 0;border-bottom:1px solid #111;"><div aria-label="' + safe + ' said ' + _ge(m.message) + '. ' + _ge(ago) + '">' +
      '<span style="font-family:Cinzel,serif;font-size:0.62rem;color:' + (mine ? '#c8a832' : '#88aacc') + ';">' + safe + '</span> ' +
      '<span style="font-family:Cinzel,serif;font-size:0.55rem;color:#909090;">' + _ge(ago) + '</span>' +
      '<div style="font-family:Cinzel,serif;font-size:0.68rem;color:#aaa;">' + _ge(m.message) + '</div></div>' +
      '<div style="display:flex;gap:6px;margin-top:4px;">' +
      (!mine ? '<button class="btn-ghost" style="font-size:0.55rem;padding:3px 8px;" onclick="guildReportMsg(\'' + idEsc + '\')" aria-label="Report message by ' + safe + '">Report</button>' +
               '<button class="btn-ghost" style="font-size:0.55rem;padding:3px 8px;" onclick="guildBlockMsg(\'' + idEsc + '\')" aria-label="Block ' + safe + '">Block</button>' : '') +
      (canDel ? '<button class="btn-ghost" style="font-size:0.55rem;padding:3px 8px;" onclick="guildDeleteMsg(\'' + idEsc + '\')" aria-label="Delete message by ' + safe + '">Delete</button>' : '') +
      '</div></div>';
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function guildGo(page, sayThis) {
  GUILD.page = page; GUILD.msg = '';
  try { sfx('sfx-select'); } catch (e) {}
  if (page !== 'chat') guildCloseChat();
  guildRender();
  window.scrollTo(0, 0);
  var g = GUILD.mine;
  if (page === 'home') {
    if (sayThis) { GUILD.msg = sayThis; guildRender(); say(sayThis); }
    else guildAnnounceHome();
  } else if (page === 'browse' || page === 'rankings') {
    say(page === 'browse' ? 'Find a Guild. Loading guilds.' : 'Guild Rankings. Loading.');
    GUILD.loadingList = true; guildRender();
    guildLoadAll().then(function(ok) {
      GUILD.loadingList = false; GUILD.listFailed = !ok;
      if (GUILD.page !== page) return;
      guildRender();
      if (!ok) { say('Couldn\'t load the guilds. Check your connection.'); return; }
      var n = page === 'browse' ? GUILD.all.length : GUILD.all.filter(function(x) { return guildThisWeek(x) > 0; }).length;
      say(page === 'browse' ? (n ? n + ' guilds.' : 'No guilds yet. Create the first one!') : (n ? n + ' guilds ranked this week.' : 'No guild has struck this week\'s boss yet.'));
    });
  } else if (page === 'create') say('Create a Guild. Type a name, then Create Guild.');
  else if (page === 'chat') { guildOpenChat(); say('Guild Chat. New messages are read out as they arrive.'); }
  else if (page === 'boss') { GUILD.bossTotal = null; try { playTrack('boss'); } catch (e) {} guildRender(); guildBossRefresh(true); }
  else if (page === 'members') say('Members. ' + (g ? guildCount(g) : 0) + ' of ' + GUILD.max + '.');
  else if (page === 'manage') say('Manage Guild.');
  setTimeout(function() { var b = document.querySelector('#guild-body button, #guild-body input'); if (b) b.focus(); }, 80);
}

function guildAnnounceHome() {
  if (!GUILD.checked && _guid()) return;
  var g = GUILD.mine;
  if (g) say(g.name + '. ' + guildCount(g) + ' of ' + GUILD.max + ' members. This week\'s Guild Boss: ' + guildWeek().boss.name + '.');
  else if (!_guid()) say('Guilds. Sign in under Settings, Account, to join or create a guild.');
  else say('Guilds. You\'re not in a guild yet. Find one to join, or create your own.');
}

// Runs an online change: a problem is read out, otherwise `done`.
function guildAct(work, done) {
  GUILD.busy = true;
  work().then(function(problem) {
    GUILD.busy = false;
    if (problem) { GUILD.msg = problem; guildRender(); say(problem); } else done();
  });
}

function guildCreateClick() {
  var name = (document.getElementById('guild-name') || {}).value || '', desc = (document.getElementById('guild-desc') || {}).value || '';
  guildAct(function() { return guildCreate(name, desc); }, function() {
    try { sfx('sfx-victory'); } catch (e) {}
    guildGo('home', name.trim() + ' is founded. You are its leader. Share the name so friends can find it.');
  });
}
function guildJoinClick(i) {
  var g = GUILD.all[i]; if (!g) return;
  guildAct(function() { return guildJoin(g); }, function() { try { sfx('sfx-confirm'); } catch (e) {} guildGo('home', 'You joined ' + g.name + '! Say hello in Guild Chat.'); });
}
function guildReportGuild(i) { var g = GUILD.all[i]; if (g) guildReport('guild', g.id, g.leaderName, g.name + ': ' + g.desc); }
function guildDevRemove(i) {
  var g = GUILD.all[i]; if (!g || !confirm('Developer: remove ' + g.name + '? This disbands the guild for every member.')) return;
  guildAct(function() { return guildDisband(g); }, function() { guildRender(); say(g.name + ' was removed.'); });
}
function guildReportMsg(id) { var m = GUILD.chat.filter(function(x) { return x.id === id; })[0]; if (m) guildReport('guild message', m.id, m.username, m.message); }
function guildBlockMsg(id) {
  var m = GUILD.chat.filter(function(x) { return x.id === id; })[0];
  if (m && confirm('Block ' + m.username + '? You will no longer see their messages. You can unblock everyone later in Settings, Chat.')) guildBlock(m.username);
}
function guildLeaveAsk() {
  var g = GUILD.mine; if (!g) return;
  if (guildIsLeader() && guildCount(g) > 1) { say('You lead ' + g.name + '. Make another member the leader first (Members), or disband the guild (Manage Guild).'); return; }
  if (!confirm('Leave ' + g.name + '?')) return;
  guildAct(guildLeave, function() { guildGo('home', 'You left the guild.'); });
}
function guildDisbandAsk() {
  var g = GUILD.mine; if (!g || !confirm('Disband ' + g.name + '? The guild ends for every member. This can\'t be undone.')) return;
  guildAct(function() { return guildDisband(); }, function() { guildGo('home', 'The guild has been disbanded.'); });
}
function guildRemoveAsk(uid) {
  var g = GUILD.mine, name = g && g.members[uid]; if (!name || !confirm('Remove ' + name + '?')) return;
  guildAct(function() { return guildRemove(uid); }, function() { guildRender(); say(name + ' was removed from the guild.'); });
}
function guildPromoteAsk(uid) {
  var g = GUILD.mine, name = g && g.members[uid]; if (!name || !confirm('Make ' + name + ' the leader? You stay in the guild as a member.')) return;
  guildAct(function() { return guildMakeLeader(uid); }, function() { guildRender(); say(name + ' now leads the guild.'); });
}
function guildSaveDesc() {
  var d = (document.getElementById('guild-desc') || {}).value || '';
  guildAct(function() { return guildSetDesc(d); }, function() { try { sfx('sfx-confirm'); } catch (e) {} GUILD.msg = 'Description saved.'; guildRender(); say('Description saved.'); });
}

function openGuilds() {
  guildEnsureScreen();
  GUILD.page = 'home'; GUILD.msg = ''; GUILD.log = []; GUILD.checked = false;
  goTo('guilds');
  guildRender();
  guildLoadMine().then(function() { if (_currentScreen === 'guilds' && GUILD.page === 'home') { guildRender(); guildAnnounceHome(); } });
}

// The menu button, after the World Boss.
(function() {
  function addButton() {
    if (document.getElementById('menu-btn-guilds')) return;
    var wb = document.getElementById('menu-btn-worldboss');
    if (!wb || !wb.parentNode) return;
    var b = document.createElement('button');
    b.className = 'menu-btn'; b.id = 'menu-btn-guilds';
    b.setAttribute('data-lang', 'Guilds'); b.setAttribute('data-pt', 'Guildas');
    b.setAttribute('aria-label', 'Guilds, join or lead a guild of up to 20 players, with guild chat and a weekly Guild Boss');
    b.style.cssText = 'color:#66ddcc;border-color:#226655;';
    b.innerHTML = '<span>🛡 Guilds</span>';
    b.onclick = openGuilds;
    wb.parentNode.insertBefore(b, wb);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
})();
