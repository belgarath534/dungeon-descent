//═════════════════
// FOUR NEW GUNS AND A SOUND FOR EVERY GUN (12.2, the same as the apps)
//═════════════════
// - Harpoon Gun: pins the enemy, which loses its next turn (bosses break free half the time).
// - Flare Gun: the enemy burns for 8 a turn for 3 turns.
// - Blunderbuss: in an ambush the spray hits every other enemy for 60%.
// - Tesla Coil: each shot in a row in a fight hits 25% harder, up to double.
// Every gun sounds different: the shot's pitch (big guns boom lower, small
// ones crack higher) and an echo or a second sound. The revolver and the
// repeater have their own recorded shots (made with ElevenLabs sound effects),
// except in the Android app (see _gunAndroid). When copying the web version
// into the Android app's www, leave out audio/sfx-gun-revolver.mp3 and
// audio/sfx-gun-repeater.mp3.

(function() {
  function gun(id, name, icon, tier, lo, hi, shots, cd, cost, parts, desc, effect) {
    return { id:id, name:name, icon:icon, tier:tier, dmgMin:lo, dmgMax:hi, shots:shots, cooldown:cd,
      chargeSfx:'sfx-charge-gun', readySfx:'sfx-unlock', shootSfx:'sfx-gun-shot',
      desc:desc, diamondCost:cost, craftParts:parts, effect:effect };
  }
  if (typeof GUN_DEFS === 'undefined' || GUN_DEFS.some(function(g) { return g.id === 'harpoon'; })) return;
  GUN_DEFS.push(
    gun('harpoon', 'Harpoon Gun', '🪝', 3, 30, 45, 1, 14, 24, ['barrel','mechanism','stock','trigger'],
      'Fires a barbed harpoon on a chain. It pins the enemy in place: it loses its next turn. Bosses break free half the time.', 'pin'),
    gun('flaregun', 'Flare Gun', '🎆', 2, 15, 24, 2, 12, 15, ['barrel','mechanism','trigger'],
      'Two burning flares. Weak on impact, but the enemy burns for 8 damage a turn for 3 turns.', 'burn'),
    gun('blunderbuss', 'Blunderbuss', '💥', 4, 30, 46, 1, 17, 30, ['barrel','barrel','mechanism','stock','trigger'],
      'A brass funnel full of everything. In an ambush the spray hits every enemy at once.', 'spread'),
    gun('teslacoil', 'Tesla Coil', '⚡', 5, 20, 30, 6, 22, 55, ['barrel','mechanism','mechanism','mechanism','stock','trigger'],
      'Six crackling bolts. Every shot in a row in the same fight hits harder, up to double damage.', 'chain')
  );
})();

// Each gun's shot: [main, pitch, after, afterPitch, afterDelay (s), afterVolume].
// 'shot' and 'charge' are the gun sounds; a name starting with 'audio/' is a
// file; anything else is a game sound effect.
var GUN_SOUNDS = {
  flintlock:    ['shot', 0.95, 'charge', 0.7, 0.25, 0.35],
  revolver:     ['audio/sfx-gun-revolver.mp3', 1],
  magnum:       ['shot', 0.82, 'shot', 0.6, 0.18, 0.3],
  glock:        ['shot', 1.25],
  machinepistol:['shot', 1.45],
  musket:       ['shot', 0.72, 'shot', 0.5, 0.3, 0.35],
  sawedoff:     ['shot', 0.68, 'sfx-heavy-hit', 0.8, 0.04, 0.6],
  doublebarrel: ['shot', 0.78, 'shot', 0.8, 0.12, 0.7],
  repeater:     ['audio/sfx-gun-repeater.mp3', 1],
  autorifle:    ['shot', 1.2],
  ak47:         ['shot', 0.9, 'shot', 0.95, 0.08, 0.55],
  sniper:       ['shot', 0.6, 'shot', 0.45, 0.45, 0.3],
  crossbow:     ['sfx-attack', 1.35],
  harpoon:      ['shot', 0.75, 'sfx-heavy-hit', 0.7, 0.22, 0.7],
  flaregun:     ['sfx-firework', 1.1, 'sfx-enemy-fire', 1, 0.3, 0.4],
  blunderbuss:  ['shot', 0.58, 'shot', 0.7, 0.05, 0.65],
  teslacoil:    ['charge', 1.7, 'sfx-enemy-fire', 1.5, 0.06, 0.5]
};

function _gunPlay(src, pitch, volume) {
  try {
    if (src !== 'shot' && src !== 'charge' && src.indexOf('audio/') !== 0) { sfx(src); return; }
    if (AUD && AUD.sfxOn === false) return;
    var a = new Audio(src === 'shot' ? _GUN_AUDIO.shot : src === 'charge' ? _GUN_AUDIO.charge : src);
    a.preservesPitch = false; a.mozPreservesPitch = false; a.webkitPreservesPitch = false;
    a.playbackRate = pitch || 1;
    a.volume = Math.max(0, Math.min(1, (AUD ? (AUD.sfxVol || 0.7) : 0.7) * (volume || 1)));
    a.play().catch(function() {});
  } catch (e) {}
}

// The two recorded shots were made on the free ElevenLabs plan, which doesn't
// allow commercial use. The Android app sells Mystery Coins and shows ads, so
// there they're left out: the revolver and the repeater use pitched shots.
function _gunAndroid() {
  try { return !!(window.Capacitor && Capacitor.getPlatform && Capacitor.getPlatform() === 'android'); } catch (e) { return false; }
}
var GUN_SOUNDS_ANDROID = { revolver: ['shot', 1.05], repeater: ['shot', 1.1, 'shot', 1.15, 0.09, 0.45] };

function playGunShot(gunId) {
  var s = (_gunAndroid() && GUN_SOUNDS_ANDROID[gunId]) || GUN_SOUNDS[gunId] || ['shot', 1];
  _gunPlay(s[0], s[1], 1);
  if (s[2]) setTimeout(function() { _gunPlay(s[2], s[3], s[5]); }, Math.round((s[4] || 0) * 1000));
}

// A shot's damage with the Tesla Coil's charge (one shot of any other gun resets it).
function gunShotDamage(gun, dmg) {
  if (!DS.enemy) return dmg;
  if (gun.effect === 'chain') {
    var n = Math.min(4, DS.enemy._teslaShots || 0);
    DS.enemy._teslaShots = n + 1;
    return Math.round(dmg * (1 + 0.25 * n));
  }
  DS.enemy._teslaShots = 0;
  return dmg;
}

// What the newer guns do besides damage, after the shot lands.
function gunShotEffect(gun, dmg) {
  var e = DS.enemy;
  if (!e || e.hp <= 0 || !gun.effect) return;
  if (gun.effect === 'pin') {
    if (!e.isBoss || Math.random() < 0.5) { e._stunned = true; addLog('🪝 The harpoon pins ' + e.name + ' in place! It loses its next turn.'); }
    else addLog('🪝 ' + e.name + ' tears the harpoon loose.');
  } else if (gun.effect === 'burn') {
    var f = fxGet(); f.dot = Math.max(f.dot || 0, 8); f.dotTurns = Math.max(f.dotTurns || 0, 3);
    addLog('🎆 ' + e.name + ' catches fire! It burns for 8 a turn for 3 turns.');
  } else if (gun.effect === 'spread') {
    if (typeof _multiCombatActive === 'undefined' || !_multiCombatActive || !_multiEnemies || _multiEnemies.length < 2) return;
    var splash = Math.max(1, Math.floor(dmg * 6 / 10));
    _multiEnemies.slice().forEach(function(o) {
      if (o === e) return;
      o.hp = Math.max(0, o.hp - splash);
      if (o.hp <= 0) {
        var g = resolveGold(o.gold);
        DS.gold += g; DS.kills++; addGlobalGold(g);
        _multiEnemies.splice(_multiEnemies.indexOf(o), 1);
        addLog('💥 ' + o.name + ' falls to the spray!');
      }
    });
    addLog('💥 The spray hits the rest of the ambush for ' + splash + ' each!');
    try { updateTopBar(); renderMultiEnemies(); } catch (x) {}
  } else if (gun.effect === 'chain' && (e._teslaShots || 0) > 1) {
    addLog('⚡ The coil crackles hotter. Shot ' + e._teslaShots + ' in a row.');
  }
}
