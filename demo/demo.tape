# pi-trans demo. Run from the repository root:
#
#   vhs demo/demo.tape && demo/render.sh
#
# Records a taller terminal than the clip; render.sh crops the top band
# (Pi's startup header) away, shortens the still stretches while
# nothing changes, and makes the mp4 and the GIF.
# The app is copied to /tmp/pi-trans-demo so no home path shows on screen.
# The language comes from LANG; only this extension is loaded.
# The waits are generous on purpose: render.sh cuts what is left over.

Output demo/out/raw.mp4

Set Shell zsh
Set FontFamily "D2Coding"
Set FontSize 18
Set Width 1280
Set Height 980
Set TypingSpeed 55ms
Set CursorBlink false

Hide
Type "D=$PWD/demo && rm -rf /tmp/pi-trans-demo && cp -R demo/app /tmp/pi-trans-demo && cd /tmp/pi-trans-demo && clear"
Enter
Type "LANG=ko_KR.UTF-8 pi --no-extensions -e $D/.. --no-session"
Enter
Sleep 8s
Show

# 1. Ask in Korean; the English shows above the prompt while typing.
Sleep 1s
Type "users.js의 loadUsers가 왜 느린지"
Sleep 1.8s
Type " 한 문장으로 말하고 바로 고쳐줘"
Sleep 3.2s
Enter
Sleep 40s

# 2. Side by side: the first answer is drawn again, English left.
Type "/translate view side"
Sleep 1s
Enter
Sleep 5s

# 3. A follow-up whose answer is a list, filled in side by side as it comes.
Type "동시 요청을 5개로 제한하는 방법은? 장단점을 짧은 목록으로"
Sleep 3.2s
Enter
Sleep 35s

# 4. The translation alone, then back to the default.
Type "/translate view translated"
Sleep 1s
Enter
Sleep 5s
Type "/translate view stacked"
Sleep 1s
Enter
Sleep 4s

Hide
Ctrl+C
Sleep 300ms
Ctrl+C
Sleep 1s
