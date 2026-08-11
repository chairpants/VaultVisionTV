// The TV Guide channel: a Prevue-Guide-style grid (channel | now | +30 | +60)
// built from the same getPositionAt() the player uses — so what a row says
// is airing is exactly what you'll see if you tune to it.
//
// The scroll/hold/wipe position is a pure function of wall-clock time (via
// EPOCH_MS, same reference point the scheduler itself uses), not local
// session state — so the guide is conceptually always running in the
// background whether you're looking at it or not, same as every channel.
// Opening it just starts rendering whatever phase of the cycle "now" lands
// in, and closing/reopening a minute later picks up further along, instead
// of restarting from the top.
//
// Plain script, not a module (see scheduler.js's header) — getPositionAt and
// EPOCH_MS come from the shared top-level scope, since scheduler.js loads
// first.

const SCROLL_PX_PER_SEC = 22;
const HOLD_MS = 4000;   // paused at the bottom, listings held still
const WIPE_MS = 600;    // transition back to the top
const REFRESH_MS = 60000;

function timeLabel(d) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function programLabel(catalog, channel, atMs) {
  const pos = getPositionAt(channel, catalog, atMs);
  if (!pos) return "—";
  if (pos.episode.movieTitle) return pos.episode.movieTitle; // real film title, not the host show's name
  const ep = pos.episode.name ? ` — ${pos.episode.name}` : "";
  return pos.show.title + ep;
}

function createGuide({ root, channels, catalog, tuneTo }) {
  const tunableChannels = channels.filter((c) => c.kind !== "guide");

  root.innerHTML = `
    <div id="guide-header"></div>
    <div id="guide-cols">
      <span class="ch-col"></span>
      <span></span><span></span><span></span>
    </div>
    <div id="guide-rows"><div id="guide-track"></div><div id="guide-wipe"></div></div>
  `;
  const headerEl = root.querySelector("#guide-header");
  const colsEl = root.querySelector("#guide-cols");
  const trackEl = root.querySelector("#guide-track");
  const wipeEl = root.querySelector("#guide-wipe");
  const rowsWrap = root.querySelector("#guide-rows");

  let rafId = null;
  let scrollDistancePx = 0; // 0 once measured, if the list is taller than the viewport
  let refreshTimer = null;

  function renderColumnHeaders(now) {
    const t30 = new Date(now.getTime() + 30 * 60000);
    const t60 = new Date(now.getTime() + 60 * 60000);
    const spans = colsEl.querySelectorAll("span:not(.ch-col)");
    spans[0].textContent = `NOW (${timeLabel(now)})`;
    spans[1].textContent = `+30 MIN (${timeLabel(t30)})`;
    spans[2].textContent = `+60 MIN (${timeLabel(t60)})`;
  }

  function renderRows() {
    const now = new Date();
    trackEl.innerHTML = tunableChannels
      .map((c) => {
        const now0 = programLabel(catalog, c, now.getTime());
        const now30 = programLabel(catalog, c, now.getTime() + 30 * 60000);
        const now60 = programLabel(catalog, c, now.getTime() + 60 * 60000);
        return `<div class="guide-row" data-ch="${c.number}">
          <span class="ch-col">${c.number} ${c.name}</span>
          <span class="prog live">${now0}</span>
          <span class="prog">${now30}</span>
          <span class="prog">${now60}</span>
        </div>`;
      })
      .join("");
    scrollDistancePx = Math.max(0, trackEl.scrollHeight - rowsWrap.clientHeight);
  }

  function refresh() {
    const now = new Date();
    headerEl.textContent = `VAULTVISIONTV GUIDE — ${now.toLocaleDateString()} ${timeLabel(now)}`;
    renderColumnHeaders(now);
    renderRows();
  }

  // One cycle: scroll top->bottom, hold at the bottom, wipe back to the top.
  // scrollMs depends on scrollDistancePx, which depends on how many channels
  // there are — effectively constant per session, but re-measured on every
  // refresh() in case a resize changed the viewport.
  function tick() {
    const scrollMs = (scrollDistancePx / SCROLL_PX_PER_SEC) * 1000;
    const cycleMs = scrollMs + HOLD_MS + WIPE_MS;
    const phase = cycleMs > 0 ? (Date.now() - EPOCH_MS) % cycleMs : 0;

    if (phase < scrollMs) {
      trackEl.style.transform = `translateY(-${(phase / scrollMs) * scrollDistancePx || 0}px)`;
      wipeEl.style.opacity = 0;
    } else if (phase < scrollMs + HOLD_MS) {
      trackEl.style.transform = `translateY(-${scrollDistancePx}px)`;
      wipeEl.style.opacity = 0;
    } else {
      // wipe: fades to blank (0..0.5) — exactly at the midpoint, fully
      // opaque, the scroll position underneath silently resets to the top,
      // still hidden — then fades back out (0.5..1), revealing the list
      // from the top. Flipping the reset any earlier would show it peeking
      // through before the fade finished covering it.
      const p = (phase - scrollMs - HOLD_MS) / WIPE_MS; // 0..1
      trackEl.style.transform = `translateY(-${p < 0.5 ? scrollDistancePx : 0}px)`;
      wipeEl.style.opacity = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5;
    }
    rafId = requestAnimationFrame(tick);
  }

  trackEl.addEventListener("click", (e) => {
    const row = e.target.closest(".guide-row");
    if (row) tuneTo(parseInt(row.dataset.ch, 10));
  });

  function show() {
    root.classList.remove("hidden");
    refresh();
    if (!rafId) rafId = requestAnimationFrame(tick);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, REFRESH_MS);
  }

  function hide() {
    root.classList.add("hidden");
    cancelAnimationFrame(rafId);
    rafId = null;
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  return { show, hide };
}
