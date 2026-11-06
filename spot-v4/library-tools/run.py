"""Apply the spec /home/claude/spot3/manual/<id>.py (SPEC = {...}, same format as /home/claude/spot2/specs/*.py) and
write the edited picture + review sheets:
  /home/claude/spot3/out/crops_<id>.jpg  (before/after of every difference)   /home/claude/spot3/out/rev_<id>.jpg (whole B, numbered)
Prints the check: count (must equal n), overlaps (must be []), stray (must be []: changes outside the boxes)."""
import sys, importlib.util
sys.path.insert(0, '/home/claude/spot2'); import kit2
pid = sys.argv[1]
sp = importlib.util.spec_from_file_location(pid, f'/home/claude/spot3/manual/{pid}.py'); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m)
S = dict(m.SPEC); S['src'] = S.get('src', pid)
kit2.run(S, src_dir='/home/claude/spot3/src', out='/home/claude/spot3/out', lib='/home/claude/spot3/lib')
