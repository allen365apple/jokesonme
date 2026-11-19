export const VOTE_COUNT_UP_DURATION_MS = 3400;

/** A cancelable presentation sequence; authoritative ballots are already closed. */
export function revealVotes(session, prefs, done) {
  let canceled = false,
    frame,
    timer,
    animation;
  const qr = document.querySelector("#qr"),
    block = document.querySelector("#qr-block");
  const original = qr.innerHTML;
  const reduced =
    prefs.reduced || matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelector("#stage").classList.add("revealing");
  block.hidden = false;
  block.classList.add("countdown-box");
  qr.innerHTML = '<span class="countdown-number" aria-live="assertive"></span>';
  const number = qr.firstElementChild;
  let digit = 3;
  function tick() {
    if (canceled) return;
    number.textContent = digit;
    if (!reduced)
      animation = number.animate(
        [
          { transform: "scale(1.65)", opacity: 0 },
          { transform: "scale(1.15)", opacity: 1, offset: 0.16 },
          { transform: "scale(.45)", opacity: 0 },
        ],
        { duration: 900, easing: "cubic-bezier(.16,1,.3,1)" },
      );
    digit--;
    timer = setTimeout(digit ? tick : count, 950);
  }
  function count() {
    if (canceled) return;
    block.hidden = true;
    document.querySelector("#stage").classList.add("counting-votes");
    document.querySelector("#status-text").textContent = "票數揭曉中⋯";
    const start = performance.now(),
      duration = reduced ? 150 : VOTE_COUNT_UP_DURATION_MS;
    const scale = Math.max(
      session.expected,
      Math.ceil(Math.max(...session.counts) / 50) * 50,
      1,
    );
    function draw(now) {
      if (canceled) return;
      const progress = Math.min(1, (now - start) / duration),
        ease = 1 - (1 - progress) ** 2;
      session.counts.forEach((total, i) => {
        const value = progress === 1 ? total : Math.floor(total * ease),
          root = document.querySelector("#team-" + i);
        root.querySelector(".score-value").textContent = value;
        root.querySelector(".bar").style.transform = `scaleY(${value / scale})`;
        root
          .querySelector(".chart")
          .setAttribute("aria-label", `${session.teams[i].name} ${value} 票`);
      });
      if (progress < 1) frame = requestAnimationFrame(draw);
      else {
        document
          .querySelector("#stage")
          .classList.remove("revealing", "counting-votes");
        document.querySelector("#stage").classList.add("reveal-complete");
        done();
      }
    }
    frame = requestAnimationFrame(draw);
  }
  tick();
  return () => {
    canceled = true;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    animation?.cancel();
    qr.innerHTML = original;
    block.classList.remove("countdown-box");
    document
      .querySelector("#stage")
      .classList.remove("revealing", "counting-votes", "reveal-complete");
  };
}
