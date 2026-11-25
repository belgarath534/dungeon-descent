//═════════════════
// RARE ROOMS (12.1.1 and 12.2, the same as the apps)
//═════════════════
// Three rare rooms in any dungeon (not the Abyssal Deep or the Shadow World,
// like the other shared events):
// - The Magic Chamber (12.1.1, asked for on the Discord): a unicorn waits.
//   Approach it and Starlight the Unicorn joins you as a minion; it fights
//   beside you and heals you 3 HP every round. Finding it again restores
//   your HP and SP.
// - The Wishing Well (12.2): 25 gold for a wish (+3 attack this run, +15 max
//   HP, or a Wishing Coin), or drink (SP restored, +15 HP).
// - The Forgotten Music Room (12.2): play the piano (a healing song, a
//   battle song for 5 turns, or something hears you and comes), or take the
//   Sheet Music, a lullaby that puts an enemy to sleep for 2 turns.

var UNICORN_MINION_ID = 'unicorn';
var UNICORN_HEAL = 3;
var WISH_COST = 25;

function _rareRoomDone(type, msg, logType) {
  updateTopBar(); updatePlayerBar(); renderInv();
  setEvent(type, msg);
  say(msg);
  addRunLog(msg, logType || 'good');
}

// Shows the same event again (the well, when you can't pay).
function _reshowEvent(ev, note) {
  setTimeout(function() {
    _activeEvent = ev;
    setEvent('encounter', note + ' ' + ev.title + ' — ' + ev.text);
    var html = ev.choices.map(function(c, i) {
      return '<button class="dg-act-btn" onclick="resolveEvent(' + i + ')" aria-label="' + c.label + '" style="margin-top:6px;">' + c.label + '</button>';
    }).join('');
    document.getElementById('dg-event').innerHTML += '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">' + html + '</div>';
    say(note + ' ' + ev.choices.map(function(c) { return c.label; }).join(' or ') + '.');
  }, 0);
}

var MAGIC_CHAMBER_EVENT = { id:'magic-chamber', weight:1, type:'encounter',
  title:'✨ The Magic Chamber',
  text:'A hidden chamber glows with soft, shifting light, like moonlight on water. In the middle stands a unicorn, white as starlight, its horn faintly humming. It looks at you as if it has been waiting.',
  choices: [
    { label:'Approach the unicorn', outcome: function() {
      DS.hp = DS.maxHp; DS.sp = DS.maxSp;
      var list = getMinions();
      if (list.some(function(m) { return m.id === UNICORN_MINION_ID; })) {
        _rareRoomDone('good', "Starlight's light is in this room. It was here before you, waiting. It touches its horn to your shoulder. HP and SP fully restored.");
        return;
      }
      if (list.length >= 8) {
        _rareRoomDone('good', 'The unicorn touches its horn to your shoulder. HP and SP fully restored. It looks at your crowded Home and does not follow. Free a minion\'s place and it may come with you next time.');
        return;
      }
      list.push({ id: UNICORN_MINION_ID, name: 'Starlight the Unicorn', icon: '🦄', atk: 10, tier: 'rare', capturedOn: Date.now() });
      saveMinions(list);
      try { incrementAchievementStat('unicornFound', 1); } catch (e) {}
      sfx('sfx-loot'); vibe(VIBE.loot);
      _rareRoomDone('good', 'You step closer. The unicorn lowers its head and touches its horn to your shoulder. Warmth floods through you. HP and SP fully restored. Then it follows you out. 🦄 Starlight the Unicorn has joined you as a minion! Choose it in your Home under Minions. It fights beside you, and its horn heals you every round.');
    }},
    { label:'Leave it in peace', outcome: function() {
      DS.hp = Math.min(DS.maxHp, DS.hp + 10);
      _rareRoomDone('good', 'You leave the unicorn in peace. It bows its head as you go, and the light follows you a little way. Plus 10 HP.');
    }},
  ]
};

var WISHING_WELL_EVENT = { id:'wishing-well', weight:1, type:'encounter',
  title:'🪙 The Wishing Well',
  text:'An old stone well sits in the middle of the room. Coins glint far below, and when you lean close you can hear the water whispering wishes back.',
  choices: [
    { label:'Toss in ' + WISH_COST + ' gold and make a wish', outcome: function() {
      if (DS.gold < WISH_COST) {
        _reshowEvent(WISHING_WELL_EVENT, 'You search your pockets. You don\'t have ' + WISH_COST + ' gold. The well waits.');
        return;
      }
      DS.gold -= WISH_COST; spendGlobalGold(WISH_COST);
      var roll = Math.floor(Math.random() * 3);
      if (roll === 0) {
        DS.atkBonus = (DS.atkBonus || 0) + 3;
        _rareRoomDone('good', 'The coin falls a long way. Then a warm wind rises out of the well. Your wish is heard: plus 3 attack for the rest of this run.');
      } else if (roll === 1) {
        DS.maxHp += 15; DS.hp = Math.min(DS.maxHp, DS.hp + 15);
        _rareRoomDone('good', 'The coin falls a long way. The water hums, and you feel sturdier. Your wish is heard: plus 15 max HP for this run.');
      } else {
        DS.inventory.push(rareRoomItem('wishing-coin'));
        sfx('sfx-loot');
        _rareRoomDone('good', 'The coin falls a long way, and then something flies back up and lands in your hand: a different coin, glowing faintly. You got a Wishing Coin.');
      }
    }},
    { label:'Drink from the well', outcome: function() {
      DS.sp = DS.maxSp; DS.hp = Math.min(DS.maxHp, DS.hp + 15);
      _rareRoomDone('good', 'The water is cold and tastes of old stone. Your mind clears. SP fully restored, and plus 15 HP.');
    }},
    { label:'Walk away', outcome: function() {
      _rareRoomDone('', 'You leave the well to its whispering.');
    }},
  ]
};

var MUSIC_ROOM_EVENT = { id:'music-room', weight:1, type:'encounter',
  title:'🎼 The Forgotten Music Room',
  text:'Dust covers an old piano. A single sheet of music sits on its stand. The keys look like they still remember a song.',
  choices: [
    { label:'Play the piano', outcome: function() {
      var roll = Math.floor(Math.random() * 3);
      if (roll === 0) {
        var heal = Math.max(1, Math.floor(DS.maxHp * 3 / 10));
        DS.hp = Math.min(DS.maxHp, DS.hp + heal);
        _rareRoomDone('good', 'You play a slow, gentle song. The room seems to breathe out. You heal ' + heal + ' HP.');
      } else if (roll === 1) {
        fxTempStat('atk', 6, 5);
        _rareRoomDone('good', 'You play something fast and fierce. Your blood answers. Plus 6 attack for 5 turns.');
      } else {
        _rareRoomDone('danger', 'You play a haunting melody. Halfway through, something in the dark starts humming along. It\'s coming.', 'danger');
        var pool = getEnemyPool();
        if (!pool.length) return;
        var e = Object.assign({}, pool[Math.floor(Math.random() * pool.length)]);
        e.maxHp = e.hp;
        DS.enemy = applyTierScaling(e);
        setTimeout(function() { startCombat(false); }, 800);
      }
    }},
    { label:'Take the sheet music', outcome: function() {
      DS.inventory.push(rareRoomItem('sheet-music'));
      sfx('sfx-loot');
      _rareRoomDone('good', 'You fold the sheet music carefully and put it away. It\'s a lullaby. You got Sheet Music.');
    }},
    { label:'Leave quietly', outcome: function() {
      _rareRoomDone('', 'You leave the piano to its silence.');
    }},
  ]
};

function rareRoomItem(type) {
  return type === 'wishing-coin'
    ? { id:'wishing-coin', name:'Wishing Coin', icon:'🪙', type:'wishing-coin', desc:'A coin the well gave back. Make a wish: full HP and 20 SP.' }
    : { id:'sheet-music', name:'Sheet Music', icon:'🎼', type:'sheet-music', desc:'A lullaby. Use it in a fight to put a non-boss enemy to sleep for 2 turns.' };
}

// The two items, from the inventory. Returns true when it handled the item.
function useRareRoomItem(i) {
  var item = DS.inventory[i];
  if (!item) return false;
  if (item.type === 'wishing-coin') {
    DS.hp = DS.maxHp; DS.sp = Math.min(DS.maxSp, DS.sp + 20);
    DS.inventory.splice(i, 1);
    _rareRoomDone('good', '🪙 You make a wish on the coin. Light runs through you. HP fully restored, plus 20 SP.');
    saveProgress();
    return true;
  }
  if (item.type === 'sheet-music') {
    if (!DS.inCombat || !DS.enemy || DS.enemy.hp <= 0) { say('Save the lullaby for a fight.'); return true; }
    if (DS.enemy.isBoss) { say("The boss doesn't listen to lullabies."); return true; }
    fxGet().stun = Math.max(fxGet().stun || 0, 2);
    DS.inventory.splice(i, 1);
    var msg = '🎼 You hum the lullaby. ' + DS.enemy.name + '\'s eyes grow heavy. It falls asleep for 2 turns.';
    addLog(msg); say(msg); renderInv(); saveProgress();
    return true;
  }
  return false;
}

(function() {
  if (typeof DUNGEON_EVENTS === 'undefined') return;
  DUNGEON_EVENTS.push(MAGIC_CHAMBER_EVENT, WISHING_WELL_EVENT, MUSIC_ROOM_EVENT);
  // The items go through useItem like every other one.
  var _useItem = useItem;
  window.useItem = useItem = function(i) {
    if (useRareRoomItem(i)) return;
    return _useItem.apply(this, arguments);
  };
})();
