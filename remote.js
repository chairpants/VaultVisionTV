// Channel controls: keyboard + the on-screen remote panel. Pure input
// handling — it doesn't know what a channel *is*, it just reports committed
// intents (a typed number, a +1/-1 step, "show the guide") to callbacks.
//
// Plain script, not a module (see scheduler.js's header).
const IDLE_COMMIT_MS = 1500;
const MAX_DIGITS = 3;

function initRemote({ root, digitOsd, onTuneNumber, onChannelStep, onGuide }) {
  let buffer = "";
  let idleTimer = null;

  function render() {
    if (buffer) {
      digitOsd.textContent = buffer;
      digitOsd.classList.remove("hidden");
    } else {
      digitOsd.classList.add("hidden");
    }
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

  document.addEventListener("keydown", (e) => {
    if (e.key >= "0" && e.key <= "9") { pressDigit(e.key); return; }
    if (e.key === "Enter") { commit(); return; }
    if (e.key === "Escape" || e.key === "Backspace") { clearBuffer(); return; }
    if (e.key === "PageUp" || e.key === "]") { onChannelStep(1); return; }
    if (e.key === "PageDown" || e.key === "[") { onChannelStep(-1); return; }
    if (e.key === "g" || e.key === "G") { onGuide(); return; }
  });

  root.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    btn.classList.add("pressed");
    setTimeout(() => btn.classList.remove("pressed"), 120);
    if (btn.dataset.digit !== undefined) { pressDigit(btn.dataset.digit); return; }
    switch (btn.dataset.action) {
      case "ch-up": onChannelStep(1); break;
      case "ch-down": onChannelStep(-1); break;
      case "guide": onGuide(); break;
      case "enter": commit(); break;
    }
  });
}
