# P Model Saved State

هذا الملف يحفظ حالة مجسم `p.stl` بعد إخفائه من العرض.

## الحالة الحالية

```txt
visible = false
file = assets/models/p.stl
```

## المادة واللون

```txt
base color = #6f7378
roughness  = 0.82
metalness  = 0
textureMode   = pattern
textureRepeat = 1
offsetX       = 0
offsetY       = 0.15
rotation      = 0
power         = 0.4
```

## صفوف p

```txt
p-front: px 0,   py 7, pz 85,  rx -90, ry 0, rz 0,  axis x
p-back:  px 0,   py 7, pz -85, rx -90, ry 0, rz 0,  axis x
p-right: px 85,  py 7, pz 0,   rx -90, ry 0, rz 90, axis z
p-left:  px -85, py 7, pz 0,   rx -90, ry 0, rz 90, axis z
```

## قاعدة توزيع القطع

```txt
side values = -3, -2, -1, 0, 1, 2, 3
pPieceGap = 11
```

## معادلة المواقع

```txt
front/back:
px = row.px + side * 11
pz = row.pz

right/left:
px = row.px
pz = row.pz + side * 11
```

## عدد النسخ

```txt
4 rows × 7 pieces = 28 p instances
```

## ملاحظة

المجسم لا يزال موجودًا ومحفوظًا داخل الكود، لكنه مخفي بصريًا حتى نحتاجه لاحقًا.
