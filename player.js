// Wires a <video> element to the scheduler: tunes to a channel's live
// position, keeps a cable-box OSD, and polls to stay "live" the way a real
// broadcast doesn't wait for you.
//
// Plain script, not a module (see scheduler.js's header) — getPositionAt
// comes from the shared top-level scope, since scheduler.js loads first.

// archive.org path segments need individual encoding so a literal "/" in a
// fileHint (nested folders inside an item) survives instead of turning into
// %2F — copied verbatim from VaultVision's engine/viewer.html.
const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");

// Per-item metadata is fetched at most once (cached by itemId) and shared by
// every episode that lives in that item — cheap since items rarely change
// mid-session and several shows keep dozens of episodes in one item.
const metaCache = new Map();
function fetchItemMetadata(itemId) {
  if (!metaCache.has(itemId)) {
    metaCache.set(itemId, fetch(`https://archive.org/metadata/${itemId}`).then((r) => r.json()));
  }
  return metaCache.get(itemId);
}

// Mirrors engine/viewer.html's file resolution: a fileHint naming a non-web
// container (.mkv originals, mainly) often has silent audio if played as-is
// (AC3/DTS the browser can't decode), so prefer archive.org's auto-derived
// same-stem .mp4 when one exists. No fileHint at all (~0.4% of episodes) ->
// take the item's first .mp4, else first .ogv/.webm.
//
// A fileHint that already names a .mp4/.webm/.ogv isn't necessarily safe as
// given, though: archive.org's *original* upload can itself be named
// "foo.mp4" while carrying non-web audio (AC3/DTS), with the actual web-safe
// transcode filed separately as "foo.ia.mp4" (source: "derivative",
// original: "foo.mp4" in the item's metadata) — an exact-name match lands on
// the silent original instead. Check for a derivative naming this fileHint
// as its `original` first, before falling back to the extension-based guess
// or the exact-name match.
async function resolveEpisodeUrl(itemId, fileHint) {
  const meta = await fetchItemMetadata(itemId);
  const files = meta.files || [];
  const derivative = fileHint && files.find((f) => f.original === fileHint && /\.(mp4|webm|ogv)$/i.test(f.name));
  const needsDerivative = fileHint && !/\.(mp4|webm|ogv)$/i.test(fileHint);
  const derivativeName = needsDerivative && fileHint.replace(/\.[^./]+$/, ".mp4");
  const file = derivative || (fileHint
    ? (needsDerivative && files.find((f) => f.name === derivativeName)) ||
      files.find((f) => f.name === fileHint)
    : files.find((f) => /\.mp4$/i.test(f.name)) || files.find((f) => /\.(ogv|webm)$/i.test(f.name)));
  return file ? `https://archive.org/download/${itemId}/${encodePath(file.name)}` : null;
}

// -- picture crop -----------------------------------------------------------
// Some rips bake the video into a bigger frame — black bars plus an
// uploader watermark panel. `episode.crop` ({x,y,w,h} fractions 0..1, from
// VaultVision's crop/cropBySeason) trims it. Same transform trick as
// VaultVision's engine/viewer.html: translate+scale computed from the crop
// rect, valid because the element's own box is first resized (below, in
// layoutCrop) to exactly the cropped picture's aspect ratio with
// object-fit:fill — without that resize the transform would stretch the
// image rather than crop it.
function cropCSS(c) {
  return c
    ? `translate(${(-c.x / c.w * 100).toFixed(4)}%, ${(-c.y / c.h * 100).toFixed(4)}%) ` +
      `scale(${(1 / c.w).toFixed(5)}, ${(1 / c.h).toFixed(5)})`
    : "";
}

// Hosted-movie shows (MonsterVision, USA Up All Night, ...) carry the real
// film title separately from the wrapper show's own name — put the movie
// front and center, the way a real "movie of the night" bumper would, with
// the host show as the secondary line instead of a code.
function titleLines(show, episode) {
  return {
    title: episode.movieTitle || show.title,
    sub: episode.movieTitle
      ? show.title
      : episode.name ? `${episode.code}  ${episode.name}` : episode.code,
  };
}

const mmss = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const DRIFT_CHECK_MS = 15000;
const DRIFT_TOLERANCE_SEC = 3;
const OSD_VISIBLE_MS = 4000;

const PAD_TICK_MS = 500; // twice a second so the countdown never visibly skips
const SUBSTITUTE_MS = 1500; // how long the failure card sits before the swap
const NO_SIGNAL_TEXT = "NO SIGNAL";

// Fallback box for the docked picture-in-picture video (fraction of #tv) if
// guide.js's own #guide-video-slot bezel can't be found for some reason —
// layoutCrop() normally measures that element directly instead, so the
// picture and its decorative frame can't drift apart.
const GUIDE_VIDEO_W_FRAC = 0.44;
const GUIDE_VIDEO_H_FRAC = 0.4;

function createPlayer(els) {
  const { video, osd, osdCh, osdTagline, osdShow, osdEpisode, osdBarFill, blankMsg, startHint,
          padCard, chyron, chyronTitle, chyronSub, chyronClock } = els;

  let loadedEpisodeKey = null;
  let loadedItemId = null; // archive.org item behind whatever is on screen, ads included
  let lastTuned = null; // {channel, catalog} — what to re-tune after a failure
  let substituteTimer = null;
  let driftTimer = null;
  let osdFadeTimer = null;
  let padTimer = null;
  let tuneToken = 0; // invalidates in-flight resolves if the user flips again before they land
  let currentCrop = null; // {x,y,w,h} of the episode currently loaded, or null
  let guideMode = false; // true while the TV Guide is up — see setGuideMode

  // Sizes the <video> box itself to the cropped picture's true aspect ratio
  // (letterboxed within its container), then applies the crop transform —
  // mirrors VaultVision's layoutFlat(). Re-run on resize since the box is
  // now sized in pixels rather than left to CSS's width:100%/object-fit.
  function layoutCrop() {
    const container = video.parentElement;
    const c = currentCrop;
    const vw = (video.videoWidth || 4) * (c ? c.w : 1);
    const vh = (video.videoHeight || 3) * (c ? c.h : 1);
    // During a break the chyron owns the bottom strip — letterbox the picture
    // into what's left and push it up by the same amount, since #tv centers
    // its flex child including margins. Measured, not a constant, so the bar
    // can be restyled in CSS alone. Neither applies in guide mode: the video
    // leaves the centered flex flow entirely (position:absolute) and fits
    // instead into guide.js's own #guide-video-slot bezel — measured
    // directly (getBoundingClientRect, in the same viewport-relative
    // coordinate space #tv's absolute children use, since #tv itself is
    // fixed at inset:0) rather than recomputed independently, so the picture
    // and its decorative frame can't drift apart the way two separately
    // calculated layouts (flexbox math here, CSS top/right there) did before.
    const reserved = !guideMode && !chyron.classList.contains("hidden") ? chyron.offsetHeight : 0;
    let availW, availH, boxLeft, boxTop;
    if (guideMode) {
      const slot = document.getElementById("guide-video-slot");
      const rect = slot && slot.getBoundingClientRect();
      // Inset by the bezel's own border-width so the picture sits flush
      // inside the frame instead of straddling it.
      const inset = slot ? parseFloat(getComputedStyle(slot).borderLeftWidth) || 0 : 0;
      boxLeft = (rect ? rect.left : 0) + inset;
      boxTop = (rect ? rect.top : 0) + inset;
      availW = (rect ? rect.width : container.clientWidth * GUIDE_VIDEO_W_FRAC) - inset * 2;
      availH = (rect ? rect.height : container.clientHeight * GUIDE_VIDEO_H_FRAC) - inset * 2;
    } else {
      availW = container.clientWidth;
      availH = container.clientHeight - reserved;
    }
    const containerAR = availW / availH;
    const videoAR = vw / vh;
    const w = videoAR > containerAR ? availW : availH * videoAR;
    const h = videoAR > containerAR ? availW / videoAR : availH;
    video.style.width = `${w}px`;
    video.style.height = `${h}px`;
    if (guideMode) {
      // Center within the bezel on whichever axis the letterboxed picture
      // doesn't fully fill.
      video.style.left = `${boxLeft + (availW - w) / 2}px`;
      video.style.top = `${boxTop + (availH - h) / 2}px`;
    } else {
      video.style.left = "";
      video.style.top = "";
    }
    video.style.marginBottom = !guideMode && reserved ? `${reserved}px` : "";
    video.style.objectFit = "fill";
    video.style.transformOrigin = "0 0";
    video.style.transform = cropCSS(c);
  }
  window.addEventListener("resize", layoutCrop);

  // Docks the picture into a small top-right box (guide open) or restores it
  // to the normal full-screen centered layout (guide closed). CSS positions
  // the box; this just supplies the sizing fraction and re-runs layoutCrop
  // immediately, since a re-tune that lands on the same episode wouldn't
  // otherwise touch layout at all.
  function setGuideMode(open) {
    guideMode = open;
    video.parentElement.classList.toggle("guide-open", open);
    layoutCrop();
  }

  // Chrome (and others) block audible autoplay until the page has seen a
  // real user gesture — the very first tune() on load runs before that ever
  // happens, so its play() reliably rejects. Rather than leave the screen
  // silently stuck on the first frame, show a hint and retry play() on the
  // page's first click/keypress, whichever comes first — after that single
  // gesture, every subsequent play() (channel changes, drift resync) is
  // allowed for the rest of the session.
  function unlockOnFirstGesture() {
    startHint.classList.remove("hidden");
    const tryResume = () => {
      if (video.paused && video.src) video.play().catch(() => {});
    };
    const clearHint = () => startHint.classList.add("hidden");
    ["click", "keydown", "touchstart"].forEach((ev) =>
      document.addEventListener(ev, tryResume, { passive: true, once: true })
    );
    video.addEventListener("playing", clearHint, { once: true });
  }

  function showOsd(channel, position) {
    osdCh.textContent = `CH ${channel.number} — ${channel.name}`;
    osdTagline.textContent = channel.tagline || "";
    const lines = titleLines(position.show, position.episode);
    osdShow.textContent = lines.title;
    osdEpisode.textContent = lines.sub;
    const pct = Math.min(100, (position.offsetSec / position.episode.durationSec) * 100);
    osdBarFill.style.width = `${pct}%`;
    osd.classList.remove("hidden", "fade");
    clearTimeout(osdFadeTimer);
    osdFadeTimer = setTimeout(() => osd.classList.add("fade"), OSD_VISIBLE_MS);
  }

  function applyPositionToVideo(position, { isNewTune }) {
    // Some rips open on baked-in footage that isn't the show (a station
    // bumper, an uploader's colorization credit) — episode.introSkipSec, from
    // VaultVision's introSkipSeconds/introSkipBySeason, is how far in the
    // real content starts. If the schedule would land before that, jump
    // straight past it rather than showing dead air.
    const seekTo = Math.max(position.offsetSec, position.episode.introSkipSec || 0);
    if (isNewTune) {
      video.currentTime = seekTo;
      video.play().catch(() => unlockOnFirstGesture());
    } else {
      // resync: only nudge if we've actually drifted, so normal playback
      // isn't fighting a reseek every 15s
      if (Math.abs(video.currentTime - seekTo) > DRIFT_TOLERANCE_SEC) {
        video.currentTime = seekTo;
      }
    }
  }

  function stopPad() {
    clearInterval(padTimer);
    padTimer = null;
    padCard.classList.add("hidden");
    if (!chyron.classList.contains("hidden")) {
      chyron.classList.add("hidden");
      layoutCrop(); // picture back to full size
    }
  }

  // The lower third: what's coming back on, and how long until it does.
  // Runs for the whole break, over the spots and the STAND BY card alike.
  function showChyron(pos) {
    const lines = titleLines(pos.next.show, pos.next.episode);
    chyronTitle.textContent = lines.title;
    chyronSub.textContent = lines.sub;
    chyronClock.textContent = mmss(pos.slotEndsInSec);
    if (chyron.classList.contains("hidden")) {
      chyron.classList.remove("hidden");
      layoutCrop(); // shrink the picture to make room
    }
  }

  // Loads and plays one commercial. `pendingSpotKey` keeps the twice-a-second
  // pad ticker from re-resolving the same spot while its URL is still in
  // flight (only slow on the first break — the item's metadata is cached
  // after that, and every spot lives in the same item).
  let pendingSpotKey = null;
  async function playSpot(spot, seekSec) {
    if (spot.key === loadedEpisodeKey) {
      if (Math.abs(video.currentTime - seekSec) > DRIFT_TOLERANCE_SEC) video.currentTime = seekSec;
      if (video.paused) video.play().catch(() => unlockOnFirstGesture());
      return;
    }
    if (spot.key === pendingSpotKey) return;
    pendingSpotKey = spot.key;
    const myToken = ++tuneToken;
    const url = await resolveEpisodeUrl(spot.itemId, spot.fileHint);
    pendingSpotKey = null;
    if (myToken !== tuneToken) return; // channel flipped, or the break moved on
    if (!url) return; // bad spot — the next tick just tries the following one
    loadedEpisodeKey = spot.key;
    loadedItemId = spot.itemId;
    currentCrop = null; // ads are full-frame; never inherit the episode's crop
    video.src = url;
    video.addEventListener("loadedmetadata", () => {
      if (myToken !== tuneToken) return;
      layoutCrop();
      video.currentTime = seekSec;
      video.play().catch(() => unlockOnFirstGesture());
    }, { once: true });
  }

  // Decides what the dead tail of a slot shows right now: a commercial if one
  // fits in the time left, otherwise the countdown.
  function renderBreak(pos) {
    showChyron(pos);
    const padElapsed = pos.offsetSec - pos.episode.durationSec;
    const ad = getAdAt(pos.episode.key, padElapsed, pos.slotEndsInSec);
    if (!ad) {
      video.pause();
      padCard.classList.remove("hidden");
      return;
    }
    padCard.classList.add("hidden");
    playSpot(ad.spot, ad.offsetSec);
  }

  // The episode is over but its slot isn't — run the commercial break, then
  // tune the moment the clock hits the next :00/:30. Its own ticker (not the
  // 15s drift loop) so spot changes and the countdown stay honest.
  function showPad(channel, catalog, position) {
    osd.classList.add("hidden");
    renderBreak(position);

    clearInterval(padTimer);
    padTimer = setInterval(() => {
      const pos = getPositionAt(channel, catalog, Date.now());
      if (!pos || !pos.padding) {
        stopPad();
        tune(channel, catalog); // slot rolled over — start the next show
        return;
      }
      renderBreak(pos);
    }, PAD_TICK_MS);
  }

  // An archive.org file that 404s or won't decode leaves the picture black
  // with no other symptom, so the <video> element's own error event is the
  // only signal we get. Retire the file for the session, show a card, and let
  // the scheduler substitute the next usable programme into the same slot.
  function onMediaError() {
    const key = loadedEpisodeKey;
    if (!key || !video.getAttribute("src")) return; // teardown, not a real failure
    if (isBroken(key)) return; // already retired; a second event is just noise
    markBroken(key);
    console.warn(`unplayable, substituting: ${key} (${video.currentSrc || "no src"})`);
    loadedEpisodeKey = null;
    failOver();
  }

  // Hold the failure card briefly, then re-tune — by which point locate() is
  // already skipping the retired file.
  function failOver() {
    stopPad();
    video.pause();
    blankMsg.textContent = "TECHNICAL DIFFICULTIES";
    blankMsg.classList.remove("hidden");
    clearTimeout(substituteTimer);
    substituteTimer = setTimeout(() => {
      if (lastTuned) tune(lastTuned.channel, lastTuned.catalog);
    }, SUBSTITUTE_MS);
  }

  video.addEventListener("error", onMediaError);

  // `silent`: the background drift loop calls this every 15s just to keep
  // the picture honest against wall-clock time — that's not a channel
  // change, so it should never pop the OSD banner. Real tune()s (a channel
  // press, or closing the guide) leave silent false.
  async function tune(channel, catalog, { silent = false } = {}) {
    const myToken = ++tuneToken;
    lastTuned = { channel, catalog };
    clearTimeout(substituteTimer);
    blankMsg.classList.add("hidden");
    blankMsg.textContent = NO_SIGNAL_TEXT;

    const position = getPositionAt(channel, catalog, Date.now());
    if (!position) {
      stopPad();
      video.pause();
      video.removeAttribute("src");
      blankMsg.classList.remove("hidden");
      osd.classList.add("hidden");
      loadedEpisodeKey = null;
      return;
    }

    // locate() hands back a known-broken entry only when it went right round
    // the pool without finding a usable one — every file on this channel is
    // dead, so there's nothing left to substitute in.
    if (isBroken(position.episode.key)) {
      stopPad();
      video.pause();
      osd.classList.add("hidden");
      blankMsg.classList.remove("hidden");
      return;
    }

    if (position.padding) {
      showPad(channel, catalog, position);
      return;
    }
    stopPad();

    const isNewEpisode = position.episode.key !== loadedEpisodeKey;
    if (isNewEpisode) {
      const url = await resolveEpisodeUrl(position.episode.itemId, position.episode.fileHint);
      if (myToken !== tuneToken) return; // superseded by a later tune while we awaited
      if (!url) {
        // Metadata lists no playable file for this episode at all — same
        // outcome as a file that won't decode, so treat it the same way.
        markBroken(position.episode.key);
        failOver();
        return;
      }
      loadedEpisodeKey = position.episode.key;
      loadedItemId = position.episode.itemId;
      currentCrop = position.episode.crop || null;
      video.src = url;
      const onReady = () => {
        video.removeEventListener("loadedmetadata", onReady);
        if (myToken !== tuneToken) return;
        layoutCrop();
        applyPositionToVideo(getPositionAt(channel, catalog, Date.now()), { isNewTune: true });
      };
      video.addEventListener("loadedmetadata", onReady);
    } else {
      applyPositionToVideo(position, { isNewTune: false });
    }
    if (!silent) showOsd(channel, position);
  }

  function startDriftLoop(getCurrentChannel, catalog) {
    stopDriftLoop();
    driftTimer = setInterval(() => {
      const channel = getCurrentChannel();
      if (!channel || channel.kind === "guide") return;
      tune(channel, catalog, { silent: true });
    }, DRIFT_CHECK_MS);
  }

  function stopDriftLoop() {
    clearInterval(driftTimer);
    driftTimer = null;
  }

  return { tune, startDriftLoop, stopDriftLoop, showOsd, getItemId: () => loadedItemId, setGuideMode };
}
