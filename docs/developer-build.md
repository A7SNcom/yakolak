# Yakolak Developer Build

نسخة مطوّر مرتبة للعبة ياكلك 3D.

## التشغيل

افتح أحد الملفات:

- `index.html`
- `yakolak-dev-one-point-v1.html`

تم استخدام importmap داخل HTML لحل مشكلة استيراد three بدون npm أو build.

## ترتيب الملفات

```txt
index.html
yakolak-dev-one-point-v1.html
src/config.js
src/main.js
src/styles.css
README.md
.gitignore
docs/developer-build.md
```

## المعايرة

المعايرة تعتمد على نقطة واحدة فقط:

- `origin.x`
- `origin.y`
- `origin.z`

كل الخانات التسعة تتولد من نفس المركز باستخدام `gridStep`.

ارتفاع كل الأحجار يتبع نفس النقطة باستخدام `dropHeight`.

لا يوجد معايرة محورين ولا نقطتين.

## STL

الإعداد الافتراضي يحاول تحميل:

- `https://a7sn.com/mtkyf/yakolak/s.stl`
- `https://a7sn.com/mtkyf/yakolak/m.stl`
- `https://a7sn.com/mtkyf/yakolak/l.stl`

لو فشل التحميل، يتم استخدام أشكال احتياطية تلقائياً.

## أزرار المطور

- زر الإعدادات يفتح لوحة المعايرة.
- زر نسخ الكود ينسخ إعدادات المعايرة الحالية.
- زر تصفير المعايرة يرجع الإعدادات الافتراضية.
- زر إعادة اللعب يرجع الأحجار للمخزن.
