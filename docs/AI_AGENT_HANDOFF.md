# AI Agent Handoff — Yakolak

اقرأ هذا الملف قبل أي تعديل على المشروع.

## الحقيقة الحالية

```txt
Current approved live experience: ممتازة ومقبولة للتصفح النهائي
Live route: index.html -> app.js -> app-hejaz-v043.js
Live app file: app-hejaz-v043.js
```

أي وكيل ذكي أو مطور يجب أن يعتبر `app-hejaz-v043.js` هو مصدر الحقيقة الحالي للتشغيل.

## لا تغيّر هذا الآن

```txt
app-hejaz-v043.js
9.stl
3.stl
p.stl
l.stl
m.stl
s.stl
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
ملفات STL تبقى في الجذر لأنها محملة بمسارات نسبية من التطبيق
app.js يبقى مجرد boot file واضح وصغير
version.json لا يتم رفع build فيه إلا بعد التأكد من عدم رجوع refresh loop
```

## ممنوع الآن

```txt
لا تعيد معايرات المواقع
لا تضف سلايدر مسافات
لا تغيّر مسار تشغيل الصفحة
لا تنقل ملفات STL من الجذر
لا تعتمد README القديم كحقيقة إذا خالف live route
لا تعدل عشوائية الانترو إلا بطلب صريح
```

## ملفات مرجعية

```txt
docs/LIVE_STATE.md
docs/PROJECT_STRUCTURE.md
docs/CURRENT_GOLDEN_STATE.md
archive/golden-v036-p-gap-11.json
archive/golden-v036-p-gap-11.js
```

## طريقة آمنة لأي تطوير قادم

```txt
1. اعمل branch جديد
2. لا تلمس main مباشرة
3. لا تغيّر live app file إلا بعد نسخة بديلة منفصلة
4. اترك app.js يشير للنسخة المعتمدة فقط
5. بعد اختبار بصري من صاحب المشروع فقط، يتم تحويل app.js للنسخة الجديدة
```
