# Run one seed of the generator in JSON mode and summarize it.
# Usage (native): python gen.py <label> <seed> [generator args...]
# In Pyodide: set GEN_ARGS = [label, seed, *args] then exec this file.
import contextlib, hashlib, io, json, sys, time, os

def run(label, seed, extra):
    sys.argv = ['DungeonRandomizer.py', '--jsonout', '--spoiler', 'full', '--loglevel', 'error'] + extra
    from CLI import parse_cli
    from Main import main
    from source.classes.BabelFish import BabelFish
    args = parse_cli(None)
    buf = io.StringIO()
    t = time.time()
    with contextlib.redirect_stdout(buf):
        main(seed=int(seed), args=args, fish=BabelFish(lang='en'))
    secs = time.time() - t
    line = [l for l in buf.getvalue().splitlines() if l.startswith('{')][-1]
    out = json.loads(line)
    patch = out.get('patch_t1_p1') or next(v for k, v in out.items() if k.startswith('patch_'))
    # file-select code at 0x180215 (5 bytes), if written as part of a segment
    code = None
    for start, vals in patch.items():
        s = int(start)
        if s <= 0x180215 and s + len(vals) >= 0x18021A:
            code = vals[0x180215 - s:0x18021A - s]
    spoiler = out.get('spoiler')
    res = {
        'label': label, 'seed': int(seed), 'secs': round(secs, 1),
        'patch_md5': hashlib.md5(json.dumps(patch, sort_keys=True).encode()).hexdigest(),
        'spoiler_md5': hashlib.md5(json.dumps(spoiler, sort_keys=True).encode()).hexdigest(),
        'segments': len(patch), 'bytes': sum(len(v) for v in patch.values()),
        'max_addr': max(int(k) + len(v) for k, v in patch.items()),
        'code': code, 'keys': sorted(out.keys()),
        'py': sys.version.split()[0], 'hashseed': os.environ.get('PYTHONHASHSEED'),
    }
    print('RESULT ' + json.dumps(res), flush=True)
    return res

if __name__ == '__main__' and 'GEN_ARGS' not in globals():
    sys.path.insert(0, os.getcwd())
    run(sys.argv[1], sys.argv[2], sys.argv[3:])
elif 'GEN_ARGS' in globals():
    run(GEN_ARGS[0], GEN_ARGS[1], GEN_ARGS[2:])
