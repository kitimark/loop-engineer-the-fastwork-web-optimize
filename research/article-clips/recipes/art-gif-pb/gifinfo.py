#!/usr/bin/env python3
# Raw GIF block walk: frame count, per-frame delays (from the Graphic Control Extensions), loop count.
import sys
from collections import Counter
def info(p):
    b = open(p, 'rb').read()
    w, h, flags = int.from_bytes(b[6:8], 'little'), int.from_bytes(b[8:10], 'little'), b[10]
    i = 13 + (3 * 2 ** ((flags & 7) + 1) if flags & 0x80 else 0)
    delays, frames, loop, pending = [], 0, None, None
    def skip_sub(i):
        while b[i]:
            i += b[i] + 1
        return i + 1
    while i < len(b):
        t = b[i]
        if t == 0x21:
            lab = b[i + 1]
            if lab == 0xF9:
                pending = int.from_bytes(b[i + 4:i + 6], 'little') * 10
            elif lab == 0xFF and b[i + 3:i + 14] == b'NETSCAPE2.0':
                loop = int.from_bytes(b[i + 16:i + 18], 'little')
            i = skip_sub(i + 2)
        elif t == 0x2C:
            frames += 1; delays.append(pending); pending = None
            f2 = b[i + 9]
            i += 10 + (3 * 2 ** ((f2 & 7) + 1) if f2 & 0x80 else 0)
            i = skip_sub(i + 1)
        elif t == 0x3B:
            break
        else:
            raise SystemExit(f'bad block {t:#x} at {i}')
    return dict(size=(w, h), frames=frames, delays=Counter(delays), total_ms=sum(d or 0 for d in delays), loop=loop, bytes=len(b), delay_list=delays)
if __name__ == '__main__':
    for p in sys.argv[1:]:
        r = info(p); r.pop('delay_list'); print(p.split('/')[-1], r)
