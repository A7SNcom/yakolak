# Yakolak Current Golden State

## الحالة المعتمدة الآن

هذه هي النقطة الذهبية الجديدة للمشروع:

```txt
version: v036-p-gap-11
pPieceGap: 11
stoneDistance: 48
threeRadius: 135
pRadius: 85
```

## القاعدة التي لا نريد نسيانها

المعايرة الوحيدة المسموحة الآن هي:

```txt
pPieceGap
```

وهي تعني: المسافة بين قطع `p.stl` وبعضها داخل نفس الصف.

لا تعني:

```txt
تحريك مركز p
تحريك مركز 3
تغيير تباعد الحجار على البورد
تكبير أو تصغير البورد
```

## ما الذي تم قفله؟

هذه العناصر ثابتة ولا يتم تحريكها من المعايرة:

```txt
9.stl
3.stl يمين / يسار / أمام / خلف
مراكز صفوف p.stl الأربعة
أماكن الحجار l/m/s
المسافة الذهبية للحجار = 48
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
side = -3, -2, -1, 0, 1, 2, 3
```

المجموع:

```txt
4 × 7 = 28 قطعة p.stl
```

## مراكز p.stl الذهبية

```txt
p-front  px 0    py 7  pz 85   rx -90  ry 0  rz 0
p-back   px 0    py 7  pz -85  rx -90  ry 0  rz 0
p-right  px 85   py 7  pz 0    rx -90  ry 0  rz 90
p-left   px -85  py 7  pz 0    rx -90  ry 0  rz 90
```

## صيغة توزيع p.stl

للأمام والخلف:

```txt
px = row.px + side * pPieceGap
pz = row.pz
```

لليمين واليسار:

```txt
px = row.px
pz = row.pz + side * pPieceGap
```

القيمة الذهبية الحالية:

```txt
pPieceGap = 11
```

## تحذير للمطور أو الوكيل الذكي

لا تعد إلى منطق معايرة كل جهة.

لا تجعل `p-front`, `p-back`, `p-right`, `p-left` قابلة للمعايرة اليدوية من الواجهة.

لا تجعل `3-right`, `3-left`, `3-front`, `3-back` قابلة للمعايرة اليدوية من الواجهة.

أي تعديل جديد يجب أن يحافظ على هذه القاعدة:

```txt
مراكز ثابتة + pPieceGap فقط
```
