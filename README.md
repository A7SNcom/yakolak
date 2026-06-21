# Yakolak

نسخة تشغيل 3D للعبة Yakolak على GitHub Pages.

## الحالة الحالية

```txt
version: v037-color-controls-only
```

الوضع الحالي ليس وضع معايرة مواقع.

الوضع الحالي هو:

```txt
Color Controls Only
```

## التشغيل

```txt
index.html
└─ app.js
   └─ app-colors-v037.js
      ├─ 9.stl
      ├─ 3.stl
      ├─ p.stl
      ├─ l.stl
      ├─ m.stl
      └─ s.stl
```

## القاعدة المهمة

لا توجد الآن أي معايرات مواقع في الواجهة.

الواجهة تعرض دوائر ألوان فقط.

## خطة الألوان

### 1. البورد والقواعد

```txt
9.stl + كل قواعد 3.stl = لون واحد
```

### 2. p.stl

```txt
كل قطع p.stl = لون واحد
```

### 3. حجار قواعد الاستعداد

حجار اللعب الموجودة على قواعد الاستعداد لها 4 ألوان حسب الاتجاه:

```txt
يمين
يسار
أمام
خلف
```

كل اتجاه له لون مستقل.

## حجار البورد

تم إخفاء حجار اللعب داخل البورد بصريًا.

لكن مواقعها محفوظة داخل ناتج النسخ في:

```txt
board_stones.positions
```

وقيمتها:

```txt
visible: false
```

## القيم الذهبية المحفوظة

```txt
stoneDistance = 48
threeRadius = 135
pRadius = 85
pPieceGap = 11
```

## ملفات التوثيق المهمة

```txt
docs/COLOR_MODE_V037.md
docs/CURRENT_GOLDEN_STATE.md
docs/AI_AGENT_HANDOFF.md
archive/golden-v036-p-gap-11.json
archive/golden-v036-p-gap-11.js
```

## تحذير للمطور أو الوكيل الذكي

لا ترجع أزرار معايرة المواقع.

لا تظهر سلايدر للمسافات.

لا تظهر معايرة لكل جهة.

الواجهة الحالية مخصصة للألوان فقط، ومصممة للجوال بدوائر لمس واضحة.
