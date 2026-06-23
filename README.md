# Yakolak

نسخة تشغيل 3D للعبة Yakolak على GitHub Pages.

## الحالة الحالية المعتمدة

```txt
Live state: approved current user browsing experience
Live route: index.html -> app.js -> app-hejaz-v043.js
Live app file: app-hejaz-v043.js
```

هذه هي النسخة الممتازة الحالية للتصفح النهائي للمستخدم. أي تنظيف أو ترتيب للمشروع يجب أن يحافظ على نفس التجربة البصرية والسلوكية.

## قاعدة ذهبية

```txt
لا تغيّر app-hejaz-v043.js إلا بطلب صريح أو اعتماد بصري جديد.
```

## ملفات التشغيل الأساسية

```txt
index.html          صفحة GitHub Pages الرئيسية
app.js              ملف إقلاع صغير يوجّه إلى النسخة الحية
app-hejaz-v043.js   النسخة الحية الحالية المعتمدة
version.json        ملف فحص نسخة، رقم build مثبت مؤقتًا لتجنب لوب التحديث
```

## ملفات المجسمات الأساسية

```txt
9.stl   البورد المركزي
3.stl   القواعد الخارجية
p.stl   علامات/قطع p
l.stl   الحجر الكبير
m.stl   الحجر الوسط
s.stl   الحجر الصغير
```

## القيم الهندسية الذهبية الحالية

```txt
stoneDistance = 48
threeRadius   = 135
pRadius       = 85
pPieceGap     = 11
```

هذه القيم محفوظة داخل النسخة الحية الحالية وداخل ملفات التوثيق الذهبية.

## ملفات التوثيق المهمة

```txt
docs/LIVE_STATE.md
docs/PROJECT_STRUCTURE.md
docs/CURRENT_GOLDEN_STATE.md
docs/AI_AGENT_HANDOFF.md
docs/COLOR_MODE_V037.md
archive/golden-v036-p-gap-11.json
archive/golden-v036-p-gap-11.js
```

## ملفات قديمة / مرجعية

بعض الملفات القديمة موجودة كمرجع تاريخي، وليست هي مسار التشغيل الحالي. لا تحذفها أو تنقلها إلا بعد مراجعة روابط GitHub Pages والتأكد أنها غير مستخدمة.

## ممنوع بدون اعتماد بصري

```txt
تغيير app-hejaz-v043.js
تغيير أماكن 9.stl أو 3.stl
تغيير أماكن p.stl
تغيير عشوائية الانترو
تغيير ألوان أو خامات الحالة الحالية
رفع build في version.json قبل إصلاح واختبار loader
```
