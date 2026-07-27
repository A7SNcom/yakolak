# vNext Tests

لا يربط أي Slice بالنسخة الحالية قبل وجود اختبارات مناسبة له.

## المجلدات المخططة

```text
tests/
├─ contracts/
├─ state-machine/
├─ game-rules/
├─ camera/
├─ motion/
├─ input/
├─ network/
├─ scenarios/
├─ visual/
└─ performance/
```

## طبقات الاختبار

### 1. Contracts

يتحقق من أشكال Actions وState وCommands وEvents.

### 2. State Machine

ينفذ الانتقالات، Guards، الفشل، المقاطعة، والاستعادة دون متصفح.

### 3. Game Rules

يغطي الحركات القانونية، المخزون، طرق الفوز الثلاث، التعادل، الأدوار، الجولات، والمباراة.

### 4. Camera and Motion

يتحقق من Pose النهائي، FOV، الحدود، Resize، Recenter، Reduced Motion، وعدم بقاء Controls معطلة.

### 5. Input

Tap/Drag threshold، touch/mouse/keyboard، منع الإدخال المكرر، وتعطيل اللعب تحت Overlay أو انقطاع الشبكة.

### 6. Network

إنشاء وانضمام 2/3/4 لاعبين، تعارض اللون، الغرفة الممتلئة، CAS، reconnect، leave، rematch، و3/5 جولات.

### 7. Scenarios

سيناريوهات حتمية كاملة:

- تشغيل → جدار → كمبيوتر → إعداد → أول حركة.
- تشغيل → غرف → إنشاء → انتظار → اكتمال → دور.
- رابط دعوة → اختيار لون → دخول.
- فقد اتصال أثناء الدور → استعادة بلا تكرار حركة.
- فوز جولة → استعداد الجميع → الجولة التالية.
- نهاية مباراة → مباراة جديدة.

### 8. Visual and Performance

- Desktop وMobile portrait وcompact landscape.
- وضوح الألوان الأربعة.
- الحواف والخامات.
- مواضع الكاميرا.
- عدم زيادة Draw Calls أو triangles دون قرار موثق.
- عدم وجود Console/Page/Runtime errors.

## Definition of Done

كل حالة أو حركة جديدة تحتاج:

- اختبار انتقال أو Contract.
- اختبار فشل أو مقاطعة عند وجودها.
- Reduced Motion عند الحركة.
- Mobile viewport عند التأثير البصري.
- دليل أن النسخة القديمة لم تتغير أثناء المرحلة التحضيرية.