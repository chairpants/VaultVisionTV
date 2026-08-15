// The TV Guide channel: a Prevue-Guide-style grid built from the same
// getPositionAt() the player uses — so what a row says is airing is exactly
// what you'll see if you tune to it.
//
// Each row is a proportional 90-minute timeline (NOW through +60) rather than
// three sampled columns: a programme's block is as wide as the airtime it
// actually occupies, and the vertical line on its left edge is the moment it
// starts — which is also the moment the previous one ends. See
// programsBetween() for how those boundaries are found.
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
const WINDOW_MS = 3 * SLOT_MS; // NOW through +60, the span a row draws across
// Floored against EPOCH_MS rather than the raw epoch so it matches the grid
// the pools are built on, whatever the local UTC offset is.
const slotStart = (ms) => EPOCH_MS + Math.floor((ms - EPOCH_MS) / SLOT_MS) * SLOT_MS;

// Below this width there isn't room to lay out a proportional NOW/+30/+60
// timeline per row without every block becoming an unreadable sliver, so
// renderRows() switches to one row = one "on now" line instead. Matches the
// breakpoint in style.css's own #guide media query — kept in sync by eye
// since the two can't share a literal across a stylesheet and a script.
const MOBILE_GUIDE_MAX_WIDTH = 700;
const isMobileGuide = () => window.matchMedia(`(max-width: ${MOBILE_GUIDE_MAX_WIDTH}px)`).matches;

const shortTime = (d) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Programme titles come from archive.org metadata, not from us — escape them
// before they go anywhere near innerHTML.
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

function posLabel(pos) {
  if (!pos) return "—";
  if (pos.episode.movieTitle) return pos.episode.movieTitle; // real film title, not the host show's name
  const ep = pos.episode.name ? ` — ${pos.episode.name}` : "";
  return pos.show.title + ep;
}

const programLabel = (catalog, channel, atMs) => posLabel(getPositionAt(channel, catalog, atMs));

// Every programme airing between startMs and endMs, by walking the same
// schedule the player follows: ask what's on at t, jump to the end of that
// slot, ask again. slotEndsInSec is measured from the scheduled programme
// (never a substitute), so a block's [airsFrom, airsUntil) is exactly the
// stretch that programme holds the channel — the boundaries between them are
// the moments the picture actually changes.
//
// `joined` means the programme was already running when it took the channel,
// so no start line is drawn for it. That's the first block on every row (the
// window opens mid-programme), and also any block at a daypart boundary: a
// curated channel switching pools at 9am picks up wherever that pool's
// continuous timeline has reached, which is generally mid-episode (see
// scheduler.js's fallback note). Drawing those as fresh starts would put a
// start line where nothing starts.
function programsBetween(catalog, channel, startMs, endMs) {
  const out = [];
  let t = startMs;
  // ponytail: 40-block cap is a runaway guard, not a real limit — 90 minutes
  // can't hold more than 18 slots at the 5-minute grid.
  while (t < endMs && out.length < 40) {
    const pos = getPositionAt(channel, catalog, t);
    if (!pos) break;
    // A missing/zero slotEndsInSec would spin forever; fall back to one column.
    const airsUntil = pos.slotEndsInSec > 0 ? t + pos.slotEndsInSec * 1000 : t + SLOT_MS;
    out.push({
      label: posLabel(pos),
      airsFrom: t,
      airsUntil,
      // Sub-second offsets are grid rounding, not a real join.
      joined: pos.offsetSec >= 1,
      startedAtMs: t - pos.offsetSec * 1000, // true start, may predate the window
    });
    t = airsUntil;
  }
  return out;
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

  // Each row is a proportional timeline rather than three equal columns: a
  // block's width is the airtime it actually occupies, and its left border is
  // the moment it starts. So a 25-minute cartoon and a 2-hour movie look like
  // what they are, and the vertical lines march across the row at the real
  // programme boundaries instead of only at :00 and :30.
  // On a phone-width screen, render one row = one "on now" line per channel
  // instead of the proportional timeline below — there's no room for a
  // 90-minute window to stay readable, so don't try (see isMobileGuide()).
  function renderRowsMobile() {
    const now = Date.now();
    trackEl.innerHTML = tunableChannels
      .map((c) => {
        const hl = c.number === highlightedNumber ? " highlight" : "";
        return `<div class="guide-row${hl}" data-ch="${c.number}">
          <span class="ch-col">${c.number} ${c.name}</span>
          <span class="prog-track now-only"><span class="prog now-only">${esc(programLabel(catalog, c, now))}</span></span>
        </div>`;
      })
      .join("");
  }

  // Each row is a proportional timeline rather than three equal columns: a
  // block's width is the airtime it actually occupies, and its left border is
  // the moment it starts. So a 25-minute cartoon and a 2-hour movie look like
  // what they are, and the vertical lines march across the row at the real
  // programme boundaries instead of only at :00 and :30.
  function renderRows() {
    // The periodic refresh() rebuilds this from scratch (program labels can
    // have changed), which would otherwise reset the user's own scroll
    // position back to the top — save and restore it around the rebuild.
    const savedScrollTop = rowsWrap.scrollTop;
    if (isMobileGuide()) {
      renderRowsMobile();
      rowsWrap.scrollTop = savedScrollTop;
      return;
    }
    const s0 = slotStart(Date.now());
    const nowPct = ((Date.now() - s0) / WINDOW_MS) * 100;
    const pct = (ms) => ((clamp(ms, s0, s0 + WINDOW_MS) - s0) / WINDOW_MS) * 100;
    trackEl.innerHTML = tunableChannels
      .map((c) => {
        const blocks = programsBetween(catalog, c, s0, s0 + WINDOW_MS)
          .map((b, i) => {
            const left = pct(b.airsFrom);
            const width = pct(b.airsUntil) - left;
            // `edge`: the leftmost block butts against the window edge, which
            // is a viewport boundary, not a programme boundary — no line.
            const cls = `prog${i === 0 ? " live edge" : ""}${b.joined ? " joined" : ""}`;
            // Joined blocks stamp nothing — the programme's own start is
            // elsewhere, so a time here would read as a start that isn't one.
            const stamp = b.joined ? "" : `<b class="prog-time">${shortTime(new Date(b.airsFrom))}</b> `;
            const when = b.joined
              ? `joined in progress, until ${shortTime(new Date(b.airsUntil))}`
              : `${shortTime(new Date(b.airsFrom))}–${shortTime(new Date(b.airsUntil))}`;
            return `<span class="${cls}" style="left:${left}%;width:${width}%" title="${esc(when)}  ${esc(b.label)}">${stamp}${esc(b.label)}</span>`;
          })
          .join("");
        const hl = c.number === highlightedNumber ? " highlight" : "";
        return `<div class="guide-row${hl}" data-ch="${c.number}">
          <span class="ch-col">${c.number} ${c.name}</span>
          <span class="prog-track">${blocks}<i class="now-line" style="left:${nowPct}%"></i></span>
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

  // Crossing MOBILE_GUIDE_MAX_WIDTH (a rotation, or resizing a desktop
  // window) should switch layouts without waiting on the next 60s refresh().
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (root.classList.contains("hidden")) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderRows, 150);
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
