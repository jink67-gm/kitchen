# 사용한 재료와 라이선스

## 게임에 들어간 것

| 재료 | 저작자 | 라이선스 | 어디에 썼나 | 파일 위치 |
|---|---|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) r187 | three.js authors | MIT | 3D 화면 | `vendor/three/` |
| [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 | 칼질, 접시 놓기, 버리기, 서빙 벨 | `assets/sounds/impact*.ogg` |
| [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 | 집기, 반환, 보관, 정답, 오류 | `assets/sounds/drop_*, error_*, confirmation_*` 등 |
| [Music Jingles](https://kenney.nl/assets/music-jingles) | Kenney | CC0 | 콤보, 러시 시작, 판 종료, 인트로의 초대장·MISSION START | `assets/sounds/jingles_*.ogg` |
| [Fluent Emoji Flat](https://github.com/microsoft/fluentui-emoji) | Microsoft | MIT | 주문 카드·주문 현황의 음식 그림, 3D 완성 요리 그림 | `assets/icons/` |
| [갈무리 Galmuri11](https://galmuri.quiple.dev) | Lee Minseo (quiple) | SIL OFL 1.1 | 주문 카드·타이머·알림·3D 글자 | `assets/fonts/` (라이선스 전문 `Galmuri-OFL.md`) |
| [Food Kit](https://kenney.nl/assets/food-kit) | Kenney | CC0 | 3D 재료 9종 중 8종과 완성 요리 6종 모델 | `assets/models/` (라이선스 `Kenney-FoodKit-License.txt`) |
| [Sushi Restaurant Kit](https://quaternius.com/packs/sushirestaurantkit.html) | Quaternius | CC0 | 토끼·판다 요리사 5종과 동작(대기, 걷기, 달리기, 들고 걷기, 칼질, 작업, 환호, 아니요, 손 흔들기, 놀람, 점프), 인트로의 천재 셰프(회색 토끼, Rabbit_Grey), 빨간 오븐 | `assets/models/chefs/`, `assets/models/furniture/sushi-oven.glb` (원본 .gltf를 .glb로 바꾸고 쓰지 않는 동작을 뺌) |
| [Furniture Kit](https://kenney.nl/assets/furniture-kit) | Kenney | CC0 | 조리대 수납장, 싱크대, 믹서기, 쓰레기통, 뒷벽 패널과 창문 / 주방 바깥 식당 홀의 식탁·의자·화분·러그·조명·책장·소파 (색은 게임에 맞게 바꿈) | `assets/models/furniture/`, `assets/models/decor/` |
| [Mini Characters](https://kenney.nl/assets/mini-characters) | Kenney | CC0 | 서빙 창구 앞에 줄 서는 손님 6종과 동작 | `assets/models/guests/` |
| three.js GLTFLoader 등 부속 | three.js authors | MIT | 모델 파일 읽기 | `vendor/three/jsm/` |
| 그 밖의 3D 모형 (타일 바닥, 옆벽, 메뉴판, 조리대 윗면, 재료 상자, 도마, 팬, 접시, 반죽, 그릇) | 이 프로젝트에서 코드로 직접 만듦 | 프로젝트 자체 | 3D 화면 | `render3d.js` |
| 합성 효과음 (젓기, 설거지, 지글지글, 익음·경고·탐, 인트로의 휙·쿵·덜컹·뭐어어어 등) | 이 프로젝트에서 직접 만듦 | 프로젝트 자체 | 녹음 파일이 없는 소리 | `sfx.js` |
| 인트로 배경음악 4곡 (경쾌·긴박·긴장·씩씩) | 이 프로젝트에서 직접 작곡, 브라우저에서 합성 | 프로젝트 자체 | 인트로 컷신 | `sfx.js`의 `SONGS` |

CC0는 출처 표시 없이도 쓸 수 있는 라이선스이지만 여기 기록해 둡니다. MIT와 OFL은 라이선스 문구를 함께 배포해야 하며, 각 폴더에 들어 있습니다.

## 받았지만 아직 쓰지 않은 것 (모두 Kenney, CC0)
UI Pack, Board Game Icons, Animal Pack Remastered — 지금 화면 구성에 맞는 자리가 없어 보류

## 쓰지 않은 것과 이유
- Kenney Mini Characters (CC0): 적용해 봤으나 Sushi Restaurant Kit의 동물 요리사가 요리 동작을 갖추고 있어 교체함
- Quaternius Ultimate Food Pack (CC0): 받아서 Kenney Food Kit과 같은 조명에서 비교함(`screenshots/8/compare_quaternius_vs_kenney.png`). 색이 어두워 파스텔 주방과 덜 어울리고 딸기·밀가루·우유·샐러드 모델이 없어 Kenney를 선택
- Poly Haven HDRI, ambientCG Ground 037 (CC0): 실내 주방 장면에 야외 하늘·흙바닥이 어울리지 않고, 파일이 커서 저사양 PC에 부담
- Kenney Platformer Kit, Pixel Platformer: 발판 게임용 그림이라 요리 게임에 맞지 않음
- Neo둥근모: 픽셀 글꼴은 갈무리 하나로 충분
- react-three-fiber, drei, gltfjsx, template-vite-ts, Supabase·Liveblocks 스타터: React·빌드 도구가 필요한데 이 게임은 빌드 없이 파일만 올리는 구조
- Phaser, KAPLAY, Tiled: 2D 게임 엔진·지도 편집기. 이미 Three.js로 만들어져 있음
- Rapier: 물리 엔진. 격자 충돌만으로 충분
- Socket.io: 별도 서버가 필요. 이미 Firebase를 사용
- Tripo API, Google AI, 표준국어대사전 API: API 키가 필요하고 지금 게임에 쓸 곳이 없음
- Blender: 직접 모델을 만들 일이 생기면 사용
| QR 코드 만들기 (`qr.js`) | 같은 선생님의 게임 SCHOOL(jink67-gm/SCHOOL)에서 가져옴 | 프로젝트 자체 | 대기실의 게임 주소 QR | `qr.js` |
