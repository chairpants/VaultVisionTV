// Glue: wire the remote, the player, the guide, and VOD together around one
// piece of state — which channel number is tuned.
//
// Plain script, not a module (see scheduler.js's header) — CHANNELS,
// GUIDE_CHANNEL, VOD_CHANNEL, CATALOG, createPlayer, createGuide, createVod,
// and initRemote all come from earlier <script src> tags in index.html
// loading into the shared top-level scope; order matters there.
// Was 3 (TOON CHANNEL) -- retired along with the rest of the flat cartoon
// sweep (see channels.js), and channel 3 has since been refilled with an
// unrelated sitcom rotation, so this stays on KIDS & LEARNING: a genre
// channel, so always has something airing (no daypart gap to land in), and
// wholesome/all-ages the way a default ought to be.
const DEFAULT_CHANNEL = 8; // KIDS & LEARNING
const VOLUME_STEP = 0.1;

const byNumber = Object.fromEntries(CHANNELS.map((c) => [c.number, c]));
const sortedNumbers = CHANNELS.map((c) => c.number).sort((a, b) => a - b);

function main() {
  const catalog = window.CATALOG;
  const video = document.getElementById("screen");
  const osd = document.getElementById("osd");

  const player = createPlayer({
    video,
    osd,
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
    vodSeek: document.getElementById("vod-seek"),
    vodSeekFill: document.getElementById("vod-seek-fill"),
    vodSeekDirEl: document.getElementById("vod-seek-dir"),
    vodSeekTimeEl: document.getElementById("vod-seek-time"),
  });

  // currentNumber is always a real content channel — the guide is a toggled
  // overlay, not something tuned into, so the video underneath it keeps
  // playing (and the drift loop below keeps it live) the whole time it's up.
  // VOD is different: it really is a channel (see tuneTo), so currentNumber
  // does become VOD_CHANNEL for as long as it's open or playing.
  let currentNumber = DEFAULT_CHANNEL;
  let lastNumber = DEFAULT_CHANNEL; // what RETURN flips back to
  let guideOpen = false;
  let vodOpen = false; // the browse overlay (sections/shows/episodes) is up
  let vodPlaying = false; // an on-demand episode is actively playing (overlay hidden)

  const guide = createGuide({
    root: document.getElementById("guide"),
    channels: CHANNELS,
    catalog,
    tuneTo,
    getCurrentNumber: () => currentNumber,
  });

  const vod = createVod({
    root: document.getElementById("vod"),
    catalog,
    playEpisode: async (show, episode) => {
      vodOpen = false;
      vod.hide();
      const ok = await player.playEpisode(show, episode);
      if (ok) {
        vodPlaying = true;
      } else {
        returnToVodMenu(); // no playable file — nothing to fail over to, just back to the list
      }
    },
    // Top level of the browse overlay, Back pressed -> exit VOD entirely.
    onExit: () => {
      vodOpen = false;
      vod.hide();
      tuneTo(lastNumber);
    },
  });

  function tuneTo(number) {
    if (number === GUIDE_CHANNEL) {
      toggleGuide();
      return;
    }
    if (number === VOD_CHANNEL) {
      enterVod();
      return;
    }
    const channel = byNumber[number];
    if (!channel) return; // no such channel — ignore, like a real tuner would
    if (number !== currentNumber) lastNumber = currentNumber;
    currentNumber = number;
    // Picking a channel straight off a guide row bypasses toggleGuide()
    // entirely, so it has to undo the docking itself — otherwise the picture
    // stayed sized/positioned for the guide's PIP box until the next time
    // the GUIDE key happened to be pressed.
    guideOpen = false;
    guide.hide();
    player.setGuideMode(false);
    if (vodOpen || vodPlaying) {
      vodOpen = false;
      vodPlaying = false;
      vod.hide();
    }
    player.tune(channel, catalog);
  }

  function toggleGuide() {
    guideOpen = !guideOpen;
    if (guideOpen) {
      // show() before setGuideMode(true): layoutCrop() measures
      // #guide-video-slot's live layout box, which only exists once the
      // guide's DOM is actually visible (display:none elements have no box).
      guide.show();
      player.setGuideMode(true);
    } else {
      guide.hide();
      player.setGuideMode(false);
      // VOD is a real channel number but not a scheduled one, so there's no
      // position to re-tune to: getPositionAt returns null for kind:"vod" and
      // tune() reacts by pausing, dropping the src and showing NO SIGNAL —
      // i.e. it would kill the on-demand title playing underneath the guide.
      // Same hazard the drift loop already guards against (see player.js's
      // startDriftLoop). Undocking the picture is all that's needed here;
      // on-demand playback never drifts, it just resumes where it was.
      if (currentNumber === VOD_CHANNEL) return;
      // re-tune on close: cheap no-op if nothing changed (same episode key
      // skips the src reload), but corrects any drift and re-flashes the
      // OSD banner so it's obvious what you've come back to
      player.tune(byNumber[currentNumber], catalog);
    }
  }

  // Unlike the guide (a pure overlay — currentNumber never actually becomes
  // its number), VOD really is a channel: it takes over the screen and
  // participates in channel-step rotation like any other, it just shows a
  // browsable menu instead of a scheduled position. Always resets to the
  // top (sections) level, even if VOD was already open (e.g. re-dialing 2).
  function enterVod() {
    if (currentNumber !== VOD_CHANNEL) lastNumber = currentNumber;
    currentNumber = VOD_CHANNEL;
    guideOpen = false;
    guide.hide();
    player.setGuideMode(false);
    video.pause();
    video.removeAttribute("src");
    osd.classList.add("hidden");
    vodPlaying = false;
    vodOpen = true;
    vod.show();
  }

  // Drops back into the browse overlay at whatever level it was left at
  // (vod.js's own nav stack is untouched by hide()) — used for Back-while-
  // playing, natural end-of-title, and a selection with no playable file.
  function returnToVodMenu() {
    vodPlaying = false;
    video.pause();
    vodOpen = true;
    vod.resume();
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
    onVod: () => tuneTo(VOD_CHANNEL),
    onVolumeStep: stepVolume,
    onMute: toggleMute,
    onLastChannel: () => tuneTo(lastNumber),
    // Only meaningful during VOD playback — live channels never get
    // trick-play (see player.js's applyPositionToVideo), a no-op otherwise.
    onSeekStart: (dir) => { if (vodPlaying) player.vodSeekBegin(dir); },
    onSeekEnd: () => { if (vodPlaying) player.vodSeekCommit(); },
    // Whatever's on screen right now — an episode or a commercial — came from
    // some archive.org item; the WEB key opens that item's page.
    onWeb: () => {
      const itemId = player.getItemId();
      if (!itemId) return; // nothing loaded yet
      window.open(`https://archive.org/details/${itemId}`, "_blank", "noopener");
    },
  });

  // Natural end of an on-demand title (no scheduled "next" to fail over to,
  // unlike a live channel's pool) — drop back to the episode list it came
  // from rather than sitting on a frozen last frame.
  video.addEventListener("ended", () => {
    if (vodPlaying) returnToVodMenu();
  });

  // An on-demand title is playing full-screen (the browse overlay itself is
  // hidden at this point, so vod.js's own Escape/Backspace listener is a
  // no-op) — Back returns to the menu it was launched from.
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Escape" || e.key === "Backspace") && vodPlaying) returnToVodMenu();
  });

  // The picture is the same <video> element whether full-screen or docked
  // as the guide's mini preview (see player.js's layoutCrop) — one handler
  // covers both directions of the toggle: click the full picture to bring
  // the guide up, click the docked mini picture to bring it back down.
  video.addEventListener("click", () => tuneTo(GUIDE_CHANNEL));

  // Browser fullscreen (the OS-level kind, distinct from the app's own
  // "full-screen picture vs. docked in the guide" concept above) — fullscreens
  // #tv rather than the video alone so the OSD/remote/guide keep working
  // inside it. webkit-prefixed fallbacks are Safari's, which still doesn't
  // expose the unprefixed names.
  (function initFullscreen() {
    const REVEAL_MS = 2500;
    const btn = document.getElementById("fullscreen-btn");
    const tv = document.getElementById("tv");
    const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;

    // No permanent box drawn for this button (see style.css) — it only
    // exists on screen while the mouse is actually moving (or, on a touch
    // device, just got tapped), fading out again after a short idle spell
    // like a video player's own controls rather than sitting over the
    // picture at all times.
    let hideTimer = null;
    function reveal() {
      btn.classList.add("visible");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => btn.classList.remove("visible"), REVEAL_MS);
    }
    tv.addEventListener("mousemove", reveal);
    tv.addEventListener("touchstart", reveal, { passive: true });
    reveal(); // visible on load so it's discoverable at all, then fades same as any other idle spell

    btn.addEventListener("click", () => {
      if (fsElement()) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        (tv.requestFullscreen || tv.webkitRequestFullscreen).call(tv);
      }
    });
    ["fullscreenchange", "webkitfullscreenchange"].forEach((ev) =>
      document.addEventListener(ev, () => {
        const isFs = !!fsElement();
        btn.classList.toggle("is-fullscreen", isFs);
        btn.setAttribute("aria-pressed", String(isFs));
        btn.setAttribute("aria-label", isFs ? "Exit fullscreen" : "Enter fullscreen");
      })
    );
  })();

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
