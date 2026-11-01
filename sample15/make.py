import sys, importlib.util
from kit2 import run
for f in sys.argv[1:]:
    sp = importlib.util.spec_from_file_location('s', f); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); run(m.SPEC)
