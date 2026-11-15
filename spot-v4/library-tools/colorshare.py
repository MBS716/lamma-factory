"""share of colour changes (recolor) among a pair's differences: python3 colorshare.py <id> [<id> ...]"""
import sys, importlib.util
for i in sys.argv[1:]:
    sp = importlib.util.spec_from_file_location(i, f'/home/claude/spot3/manual/{i}.py'); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m)
    D = m.SPEC['diffs']; r = sum(d['op'] == 'recolor' for d in D); n = len(D)
    lim = {5: 2, 8: 3, 12: 5}.get(n, round(n * 0.4))
    print(f"{'OK  ' if r <= lim else 'HIGH'} {i}: {r} of {n} are colour changes ({round(100 * r / n)}%, aim ≤ {lim})", {op: sum(d['op'] == op for d in D) for op in sorted({d['op'] for d in D})})
