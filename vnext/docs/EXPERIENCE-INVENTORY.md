# Experience Inventory

هذا الملف هو الجرد الرسمي للوضعيات التي يجب أن تعرفها النسخة الجديدة. لا يعني أن كل وضع سيملك شاشة منفصلة؛ المقصود أن كل حالة تكون مسماة وقابلة للاختبار.

## 1. تشغيل التطبيق

| المجموعة | الحالات |
|---|---|
| البداية | `boot.idle`, `boot.loading`, `boot.ready` |
| الأصول | `assets.loading`, `assets.ready`, `assets.failed` |
| الاستعادة | `session.checking`, `session.restoring`, `session.restored`, `session.expired` |
| الفشل | `fatal.error`, `recoverable.error`, `offline.notice` |

## 2. الدخول واختيار المسار

- `entry.wall-idle`
- `entry.wall-hover`
- `entry.wall-selecting`
- `entry.to-table`
- `entry.to-side-service`
- `entry.returning-home`

المسارات:

- `mode.online`
- `mode.computer`
- `mode.learn`

## 3. الأونلاين

### قائمة الغرف

- `online.browse.loading`
- `online.browse.ready`
- `online.browse.empty`
- `online.browse.refreshing`
- `online.browse.error`

### إنشاء غرفة

- `online.create.editing-name`
- `online.create.selecting-players`
- `online.create.selecting-rounds`
- `online.create.selecting-color`
- `online.create.submitting`
- `online.create.error`

### الانضمام

- `online.join.previewing`
- `online.join.selecting-color`
- `online.join.submitting`
- `online.join.color-taken`
- `online.join.room-full`
- `online.join.error`

### غرفة الانتظار

- `online.waiting.owner`
- `online.waiting.guest`
- `online.waiting.player-joined`
- `online.waiting.player-left`
- `online.waiting.starting`
- `online.waiting.cancelled`

### الاتصال

- `network.connected`
- `network.polling`
- `network.stale`
- `network.reconnecting`
- `network.recovered`
- `network.conflict`
- `network.disconnected`

## 4. إعداد المباراة

- `setup.locked`
- `setup.choose-color`
- `setup.choose-player-count`
- `setup.choose-round-count`
- `setup.confirming`
- `setup.complete`

اختلافات المسار:

- الكمبيوتر يختار اللون وعدد اللاعبين/الخصوم.
- الأونلاين قد يأتي اللون والعدد والجولات من الغرفة.
- التدريب قد يفرض إعدادًا مبسطًا ومعلومًا.

## 5. بداية الجولة

- `round.preparing`
- `round.intro`
- `round.positioning-camera`
- `round.ready`
- `round.starting-turn`

## 6. دورة الدور

- `turn.waiting`
- `turn.human-ready`
- `turn.bot-thinking`
- `turn.remote-waiting`
- `turn.timer-running`
- `turn.timer-paused-for-guide`
- `turn.expired`
- `turn.resolving`
- `turn.transitioning`

## 7. اختيار القطعة والحركة

### درج القطع

- `selection.closed`
- `selection.opening`
- `selection.open`
- `selection.size-hover`
- `selection.size-selected`
- `selection.closing`

### التصويب

- `move.idle`
- `move.piece-picked`
- `move.dragging`
- `move.aiming`
- `move.legal-preview`
- `move.illegal-preview`
- `move.confirming`
- `move.submitting`
- `move.accepted`
- `move.rejected`
- `move.returning-piece`
- `move.snapping-piece`

### مؤشرات اللعب

- `indicator.active-player`
- `indicator.legal-zones`
- `indicator.last-move`
- `indicator.invalid-move`
- `indicator.connection-delay`

## 8. التعليم

- `learn.intro`
- `learn.win-method-1`
- `learn.win-method-2`
- `learn.win-method-3`
- `learn.first-move-guide`
- `learn.skipped`
- `learn.completed`
- `learn.reopened`

## 9. نهاية الجولة والمباراة

- `result.win-detected`
- `result.win-highlight`
- `result.round-summary`
- `result.draw`
- `result.score-update`
- `result.rematch-requested`
- `result.waiting-others`
- `result.next-round-starting`
- `result.match-complete`
- `result.match-draw`
- `result.new-match-requested`
- `result.exiting`

## 10. الكاميرا

الوضعيات المرجعية:

- `camera.wall`
- `camera.overview`
- `camera.setup-fit`
- `camera.player-right`
- `camera.player-back`
- `camera.player-left`
- `camera.player-front`
- `camera.side-service`
- `camera.win-focus`
- `camera.free-limited`
- `camera.recentering`

## 11. الواجهات العامة

- `overlay.settings`
- `overlay.language`
- `overlay.room-details`
- `overlay.leave-confirmation`
- `overlay.help`
- `overlay.error`
- `overlay.connection`
- `overlay.accessibility`

## 12. Variants يجب اختبارها

- Desktop واسع.
- Desktop صغير.
- Mobile portrait.
- Mobile compact landscape.
- Touch فقط.
- Mouse فقط.
- Keyboard navigation.
- Reduced Motion.
- اتصال بطيء أو متقطع.
- 2، 3، و4 لاعبين.
- جولات 3 و5.
- لاعب بشري، Bot، ولاعب بعيد.

## الدروس المستفادة من النسخ السابقة

- v112: التعليم القصير المرتبط بأول حركة أفضل من عرض طويل إلزامي.
- v113: لا يبدأ مؤقت أول حركة أثناء قراءة التعليم.
- v114–v118: الأونلاين يحتاج خادمًا صاحب قرار، هوية قابلة للاستعادة، جولات ونتائج واضحة.
- v115: كاميرا الإعداد لا تساوي كاميرا اللعب.
- v117: لا تنشئ واجهة لعب أونلاين موازية؛ أعد استخدام نفس اللعب الأصلي.
- v119: علامة آخر حركة يجب أن تكون هادئة ولا تطغى على اللوحة.
- v120–v121: وضوح الجوال يعالج بالخامات والهندسة والسياسة، لا برفع التكلفة بلا حدود.
- v122–v125: الجدار والطاولة يمكن أن يكونا جزءًا من الرحلة، لكن يجب أن يحكمهما State Machine واحد.
- v126: الغرف المسماة والقواعد المشتركة اتجاه صحيح، ويجب نقله إلى بنية غير تراكمية.