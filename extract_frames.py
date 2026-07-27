import imageio.v2 as imageio
import os
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(ROOT, 'render13c_out', 'frames')
os.makedirs(OUTDIR, exist_ok=True)

VIDEOS = [
    'render13c_out/vid_1_巷口候车.mp4',
    'render13c_out/vid_2_并肩.mp4',
    'render13c_out/vid_3_搭话.mp4',
    'render13c_out/vid_4_欲言又止.mp4',
]

for rel in VIDEOS:
    v = os.path.join(ROOT, rel)
    reader = imageio.get_reader(v)
    meta = reader.get_meta_data()
    n = reader.count_frames()
    fps = meta.get('fps', 24)
    dur = n / fps if fps else 0
    print(f'{rel}: frames={n} fps={fps:.2f} duration={dur:.2f}s')
    base = os.path.splitext(os.path.basename(rel))[0]
    fracs = [0.02, 0.16, 0.33, 0.5, 0.66, 0.83, 0.98]
    targets = sorted(set(max(0, min(n - 1, int(n * f))) for f in fracs))
    for i, idx in enumerate(targets):
        frame = reader.get_data(idx)
        out = os.path.join(OUTDIR, f'{base}_f{i+1:02d}.jpg')
        Image.fromarray(frame).save(out, quality=88)
    reader.close()
    print(f'  extracted {len(targets)} frames -> {OUTDIR}')

print('ALL_DONE')
