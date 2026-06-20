# yakolak

نسخة مطوّر مرتبة للعبة ياكلك 3D.

## الملف المعتمد الآن

افتح:

- `index.html` ← هذا هو الملف الأساسي لصفحة GitHub Pages
- `yaklak_dev_calibration_v002.html` ← نسخة مطابقة محفوظة باسم المطور

## فكرة المعايرة الجديدة

المعايرة صارت نقطة واحدة فقط:

```js
origin: { x, y, z }
```

بعدها كل أماكن الوقوف التسعة تتولد تلقائيًا من نفس النقطة باستخدام:

```js
gridStep
```

والارتفاع كله يتبع:

```js
origin.y + dropHeight
```

يعني ما عاد فيه محورين ولا معايرة مكانين.

## ترتيب الملفات

```txt
/
├─ index.html                         # صفحة التشغيل الأساسية الصحيحة
├─ yaklak_dev_calibration_v002.html    # نسخة مطابقة للاندكس
├─ src/
│  ├─ config.js                        # إعدادات اللعبة والألوان ومسارات STL
│  ├─ main.js                          # تشغيل اللعبة 3D والسحب والإفلات
│  ├─ calibration.js                   # أدوات المعايرة نقطة واحدة
│  └─ styles.css                       # تنسيق الواجهة ولوحة المطور
├─ s.stl                               # الحجر الصغير
├─ m.stl                               # الحجر المتوسط
├─ l.stl                               # الحجر الكبير
└─ README.md
```

## ملاحظة مهمة لملفات STL

تم ضبط اللعبة لتحمل ملفات STL محليًا من نفس الريبو:

```js
modelBaseUrl: './'
modelFiles: {
  small: 's.stl',
  medium: 'm.stl',
  large: 'l.stl'
}
```

يعني GitHub Pages يعتمد على ملفات الريبو نفسها، وليس رابط خارجي.

## ملاحظة تشغيل

لو ظهر خطأ `Failed to resolve module specifier three` فافتح `index.html` الجديد؛ لأنه يحتوي `importmap` الصحيح.
