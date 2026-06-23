# Yakolak Current Golden State

## الحالة الحية الحالية

```txt
Approved live browsing experience: current excellent state
Live route: index.html -> app.js -> app-hejaz-v043.js
Live app file: app-hejaz-v043.js
```

هذه الصفحة الحالية هي المرجع الحي للمشروع. ترتيب الملفات أو تنظيف التوثيق يجب أن يحافظ عليها كما هي.

## الحالة الهندسية الذهبية

```txt
stoneDistance = 48
threeRadius   = 135
pRadius       = 85
pPieceGap     = 11
```

## مواضع المجسمات الأساسية

```txt
9.stl
px: 0
py: 6
pz: 0
rx: -90
ry: 0
rz: 0
```

```txt
3-right
px: 135
py: 6
pz: 0
rx: -90
ry: 0
rz: 0
```

```txt
3-left
px: -135
py: 6
pz: 0
rx: -90
ry: 0
rz: 180
```

```txt
3-front
px: 0
py: 6
pz: 135
rx: -90
ry: 0
rz: 90
```

```txt
3-back
px: 0
py: 6
pz: -135
rx: -90
ry: 0
rz: -90
```

## صفوف p.stl الذهبية

```txt
p-front: px 0,   py 7, pz 85,  rx -90, ry 0, rz 0,  axis x
p-back:  px 0,   py 7, pz -85, rx -90, ry 0, rz 0,  axis x
p-right: px 85,  py 7, pz 0,   rx -90, ry 0, rz 90, axis z
p-left:  px -85, py 7, pz 0,   rx -90, ry 0, rz 90, axis z
```

## قاعدة pPieceGap

```txt
side values: -3, -2, -1, 0, 1, 2, 3
front/back: px = row.px + side * 11; pz = row.pz
right/left: px = row.px; pz = row.pz + side * 11
```

## ما الذي تم قفله؟

```txt
9.stl
3.stl يمين / يسار / أمام / خلف
مراكز صفوف p.stl الأربعة
أماكن الحجار l/m/s في الحالة النهائية
المسافة الذهبية للحجار = 48
pPieceGap = 11
مسار التشغيل الحالي
```

## تحذير مهم

لا ترجع إلى منطق معايرة كل جهة. لا تجعل `p-front`, `p-back`, `p-right`, `p-left` قابلة للمعايرة اليدوية من الواجهة. لا تجعل `3-right`, `3-left`, `3-front`, `3-back` قابلة للمعايرة اليدوية.

## ملاحظة عن التوثيق القديم

أي توثيق قديم يقول إن الوضع الحالي هو `v037-color-controls-only` يعتبر تاريخيًا فقط وليس حقيقة التشغيل الحالية.
