# Motion Catalog

هذا الملف يسمي كل حركة قبل تنفيذها. القيم الزمنية هنا نطاقات أولية وليست اعتمادًا بصريًا نهائيًا.

## قواعد الحركة

- كل حركة لها `id`, `from`, `to`, `duration`, `easing`, `interruptPolicy`, ونسخة Reduced Motion.
- لا توجد حركة مجهولة داخل Feature file.
- الكاميرا تتحرك عبر Camera Director فقط.
- حركة القطع لا تعدل Game State؛ تعرض نتيجة الحالة فقط.
- يجب أن تكون نهاية كل حركة حتمية حتى لو تغير الحجم أو فقد التبويب التركيز.

## حركات الكاميرا

| ID | الاستخدام | المدة الأولية | المقاطعة |
|---|---|---:|---|
| `camera.overview-to-wall` | بداية الرحلة واكتشاف الجدار | 900–1450ms | replace-before-commit |
| `camera.wall-to-overview` | اختيار مسار والعودة للطاولة | 700–1250ms | replace-before-commit |
| `camera.overview-to-player` | تثبيت زاوية اللاعب بعد الإعداد | 450–800ms | replace |
| `camera.player-to-player` | تغير منظور/مقعد عند الاستعادة | 350–650ms | replace |
| `camera.overview-to-side-service` | فتح خدمة جانبية | 700–980ms | replace |
| `camera.side-service-to-overview` | إغلاق الخدمة | 550–850ms | replace |
| `camera.recenter` | إعادة زاوية اللاعب | 300–500ms | replace |
| `camera.win-focus` | إبراز خط الفوز دون فقد السياق | 400–650ms | locked-until-highlight |
| `camera.resize-reframe` | إعادة حساب Pose الحالية | 0–180ms | replace |

## Poses المرجعية

كل Pose يعرّف:

```text
position
target
fov
minDistance
maxDistance
polarLimits
panPolicy
userControlPolicy
```

الـPoses المطلوبة:

- `wall`
- `overview.desktop`
- `overview.mobilePortrait`
- `overview.compactLandscape`
- `setup.fit`
- `player.right`
- `player.back`
- `player.left`
- `player.front`
- `sideService`
- `winFocus`

## حركات الواجهة داخل المشهد

| ID | الوصف |
|---|---|
| `entry.menu-fade-in` | ظهور القائمة فوق الجدار |
| `entry.choice-hover` | استجابة خفيفة بلا وهج مبالغ |
| `entry.choice-commit` | تثبيت الاختيار قبل الانتقال |
| `entry.menu-fade-out` | اختفاء الجدار عند التحول |
| `setup.panel-enter` | ظهور تعليمات الإعداد فوق الطاولة |
| `setup.lock-idle` | حركة هادئة للقفل |
| `setup.step-change` | تبديل النص دون قطع بصري |
| `setup.complete` | فتح الطاولة وإزالة القفل |
| `overlay.open` | فتح نافذة DOM أو سطح داخل المشهد |
| `overlay.close` | إغلاقها وإعادة التركيز |
| `network.reconnecting` | مؤشر هادئ لا يغطي اللعب |

## حركات درج القطع والاختيار

- `tray.open`
- `tray.close`
- `tray.size-hover`
- `tray.size-select`
- `piece.ready-lift`
- `piece.pick`
- `piece.drag-follow`
- `piece.legal-hover`
- `piece.illegal-hover`
- `piece.snap-to-zone`
- `piece.return-to-home`
- `piece.remote-place`
- `piece.bot-place`

## حركات الدور

- `turn.active-glow-enter`
- `turn.active-glow-idle`
- `turn.active-glow-exit`
- `turn.timer-warning`
- `turn.expired`
- `turn.transition`
- `last-move.enter`
- `last-move.settle`
- `last-move.clear`

## حركات النتيجة

- `win.cells-focus`
- `win.pieces-blink`
- `win.camera-focus`
- `win.summary-enter`
- `draw.summary-enter`
- `score.update`
- `rematch.ready-mark`
- `next-round.reset-board`
- `match-complete.enter`

## الحركة غير الصحيحة

يجب ألا تعتمد على اهتزاز قوي أو عقوبة مزعجة.

- `invalid.zone-pulse`
- `invalid.piece-return`
- `invalid.message-enter`

المدة المستهدفة 160–320ms، مع شرح السبب إن كان غير واضح: خانة مشغولة، نفاد الحجم، ليس دورك، أو انتظار الخادم.

## Reduced Motion

- الانتقالات المكانية الطويلة تصبح Cut أو Crossfade من 0–120ms.
- لا دوران مستمر للقفل.
- لا Blink متكرر؛ يستخدم Highlight ثابت قصير.
- وضع القطعة يحتفظ بالـSnap الضروري لفهم النتيجة، لكن دون Arc أو Overshoot.
- لا اهتزاز شاشة أو كاميرا.

## سياسة Easing

- الكاميرا: `easeInOutCubic` افتراضيًا.
- Snap القطعة: `easeOutCubic` بدون bounce افتراضيًا.
- الواجهات: opacity + scale محدود جدًا.
- الفوز: pulse متزن لا يغير اللون الأصلي للقطعة.

## معايير القبول

أي Motion جديد يجب أن يثبت:

1. بداية ونهاية معلومتان.
2. عدم ترك Controls مقفلة بالخطأ.
3. سلامة المقاطعة.
4. تطابق الجوال والكمبيوتر وظيفيًا.
5. Reduced Motion.
6. عدم تغيير قواعد اللعب أو زمن استجابة الشبكة.
7. اختبار حتمي أو لقطة مقارنة عند الحاجة.