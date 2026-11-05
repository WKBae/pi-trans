#!/usr/bin/env bash
# Turns demo/out/raw.mp4 (from demo/demo.tape) into:
#   demo/out/cc-trans.mp4  1280x720 H.264, for posting
#   demo/cc-trans.gif      960 wide, for the README
#
# Every stretch where the picture does not change is cut to HOLD seconds (the
# tape waits generously for Claude and the translator); the last one is kept
# for END_HOLD seconds.
set -euo pipefail
cd "$(dirname "$0")"

TOP=${TOP:-255}           # rows above the first prompt: logo, /clear, startup notices
HOLD=${HOLD:-3}         # seconds a still stretch is kept
END_HOLD=${END_HOLD:-4}   # seconds the final frame is kept
CROP="crop=1280:720:0:${TOP}"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 out/raw.mp4)
FREEZES=$(ffmpeg -hide_banner -nostats -i out/raw.mp4 -vf "$CROP,freezedetect=n=0.0005:d=${HOLD}" -map 0:v -f null - 2>&1 |
  grep -oE 'freeze_(start|end): [0-9.]+' || true)

# A select= expression for the ranges to cut.
CUT=$(python3 -I -c '
import sys
dur, hold, end_hold = map(float, sys.argv[1:4])
starts = [float(l.split()[1]) for l in sys.argv[4].splitlines() if l.startswith("freeze_start")]
ends = [float(l.split()[1]) for l in sys.argv[4].splitlines() if l.startswith("freeze_end")]
cuts = []
for i, s in enumerate(starts):
    e = ends[i] if i < len(ends) else dur
    keep = end_hold if e >= dur - 0.05 else hold
    if e - s > keep:
        cuts.append((s + keep, e))
print("+".join(f"between(t,{a:.3f},{b:.3f})" for a, b in cuts) or "0")
' "$DUR" "$HOLD" "$END_HOLD" "$FREEZES")
SELECT="select='not(${CUT})',setpts=N/FRAME_RATE/TB"

ffmpeg -y -loglevel error -i out/raw.mp4 -vf "$CROP,$SELECT" -an \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart out/cc-trans.mp4

ffmpeg -y -loglevel error -i out/cc-trans.mp4 \
  -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  out/cc-trans.raw.gif
gifsicle -O3 --lossy=30 out/cc-trans.raw.gif -o cc-trans.gif
rm out/cc-trans.raw.gif

printf 'raw %.1fs -> %.1fs\n' "$DUR" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 out/cc-trans.mp4)"
ls -lh out/cc-trans.mp4 cc-trans.gif
