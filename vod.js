// The Video On Demand channel: a browsable menu built live off the catalog,
// not a scheduled simulation -- pick a genre section, a show in it, then an
// episode, and watch it start to finish. Entirely programmatic (window.CATALOG
// is the only data source; no hardcoded titles/shows anywhere below), same
// spirit as how the genre channels sweep their pool automatically by tag.
//
// Mouse-driven the same way guide.js's listings are (click + native
// overflow-y scroll, no keyboard row-stepping) -- Escape/Backspace is the
// only keyboard affordance, popping one level same as the guide's own Back.
//
// Plain script, not a module (see scheduler.js's header for why).

// Same movie-title-vs-code+name precedence titleLines() (player.js) uses,
// but without the show's own title as a second line -- redundant here,
// since the breadcrumb above the list already names the show every row in
// an episode list belongs to.
function vodEpisodeLabel(episode) {
  if (episode.movieTitle) return episode.movieTitle;
  if (episode.name) return `${episode.code}  ${episode.name}`;
  return episode.code;
}

// Episode/show titles come from archive.org metadata, not from us -- escape
// them before they go anywhere near innerHTML (same policy as guide.js).
const vodEsc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

function createVod({ root, catalog, playEpisode, onExit }) {
  // Nav stack: [] at the section list, [genre] one level in, [genre, show]
  // two levels in (an episode list). Selecting an episode calls playEpisode
  // and leaves the stack alone, so Back from playback (see app.js) drops
  // right back into the same episode list without re-navigating.
  let stack = [];
  let currentItems = [];

  root.innerHTML = `
    <div id="vod-header">
      <span id="vod-title">🎬 VIDEO ON DEMAND</span>
      <span id="vod-breadcrumb"></span>
    </div>
    <div id="vod-rows"></div>
  `;
  const breadcrumbEl = root.querySelector("#vod-breadcrumb");
  const rowsEl = root.querySelector("#vod-rows");

  function itemsForLevel() {
    if (stack.length === 0) {
      return catalog.genres.map((genre) => ({
        label: `${genre}  (${Object.values(catalog.shows).filter((s) => s.genre === genre).length})`,
        onSelect: () => { stack = [genre]; render(); },
      }));
    }
    if (stack.length === 1) {
      const [genre] = stack;
      return Object.values(catalog.shows)
        .filter((s) => s.genre === genre)
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((show) => ({ label: show.title, onSelect: () => { stack = [genre, show]; render(); } }));
    }
    const [, show] = stack;
    return show.episodes.map((episode) => ({
      label: vodEpisodeLabel(episode),
      onSelect: () => playEpisode(show, episode),
    }));
  }

  function render() {
    breadcrumbEl.textContent =
      stack.length === 0 ? "" : stack.length === 1 ? stack[0] : `${stack[0]}   /   ${stack[1].title}`;
    currentItems = itemsForLevel();
    rowsEl.innerHTML = currentItems
      .map((it, i) => `<div class="vod-row" data-idx="${i}">${vodEsc(it.label)}</div>`)
      .join("");
    rowsEl.scrollTop = 0;
  }

  rowsEl.addEventListener("click", (e) => {
    const row = e.target.closest(".vod-row");
    if (!row) return;
    currentItems[parseInt(row.dataset.idx, 10)].onSelect();
  });

  // Top level -> exit VOD entirely (app.js's onExit retunes whatever channel
  // was live before VOD was entered); otherwise pop one level.
  function back() {
    if (stack.length === 0) {
      onExit();
      return;
    }
    stack = stack.slice(0, -1);
    render();
  }

  document.addEventListener("keydown", (e) => {
    if (root.classList.contains("hidden")) return;
    if (e.key === "Escape" || e.key === "Backspace") back();
  });

  // Fresh entry from live TV -- always starts at the top (sections) level.
  function show() {
    stack = [];
    root.classList.remove("hidden");
    render();
  }

  // Returning from playback (Back, natural end, or a dead file) -- same
  // level it was at, not reset to the top. stack is untouched by hide(), so
  // this just re-renders whatever it already was.
  function resume() {
    root.classList.remove("hidden");
    render();
  }

  function hide() {
    root.classList.add("hidden");
  }

  return { show, resume, hide, back };
}
