// Channel controls: keyboard + the on-screen remote panel. Pure input
// handling — it doesn't know what a channel *is*, it just reports committed
// intents (a typed number, a +1/-1 step, "show the guide") to callbacks.
//
// Plain script, not a module (see scheduler.js's header).
const IDLE_COMMIT_MS = 1500;
const MAX_DIGITS = 3;

const FLASH_MS = 1200;

function initRemote({ root, digitOsd, onTuneNumber, onChannelStep, onGuide, onVod,
                      onVolumeStep, onMute, onLastChannel, onWeb, onSeekStart, onSeekEnd }) {
  let buffer = "";
  let idleTimer = null;
  let flashText = ""; // transient status (VOL 70, MUTE) borrowing the same corner
  let flashTimer = null;
  let openDelayResetTimer = null;
  const toggleBtn = root.querySelector("#remote-toggle");

  function render() {
    const text = buffer || flashText;
    digitOsd.textContent = text;
    digitOsd.classList.toggle("hidden", !text);
  }

  // Exposed so app.js can echo volume/mute without owning the OSD element.
  function flash(text) {
    flashText = text;
    render();
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashText = ""; render(); }, FLASH_MS);
  }

  function commit() {
    clearTimeout(idleTimer);
    idleTimer = null;
    if (buffer) onTuneNumber(parseInt(buffer, 10));
    buffer = "";
    render();
  }

  function pressDigit(d) {
    buffer = (buffer + d).slice(-MAX_DIGITS);
    render();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(commit, IDLE_COMMIT_MS);
  }

  function clearBuffer() {
    clearTimeout(idleTimer);
    idleTimer = null;
    buffer = "";
    render();
  }

  // Whether the panel is actually rendered open right now — reads the real
  // transform rather than trusting the .open class alone, because :hover can
  // also be the thing holding it open (a mouse has to be hovering #remote to
  // click anything inside it in the first place). Toggling off of the class
  // instead would make the first click while hovering a no-op: .open would
  // go from absent to present with nothing visibly changing, since :hover
  // was already rendering it open.
  function isRenderedOpen() {
    const m = getComputedStyle(root).transform.match(/matrix\(([^)]+)\)/);
    return !m || Math.abs(parseFloat(m[1].split(",")[5])) < 5;
  }

  // Touch devices have no :hover, so #remote-toggle (see style.css) is their
  // only way to open the remote. transitionDelay is set inline rather than
  // via a class because the panel's CSS deliberately delays *closing* by 3s
  // on hover-leave (so a mouse brushing past doesn't snap it shut) — a tap
  // shouldn't inherit that delay in either direction. Cleared again after the
  // transition finishes so hover on a device that has both input types keeps
  // its own idle-close behavior.
  function toggleOpen() {
    const open = !isRenderedOpen();
    root.style.transitionDelay = "0s";
    root.classList.toggle("open", open);
    // On a mouse, clicking the chevron closed happens while still hovering
    // #remote (the cursor has to be over it to click something inside it),
    // which would otherwise keep :hover's own open rule in charge — .closed
    // overrides that (see style.css); "mouseleave" below drops it again once
    // the cursor actually leaves, so the next hover cycle isn't stuck shut.
    root.classList.toggle("closed", !open);
    toggleBtn.setAttribute("aria-expanded", String(open));
    toggleBtn.setAttribute("aria-label", open ? "Hide remote controls" : "Show remote controls");
    clearTimeout(openDelayResetTimer);
    openDelayResetTimer = setTimeout(() => { root.style.transitionDelay = ""; }, 450);
    // A tap focuses the button same as a click would. Left focused, a later
    // keydown anywhere (e.g. the "g"/"v" hotkeys) can promote that focus to
    // :focus-visible, which — same as real keyboard tabbing — pins the
    // remote open via the rule below, undoing whatever this tap just did.
    toggleBtn.blur();
  }

  root.addEventListener("mouseleave", () => root.classList.remove("closed"));

  document.addEventListener("keydown", (e) => {
    if (e.key >= "0" && e.key <= "9") { pressDigit(e.key); return; }
    if (e.key === "Enter") { commit(); return; }
    if (e.key === "Escape" || e.key === "Backspace") { clearBuffer(); return; }
    if (e.key === "PageUp" || e.key === "]") { onChannelStep(1); return; }
    if (e.key === "PageDown" || e.key === "[") { onChannelStep(-1); return; }
    if (e.key === "ArrowUp") { onVolumeStep(1); return; }
    if (e.key === "ArrowDown") { onVolumeStep(-1); return; }
    // Only VOD playback does anything with these (app.js no-ops otherwise)
    // — e.repeat guards against the OS's own key-repeat re-firing keydown
    // throughout a hold; the actual scrubbing runs off player.js's own
    // ticker between this start and the keyup below, not off repeat events.
    if (e.key === "ArrowLeft") { if (!e.repeat) onSeekStart(-1); return; }
    if (e.key === "ArrowRight") { if (!e.repeat) onSeekStart(1); return; }
    if (e.key === "m" || e.key === "M") { onMute(); return; }
    if (e.key === "r" || e.key === "R") { onLastChannel(); return; }
    if (e.key === "g" || e.key === "G") { onGuide(); return; }
    if (e.key === "v" || e.key === "V") { onVod(); return; }
  });

  document.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") onSeekEnd();
  });

  root.addEventListener("click", (e) => {
    if (e.target.closest("#remote-toggle")) { toggleOpen(); return; }
    const btn = e.target.closest("button");
    if (!btn) return;
    btn.classList.add("pressed");
    setTimeout(() => btn.classList.remove("pressed"), 120);
    switch (btn.dataset.action) {
      case "ch-up": onChannelStep(1); break;
      case "ch-down": onChannelStep(-1); break;
      case "vol-up": onVolumeStep(1); break;
      case "vol-down": onVolumeStep(-1); break;
      case "mute": onMute(); break;
      case "last": onLastChannel(); break;
      case "web": onWeb(); break;
      case "guide": onGuide(); break;
      case "vod": onVod(); break;
    }
  });

  return { flash };
}
