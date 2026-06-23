# Yakolak Intro Timing Archive

حفظ للقيم القديمة قبل تعديل تزامن الغطاء والجدران.

## التاريخ
2026-06-23

## الملف
`src/app-live.js`

## القيم القديمة

```js
const TLINE = {
  lidShake: 450,
  lidLift: 850,
  lidH: 900,
  wallStart: 180,
  wallDelay: 520,
  wallShake: 280,
  wallRaise: 20,
  wallLift: 360,
  wallMove: 850,
  wallDrop: 430,
  pieceLead: 520,
  pieceMove: 1200,
  pieceArc: 34,
  pieceStagger: 60
};
```

## منطق البداية القديم للجدران

```js
start = TLINE.lidShake + TLINE.lidLift + TLINE.wallStart + i * TLINE.wallDelay
```

يعني الجدران كانت تنتظر انتهاء هزة الغطاء + انتهاء ارتفاع الغطاء + انتظار إضافي 180ms.

## منطق القطع القديم

```js
drop = TLINE.lidShake + TLINE.lidLift + TLINE.wallStart + i*TLINE.wallDelay + TLINE.wallShake + TLINE.wallLift + TLINE.wallMove
```

## التعديل المطلوب

- زيادة مدة هزة الغطاء 10%: من 450 إلى 495.
- زيادة مدة ارتفاع الغطاء 20%: من 850 إلى 1020.
- حذف فترة الانتظار بين الغطاء والجدران.
- تبدأ الجدران أثناء ارتفاع الغطاء، مباشرة بعد بداية خروج الغطاء.
