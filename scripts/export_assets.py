"""Export original SFF v1 backgrounds to browser PNGs, using only Python stdlib."""
from pathlib import Path
import struct
import zlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'web' / 'assets'


def png(path, width, height, rgba):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    rows = b''.join(b'\0' + rgba[y * width * 4:(y + 1) * width * 4] for y in range(height))
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
                     + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))


def decode_pcx(data, shared_palette):
    if data[0] != 10 or data[2:4] != b'\x01\x08' or data[65] != 1:
        raise ValueError('Expected 8-bit single-plane RLE PCX')
    xmin, ymin, xmax, ymax = struct.unpack_from('<4H', data, 4)
    width, height = xmax - xmin + 1, ymax - ymin + 1
    stride = struct.unpack_from('<H', data, 66)[0]
    palette = data[-768:] if len(data) >= 897 and data[-769] == 12 else shared_palette
    if palette is None:
        raise ValueError('Missing PCX palette')
    decoded = bytearray()
    offset = 128
    while len(decoded) < stride * height:
        value = data[offset]
        offset += 1
        if value >= 192:
            count = value & 63
            value = data[offset]
            offset += 1
        else:
            count = 1
        decoded.extend([value] * count)
    if len(decoded) != stride * height:
        raise ValueError('PCX scanline overflow')
    colors = [palette[i * 3:i * 3 + 3] + bytes([0 if i == 0 else 255]) for i in range(256)]
    rgba = b''.join(colors[decoded[y * stride + x]] for y in range(height) for x in range(width))
    return width, height, rgba, palette


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    data = (ROOT / 'DrKarate.sff').read_bytes()
    if data[:12] != b'ElecbyteSpr\0' or data[15] != 1:
        raise ValueError('Expected SFF v1')
    count, offset, header = struct.unpack_from('<III', data, 20)
    sprites, palette, manifest = [], None, {}
    for _ in range(count):
        nxt, size, x, y, group, number, link, same_palette = struct.unpack_from('<IIhhHHHB', data, offset)
        if size:
            width, height, rgba, current_palette = decode_pcx(data[offset + header:offset + header + size], palette)
            if same_palette and palette is not None:
                # Shared-palette PCXs normally omit their palette; retain the previous one.
                pass
            palette = current_palette
        else:
            width, height, rgba = sprites[link]
        sprites.append((width, height, rgba))
        # Intro curtains are MUGEN-specific; the web game has its own round overlay.
        if group < 7:
            name = f'{group}-{number}.png'
            png(OUT / name, width, height, rgba)
            manifest[f'{group},{number}'] = {'file': name, 'width': width, 'height': height, 'x': x, 'y': y}
        offset = nxt
    (OUT / 'sprites.json').write_text(json.dumps(manifest, separators=(',', ':')), encoding='utf-8')
    for i in (1, 2):
        shutil.copyfile(ROOT / f'DrKarate{i}.mp3', OUT / f'DrKarate{i}.mp3')
    print(f'Exported {len(manifest)} sprites and 2 music tracks to {OUT}')


if __name__ == '__main__':
    main()
