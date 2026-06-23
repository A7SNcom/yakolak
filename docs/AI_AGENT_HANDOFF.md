# AI Agent Handoff — Yakolak

اقرأ هذا الملف قبل أي تعديل على المشروع.

## الحقيقة الحالية

```txt
Current approved live experience: ممتازة ومقبولة للتصفح النهائي
Live route: index.html -> app.js -> src/app-live.js
Live app file: src/app-live.js
```

أي وكيل ذكي أو مطور يجب أن يعتبر `src/app-live.js` هو مصدر الحقيقة الحالي للتشغيل.

## لا تغيّر هذا بصريًا الآن

```txt
src/app-live.js
src/assets/models/9.stl
src/assets/models/3.stl
src/assets/models/p.stl
src/assets/models/l.stl
src/assets/models/m.stl
src/assets/models/s.stl
```

لا تغيّر هذه الملفات إلا بطلب صريح أو اعتماد بصري جديد من صاحب المشروع.

## القيم الذهبية الحالية

```txt
stoneDistance = 48
threeRadius   = 135
pRadius       = 85
pPieceGap     = 11
```

## ما يجب الحفاظ عليه

```txt
الصفحة تعمل من GitHub Pages كما هي
الانترو الحالي يبقى كما هو
تصفح المستخدم النهائي يبقى كما هو
app.js يبقى boot file واضح وصغير
الكود الحي يبقى داخل src/
ملفات STL الحية تبقى داخل src/assets/models/
version.json لا يتم رفع build فيه إلا بعد التأكد من عدم رجوع refresh loop
```

## ممنوع الآن

```txt
لا تعيد معايرات المواقع
لا تضف سلايدر مسافات
لا تغيّر مسار تشغيل الصفحة إلا لتبديل نسخة معتمدة
لا تعتمد README قديم كحقيقة إذا خالف live route
لا تعدل عشوائية الانترو إلا بطلب صريح
لا ترجع ملفات التطبيق القديمة إلى الجذر
```

## ملفات مرجعية

```txt
docs/LIVE_STATE.md
docs/PROJECT_STRUCTURE.md
docs/CURRENT_GOLDEN_STATE.md
archive/golden-v036-p-gap-11.json
archive/golden-v036-p-gap-11.js
legacy/apps/
```

## طريقة آمنة لأي تطوير قادم

```txt
1. اعمل branch جديد
2. لا تلمس main مباشرة إلا بعد اعتماد واضح
3. أنشئ نسخة جديدة داخل src/ مثل src/app-next.js
4. اختبر بصريًا
5. بعد الاعتماد فقط، غيّر app.js ليشير للنسخة الجديدة
6. انقل القديم إلى legacy/ عند انتهاء الحاجة منه
```
