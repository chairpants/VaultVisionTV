// The Video On Demand channel: a browsable menu built live off the catalog,
// not a scheduled simulation -- pick a genre section, a show in it, then an
// episode, and watch it start to finish. Entirely programmatic (window.CATALOG
// is the only data source; no hardcoded titles/shows anywhere below), same
// spirit as how the genre channels sweep their pool automatically by tag.
//
// Mouse-driven the same way guide.js's listings are (click + native
// overflow-y scroll, no keyboard row-stepping) -- Escape/Backspace is the
// only keyboard affordance, popping one level same as the guide's own Back.
// Every list also carries that same pop as its own first row, so a mouse
// alone can get all the way back out (see render()).
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

// Sorted, deduped seasonNum values across a show's episodes. A seasons
// level only makes sense when there's more than one -- most tape/movie-pile
// shows (MonsterVision and the like) only ever have a single value here.
const vodSeasons = (show) => [...new Set(show.episodes.map((ep) => ep.seasonNum))].sort((a, b) => a - b);

// Series or feature film, off the same MOVIE_GENRES list the VBO channels
// sweep (channels.js) -- the catalog has no is-a-movie flag of its own, the
// genre tag is the flag. Anything VaultVision invents a new film genre for
// gets added there and lands on both the VBO tier and the MOVIES side here.
const vodIsMovieGenre = (genre) => (window.MOVIE_GENRES || []).includes(genre);

const VOD_SECTIONS = ["SHOWS", "MOVIES"];

function createVod({ root, catalog, playEpisode, onExit }) {
  // Nav stack: [] SHOWS/MOVIES, [section] genres on that side, [section,
  // genre] shows, [section, genre, show] seasons-or-episodes (episodes
  // directly if the show only has one season), [section, genre, show, season]
  // episodes filtered to that season. Selecting an episode calls playEpisode
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

  const genresIn = (section) =>
    catalog.genres.filter((g) => vodIsMovieGenre(g) === (section === "MOVIES"));
  const countIn = (genre) =>
    Object.values(catalog.shows).filter((s) => s.genre === genre).length;

  function itemsForLevel() {
    if (stack.length === 0) {
      return VOD_SECTIONS.map((section) => ({
        label: `${section}  (${genresIn(section).reduce((n, g) => n + countIn(g), 0)})`,
        onSelect: () => { stack = [section]; render(); },
      }));
    }
    if (stack.length === 1) {
      const [section] = stack;
      return genresIn(section).map((genre) => ({
        label: `${genre}  (${countIn(genre)})`,
        onSelect: () => { stack = [section, genre]; render(); },
      }));
    }
    if (stack.length === 2) {
      const [section, genre] = stack;
      return Object.values(catalog.shows)
        .filter((s) => s.genre === genre)
        .sort((a, b) => a.title.localeCompare(b.title))
        // A feature film is a one-episode show, and a list of one row labelled
        // "Movie" is a click that asks nothing -- play it straight from here.
        .map((show) => ({
          label: show.title,
          onSelect: show.episodes.length === 1
            ? () => playEpisode(show, show.episodes[0])
            : () => { stack = [section, genre, show]; render(); },
        }));
    }
    if (stack.length === 3) {
      const show = stack[2];
      const seasons = vodSeasons(show);
      if (seasons.length > 1) {
        return seasons.map((season) => ({
          label: `Season ${season}  (${show.episodes.filter((ep) => ep.seasonNum === season).length})`,
          onSelect: () => { stack = [...stack, season]; render(); },
        }));
      }
      // Single season/flat show -- nothing to choose between, straight to episodes.
      return show.episodes.map((episode) => ({
        label: vodEpisodeLabel(episode),
        onSelect: () => playEpisode(show, episode),
      }));
    }
    const [, , show, season] = stack;
    return show.episodes
      .filter((ep) => ep.seasonNum === season)
      .map((episode) => ({ label: vodEpisodeLabel(episode), onSelect: () => playEpisode(show, episode) }));
  }

  function render() {
    // section / genre are plain strings, the show is an object, the season a
    // number -- one map beats a rung per depth now that there are five of them.
    breadcrumbEl.textContent = stack
      .map((entry) => (entry.title ? entry.title : typeof entry === "number" ? `Season ${entry}` : entry))
      .join("   /   ");
    // Row 0 is always the same affordance Escape/Backspace already is -- one
    // level up, or out of VOD entirely at the top. It's a real row rather than
    // a header button so the existing click delegation covers it for free;
    // `back: true` only marks it for the sticky styling.
    currentItems = [
      { label: stack.length ? "‹ BACK" : "‹ EXIT TO TV", back: true, onSelect: back },
      ...itemsForLevel(),
    ];
    rowsEl.innerHTML = currentItems
      .map((it, i) => `<div class="vod-row${it.back ? " vod-back" : ""}" data-idx="${i}">${vodEsc(it.label)}</div>`)
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
