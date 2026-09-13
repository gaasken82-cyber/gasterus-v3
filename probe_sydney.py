import urllib.request, socket, re
socket.setdefaulttimeout(8)

urls = [
    'https://widgets.vegasnet.info/result1.php',
    'https://widgets.vegasnet.info/result2.php',
    'https://widgets.vegasnet.info/result.php',
]

for url in urls:
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=8) as r:
            body = r.read().decode('utf-8','ignore')
        low = body.lower()
        # find market names
        names = re.findall(r'<b>([^<]{3,40})</b>', body)
        names = [n.strip() for n in names if n.strip() and len(n.strip())>2]
        print(f"=== {url} === len={len(body)} sydney={'sydney' in low}")
        print("  names:", names[:40])
    except Exception as e:
        print(f"=== {url} === ERR {repr(e)[:150]}")