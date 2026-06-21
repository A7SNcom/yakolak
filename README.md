# Yakolak

نسخة مرتبة لتشغيل ومعايرة لعبة ياكلك 3D على GitHub Pages.

## الملف المعتمد للتشغيل

افتح:

```txt
index.html
```

مسار التشغيل الحالي:

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

## قاعدة المعايرة الحالية

المعايرة الوحيدة الآن هي:

```txt
layout.distance
```

القيمة الذهبية:

```txt
layout.distance = 48
```

أي تغيير في هذه الخانة يوزن كل شيء بنسبة واحدة:

```txt
بورد اللعب 3x3
أماكن الحجار على البورد
أماكن الحجار الخارجية
مواقع 3.stl الأربعة
مواقع p.stl الأربعة
تباعد نسخ p.stl السبعة في كل جهة
```

لا توجد معايرة لكل جهة من `3.stl`.

لا توجد معايرة لكل جهة من `p.stl`.

## p.stl

`p.stl` ثابت كنظام مشتق من `layout.distance`.

عند القيمة الذهبية 48 تكون المراكز:

```txt
p-front  px 0    py 7  pz 85   rx -90  ry 0  rz 0
p-back   px 0    py 7  pz -85  rx -90  ry 0  rz 0
p-right  px 85   py 7  pz 0    rx -90  ry 0  rz 90
p-left   px -85  py 7  pz 0    rx -90  ry 0  rz 90
```

كل مركز ينتج 7 نسخ:

```txt
3 يسار + 1 وسط + 3 يمين = 7
4 جهات × 7 = 28 نسخة من p.stl
```

تباعد p.stl مشتق تلقائيًا من نفس المسافة:

```txt
pGap = layout.distance × (28 / 48)
```

## نسب الاشتقاق

```txt
3.stl radius = layout.distance × (135 / 48)
p.stl radius = layout.distance × (85 / 48)
p.stl gap    = layout.distance × (28 / 48)
```

## المعايرة الذهبية القديمة

تم أرشفة المعايرة الممتازة هنا:

```txt
archive/golden-calibration-v030.json
archive/golden-calibration-v030.js
```

## قاعدة التطوير

لا نرجع للمعايرات الفردية إلا إذا ثبت بصريًا أنها ضرورية.

الأصل الآن: خانة واحدة فقط تضبط كل البقية بنسبة واحدة.

## الملفات الأساسية

```txt
index.html         صفحة التشغيل
app.js             نقطة الدخول الرسمية
app-clean-v026.js  المحرك الحالي
9.stl              بورد اللعب
3.stl              قواعد الاستعداد الخارجية
p.stl              مجسم مشتق من التباعد العام
l.stl              حجر كبير
m.stl              حجر وسط
s.stl              حجر صغير
archive/           أرشيف المعايرة الذهبية
```
