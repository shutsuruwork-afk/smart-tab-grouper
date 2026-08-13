import os
import zlib
import struct

os.makedirs('icons', exist_ok=True)

def create_png(width, height, color_bg, color_fg1, color_fg2, filename):
  raw_data = bytearray()
  for y in range(height):
    raw_data.append(0) # filter type 0 (None)
    for x in range(width):
      margin = max(1, width // 8)
      h = max(2, height // 4)
      y1 = margin
      y2 = y1 + h + max(1, height // 16)
      
      if margin <= x < width - margin and y1 <= y < y1 + h:
        r, g, b, a = color_fg1
      elif margin <= x < width - margin and y2 <= y < y2 + h:
        r, g, b, a = color_fg2
      else:
        r, g, b, a = color_bg

      raw_data.extend([r, g, b, a])

  compressed = zlib.compress(raw_data)

  def chunk(tag, data):
    return (struct.pack('>I', len(data)) +
            tag +
            data +
            struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

  ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)

  png_bytes = (b'\x89PNG\r\n\x1a\n' +
               chunk(b'IHDR', ihdr) +
               chunk(b'IDAT', compressed) +
               chunk(b'IEND', b''))

  with open(filename, 'wb') as f:
    f.write(png_bytes)
  print(f'Saved {filename}')

for s in [16, 48, 128]:
  create_png(s, s, (0, 0, 0, 0), (26, 115, 232, 255), (138, 180, 248, 255), f'icons/icon{s}.png')
