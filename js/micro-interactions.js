/* UI Micro Interactions (#9) - new file, only adds/removes CSS classes */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var suppressEnter = false;

  function replay(el, cls) {
    if (reduceMotion.matches) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener("animationend", function done(e) {
      if (e.target !== el) return;
      el.classList.remove(cls);
      el.removeEventListener("animationend", done);
    });
  }

  function watchContainer(id) {
    var container = document.getElementById(id);
    if (!container) return;
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        if (suppressEnter) return;
        Array.prototype.forEach.call(container.children, function (child) {
          replay(child, "mi-enter");
        });
      });
    }).observe(container, { childList: true, subtree: true, characterData: true });
  }

  function watchHidden(id) {
    var el = document.getElementById(id);
    if (!el) return;
    new MutationObserver(function () {
      if (!el.hidden) replay(el, "mi-enter");
    }).observe(el, { attributes: true, attributeFilter: ["hidden"] });
  }

  function watchUnitButtons() {
    ["celsius-btn", "fahrenheit-btn"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener("click", function () {
        if (reduceMotion.matches) return;
        suppressEnter = true;
        setTimeout(function () { suppressEnter = false; }, 400);
        ["current-weather", "forecast"].forEach(function (cid) {
          var c = document.getElementById(cid);
          if (c) replay(c, "mi-unit-swap");
        });
      });
    });
  }

  function init() {
    watchContainer("current-weather");
    watchContainer("forecast");
    watchHidden("loading");
    watchHidden("error");
    watchUnitButtons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
