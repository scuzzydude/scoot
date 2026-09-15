/* rim_selector.js - the RIM^5 scope selector shared by the RIM landing pages.
   No build step, no modules, no external resources.

   Three scopes = the three levels:
     level 1  RIM^5        the pattern (identical on every host - it is open methodology)
     level 2  BigMo        this machine
     level 3  Scoot(34)    a design running on it

   hrefs are RELATIVE, so the bundle works wherever it is mounted (/rim-sim/, /, a
   subpath). Edit the labels; do NOT change the level ordering, which is the dependency
   chain the pages assert. */
(function () {
  var SCOPES = [
    { key: "design",  label: "Scoot(34)", href: "../design/index.html"  }, // level 3
    { key: "machine", label: "BigMo",     href: "../machine/index.html" }, // level 2
    { key: "rim5",    label: "RIM⁵",      href: "../rim5/index.html"    }, // level 1
  ];
  window.RIM_SCOPES = SCOPES;
  window.mountRimSelector = function (currentKey) {
    var sel = document.getElementById("rimScope");
    if (!sel) return;
    SCOPES.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s.href; o.textContent = s.label;
      if (s.key === currentKey) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () { if (sel.value) window.location.href = sel.value; });
  };
})();
