/* rim_selector.js — the RIM^5 scope selector shared by the RIM landing pages.
   No build step, no modules, no external resources; everything lands in the
   global scope, matching sim_common.js's convention.

   Three scopes = the three levels of the RIM hierarchy:
     level 1  the pattern itself
     level 2  a RIM machine — an implementation of the pattern
     level 3  a RIM design — Map + Model, one turn down

   PORTED FRAMEWORK NOTE: hrefs are RELATIVE, so the bundle works wherever it
   is mounted (/rim-sim/, /, a subpath). The original used absolute
   paths, which assumed its own mount point. Edit LABELS below to name your
   own machine and design; do not change the level ordering.
*/
(function () {
  var SCOPES = [
    { key: "design",  label: "Player-card pipeline",  href: "../design/index.html"  }, // level 3
    { key: "machine", label: "dreamlab", href: "../machine/index.html" }, // level 2
    { key: "rim5",    label: "RIM⁵",         href: "../rim5/index.html"    }, // level 1
  ];

  window.RIM_SCOPES = SCOPES;

  // Renders into an existing <select id="rimScope">. Navigates on change.
  window.mountRimSelector = function (currentKey) {
    var sel = document.getElementById("rimScope");
    if (!sel) return;
    SCOPES.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s.href;
      o.textContent = s.label;
      if (s.key === currentKey) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      if (sel.value) window.location.href = sel.value;
    });
  };
})();
