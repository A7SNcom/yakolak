# Hejaz Materials v041

## الحالة

```txt
v041-hejaz-materials
```

## الخامات المطبقة

### البورد والقواعد

```txt
9.stl + 3.stl = أسود متوسط اللمعة
color: #171717
roughness: 0.48
metalness: 0.18
```

### p.stl

```txt
ماربل رمادي
base: #b9bcc1
speck1: #74787e
speck2: #3f4348
density: 72
roughness: 0.72
metalness: 0.06
```

### حجار الاتجاهات

```txt
right = أبيض ماربل
left  = ذهبي غامق ساتان/front = أخضر معدني متوسط اللمعة
back  = أزرق مطفي
```

## طريقة الماربل

تم تطبيق الماربل عبر `CanvasTexture` يتم توليدها داخل المتصفح.

الماربل عبارة عن تنقيطات رمادية/سوداء خفيفة وغير كثيفة.

## قاعدة مهمة

الخامات هنا ليست ألوان flat فقط.

تم استخدام:

```txt
MeshStandardMaterial
roughness
metalness
CanvasTexture للماربل
```
