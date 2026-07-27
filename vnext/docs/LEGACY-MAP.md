# Legacy-to-vNext Map

هذا الملف يمنع نسخ الملفات القديمة كما هي. لكل جزء حالي نحدد الفكرة التي تستحق النقل والمالك الجديد.

| المصدر الحالي | المسؤولية الحالية | الوجهة في vNext | قرار النقل |
|---|---|---|---|
| `src/app-game-v085.js` | المشهد، الكاميرا، اللعب، الإدخال، الخامات، HUD، التعليم | `experience/`, `game/`, `core/` | تفكيك كامل؛ لا نسخ الملف |
| `src/app-game-v112.js` | تعليم أول حركة وسياسات العرض | `experience/tutorials`, `core/state` | نقل السلوك والعقود فقط |
| `src/app-game-v114.js` | كاميرا اللاعب وربط الأونلاين والقواعد | `experience/camera`, `network`, `game` | فصل المسؤوليات |
| `src/app-game-v121.js` | رحلة الدخول عبر runtime patch | `core/app-machine`, `experience/ui`, `experience/camera` | إعادة بناء؛ لا Blob أو replace |
| `src/app-game-v122.js` | القائمة الجدارية والانتقال | `experience/scene`, `experience/motion` | نقل الرحلة والـPoses |
| `src/app-game-v123.js` | إعداد الطاولة والقفل | `core/state`, `experience/ui` | نقل الحالات والحركة |
| `src/app-game-v124.js` | خدمات الأونلاين والتعليم والانتظار داخل المشهد | `network`, `experience/ui` | تقسيم حسب المسؤولية |
| `src/app-game-v125.js` | استمرارية الجدار الأبيض | `experience/scene`, `experience/motion` | الاحتفاظ بالمبدأ البصري |
| `src/app-game-v126.js` | Wrapper تعريفي | لا مقابل مباشر | يحذف في البنية الجديدة |
| `src/game-rules-v126.js` | القواعد المشتركة | `game/` | أفضل أساس للنقل المباشر بعد الاختبارات |
| `src/room-browser-v126.js` | قائمة/إنشاء/انضمام/HUD وState محلي | `network/rooms`, `core/state`, `experience/ui` | فصل UI عن Network State |
| `src/room-name-v126.js` | تطبيع اسم الغرفة | `network/rooms` أو `game/contracts` | نقل شبه مباشر |
| `src/online-client-v114.js` | العميل والمزامنة والاستعادة | `network/transport`, `network/sync`, `network/reconnect` | تفكيك مع الحفاظ على العقود |
| `src/online-rules-v118.js` | حالة الغرفة والجولات | `game/match`, `network/server-contracts` | توحيد مع Game Rules |
| `api/rooms-v126.js` | API والغرف وTurso وCAS | `network/server-contracts` + API منفصل | إعادة تنظيم دون تغيير الأمان |
| `styles/v126-rooms.css` | واجهة الغرف | `experience/ui` | نقل بعد تثبيت Design Tokens |
| `scripts/verify-v126-gameplay.mjs` | verifier | `vnext/tests/scenarios` | تحويله إلى سيناريوهات وحدات واضحة |

## Globals الحالية التي يجب استبدالها

- `__yakolakGame`
- `__yakolakV121Entry`
- `__yakolakV122RoomMenu`
- `__yakolakV123TabletopSetup`
- `__yakolakV124RoomServices`
- `__yakolakV125WhiteWall`
- `__yakolakOnlineV126`
- `__yakolakRoomBrowserV126`

البديل: Dependencies صريحة ينشئها App bootstrap ويمررها عبر Interfaces.

## DOM classes المستخدمة كحالة ويجب فصلها

- `yakolak-entry-open`
- `yakolak-entry-complete`
- `yakolak-room-sequence`
- `yakolak-wall-menu-active`
- `yakolak-tabletop-setup-active`
- `yakolak-room-service-active`
- `yakolak-room-howto-active`
- `yakolak-online-native-setup`
- `yakolak-online-waiting`
- `yakolak-room-browser-open`

في vNext تكون هذه ناتج Render للحالة، وليست هي الحالة نفسها.

## Timers/Polling يجب مراجعتها

- الانتظار المتكرر لتوفر Globals أثناء bootstrap.
- polling لملاحظة `setupStep`.
- polling لملاحظة ظهور Lobby DOM.
- تحديث قائمة الغرف دوريًا.

Polling الشبكة قد يبقى كTransport مقصود، لكن Polling الداخلي بين وحدات الصفحة يستبدل Events.