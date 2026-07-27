# vNext Architecture

## الهدف

إنشاء بنية يمكن فهمها من اسم الملف ومساره، وتمنع تكرار منطق الحالة والكاميرا والقواعد بين المحلي والأونلاين.

## تدفق النظام

```text
Pointer / Touch / Keyboard / Network
                │
                ▼
             Actions
                │
                ▼
        State Machine + Guards
                │
       ┌────────┼─────────┐
       ▼        ▼         ▼
    Game      Camera    Experience
    Rules     Director   Effects
       │        │         │
       └────────┼─────────┘
                ▼
        Renderer / DOM / Audio
```

## حدود الوحدات

### `src/core/`

يمتلك دورة التطبيق، الحالة العليا، الأحداث، الحفظ والاستعادة، وتنسيق الوحدات. لا يحتوي قواعد فوز أو تفاصيل Three.js.

### `src/experience/`

يمتلك الكاميرا، الانتقالات، الإدخال، التلميحات، الواجهات، الصوت، الوصول، وسياسات الجوال. لا يقرر صحة الحركة أو الفائز.

### `src/game/`

يمتلك اللوحة، القطع، المخزون، الحركة القانونية، ترتيب الدور، الفوز، التعادل، الجولات، والذكاء الاصطناعي. يجب أن تكون أغلب ملفاته Pure Functions قابلة للاختبار دون متصفح.

### `src/network/`

يمتلك الغرف، الهوية، الاستعادة، المزامنة، polling أو transport، حل التعارض، وتحويل رسائل الخادم إلى Actions. لا يحرك الكاميرا ولا يرسم الواجهة.

### `tests/`

يمتلك العقود، انتقالات الحالة، القواعد، حركات الكاميرا، الإدخال، الشبكة، وإعادة تشغيل السيناريوهات الحتمية.

## الملكية الوحيدة

| المسؤولية | المالك الوحيد |
|---|---|
| الحالة العليا | App State Machine |
| صحة الحركة والفوز | Game Rules |
| موضع واتجاه الكاميرا | Camera Director |
| Pointer/Touch/Keyboard | Input Router |
| حركة القطعة المرئية | Motion/Animation System |
| الغرفة والمزامنة | Network Session |
| Three.js objects | Scene Renderer |
| DOM overlays | UI Renderer |
| Reduced Motion | Motion Policy |

## شكل الحالة المقترح

```js
{
  app: { phase, build, ready, error },
  route: { mode, screen, overlay },
  session: { kind, roomId, connection, identity },
  setup: { step, color, playerCount, rounds },
  match: { status, round, targetRounds, scores },
  turn: { index, color, phase, deadline },
  selection: { tray, size, pieceId, zoneId, validity },
  board: { slots, lastMove, winner },
  camera: { pose, transition, userControl },
  preferences: { reducedMotion, quality, language }
}
```

## قواعد الاعتماد

- `core` يستطيع استدعاء بقية الوحدات عبر Interfaces.
- `experience` يقرأ Snapshot ولا يعدل القواعد مباشرة.
- `game` لا يستورد من `experience` أو `network`.
- `network` يستورد العقود والقواعد المشتركة فقط.
- `renderer` لا يقرر الانتقال؛ يعرض State وEffects.

## ممنوعات معمارية

- تعديل ملفات runtime كنصوص ثم تشغيلها من Blob.
- استخدام `globalThis` كوسيلة ربط أساسية.
- تكرار قواعد المحلي داخل API الأونلاين.
- أكثر من وظيفة تحرك الكاميرا مباشرة.
- DOM classes كمصدر حقيقة لحالة اللعبة.
- `setInterval` لاكتشاف الحالة التي يمكن إصدار Event عند تغيرها.
- Feature file يتولى القواعد والرسم والشبكة معًا.

## العقود الأولى المطلوب تثبيتها

1. `Action`
2. `AppState`
3. `GameCommand`
4. `GameResult`
5. `CameraPose`
6. `MotionRequest`
7. `NetworkEvent`
8. `RenderSnapshot`

لا تُكتب Implementations كاملة قبل اعتماد هذه العقود.