#!/usr/bin/env bash
# Turns demo/out/raw.mp4 (from demo/demo.tape) into:
#   demo/out/cc-trans.mp4  1280x720 H.264, for posting
#   demo/cc-trans.gif      960 wide, for the README
set -euo pipefail
cd "$(dirname "$0")"

TOP=${TOP:-255}   # rows above the first prompt: logo, /clear, startup notices
CROP="crop=1280:720:0:${TOP}"
END=${END:+-t $END}   # seconds to keep, to cut the still tail after the translation lands

ffmpeg -y -loglevel error $END -i out/raw.mp4 -vf "$CROP" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart out/cc-trans.mp4

ffmpeg -y -loglevel error $END -i out/raw.mp4 \
  -vf "$CROP,fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  out/cc-trans.raw.gif
gifsicle -O3 --lossy=30 out/cc-trans.raw.gif -o cc-trans.gif
rm out/cc-trans.raw.gif

ls -lh out/cc-trans.mp4 cc-trans.gif
