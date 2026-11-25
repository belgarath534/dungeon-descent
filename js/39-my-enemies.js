//═════════════════
// MY ENEMIES (12.2, the same as the apps)
//═════════════════
// The community enemies you made (while signed in), each with an edit page:
// rename it, change its description, change its type (fresh stats in that
// type's range) or re-roll its stats, or delete it from every dungeon. Stats
// are never typed in. The developer's account can edit every enemy. Deleting
// takes it out of every dungeon (approved off) but keeps it for moderation.

var MYE = { list: [], loading: false, editing: null, preview: null, msg: '' };
var MYE_DEV = 'WgqZGmnPKeYIymlMkx0aAg8G2T52';

function _myeUid() { return window._fbAuth && window._fbAuth.currentUser ? window._fbAuth.currentUser.uid : null; }
function _myeIsDev() { return _myeUid() === MYE_DEV; }
function _myeEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return '&#' + c.charCodeAt(0) + ';'; }); }
var MYE_ICONS = { common:'👤', uncommon:'⚠️', rare:'💀', elite:'👁️', boss:'💀' };

function myeEnsureScreen() {
  if (document.getElementById('screen-my-enemies')) return;
  var el = document.createElement('div');
  el.id = 'screen-my-enemies'; el.className = 'screen';
  el.setAttribute('role', 'main'); el.setAttribute('aria-label', 'My Enemies');
  el.innerHTML = '<div id="mye-body" style="max-width:520px;margin:0 auto;padding:20px 16px;"></div>';
  document.body.appendChild(el);
}

async function myeLoad() {
  var uid = _myeUid(), db = window._fbDb;
  MYE.list = [];
  if (!db || (!uid)) return;
  try {
    var q = _myeIsDev() ? db.collection('community_enemies').where('approved', '==', true)
                        : db.collection('community_enemies').where('ownerUid', '==', uid);
    var snap = await q.get();
    MYE.list = snap.docs.map(function(d) { var v = d.data(); v.id = d.id; return v; })
      .filter(function(v) { return v.approved === true && v.name; })
      .sort(function(a, b) { return a.name.localeCompare(b.name); });
  } catch (e) { console.warn('[MyEnemies]', e); }
}

function myeRenderList() {
  var b = document.getElementById('mye-body'); if (!b) return;
  var h = '<div class="screen-header"><button class="back-btn" onclick="goTo(\'bestiary\')" aria-label="Back to the Bestiary">← Back to the Bestiary</button></div>' +
    '<h2 class="screen-title" style="color:#aa88ff;">🛠 My Enemies</h2>' +
    '<p style="font-family:\'Crimson Text\',serif;font-style:italic;color:#aaa;">' + (_myeIsDev()
      ? 'Developer: every community enemy. Editing one keeps it with the player who made it.'
      : 'The enemies you made. Rename them, make them stronger, or delete them.') + '</p>';
  if (MYE.loading) h += '<p style="font-family:Cinzel,serif;font-size:0.7rem;color:#777;">Finding your enemies...</p>';
  else if (!_myeUid()) h += '<p style="font-family:\'Crimson Text\',serif;font-style:italic;color:#aaa;">Sign in (Settings, Account) to edit your enemies. Enemies you make while signed in are yours to edit, on any device.</p>';
  else if (!MYE.list.length) h += '<p style="font-family:\'Crimson Text\',serif;font-style:italic;color:#aaa;">You haven\'t made any enemies to edit yet. Enemies you make while signed in, from this version on, are yours to edit. For an older one, ask the developer on Discord.</p>';
  MYE.list.forEach(function(e, i) {
    h += '<button onclick="myeEdit(' + i + ')" style="display:block;width:100%;text-align:left;background:#0a0a0f;border:1px solid #554488;padding:12px;margin-bottom:8px;color:#ddd;cursor:pointer;" aria-label="' +
      _myeEsc('Edit ' + e.name + ', by ' + e.creator + '. ' + e.type + ', HP ' + e.hp + ', attack ' + e.atk + ', defense ' + e.def + '. ' + (e.kills || 0) + ' kills.') + '">' +
      '<div style="font-family:Cinzel,serif;font-size:0.8rem;">' + _myeEsc((e.icon || '👤') + ' ' + e.name) + '</div>' +
      '<div style="font-family:Cinzel,serif;font-size:0.58rem;color:#909090;">' + _myeEsc(e.type + ' · HP ' + e.hp + ' · ATK ' + e.atk + ' · DEF ' + e.def + ' · ⚔ ' + (e.kills || 0) + ' kills · by ' + e.creator) + '</div></button>';
  });
  b.innerHTML = h;
}

function myeRoll(type) {
  var r = EC_STAT_RANGES[type] || EC_STAT_RANGES.common;
  function roll(a) { return a[0] + Math.floor(Math.random() * (a[1] - a[0] + 1)); }
  return { hp: roll(r.hp), atk: roll(r.atk), def: roll(r.def) };
}

function myeEdit(i) {
  var e = MYE.list[i]; if (!e) return;
  MYE.editing = e; MYE.preview = { type: e.type, hp: e.hp, atk: e.atk, def: e.def }; MYE.msg = '';
  myeRenderEdit();
  say('Edit ' + e.name + '.');
  setTimeout(function() { var x = document.querySelector('#mye-body button'); if (x) x.focus(); }, 60);
}

function myeRenderEdit() {
  var b = document.getElementById('mye-body'), e = MYE.editing, p = MYE.preview; if (!b || !e) return;
  var types = ['common', 'uncommon', 'rare', 'elite', 'boss'];
  b.innerHTML =
    '<div class="screen-header"><button class="back-btn" onclick="myeBack()" aria-label="Back to my enemies without saving">← Back to My Enemies</button></div>' +
    '<h2 class="screen-title" style="color:#aa88ff;">Edit ' + _myeEsc(e.name) + '</h2>' +
    '<p style="font-family:\'Crimson Text\',serif;font-style:italic;color:#aaa;">Changes reach every player\'s dungeon.</p>' +
    '<label for="mye-name" style="font-family:Cinzel,serif;font-size:0.6rem;color:var(--gold-dim);">NAME</label>' +
    '<input id="mye-name" maxlength="30" value="' + _myeEsc(e.name) + '" aria-label="Enemy name" style="width:100%;padding:10px;margin:4px 0 10px;background:#0a0800;border:1px solid #443300;color:#ddd;">' +
    '<label for="mye-desc" style="font-family:Cinzel,serif;font-size:0.6rem;color:var(--gold-dim);">DESCRIPTION</label>' +
    '<textarea id="mye-desc" maxlength="200" rows="3" aria-label="Enemy description" style="width:100%;padding:10px;margin:4px 0 10px;background:#0a0800;border:1px solid #443300;color:#ddd;">' + _myeEsc(e.desc) + '</textarea>' +
    '<label for="mye-type" style="font-family:Cinzel,serif;font-size:0.6rem;color:var(--gold-dim);">TYPE</label>' +
    '<select id="mye-type" onchange="myeTypeChanged()" aria-label="Enemy type. A new type rolls new stats in that type\'s range." style="width:100%;padding:10px;margin:4px 0 10px;background:#0a0800;border:1px solid #443300;color:#ddd;">' +
      types.map(function(t) { return '<option value="' + t + '"' + (t === p.type ? ' selected' : '') + '>' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>'; }).join('') + '</select>' +
    '<div id="mye-stats" tabindex="0" aria-label="Stats. HP ' + p.hp + ', attack ' + p.atk + ', defense ' + p.def + '." style="font-family:Cinzel,serif;font-size:0.75rem;color:var(--gold);margin:6px 0;">Stats: HP ' + p.hp + ' · ATK ' + p.atk + ' · DEF ' + p.def + '</div>' +
    '<button class="btn-ghost" style="width:100%;margin-top:6px;" onclick="myeReroll()" aria-label="Re-roll stats within this type\'s range">🎲 Re-roll Stats</button>' +
    '<button class="menu-btn primary" style="width:100%;margin-top:8px;" onclick="myeSave()" aria-label="Save changes">💾 Save Changes</button>' +
    (MYE.msg ? '<p role="status" style="font-family:Cinzel,serif;font-size:0.7rem;color:#a0d4a0;text-align:center;">' + _myeEsc(MYE.msg) + '</p>' : '') +
    '<button class="btn-ghost" style="width:100%;margin-top:20px;color:#ff8866;border-color:#882222;" onclick="myeDelete()" aria-label="Delete ' + _myeEsc(e.name) + ' from every dungeon">🗑 Delete This Enemy</button>';
}

function myeKeepFields() {
  var e = MYE.editing; if (!e) return;
  var n = document.getElementById('mye-name'), d = document.getElementById('mye-desc');
  if (n) e._draftName = n.value; if (d) e._draftDesc = d.value;
}
function myeRestoreFields() {
  var e = MYE.editing; if (!e) return;
  if (e._draftName != null) document.getElementById('mye-name').value = e._draftName;
  if (e._draftDesc != null) document.getElementById('mye-desc').value = e._draftDesc;
}

function myeTypeChanged() {
  var t = document.getElementById('mye-type').value;
  myeKeepFields();
  var s = myeRoll(t); MYE.preview = { type: t, hp: s.hp, atk: s.atk, def: s.def };
  myeRenderEdit(); myeRestoreFields();
  try { sfx('sfx-select'); } catch (x) {}
  say('New stats. HP ' + s.hp + ', attack ' + s.atk + ', defense ' + s.def + '. Save to keep them.');
  document.getElementById('mye-type').focus();
}

function myeReroll() {
  myeKeepFields();
  var t = MYE.preview.type, s = myeRoll(t); MYE.preview = { type: t, hp: s.hp, atk: s.atk, def: s.def };
  myeRenderEdit(); myeRestoreFields();
  try { sfx('sfx-select'); } catch (x) {}
  say('New stats. HP ' + s.hp + ', attack ' + s.atk + ', defense ' + s.def + '. Save to keep them.');
}

function myeBack() { MYE.editing = null; myeRenderList(); say('My Enemies.'); }

function myeSave() {
  var e = MYE.editing, p = MYE.preview; if (!e) return;
  var name = (document.getElementById('mye-name').value || '').trim(), desc = (document.getElementById('mye-desc').value || '').trim();
  var problem = !name ? 'Please give your enemy a name.' : name.length < 2 ? 'Enemy name is too short.' : !desc ? 'Please add a description.'
    : (ecContainsBadWord(name) || ecContainsBadWord(desc)) ? 'Your submission contains inappropriate content. Please revise and try again.' : null;
  if (problem) { MYE.msg = problem; myeKeepFields(); myeRenderEdit(); myeRestoreFields(); say(problem); return; }
  var fields = { name: name.slice(0, 30), desc: desc.slice(0, 200), type: p.type, icon: MYE_ICONS[p.type] || '👤', hp: p.hp, atk: p.atk, def: p.def, editedAt: Date.now() };
  window._fbDb.collection('community_enemies').doc(e.id).update(fields).then(function() {
    Object.assign(e, fields); delete e._draftName; delete e._draftDesc;
    try { _communityEnemyCacheTime = 0; } catch (x) {}
    try { sfx('sfx-confirm'); } catch (x) {}
    MYE.msg = 'Saved. ' + name + ' is updated in every dungeon.';
    myeRenderEdit(); say(MYE.msg);
  }).catch(function() { MYE.msg = 'Couldn\'t save it. Check your connection and try again.'; myeKeepFields(); myeRenderEdit(); myeRestoreFields(); say(MYE.msg); });
}

function myeDelete() {
  var e = MYE.editing; if (!e) return;
  if (!confirm('Delete ' + e.name + '? It will leave every player\'s dungeon. This can\'t be undone from the game.')) return;
  var f = { approved: false, moderatedAt: Date.now() };
  f[_myeIsDev() ? 'deletedByDeveloper' : 'deletedByOwner'] = true;
  window._fbDb.collection('community_enemies').doc(e.id).update(f).then(function() {
    MYE.list = MYE.list.filter(function(x) { return x.id !== e.id; });
    try { _communityEnemyCacheTime = 0; } catch (x) {}
    MYE.editing = null; myeRenderList();
    say(e.name + ' has been deleted from every dungeon.');
  }).catch(function() { say('Couldn\'t delete it. Check your connection and try again.'); });
}

function openMyEnemies() {
  myeEnsureScreen();
  MYE.editing = null; MYE.loading = !!_myeUid();
  goTo('my-enemies');
  myeRenderList();
  myeLoad().then(function() {
    MYE.loading = false; myeRenderList();
    say(!_myeUid() ? 'My Enemies. Sign in to edit your enemies.'
      : !MYE.list.length ? 'My Enemies. You have no enemies to edit yet.' : 'My Enemies. ' + MYE.list.length + '. Choose one to edit it.');
  });
}

// The button, under "Create Your Own Enemy" in the Bestiary's Community tab.
(function() {
  function addButton() {
    if (document.getElementById('be-my-enemies-btn')) return;
    var sec = document.getElementById('be-section-community');
    var create = sec && sec.querySelector('button[onclick="goTo(\'enemy-creator\')"]');
    if (!create) return;
    var b = document.createElement('button');
    b.id = 'be-my-enemies-btn';
    b.style.cssText = create.style.cssText;
    b.textContent = '🛠 My Enemies';
    b.setAttribute('aria-label', 'My enemies. Rename, make stronger or delete the enemies you made');
    b.onclick = openMyEnemies;
    create.parentNode.insertBefore(b, create.nextSibling);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
})();
