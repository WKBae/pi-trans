# cc-trans

[English](README.md) · **한국어** · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

**Claude Code와 내 언어로 이야기하세요. Claude는 그대로 영어로 일합니다.**

한국어, 일본어, 중국어, 스페인어…로 입력하면 Claude에게는 깔끔한 영어가 전달됩니다. Claude는 영어로
답하고, 문단마다 바로 아래에 차분한 번역이 붙습니다. 코드는 손대지 않습니다.

![한국어 프롬프트가 영어로 Claude에게 전달되고, Claude가 파일을 고친 뒤 영어 답변 문단마다 흐린 한국어 번역이 붙는 모습. 이어서 같은 대화를 나란히 보기와 번역만 보기로 전환](demo/cc-trans.gif)

```
/plugin install cc-trans --marketplace midagedev/cc-trans
```

## 왜 쓰나요

- **생각은 내 언어로, 세션은 영어로.** Claude는 언제나 영어만 읽습니다. 그래서 답변도, 레포에 남기는
  것(주석, 커밋 메시지, 문서)도 나머지 코드처럼 영어로 나옵니다.
- **원문을 읽고, 번역은 곁눈질로.** 영어가 본문으로 남아 정확한 표현과 기술 용어를 그대로 볼 수 있고,
  번역은 그 아래 흐린 색으로 붙어 필요할 때만 보면 됩니다.
- **기다림이 없습니다.** Enter를 누르기 전에 프롬프트의 영어가 이미 준비돼 있고, 답변은 백그라운드에서
  번역되어 Claude를 붙잡지 않습니다.

## 무엇을 해주나요

**입력하는 동안 영어 미리보기.** 프롬프트 위 띠에 Claude가 읽을 영어가 보입니다(`EN ▸ …`). Enter를
누르면 그 영어가 그대로 전송되고, 추가 왕복은 없습니다. 대화 기록에는 내가 입력한 문장이 남고, 그 아래에
영어가 붙습니다:

```
> users.js의 loadUsers가 왜 느린지 한 문장으로 말하고 바로 고쳐줘
  ↳ In one sentence, tell me why users.js's loadUsers is slow, then fix it right away
```

**코드를 아는 번역.** 코드 블록, `인라인 코드`, 경로, URL, 플래그, `snake_case`, `camelCase`,
`dotted.members`는 번역기로 보내지 않습니다. 자리표시자로 바꿔 보냈다가 바이트 하나 다르지 않게 되돌려
놓습니다. 제목, 목록, 인용, 표도 줄 단위로 모양을 유지합니다.

**답변 보기 방식 선택.** `/translate view <mode>`로 대화 기록 전체를 다시 그립니다:

| 보기 | 보이는 모습 |
| --- | --- |
| `stacked` | Claude가 쓴 문단 그대로, 바로 아래에 들여쓰고 흐리게 처리한 번역 |
| `side` | 왼쪽 영어, 오른쪽 번역, 블록 단위로 나란히 |
| `translated` | 번역만, 코드는 제자리에 |
| `interleave` | 문단마다 그 번역을 인용으로 |
| `below` | 영어 답변 전체 뒤에 번역 전체 |
| `original` | 영어만 |
| `auto` (기본) | 터미널이 140칸 이상이면 `side`, 아니면 `stacked` |

**어떤 언어든, 어떤 번역기든.** 기본으로는 지금 쓰는 Claude Code 세션을 통해 Claude Haiku가 번역합니다.
따로 설정할 것이 없습니다. 다른 번역기를 쓰고 싶다면 OpenAI 호환 서버(Ollama, LM Studio, DeepSeek,
OpenRouter)나 직접 만든 프로그램(Apple Translation, DeepL, Papago)에 연결하면 됩니다.

## 사용법

| 명령 | |
| --- | --- |
| `/translate` | 번역 켜기/끄기 |
| `/translate view <mode>` | 답변 보기 방식 바꾸기 |
| `/translate status` | 언어, 엔진, 보기 방식, 대기열 |

프롬프트 아래 힌트에 지금 돌아가는 것이 보입니다. 예: `ko↔en · haiku · 2 queued`.

## 내 언어 설정

cc-trans는 다음 순서로 언어를 정합니다: 자신의 `language` 옵션, Claude Code의 `language` 설정, 시스템
로케일(`LANG`). 코드(`ko`, `ja`, `zh`, `es`)도 이름(`Korean`, `日本語`)도 됩니다. 아무것도 설정돼 있지
않거나 영어라면 아무 일도 하지 않습니다.

> **팁:** Claude Code 자체의 `language` 설정은 Claude에게 그 언어로 *답하라*고도 요청하기 때문에, 번역할
> 것이 남지 않습니다. 영어 답변과 번역을 함께 보려면 그 설정은 비워 두고 cc-trans의 `language` 옵션을
> 설정하세요.

## 번역 엔진

| 엔진 | 설정 | 비고 |
| --- | --- | --- |
| `haiku` (기본) | 없음 | Claude Code 세션의 모델 접근을 그대로 사용 |
| `openai` | `openaiBaseUrl`, `openaiModel`, 선택 `openaiApiKey` | OpenAI 호환 서버 아무거나: Ollama, LM Studio, DeepSeek, OpenRouter… |
| `command` | `command` | 직접 만든 프로그램: stdin으로 `{"from","to","lines":[…]}`, stdout으로 `{"lines":[…]}` |

`openai`나 `command`가 실패하면 `haiku`가 대신 번역합니다(`fallback`을 끄지 않았다면).

## 옵션

설치할 때 정하거나, settings의 `pluginConfigs["cc-trans"].options`에 적습니다.

| 옵션 | 기본값 | |
| --- | --- | --- |
| `language` | 비어 있음 | 내 언어. 비워 두면 Claude Code의 `language` 설정, 그다음 시스템 로케일을 따름 |
| `engine` | `haiku` | `haiku` · `openai` · `command` |
| `view` | `auto` | 위의 보기 방식 참고 |
| `preview` | `true` | 입력 중 영어 미리보기 |
| `haikuModel` | `haiku` | haiku 엔진이 쓰는 모델 |
| `openaiBaseUrl` · `openaiModel` · `openaiApiKey` | | openai 엔진용 |
| `command` | | command 엔진용 |
| `fallback` | `true` | 실패하면 haiku로 대신 번역 |

## 자주 묻는 질문

**내 코드가 번역기로 가나요?** 아니요. 보내는 건 글뿐입니다. 코드 블록은 건너뛰고, 인라인 코드, 경로,
URL, 식별자는 밖으로 나가기 전에 자리표시자로 바꿉니다.

**비용은 얼마나 드나요?** 기본 엔진에서는 번역이 내 Claude 계정의 Haiku 호출입니다. 짧은 글만 보내고, 각
줄은 세션 동안 캐시되므로 같은 줄을 두 번 번역하지 않습니다. `openai`(예: 로컬 Ollama)나 `command`를
쓰면 그 엔진의 비용만 듭니다.

**번역이 실패하면요?** 프롬프트는 입력한 그대로 전송되고 토스트로 이유를 알려 줍니다. 답변 블록은 영어로
남고 번역이 실패했다고 표시됩니다. 무엇도 막히지 않습니다.

## 개발

```
claude --plugin-dir .          # 불러오기
claude plugin validate .
claude plugin test .
vhs demo/demo.tape && demo/render.sh   # 데모 다시 녹화 (vhs, ffmpeg, gifsicle 필요)
```

단위 모델과 표시 규칙은 [DESIGN.md](DESIGN.md)(영어)에 있습니다.

## 라이선스

MIT
