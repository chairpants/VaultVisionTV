// Exercises player.js's stall decision -- the one that fires when archive.org
// dribbles a file instead of failing it, so no "error" event ever arrives and
// the channel freezes until the slot rolls over.
//
//   node tools/check-stall.js
//
// The rule is small but every clause guards a real way to break the picture:
// firing while paused would fight the user, firing during a padding break
// would kill the countdown, and skipping straight to substitute would retire
// a good programme over one bad node.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'player.js'), 'utf8'));
const decide = global.window.stallActionDue; // renamed: eval() above already bound the original

const T = 1000000; // arbitrary "now"
const stalled = (over, extra) => Object.assign(
  { stalledSince: T - over, paused: false, hasEpisode: true, padding: false, stallRetunes: 0 },
  extra,
);

// Not stalled at all, or not stalled long enough, is the common case.
assert.strictEqual(decide(T, stalled(0, { stalledSince: 0 })), null, 'playing cleanly');
assert.strictEqual(decide(T, stalled(11999)), null, 'ordinary buffering is not a stall');

// Past the threshold: re-tune first, and only retire the file once re-tuning
// has had its two goes.
assert.strictEqual(decide(T, stalled(12000)), 'retune', 'first stall re-tunes');
assert.strictEqual(decide(T, stalled(30000, { stallRetunes: 1 })), 'retune', 'second re-tune');
assert.strictEqual(decide(T, stalled(30000, { stallRetunes: 2 })), 'substitute', 'then give up');

// States where a stall is not ours to act on.
assert.strictEqual(decide(T, stalled(30000, { paused: true })), null, 'user paused');
assert.strictEqual(decide(T, stalled(30000, { padding: true })), null, 'padding break');
assert.strictEqual(decide(T, stalled(30000, { hasEpisode: false })), null, 'nothing loaded');

console.log('ok - stall recovery: re-tune twice, then substitute');
