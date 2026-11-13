# «اكتشف الفرق» v5 — local test results (branch spot-v5)
The whole local suite (the six games, fake database in the browser) after each phase:
- p1/ — phase 1 (results screen). vswitch rerun after its check was updated (the old version is now v4.8, which knows «أكملها»).
- p23/ — phases 2 and 3 (new competition, the picture library). Two failures in the parallel run (letters «second replacement», «أكملها» answer card: an element detached while scrolling) pass when run alone: *_alone.txt.
- p4/ — phase 4 (the host plays from a separate device): every test passed.
shots/ — screenshots (phone 390/360, computer 1280); *.csv — downloaded competition summaries.
