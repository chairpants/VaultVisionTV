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
async function resolveEpisodeUrl(itemId, fileHint) {
  const meta = await fetchItemMetadata(itemId);
  const files = meta.files || [];
  const needsDerivative = fileHint && !/\.(mp4|webm|ogv)$/i.test(fileHint);
  const derivativeName = needsDerivative && fileHint.replace(/\.[^./]+$/, ".mp4");
  const file = fileHint
    ? (needsDerivative && files.find((f) => f.name === derivativeName)) ||
      files.find((f) => f.name === fileHint)
    : files.find((f) => /\.mp4$/i.test(f.name)) || files.find((f) => /\.(ogv|webm)$/i.test(f.name));
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

const DRIFT_CHECK_MS = 15000;
const DRIFT_TOLERANCE_SEC = 3;
const OSD_VISIBLE_MS = 4000;

function createPlayer(els) {
  const { video, osd, osdCh, osdTagline, osdShow, osdEpisode, osdBarFill, blankMsg, startHint } = els;

  let loadedEpisodeKey = null;
  let driftTimer = null;
  let osdFadeTimer = null;
  let tuneToken = 0; // invalidates in-flight resolves if the user flips again before they land
  let currentCrop = null; // {x,y,w,h} of the episode currently loaded, or null

  // Sizes the <video> box itself to the cropped picture's true aspect ratio
  // (letterboxed within its container), then applies the crop transform —
  // mirrors VaultVision's layoutFlat(). Re-run on resize since the box is
  // now sized in pixels rather than left to CSS's width:100%/object-fit.
  function layoutCrop() {
    const container = video.parentElement;
    const c = currentCrop;
    const vw = (video.videoWidth || 4) * (c ? c.w : 1);
    const vh = (video.videoHeight || 3) * (c ? c.h : 1);
    const containerAR = container.clientWidth / container.clientHeight;
    const videoAR = vw / vh;
    const w = videoAR > containerAR ? container.clientWidth : container.clientHeight * videoAR;
    const h = videoAR > containerAR ? container.clientWidth / videoAR : container.clientHeight;
    video.style.width = `${w}px`;
    video.style.height = `${h}px`;
    video.style.objectFit = "fill";
    video.style.transformOrigin = "0 0";
    video.style.transform = cropCSS(c);
  }
  window.addEventListener("resize", layoutCrop);

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
    // Hosted-movie shows (MonsterVision, USA Up All Night, ...) carry the
    // real film title separately from the wrapper show's own name — put the
    // movie front and center, the way a real "movie of the night" bumper
    // would, with the host show as the secondary line instead of a code.
    const movieTitle = position.episode.movieTitle;
    osdShow.textContent = movieTitle || position.show.title;
    const label = movieTitle
      ? position.show.title
      : position.episode.name
        ? `${position.episode.code}  ${position.episode.name}`
        : position.episode.code;
    osdEpisode.textContent = label;
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

  // `silent`: the background drift loop calls this every 15s just to keep
  // the picture honest against wall-clock time — that's not a channel
  // change, so it should never pop the OSD banner. Real tune()s (a channel
  // press, or closing the guide) leave silent false.
  async function tune(channel, catalog, { silent = false } = {}) {
    const myToken = ++tuneToken;
    blankMsg.classList.add("hidden");

    const position = getPositionAt(channel, catalog, Date.now());
    if (!position) {
      video.pause();
      video.removeAttribute("src");
      blankMsg.classList.remove("hidden");
      osd.classList.add("hidden");
      loadedEpisodeKey = null;
      return;
    }

    const isNewEpisode = position.episode.key !== loadedEpisodeKey;
    if (isNewEpisode) {
      const url = await resolveEpisodeUrl(position.episode.itemId, position.episode.fileHint);
      if (myToken !== tuneToken) return; // superseded by a later tune while we awaited
      if (!url) {
        blankMsg.classList.remove("hidden");
        return;
      }
      loadedEpisodeKey = position.episode.key;
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

  return { tune, startDriftLoop, stopDriftLoop, showOsd };
}
