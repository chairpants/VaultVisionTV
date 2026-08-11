// Glue: wire the remote, the player, and the guide together around one
// piece of state — which channel number is tuned.
//
// Plain script, not a module (see scheduler.js's header) — CHANNELS,
// GUIDE_CHANNEL, CATALOG, createPlayer, createGuide, and initRemote all come
// from earlier <script src> tags in index.html loading into the shared
// top-level scope; order matters there.
const DEFAULT_CHANNEL = 3; // TOON CHANNEL
const VOLUME_STEP = 0.1;

const byNumber = Object.fromEntries(CHANNELS.map((c) => [c.number, c]));
const sortedNumbers = CHANNELS.map((c) => c.number).sort((a, b) => a - b);

function main() {
  const catalog = window.CATALOG;
  const video = document.getElementById("screen");

  const player = createPlayer({
    video,
    osd: document.getElementById("osd"),
    osdCh: document.getElementById("osd-ch"),
    osdTagline: document.getElementById("osd-tagline"),
    osdShow: document.getElementById("osd-show"),
    osdEpisode: document.getElementById("osd-episode"),
    osdBarFill: document.getElementById("osd-bar-fill"),
    blankMsg: document.getElementById("blank-msg"),
    startHint: document.getElementById("start-hint"),
    padCard: document.getElementById("pad-card"),
    chyron: document.getElementById("chyron"),
    chyronTitle: document.getElementById("chyron-title"),
    chyronSub: document.getElementById("chyron-sub"),
    chyronClock: document.getElementById("chyron-clock"),
  });

  // currentNumber is always a real content channel — the guide is a toggled
  // overlay, not something tuned into, so the video underneath it keeps
  // playing (and the drift loop below keeps it live) the whole time it's up.
  let currentNumber = DEFAULT_CHANNEL;
  let lastNumber = DEFAULT_CHANNEL; // what RETURN flips back to
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
    if (number !== currentNumber) lastNumber = currentNumber;
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

  const volumeLabel = () => `VOL ${Math.round(video.volume * 100)}`;

  function stepVolume(direction) {
    video.muted = false; // volume press unmutes, same as a real set
    // rounded to a tenth so repeated steps land on clean 10% marks
    video.volume = Math.min(1, Math.max(0, Math.round((video.volume + direction * VOLUME_STEP) * 10) / 10));
    remote.flash(volumeLabel());
  }

  function toggleMute() {
    video.muted = !video.muted;
    remote.flash(video.muted ? "MUTE" : volumeLabel());
  }

  const remote = initRemote({
    root: document.getElementById("remote"),
    digitOsd: document.getElementById("digit-osd"),
    onTuneNumber: tuneTo,
    onChannelStep: step,
    onGuide: () => tuneTo(GUIDE_CHANNEL),
    onVolumeStep: stepVolume,
    onMute: toggleMute,
    onLastChannel: () => tuneTo(lastNumber),
    // Whatever's on screen right now — an episode or a commercial — came from
    // some archive.org item; the WEB key opens that item's page.
    onWeb: () => {
      const itemId = player.getItemId();
      if (!itemId) return; // nothing loaded yet
      window.open(`https://archive.org/details/${itemId}`, "_blank", "noopener");
    },
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
