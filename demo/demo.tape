# cc-trans demo. Run from the repository root:
#
#   vhs demo/demo.tape && demo/render.sh
#
# Records a taller terminal than the clip; render.sh crops the top band
# (logo, /clear, startup notices) away, shortens the still stretches while
# nothing changes, and makes the mp4 and the GIF.
# The app is copied to /tmp/cc-trans-demo so no home path shows on screen;
# trust that folder once in Claude Code before recording.
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
# A clean environment when recorded from inside another Claude Code session.
Type "D=$PWD/demo && rm -rf /tmp/cc-trans-demo && cp -R demo/app /tmp/cc-trans-demo && cd /tmp/cc-trans-demo && unset CLAUDECODE CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_SESSION_ID CLAUDE_CODE_BRIDGE_SESSION_ID CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_PID CLAUDE_CODE_SESSION_ATTENDED CLAUDE_CODE_ENTRYPOINT CLAUDE_EFFORT && clear"
Enter
Type "claude --plugin-dir $D/.. --settings $D/settings.json --model sonnet --permission-mode acceptEdits"
Enter
Sleep 8s
Type "/clear"
Enter
Sleep 3s
Show

# 1. Ask in Korean; the English shows above the prompt while typing.
Sleep 1s
Type "users.js의 loadUsers가 왜 느린지"
Sleep 1.8s
Type " 한 문장으로 말하고 바로 고쳐줘"
Sleep 3.2s
Enter
Sleep 40s

# 2. A follow-up whose answer is a list.
Type "동시 요청을 5개로 제한하는 방법은? 장단점을 짧은 목록으로"
Sleep 3.2s
Enter
Sleep 35s

# 3. The same transcript in other views.
Type "/translate view side"
Sleep 1s
Enter
Sleep 5s
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
