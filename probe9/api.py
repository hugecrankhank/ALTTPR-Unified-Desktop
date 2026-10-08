import json, time, urllib.request, base64, sys
API = 'https://api.alttpr.gwaa.kiwi'
def req(method, path, body=None, origin='https://hugecrankhank.github.io'):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
        headers={'Content-Type': 'application/json', 'Origin': origin, 'User-Agent': 'ALTTPR-Unified probe'})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
if sys.argv[1].startswith('get:'):
    sids = [sys.argv[1][4:]]
else:
    sids = []
settings = {"randomizer": "base", "race": sys.argv[1], "mode": "open", "weapons": "random", "goal": "ganon", "crystals_ganon": "7", "crystals_gt": "7", "show_map": "always", "hints": "off"}
sid = sids[0] if sids else None
if not sid:
    st, h, b = req('POST', '/generate', settings)
    print('POST', st, b[:200])
    sid = b.decode().strip().strip('"') if st in (200, 202) else None
t = time.time()
while sid:
    st, h, b = req('GET', f'/seed/{sid}')
    if st != 409: break
    time.sleep(2)
print('GET', st, round(time.time() - t), 's', {k: v for k, v in h.items() if 'ccess' in k})
if st == 200:
    d = json.loads(b)
    print('keys', sorted(d.keys()))
    for k, v in d.items():
        if k == 'patch': p = base64.b64decode(v); print('patch bytes', len(p), p[:4], 'srccrc', hex(int.from_bytes(p[-12:-8], 'little')))
        elif k == 'spoiler': print('spoiler type', type(v).__name__, (list(v.keys())[:12] if isinstance(v, dict) else str(v)[:100]))
        else: print(k, json.dumps(v)[:400])
else:
    print(b[:300])
st, h, b = req('OPTIONS', '/generate', origin='https://hugecrankhank.github.io')
print('OPTIONS', st, {k: v for k, v in h.items() if 'ccess' in k})
