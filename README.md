# Yakolak

نسخة تشغيل 3D للعبة Yakolak على GitHub Pages.

## الحالة الحالية المعتمدة

```txt
Live state: approved current user browsing experience
Live route: index.html -> app.js -> app-hejaz-v043.js
Live app file: app-hejaz-v043.js
```

هذه هي النسخة الممتازة الحالية للتصفح النهائي للمستخدم. أي تنظيف أو ترتيب للمشروع يجب أن يحافظ على نفس التجربة البصرية والسلوكية.

## ملفات التشغيل الأساسية

```txt
index.html          صفحة GitHub Pages الرئيسية
app.js              ملف إقلاع صغير يوجّه إلى النسخة الحية
app-hejaz-v043.js   النسخة الحية الحالية المعتمدة
version.json        ملف فحص نسخة، رقم build مثبت مؤقتًا لتجنب لوب التحديث
```

## ملفات المجسمات الأساسية

تم ترتيب المجسمات داخل مجلد واضح:

```txt
assets/models/9.stl   البورد المركزي
assets/models/3.stl   القواعد الخارجية
assets/models/p.stl   علامات وقطع p
assets/models/l.stl   الحجر الكبير
assets/models/m.stl   الحجر الوسط
assets/models/s.stl   الحجر الصغير
```

## القيم الهندسية الذهبية الحالية

```txt
stoneDistance = 48
threeRadius   = 135
pRadius       = 85
pPieceGap     = 11
```

## بنية المشروع المختصرة

```txt
/
├─ index.html
├─ app.js
├─ app-hejaz-v043.js
├─ version.json
├─ assets/
│  └─ models/
│     ├─ 9.stl
│     ├─ 3.stl
│     ├─ p.stl
│     ├─ l.stl
│     ├─ m.stl
│     └─ s.stl
├─ docs/
└─ archive/
```

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

بعض الملفات القديمة موجودة كمرجع تاريخي، وليست هي مسار التشغيل الحالي. أي نقل إضافي يحتاج مراجعة روابط GitHub Pages والتأكد أنها غير مستخدمة.
