# Experience

تجمع هذه الوحدة كل ما يراه أو يلمسه اللاعب، دون أن تصبح مصدر حقيقة للقواعد.

## المجلدات المخططة

```text
experience/
├─ camera/
├─ motion/
├─ input/
├─ scene/
├─ ui/
├─ hud/
├─ tutorials/
├─ audio/
├─ accessibility/
└─ device-policy/
```

## المسؤوليات

- Camera Director وPoses.
- Motion scheduler وسياسة المقاطعة.
- Pointer/Touch/Mouse/Keyboard routing.
- عرض المشهد وDOM overlays.
- التلميحات والتعليم.
- الصوت والاهتزاز المسموح.
- Reduced Motion والوصول.
- سياسات الجودة والجوال.

## قاعدة مهمة

كل وحدة تستقبل `RenderSnapshot` أو `MotionRequest` وتصدر Events. لا تعدل Game State أو Network State مباشرة.

## أول Harness مطلوب لاحقًا

مشهد بسيط مستقل يحتوي جدارًا وطاولة وعناصر بديلة، لاختبار:

- جميع Camera Poses.
- Resize.
- Recenter.
- الانتقالات والمقاطعة.
- Reduced Motion.
- Pointer مقابل Camera control.