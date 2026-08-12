// The TV Guide channel: a Prevue-Guide-style grid (channel | now | +30 | +60)
// built from the same getPositionAt() the player uses — so what a row says
// is airing is exactly what you'll see if you tune to it.
//
// Listings scroll freely (native overflow-y, mouse wheel/trackpad/scrollbar)
// rather than auto-scrolling on a timer — opening the guide jumps straight
// to whatever channel is currently tuned (see show()) and leaves it there
// until you scroll yourself.
//
// Plain script, not a module (see scheduler.js's header) — getPositionAt and
// EPOCH_MS come from the shared top-level scope, since scheduler.js loads
// first.

const REFRESH_MS = 60000;

function timeLabel(d) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Independent of scheduler.js's own SLOT_SEC (the programming grid, 5
// minutes) on purpose: a real TV Guide's "NOW / +30 / +60" columns mean
// literal half-hour lookaheads regardless of how finely a station grids its
// own programming underneath — coupling the two would mean the guide's
// column labels silently changed meaning (e.g. "+5 min" / "+10 min")
// whenever the scheduling grid did, even though nothing about what a real
// guide's columns represent actually changed.
const GUIDE_COLUMN_SEC = 30 * 60;
const SLOT_MS = GUIDE_COLUMN_SEC * 1000;
// Floored against EPOCH_MS rather than the raw epoch so it matches the grid
// the pools are built on, whatever the local UTC offset is.
const slotStart = (ms) => EPOCH_MS + Math.floor((ms - EPOCH_MS) / SLOT_MS) * SLOT_MS;

function programLabel(catalog, channel, atMs) {
  const pos = getPositionAt(channel, catalog, atMs);
  if (!pos) return "—";
  if (pos.episode.movieTitle) return pos.episode.movieTitle; // real film title, not the host show's name
  const ep = pos.episode.name ? ` — ${pos.episode.name}` : "";
  return pos.show.title + ep;
}

function createGuide({ root, channels, catalog, tuneTo, getCurrentNumber }) {
  const tunableChannels = channels.filter((c) => c.kind !== "guide");
  const byNumber = Object.fromEntries(tunableChannels.map((c) => [c.number, c]));

  root.innerHTML = `
    <div id="guide-header"></div>
    <div id="guide-top">
      <div id="guide-info">
        <div id="guide-info-num"></div>
        <div id="guide-info-name"></div>
        <div id="guide-info-tagline"></div>
        <div id="guide-info-live-label">ON NOW</div>
        <div id="guide-info-live"></div>
      </div>
      <div id="guide-video-slot"></div>
    </div>
    <div id="guide-listings">
      <div id="guide-cols">
        <span class="ch-col"></span>
        <span></span><span></span><span></span>
      </div>
      <div id="guide-rows"><div id="guide-track"></div></div>
    </div>
  `;
  const headerEl = root.querySelector("#guide-header");
  const infoNumEl = root.querySelector("#guide-info-num");
  const infoNameEl = root.querySelector("#guide-info-name");
  const infoTaglineEl = root.querySelector("#guide-info-tagline");
  const infoLiveEl = root.querySelector("#guide-info-live");
  const colsEl = root.querySelector("#guide-cols");
  const trackEl = root.querySelector("#guide-track");
  const rowsWrap = root.querySelector("#guide-rows");

  let refreshTimer = null;
  let highlightedNumber = null; // whichever row the info panel currently describes

  function renderColumnHeaders(now) {
    const s0 = slotStart(now.getTime());
    const spans = colsEl.querySelectorAll("span:not(.ch-col)");
    spans[0].textContent = `NOW (${timeLabel(new Date(s0))})`;
    spans[1].textContent = timeLabel(new Date(s0 + SLOT_MS));
    spans[2].textContent = timeLabel(new Date(s0 + 2 * SLOT_MS));
  }

  // Describes whichever channel is currently highlighted — defaults to
  // whatever's actually tuned (see show()), and follows the mouse from there
  // (see the trackEl "mouseover" listener below): a live look at what's
  // airing there right now, same lookup the row itself uses.
  function renderInfoPanel(now) {
    const channel = byNumber[highlightedNumber];
    if (!channel) return;
    infoNumEl.textContent = `CH ${channel.number}`;
    infoNameEl.textContent = channel.name;
    infoTaglineEl.textContent = channel.tagline || "";
    infoLiveEl.textContent = programLabel(catalog, channel, now.getTime());
  }

  // Cheap on its own (one getPositionAt lookup, no full re-render) so hover
  // feedback stays instant instead of waiting on the next 60s refresh().
  function setHighlight(number) {
    if (number === highlightedNumber || !byNumber[number]) return;
    const prevRow = trackEl.querySelector(".guide-row.highlight");
    if (prevRow) prevRow.classList.remove("highlight");
    highlightedNumber = number;
    const row = trackEl.querySelector(`.guide-row[data-ch="${number}"]`);
    if (row) row.classList.add("highlight");
    renderInfoPanel(new Date());
  }

  function renderRows() {
    const s0 = slotStart(Date.now());
    // The periodic refresh() rebuilds this from scratch (program labels can
    // have changed), which would otherwise reset the user's own scroll
    // position back to the top — save and restore it around the rebuild.
    const savedScrollTop = rowsWrap.scrollTop;
    trackEl.innerHTML = tunableChannels
      .map((c) => {
        const now0 = programLabel(catalog, c, s0);
        const now30 = programLabel(catalog, c, s0 + SLOT_MS);
        const now60 = programLabel(catalog, c, s0 + 2 * SLOT_MS);
        const hl = c.number === highlightedNumber ? " highlight" : "";
        return `<div class="guide-row${hl}" data-ch="${c.number}">
          <span class="ch-col">${c.number} ${c.name}</span>
          <span class="prog live">${now0}</span>
          <span class="prog">${now30}</span>
          <span class="prog">${now60}</span>
        </div>`;
      })
      .join("");
    rowsWrap.scrollTop = savedScrollTop;
  }

  // Scrolls whichever row is currently highlighted to the middle of the
  // listings viewport — used on show() so opening the guide always starts
  // centered on the tuned channel instead of at the top of a 40+ row list.
  function scrollToHighlighted() {
    const row = trackEl.querySelector(`.guide-row[data-ch="${highlightedNumber}"]`);
    if (row) row.scrollIntoView({ block: "center" });
  }

  function refresh() {
    const now = new Date();
    headerEl.textContent = `VAULTVISIONTV GUIDE — ${now.toLocaleDateString()} ${timeLabel(now)}`;
    renderColumnHeaders(now);
    renderRows();
    renderInfoPanel(now);
  }

  trackEl.addEventListener("click", (e) => {
    const row = e.target.closest(".guide-row");
    if (row) tuneTo(parseInt(row.dataset.ch, 10));
  });
  trackEl.addEventListener("mouseover", (e) => {
    const row = e.target.closest(".guide-row");
    if (row) setHighlight(parseInt(row.dataset.ch, 10));
  });

  function show() {
    // Fresh highlight every time the guide opens — whatever's actually
    // tuned, so the info panel starts out describing what you're watching
    // (and the listings start scrolled to it, see scrollToHighlighted)
    // rather than whatever was last hovered the previous time it was open.
    const current = getCurrentNumber && getCurrentNumber();
    highlightedNumber = byNumber[current] ? current : (tunableChannels[0] && tunableChannels[0].number);
    root.classList.remove("hidden");
    refresh();
    scrollToHighlighted();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, REFRESH_MS);
  }

  function hide() {
    root.classList.add("hidden");
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  return { show, hide };
}
