// frameutil.py — 帧工具：抽尾帧（验证用）+ ffmpeg 拼接成片
// 依赖 venv: imageio / imageio_ffmpeg / Pillow
import sys, os, subprocess
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def lastframe(video, out_jpg):
    # 用 ffmpeg 直接 seek 到末尾前一帧，避免解码整段
    cmd = [FFMPEG, '-y', '-sseof', '-0.05', '-i', video,
           '-frames:v', '1', '-q:v', '2', out_jpg]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"lastframe -> {out_jpg}")


def concat(manifest, out_mp4):
    with open(manifest, 'r', encoding='utf-8') as f:
        files = [l.strip() for l in f if l.strip()]
    lst = out_mp4 + '.concat.txt'
    with open(lst, 'w', encoding='utf-8') as f:
        for p in files:
            f.write(f"file '{os.path.abspath(p)}'\n")

    def run(args):
        return subprocess.run(args, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    # 1) 优先无损 copy（分段参数一致时）
    r = run([FFMPEG, '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', out_mp4])
    if r.returncode == 0 and os.path.getsize(out_mp4) > 0:
        print(f"concat(copy) -> {out_mp4} ({len(files)} segments)")
        return
    # 2) 回退：重编码视频保留音频
    r = run([FFMPEG, '-y', '-f', 'concat', '-safe', '0', '-i', lst,
             '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', out_mp4])
    if r.returncode == 0 and os.path.getsize(out_mp4) > 0:
        print(f"concat(recode+aac) -> {out_mp4} ({len(files)} segments)")
        return
    # 3) 最后回退：丢弃音频
    r = run([FFMPEG, '-y', '-f', 'concat', '-safe', '0', '-i', lst,
             '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', out_mp4])
    if r.returncode != 0:
        raise RuntimeError('concat failed: ' + (r.stderr or b'').decode(errors='ignore')[-300:])
    print(f"concat(recode,no-audio) -> {out_mp4} ({len(files)} segments)")


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'lastframe':
        lastframe(sys.argv[2], sys.argv[3])
    elif cmd == 'concat':
        concat(sys.argv[2], sys.argv[3])
    else:
        print('usage: frameutil.py [lastframe <video> <out.jpg> | concat <manifest> <out.mp4>]')
        sys.exit(1)
