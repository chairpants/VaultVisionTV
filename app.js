// Glue: wire the remote, the player, and the guide together around one
// piece of state — which channel number is tuned.
//
// Plain script, not a module (see scheduler.js's header) — CHANNELS,
// GUIDE_CHANNEL, CATALOG, createPlayer, createGuide, and initRemote all come
// from earlier <script src> tags in index.html loading into the shared
// top-level scope; order matters there.
const DEFAULT_CHANNEL = 3; // TOON CHANNEL

const byNumber = Object.fromEntries(CHANNELS.map((c) => [c.number, c]));
const sortedNumbers = CHANNELS.map((c) => c.number).sort((a, b) => a - b);

function main() {
  const catalog = window.CATALOG;

  const player = createPlayer({
    video: document.getElementById("screen"),
    osd: document.getElementById("osd"),
    osdCh: document.getElementById("osd-ch"),
    osdTagline: document.getElementById("osd-tagline"),
    osdShow: document.getElementById("osd-show"),
    osdEpisode: document.getElementById("osd-episode"),
    osdBarFill: document.getElementById("osd-bar-fill"),
    blankMsg: document.getElementById("blank-msg"),
    startHint: document.getElementById("start-hint"),
  });

  // currentNumber is always a real content channel — the guide is a toggled
  // overlay, not something tuned into, so the video underneath it keeps
  // playing (and the drift loop below keeps it live) the whole time it's up.
  let currentNumber = DEFAULT_CHANNEL;
  let guideOpen = false;
  const guide = createGuide({
    root: document.getElementById("guide"),
    channels: CHANNELS,
    catalog,
    tuneTo,
  });

  function tuneTo(number) {
    if (number === GUIDE_CHANNEL) {
      toggleGuide();
      return;
    }
    const channel = byNumber[number];
    if (!channel) return; // no such channel — ignore, like a real tuner would
    currentNumber = number;
    guideOpen = false;
    guide.hide();
    player.tune(channel, catalog);
  }

  function toggleGuide() {
    guideOpen = !guideOpen;
    if (guideOpen) {
      guide.show(); // video plays on, untouched, behind the (semi-transparent) overlay
    } else {
      guide.hide();
      // re-tune on close: cheap no-op if nothing changed (same episode key
      // skips the src reload), but corrects any drift and re-flashes the
      // OSD banner so it's obvious what you've come back to
      player.tune(byNumber[currentNumber], catalog);
    }
  }

  function step(direction) {
    const idx = sortedNumbers.indexOf(currentNumber);
    const next = sortedNumbers[(idx + direction + sortedNumbers.length) % sortedNumbers.length];
    tuneTo(next);
  }

  initRemote({
    root: document.getElementById("remote"),
    digitOsd: document.getElementById("digit-osd"),
    onTuneNumber: tuneTo,
    onChannelStep: step,
    onGuide: () => tuneTo(GUIDE_CHANNEL),
  });

  player.startDriftLoop(() => byNumber[currentNumber], catalog);
  tuneTo(DEFAULT_CHANNEL);
}

try {
  main();
} catch (e) {
  console.error(e);
  document.getElementById("blank-msg").textContent = "TUNER ERROR — " + e.message;
  document.getElementById("blank-msg").classList.remove("hidden");
}
