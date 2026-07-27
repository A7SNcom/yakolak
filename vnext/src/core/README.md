# Core

هذه الوحدة هي قلب التطبيق وليست مكانًا للرسم أو القواعد.

## المجلدات المخططة

```text
core/
├─ app-machine/
├─ actions/
├─ effects/
├─ state/
├─ persistence/
├─ preferences/
└─ diagnostics/
```

## المسؤوليات

- إنشاء الحالة الأولى.
- استقبال Actions.
- تطبيق Guards والانتقالات.
- إصدار Effects.
- حفظ Snapshot آمن واستعادته.
- إدارة Overlays دون تغيير Match State.
- تسجيل الأحداث التشخيصية الضرورية فقط.

## لا يوضع هنا

- Three.js objects.
- قواعد الفوز.
- Fetch أو Turso مباشرة.
- DOM rendering.
- مواضع الكاميرا.
- Timers موزعة داخل Features.

## أول ملفات التنفيذ لاحقًا

- `create-initial-state.js`
- `app-machine.js`
- `actions.js`
- `effects.js`
- `guards.js`
- `snapshot.js`

هذه الملفات غير منشأة الآن عمدًا؛ المرحلة الحالية تثبت الحدود فقط.