# AI Agent Handoff — Yakolak

اقرأ هذا الملف قبل أي تعديل على المشروع.

## آخر حالة مستقرة

```txt
Current golden state: v036-p-gap-11
```

## الهدف من المشروع حاليًا

عرض لعبة Yakolak 3D في المتصفح باستخدام:

```txt
Three.js
STLLoader
GitHub Pages
```

## ملفات التشغيل

```txt
index.html
app.js
app-clean-v026.js
```

`index.html` يشغل `app.js`.

`app.js` يشغل المحرك الحالي `app-clean-v026.js`.

## أهم قرار معماري

تم إلغاء معايرات الجهات الفردية.

المعايرة الوحيدة في الواجهة هي:

```txt
layout.pPieceGap
```

وهي تتحكم فقط في تباعد قطع `p.stl` عن بعضها داخل الصف الواحد.

## لا تفعل هذا

لا تضف أزرار معايرة لكل جهة من `p.stl`.

لا تضف أزرار معايرة لكل جهة من `3.stl`.

لا تربط pPieceGap بتحريك مركز p أو مركز 3.

لا تغيّر قيمة الحجار الذهبية `48` إلا بطلب صريح واختبار بصري.

## القيم الذهبية

```txt
GOLDEN_DISTANCE = 48
THREE_RADIUS = 135
P_RADIUS = 85
P_GAP_GOLDEN = 11
```

## التوزيع الصحيح لـ p.stl

يوجد 4 صفوف:

```txt
p-front
p-back
p-right
p-left
```

كل صف فيه 7 نسخ:

```txt
-3, -2, -1, 0, 1, 2, 3
```

الأمام والخلف ينتشران على محور X.

اليمين واليسار ينتشران على محور Z.

## الملفات المؤرشفة

ارجع لهذه الملفات قبل تعديل المنطق:

```txt
archive/golden-v036-p-gap-11.json
archive/golden-v036-p-gap-11.js
docs/CURRENT_GOLDEN_STATE.md
```

## صيغة مختصرة للمنطق

```js
pPieceGap = 11;
for each pRow:
  for side in [-3, -2, -1, 0, 1, 2, 3]:
    if row is front/back:
      px = row.px + side * pPieceGap;
      pz = row.pz;
    if row is right/left:
      px = row.px;
      pz = row.pz + side * pPieceGap;
```

## سبب هذه القاعدة

المستخدم صحح أن المقصود بالمعايرة ليس التباعد من المركز، بل الفراغ بين قطع `p.stl` وبعضها. لذلك تم تثبيت المراكز والإبقاء على تباعد القطع فقط.
