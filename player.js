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

// A dead/renamed item still answers with valid JSON (an empty-ish object, no
// files) — that's a per-item problem, and the existing broken-file failover
// already handles it. This is for the other kind: archive.org itself not
// answering at all (offline, rate-limited, mid-maintenance), where every
// item would look dead at once. Distinguishing the two matters because the
// failover response is wrong for an outage — cycling through the whole
// catalog marking perfectly good episodes "broken" over one downed service.
class ArchiveUnavailableError extends Error {}

// archive.org's maintenance banner is served as an HTML page in place of the
// JSON API response — sometimes still with a 200, so the status check alone
// wouldn't catch it. The JSON.parse fallback below is the real safety net
// (it catches any HTML page, worded however); this regex just gives a
// cleaner diagnostic when it's the known one.
const MAINTENANCE_RE = /temporarily offline|undergoing maintenance/i;

function fetchItemMetadata(itemId) {
  if (!metaCache.has(itemId)) {
    const p = fetch(`https://archive.org/metadata/${itemId}`)
      .catch(() => { throw new ArchiveUnavailableError("network"); })
      .then(async (r) => {
        if (!r.ok) throw new ArchiveUnavailableError(`http ${r.status}`);
        const text = await r.text();
        if (MAINTENANCE_RE.test(text)) throw new ArchiveUnavailableError("maintenance page");
        try {
          return JSON.parse(text);
        } catch {
          throw new ArchiveUnavailableError("non-JSON response");
        }
      });
    // Only an outage-shaped failure gets evicted, so it's retried once
    // service is back — every rejection this chain can produce is one of
    // those (a dead item resolves fine, just with no usable file), so an
    // unconditional delete-on-reject is safe.
    p.catch(() => metaCache.delete(itemId));
    metaCache.set(itemId, p);
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
//
// That derivative check must stay narrowed to .mp4 specifically, not any of
// mp4/webm/ogv — archive.org's standard derive pipeline stamps an .ogv (and
// sometimes a .webm) alongside *every* video item regardless of whether the
// original needed fixing at all, not just as a replacement for a bad one.
// Matching all three meant a fine original .mp4 kept losing to its own
// unrelated .ogv sibling (Theora video Chrome can't decode, only the Vorbis
// audio — the exact "picture's gone, sound's fine" bug this was chasing).
// .mp4 is the one format IA's pipeline actually generates *as a fix*, so
// it's the only derivative name worth preferring over the original.
async function resolveEpisodeUrl(itemId, fileHint) {
  const meta = await fetchItemMetadata(itemId);
  const files = meta.files || [];
  const derivative = fileHint && files.find((f) => f.original === fileHint && /\.mp4$/i.test(f.name));
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

// The transform above only *positions* the wanted region over the element's
// box — it doesn't remove the rest of the frame. A transform isn't clipped by
// the element's own bounds, and nothing upstream clips it either (#tv is the
// whole viewport), so without this the black surround and the watermark panel
// scale up right along with the picture and paint straight over the layout,
// i.e. the crop has no visible effect at all.
//
// clip-path is measured in the element's own untransformed box, where the
// frame is drawn whole (object-fit: fill) — so the crop rect's fractions are
// usable as inset percentages directly, and the transform then maps what
// survives onto the box.
function clipCSS(c) {
  if (!c) return "";
  const pct = (v) => `${(v * 100).toFixed(4)}%`;
  return `inset(${pct(c.y)} ${pct(1 - c.x - c.w)} ${pct(1 - c.y - c.h)} ${pct(c.x)})`;
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
// Must stay comfortably above what a seek actually costs, or the correction
// becomes the problem: on a multi-gigabyte item (Storm of the Century is
// 2.2GB / 5.8h with a 17.7MB moov) a tune-in seek lands hours into the file
// and takes seconds to buffer. That latency *is* drift — so with a tolerance
// tighter than the seek cost, every 15s check finds the picture "late",
// re-seeks, re-buffers, and lands late again. It never converges, and the
// symptom is a fresh frame every several seconds forever.
// Being ~10s off a simulated broadcast is invisible; a reseek loop is not.
const DRIFT_TOLERANCE_SEC = 10;
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
          padCard, chyron, chyronTitle, chyronSub, chyronClock, outageCard,
          vodSeek, vodSeekFill, vodSeekDirEl, vodSeekTimeEl } = els;

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
  const frame = document.getElementById("guide-video-frame");

  // -- service outage ---------------------------------------------------------
  // archive.org unreachable or in maintenance mode -- every channel would
  // fail the same fetch the same way right now, so this replaces the picture
  // outright instead of running the normal broken-file failover (which would
  // just cycle the whole catalog into the broken set for no reason). Retried
  // on a fixed cadence rather than every call site's own tick rate (a
  // commercial break's pad ticker alone would otherwise hit the network twice
  // a second) — piggybacks the drift loop's own 15s cadence, since that's
  // what re-tries it in practice.
  const OUTAGE_RETRY_MS = DRIFT_CHECK_MS;
  const OUTAGE = Symbol("archive-outage");
  let serviceDown = false;
  let nextProbeAt = 0;

  function showOutage() {
    stopPad();
    video.pause();
    osd.classList.add("hidden");
    blankMsg.classList.add("hidden");
    outageCard.classList.remove("hidden");
  }

  function hideOutage() {
    outageCard.classList.add("hidden");
  }

  // Every resolveEpisodeUrl call in this file goes through here instead of
  // calling it directly, so the outage flag and its retry throttle are
  // enforced in one place regardless of which caller (tune, a commercial
  // spot, VOD) hit the failure. Returns the OUTAGE sentinel (never null or a
  // real URL) so callers can tell "archive.org is down" apart from "this one
  // file has no usable copy," which still goes through the ordinary
  // broken-file failover.
  async function resolveOrOutage(itemId, fileHint) {
    if (serviceDown && Date.now() < nextProbeAt) return OUTAGE;
    try {
      const url = await resolveEpisodeUrl(itemId, fileHint);
      if (serviceDown) { serviceDown = false; hideOutage(); }
      return url;
    } catch (err) {
      if (!(err instanceof ArchiveUnavailableError)) throw err;
      serviceDown = true;
      nextProbeAt = Date.now() + OUTAGE_RETRY_MS;
      console.warn(`archive.org unavailable (${err.message}), showing outage card`);
      showOutage();
      return OUTAGE;
    }
  }

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
      // Center within the slot on whichever axis the letterboxed picture
      // doesn't fully fill.
      const left = boxLeft + (availW - w) / 2;
      const top = boxTop + (availH - h) / 2;
      video.style.left = `${left}px`;
      video.style.top = `${top}px`;
      // The outline hugs the picture, not the slot — same rect, no transform
      // (a border on the video itself would be scaled by the crop).
      if (frame) {
        frame.style.left = `${left}px`;
        frame.style.top = `${top}px`;
        frame.style.width = `${w}px`;
        frame.style.height = `${h}px`;
        frame.classList.remove("hidden");
      }
    } else {
      video.style.left = "";
      video.style.top = "";
      if (frame) frame.classList.add("hidden");
    }
    video.style.marginBottom = !guideMode && reserved ? `${reserved}px` : "";
    video.style.objectFit = "fill";
    video.style.transformOrigin = "0 0";
    video.style.clipPath = clipCSS(c);
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
    const pct = Math.min(100, (position.offsetSec / playableSec(position.episode)) * 100);
    osdBarFill.style.width = `${pct}%`;
    osd.classList.remove("hidden", "fade");
    clearTimeout(osdFadeTimer);
    osdFadeTimer = setTimeout(() => osd.classList.add("fade"), OSD_VISIBLE_MS);
  }

  function applyPositionToVideo(position, { isNewTune }) {
    // episode.introSkipSec is baked-in footage that isn't the show (a station
    // bumper, an uploader's colorization credit). It isn't part of the
    // broadcast, so the slot's clock maps onto the content *after* it: offset
    // 0 is the first real frame. The scheduler sizes the slot off the same
    // playable length (see playableSec), so the two stay in step.
    //
    // Not max(offset, skip) — that pinned the seek at `skip` for the first
    // `skip` seconds of the slot while playback ran on past it, so the 15s
    // drift check kept yanking the picture back to the same frame.
    const seekTo = position.offsetSec + (position.episode.introSkipSec || 0);
    if (isNewTune) {
      video.currentTime = seekTo;
      video.play().catch(() => unlockOnFirstGesture());
    } else {
      // resync: only nudge if we've actually drifted, so normal playback
      // isn't fighting a reseek every 15s.
      // Never correct while a seek is still landing or the buffer is starved
      // — currentTime is meaningless mid-seek, and issuing a second seek
      // just restarts the stall that caused the reading in the first place.
      if (video.seeking || video.readyState < 3 /* HAVE_FUTURE_DATA */) return;
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
    const url = await resolveOrOutage(spot.itemId, spot.fileHint);
    pendingSpotKey = null;
    if (myToken !== tuneToken) return; // channel flipped, or the break moved on
    if (url === OUTAGE) return; // outage card already up; nothing to load
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
    const padElapsed = pos.offsetSec - playableSec(pos.episode);
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

    // Known down and not yet due for a retry: every channel would hit the
    // same fetch and fail the same way, so skip straight to keeping the card
    // up rather than re-running the whole tune (and every 15s drift-loop
    // call, and every channel flip) into a network attempt that's throttled
    // to fail anyway.
    if (serviceDown && Date.now() < nextProbeAt) {
      showOutage();
      return;
    }

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
      const url = await resolveOrOutage(position.episode.itemId, position.episode.fileHint);
      if (myToken !== tuneToken) return; // superseded by a later tune while we awaited
      if (url === OUTAGE) return; // outage card already up
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

  // -- Video On Demand ---------------------------------------------------------
  // Parallel to tune(), not part of it: a specific episode from t=0 (or its
  // introSkipSec), no wall-clock scheduling position. Live channels never
  // enable trick-play (there's no "seeking" a simulated broadcast — see
  // applyPositionToVideo above), but an on-demand title is genuinely
  // on-demand, so it gets real seeking: hold left/right moves a marker
  // (vodSeekTarget) without touching the actual video, and only the release
  // commits it to video.currentTime — scrubbing this way never fights a
  // half-finished intermediate seek the way stepping video.currentTime on
  // every tick would.
  let vodSeekEpisode = null; // set by playEpisode; durationSec clamps the marker
  let vodSeekActive = false;
  let vodSeekTarget = 0;
  let vodSeekDir = 1;
  let vodSeekTimer = null;
  const VOD_SEEK_STEP_SEC = 10;
  const VOD_SEEK_TICK_MS = 150;

  function renderVodSeekUi() {
    const total = (vodSeekEpisode && vodSeekEpisode.durationSec) || 0;
    const pct = total > 0 ? Math.min(100, Math.max(0, (vodSeekTarget / total) * 100)) : 0;
    vodSeekFill.style.width = `${pct}%`;
    vodSeekDirEl.textContent = vodSeekDir < 0 ? "◀◀ REWIND" : "FAST FORWARD ▶▶";
    vodSeekTimeEl.textContent = `${mmss(vodSeekTarget)} / ${mmss(total)}`;
  }

  // First press in a hold starts the scrub (marker begins at the video's
  // actual current position) and its own ticker; a later press before
  // release (direction reversed mid-hold) just updates which way it moves.
  function vodSeekBegin(direction) {
    if (!vodSeekActive) {
      vodSeekActive = true;
      vodSeekTarget = video.currentTime;
      vodSeek.classList.remove("hidden");
      clearInterval(vodSeekTimer);
      vodSeekTimer = setInterval(() => {
        const total = (vodSeekEpisode && vodSeekEpisode.durationSec) || Infinity;
        vodSeekTarget = Math.min(total, Math.max(0, vodSeekTarget + VOD_SEEK_STEP_SEC * vodSeekDir));
        renderVodSeekUi();
      }, VOD_SEEK_TICK_MS);
      renderVodSeekUi();
    }
    vodSeekDir = direction;
  }

  function vodSeekCommit() {
    if (!vodSeekActive) return;
    vodSeekActive = false;
    clearInterval(vodSeekTimer);
    vodSeekTimer = null;
    video.currentTime = vodSeekTarget;
    vodSeek.classList.add("hidden");
  }

  function showVodOsd(show, episode) {
    osdCh.textContent = "🎬 VIDEO ON DEMAND";
    osdTagline.textContent = "on demand";
    const lines = titleLines(show, episode);
    osdShow.textContent = lines.title;
    osdEpisode.textContent = lines.sub;
    osdBarFill.style.width = "0%"; // no live schedule position to show progress against
    osd.classList.remove("hidden", "fade");
    clearTimeout(osdFadeTimer);
    osdFadeTimer = setTimeout(() => osd.classList.add("fade"), OSD_VISIBLE_MS);
  }

  // Returns true on success, false if there's no playable file -- the
  // caller (app.js) drops back to the episode list either way, there's no
  // "next in the pool" the way a live channel's failover has.
  async function playEpisode(show, episode) {
    const myToken = ++tuneToken;
    clearTimeout(substituteTimer);
    stopPad();
    blankMsg.classList.add("hidden");

    const url = await resolveOrOutage(episode.itemId, episode.fileHint);
    if (myToken !== tuneToken) return false; // superseded by a later tune/VOD selection while we awaited
    if (!url || url === OUTAGE) return false; // OUTAGE: card is already up behind the VOD menu

    loadedEpisodeKey = episode.key;
    loadedItemId = episode.itemId;
    currentCrop = episode.crop || null;
    vodSeekEpisode = episode;
    video.src = url;
    const onReady = () => {
      video.removeEventListener("loadedmetadata", onReady);
      if (myToken !== tuneToken) return;
      layoutCrop();
      video.currentTime = episode.introSkipSec || 0;
      video.play().catch(() => unlockOnFirstGesture());
    };
    video.addEventListener("loadedmetadata", onReady);
    showVodOsd(show, episode);
    return true;
  }

  // -- seek-index warmer -----------------------------------------------------
  // A few catalog items are multi-hour tapes (6h Saturday-morning blocks, whole
  // TV-movie broadcasts). Their mp4 seek index is sized by frame *count*, not
  // runtime — Storm of the Century's is 17.7MB, Nick at Nite's 44.5MB — and the
  // browser needs all of it before it can paint frame one, wherever in the file
  // the schedule drops you. Nothing streams around that; it's a prerequisite,
  // not the picture. Cold, it's ~10-30s of black on tune-in.
  //
  // So fetch it before it's asked for. The user can only tune to what's airing
  // *now*, and that's a small set: sampled every 5 minutes across a day, 2-6
  // channels are showing something over the threshold at once. Warming exactly
  // that set is the whole job.
  //
  // A hidden preload="metadata" element is the entire mechanism — the browser
  // walks the mp4 boxes itself, so an item with its index at the end of the
  // file (1993-wsb-tv-abc-saturday-morning) needs no special case here. It also
  // warms archive.org's edge node, which is what actually makes the real tune
  // fast; the browser's own media cache is capped and evicts these happily.
  // Measured moov sizes, since runtime is only a rough proxy for index size:
  // a 23-min sitcom is ~1.1-1.5MB, but Twin Peaks' 47-min DVD rips are 5.5MB —
  // 4x the header for 2x the runtime, because the index is sized by sample
  // count and those rips carry far more samples per minute. At the old 3h
  // threshold nothing under a multi-hour tape was warmed, so those 47-minute
  // episodes took the full cold hit (~5s of header on a good node, much worse
  // on a flaky one) every time.
  //
  // 45 min is where that class gets caught. Cost, sampled every 5 min across a
  // week: channels airing something over the threshold at once goes from 3.6
  // (max 8) to 19.8 (max 26), and the eligible slice of the catalog from 0.1%
  // to 9.3%. That's affordable only because of the two throttles below — one
  // warm in flight at a time, and never while the picture is still buffering —
  // so it drains slowly in the background instead of racing the viewer. Raise
  // it back toward 3600 if that bandwidth ever matters more than the tune-in.
  const WARM_OVER_SEC = 45 * 60;
  const WARM_TIMEOUT_MS = 90000; // a 44MB index on a slow node, then give up
  const warmAttempted = new Set();
  let warmEl = null;
  let warming = false;

  async function warmTick(catalog) {
    if (warming) return;
    // archive.org already isn't answering -- don't spend the background
    // warming budget on fetches that are just going to join the same outage.
    if (serviceDown) return;
    // Never race the picture for bandwidth: if the real video is still filling
    // its buffer, what the viewer is actually watching wins.
    if (!video.paused && video.readyState < 3 /* HAVE_FUTURE_DATA */) return;

    for (const c of window.CHANNELS || []) {
      if (c.kind === "guide") continue;
      const pos = getPositionAt(c, catalog, Date.now());
      if (!pos || pos.episode.durationSec <= WARM_OVER_SEC) continue;
      const key = pos.episode.key;
      // Attempted, not succeeded: a dead or failing item must not be retried
      // every tick forever. Worst case we skip one warm and the tune is slow.
      if (warmAttempted.has(key) || isBroken(key) || key === loadedEpisodeKey) continue;
      warmAttempted.add(key);

      warming = true;
      const url = await resolveOrOutage(pos.episode.itemId, pos.episode.fileHint);
      if (!url || url === OUTAGE) { warming = false; return; }
      if (!warmEl) {
        // Kept on this closure so it isn't collected mid-load. Never attached
        // to the document — it exists only to make the browser do the fetch.
        warmEl = document.createElement("video");
        warmEl.preload = "metadata";
        warmEl.muted = true;
      }
      const release = () => { clearTimeout(timer); warming = false; };
      const timer = setTimeout(release, WARM_TIMEOUT_MS);
      warmEl.addEventListener("loadedmetadata", release, { once: true });
      warmEl.addEventListener("error", release, { once: true });
      warmEl.src = url;
      return; // one per tick — these are 8-45MB each
    }
  }

  function startDriftLoop(getCurrentChannel, catalog) {
    stopDriftLoop();
    driftTimer = setInterval(() => {
      const channel = getCurrentChannel();
      // "vod" has no scheduled position to correct toward -- unlike
      // "guide", currentNumber genuinely can equal the VOD channel's number
      // for the whole time it's open (VOD replaces the screen like a real
      // channel change rather than overlaying live video the way the guide
      // does), so without this a stray tune() every 15s would find "no
      // position" and stop the video out from under VOD.
      if (!channel || channel.kind === "guide" || channel.kind === "vod") return;
      tune(channel, catalog, { silent: true });
      warmTick(catalog); // piggybacks the 15s tick; no timer of its own
    }, DRIFT_CHECK_MS);
  }

  function stopDriftLoop() {
    clearInterval(driftTimer);
    driftTimer = null;
  }

  return {
    tune, startDriftLoop, stopDriftLoop, showOsd, getItemId: () => loadedItemId, setGuideMode,
    playEpisode, vodSeekBegin, vodSeekCommit,
  };
}
