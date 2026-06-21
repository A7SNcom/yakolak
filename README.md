# Yakolak

نسخة مرتبة لتشغيل ومعايرة لعبة ياكلك 3D على GitHub Pages.

## الحالة الذهبية الحالية

```txt
version: v036-p-gap-11
```

هذه هي الحالة المعتمدة الآن ولا نريد فقدانها.

## الملف المعتمد للتشغيل

```txt
index.html
└─ app.js
   └─ app-clean-v026.js
      ├─ 9.stl
      ├─ 3.stl
      ├─ p.stl
      ├─ l.stl
      ├─ m.stl
      └─ s.stl
```

## القاعدة الذهبية الجديدة

المعايرة الوحيدة الآن هي:

```txt
pPieceGap = 11
```

والمقصود بها فقط:

```txt
تباعد قطع p.stl عن بعضها داخل نفس الصف
```

لا يقصد بها:

```txt
تحريك مركز p.stl
تحريك مركز 3.stl
تغيير تباعد الحجار على البورد
تكبير أو تصغير البورد
```

## القيم الثابتة

```txt
GOLDEN_DISTANCE = 48
THREE_RADIUS = 135
P_RADIUS = 85
P_GAP_GOLDEN = 11
```

## p.stl

لدينا 4 صفوف من `p.stl`:

```txt
p-front
p-back
p-right
p-left
```

كل صف فيه 7 قطع:

```txt
3 يسار + 1 وسط + 3 يمين = 7
```

المجموع:

```txt
4 جهات × 7 = 28 قطعة p.stl
```

## مراكز p.stl الثابتة

```txt
p-front  px 0    py 7  pz 85   rx -90  ry 0  rz 0
p-back   px 0    py 7  pz -85  rx -90  ry 0  rz 0
p-right  px 85   py 7  pz 0    rx -90  ry 0  rz 90
p-left   px -85  py 7  pz 0    rx -90  ry 0  rz 90
```

## صيغة توزيع p.stl

الأمام والخلف ينتشران على محور X:

```txt
px = row.px + side * pPieceGap
pz = row.pz
```

اليمين واليسار ينتشران على محور Z:

```txt
px = row.px
pz = row.pz + side * pPieceGap
```

والـ `side` دائمًا:

```txt
-3, -2, -1, 0, 1, 2, 3
```

## ممنوع بدون سبب واختبار بصري

```txt
إرجاع معايرة كل جهة من p.stl
إرجاع معايرة كل جهة من 3.stl
تحريك مراكز p.stl
تحريك مراكز 3.stl
تغيير GOLDEN_DISTANCE = 48
```

## ملفات التوثيق المهمة

```txt
archive/golden-v036-p-gap-11.json
archive/golden-v036-p-gap-11.js
docs/CURRENT_GOLDEN_STATE.md
docs/AI_AGENT_HANDOFF.md
```

## أرشيف سابق

```txt
archive/golden-calibration-v030.json
archive/golden-calibration-v030.js
```

## الملفات الأساسية

```txt
index.html         صفحة التشغيل
app.js             نقطة الدخول الرسمية
app-clean-v026.js  المحرك الحالي
9.stl              بورد اللعب
3.stl              قواعد الاستعداد الخارجية
p.stl              علامات/قطع محيطية بتباعد pPieceGap
l.stl              حجر كبير
m.stl              حجر وسط
s.stl              حجر صغير
archive/           أرشيف الحالات الذهبية
```
