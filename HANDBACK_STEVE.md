# Handback — BigMo → Steve

Items generated during Scoot (SW) RI work that are feedback or decisions applicable to the Bregman (HW/Arch) project.

---

## 2026-05-21 — Pass directory naming: `ri/rtl/` vs `ri/src/`

**Decision made on Scoot:**  
Renamed `ri/rtl/` to `ri/src/` for the implementation pass directory.

**Rationale:**  
`rtl/` is HW-specific vocabulary. A SW project puts source code here — calling it `rtl/` is confusing to any contributor who doesn't already know the HW analogy. `ri/src/` preserves the RI scaffold grammar (same position, same role) while being immediately readable in both domains.

**Recommendation for Bregman:**  
If Bregman has any directories named `ri/rtl/`, consider renaming to `ri/src/` for the same reason — or at minimum document the mapping explicitly so engineers new to the project understand it.  
If Bregman is strictly RTL (no software source mixed in), `ri/rtl/` is still defensible but `ri/src/` is a cleaner cross-domain label.

**The principle:**  
The RI scaffold's pass names are not sacred. The structure and methodology are. Use names that are unambiguous in your domain.

---

*Add new items below as they arise.*
