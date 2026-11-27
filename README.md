# 👑 신회장 비서실

신회장 전용 AI 비서실 웹앱 — 회의실 · 작업실 · 비서현황 · 메모.
순수 HTML/CSS/JS(빌드 없음)라서 어떤 정적 호스팅에도 그대로 올라갑니다.

**기본 백엔드는 Supabase 실시간 서버**입니다. 앱을 열면 서버에서 대화·작업·메모를 불러오고,
3초마다 새 글을 확인하며, 화면으로 돌아오면 바로 동기화합니다.

## 구성

| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면 구조 (헤더·5탭·오피스 맵·회의실·설정 시트) |
| `styles.css` | 크림/골드/브라운 테마, 모바일 우선(max-width 480px) |
| `app.js` | 상태·렌더링·서버 동기화(Supabase/셋톡/커스텀)·로컬 저장 |
| `assets/office-map.webp` | 3D 아이소메트릭 오피스 이미지 (jpg 폴백 함께 둠) |
| `tests/smoke.mjs` | Supabase REST 읽기·쓰기 스모크 테스트 (`node tests/smoke.mjs`) |

## 기능

- **오피스 맵** (기본 탭) — 3D 아이소메트릭 미니어처 오피스 위에 방 핀과 비서 캐릭터 핀
  - 방 핀: 🎯 지휘실 / 🏛️ 대회의실 / ☕ 라운지 / 📌 작업실 — 누르면 최근 대화·작업 요약 시트
  - 캐릭터 핀: 김비서·김대리·제대리·클대리 — 누르면 해당 비서의 **최근 보고**(서버 `messages`),
    진행 작업(`tasks`), 활동 상태를 카드로 보여 주고 `대화 이어가기`·`지시하기`로 바로 이동
  - `✨ 움직임 ON/OFF` 칩으로 핀·캐릭터의 부유 애니메이션을 켜고 끕니다(설정은 기기에 저장)
- **회의실** — 대회의실 / 지휘실 / 라운지 3개 방, 방별 대화 분리 저장
  - 신회장 말풍선은 우측 살구색, 비서는 좌측 크림색(아이콘·직책·시간 표시)
  - 발신자 전환 칩 6명, 멘션 칩 `@all` `@김비서` `@제대리` `@김대리` `@클대리` `@챗대리`
  - 보낸 메시지는 즉시 화면에 뜨고(`전송 중…`) 서버에 저장되면 확정됩니다. 실패하면 `전송 실패`로 남습니다.
  - **🎤 음성 입력** — 입력창 옆 마이크 버튼. 누르면 빨간 펄스와 `듣고 있어요…` 안내가 뜨고, 말한 내용이 입력창에 실시간으로 받아써집니다(ko-KR, Web Speech API). 다시 누르거나 말이 끝나면 입력창에 남아 **확인 후 전송**이 기본이고, 안내줄의 `자동 전송`을 켜면 말이 끝나는 대로 보냅니다. 지원하지 않는 브라우저에서는 안내 토스트가 뜹니다.
  - **🔊 음성 안내** — 회의실 상단 토글(기본 OFF). 켜면 새 비서 답변이 도착할 때 한국어 음성으로 읽어 줍니다(`speechSynthesis`). 끄면 읽던 소리도 바로 멈춥니다.
- **작업실** — 작업 카드 추가/상태 전환(대기→진행중→완료)/삭제, 상태별 필터·카운트 (서버 동기화)
- **비서현황** — 6명 카드(역할·상태·최근 활동), `지시` 버튼으로 해당 비서 멘션 자동 삽입
- **메모** — 분류(원칙/종목/수익화/기타) 카드 저장·수정·삭제 (서버 동기화)
- 새로고침해도 유지되도록 마지막 화면 상태는 `localStorage`에 캐시합니다.

## 실시간 서버 (기본)

- 프로젝트: `https://qrkgbextxzgodywukesd.supabase.co` · 브라우저 공개용(publishable) 키 사용
- 테이블
  - `messages(id bigint identity PK, room text, sender text, body text, created_at timestamptz)`
  - `tasks(id text PK, title text, owner text, status text, created_at timestamptz)`
  - `memos(id text PK, category text, title text, body text, created_at timestamptz)`
- 동작
  - 앱을 열면 `messages`(최근 300)·`tasks`·`memos`를 받아 렌더링
  - 3초마다 `messages?id=gt.{lastId}` 증분 조회, 작업·메모는 3회에 1회 갱신
  - 페이지 포커스·탭 복귀·네트워크 복구 시 즉시 동기화
  - 정상이면 상단 `● 실시간 연결`, 네트워크/권한 오류일 때만 `연결 끊김`
  - 처음 열었을 때 `messages`가 비어 있으면 안내 메시지 1건만 넣습니다(이미 있으면 넣지 않음)
- **데모 자동응답 없음**: 서버 모드에서는 `@all` 같은 가짜 시뮬레이션 답장을 돌리지 않습니다.
  답장은 실제 백그라운드 비서(김비서·제대리·클대리 등)가 이 DB를 읽고 `messages`에 올린 글로만 표시됩니다.

### 설정 (우측 상단 ⋯)

- **🟢 실시간 서버** — Project URL / Publishable Key 확인·변경, `연결 테스트`로 세 테이블 건수 확인
- **💾 로컬 저장** — 서버 없이 이 기기에서만. 비서들이 읽을 수 없습니다.
- **🔑 셋톡 API** — `https://chat.gonipro.app`
  - 읽기: `GET /api/msgs?k=<열쇠>&since=<마지막 id>` → `{ msgs:[{id, who, owner, text, ts}], brain, check_every_min }`
  - 쓰기: `POST /api/send`, 헤더 `x-key: <열쇠>`, 본문 `{ "text": "..." }`
- **🔗 직접 URL** — 프록시/자체 백엔드
  - `GET {URL}/messages?since=<id>` → `{ messages:[{id, who, text, ts, owner}] }`
  - `POST {URL}/messages` ← `{ who, text }`

## 배포 (GitHub Pages)

```bash
./deploy.sh
```

배포 주소: `https://eunibbb-cyber.github.io/secretary_room/`

> `styles.css`·`app.js`를 고치면 `index.html`의 `?v=` 숫자도 함께 올립니다.
> GitHub Pages가 파일을 10분간 캐시해서, 그대로 두면 새 HTML + 예전 CSS가 섞여 화면이 깨질 수 있습니다.

## 검증

```bash
node --check app.js        # 문법
node tests/smoke.mjs       # Supabase 읽기·쓰기 (자기가 만든 행만 지움)
```

## 휴대폰에서 쓰기

1. 위 주소를 크롬/사파리로 연다
2. 메뉴 → **홈 화면에 추가**
3. 앱처럼 전체화면으로 열립니다 (상단 상태바·하단 홈바 안전영역 반영)

> 🎤 음성 입력은 마이크 권한이 필요합니다(HTTPS). 처음 누를 때 나오는 권한 창에서 **허용**을 선택하세요.
> 🔇 음성 안내가 들리지 않으면 휴대폰 무음 모드와 미디어 볼륨을 확인하세요.
