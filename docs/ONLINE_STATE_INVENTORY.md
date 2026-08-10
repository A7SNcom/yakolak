# YAKOLAK Online State Inventory

Scope: UI state coverage only. Network transport, retry policy, room rules, and server behavior are intentionally unchanged.

## Room / setup path

| Reachable state | Trigger | Before this task | Unified UI now | Action |
|---|---|---|---|---|
| Room entry | User chooses join/new | Clear | Existing screen | Choose path |
| `room-checking` | Preview request in flight | Ambiguous `...` / disabled button | “نتحقق من الغرفة” | None while request is active |
| `room-ready` | Waiting room can accept player | Join button only | “الغرفة جاهزة” | اختيار اللون |
| `room-not-found` | Preview/join returns `room_not_found` | Generic connection failure | “الغرفة غير موجودة” | غرفة أخرى |
| `invalid-room-code` | Invalid two-digit code | Mixed generic errors | “رمز الغرفة غير صحيح” | تعديل الرمز |
| `room-full` | Join race returns `room_full` | Generic online failure | “الغرفة ممتلئة” | غرفة أخرى |
| `room-started` | Preview says `playing` or server says not waiting | Generic “غير متاحة” | “اللعبة بدأت” | غرفة أخرى |
| `room-finished` | Preview says `finished` | Generic “غير متاحة” | “اللعبة انتهت” | غرفة أخرى |
| `room-cancelled` | Preview/room says `cancelled` | Generic / hidden in gameplay | “انتهت الغرفة” | العودة للإعداد |
| `color-taken` | Join race reserves chosen color | Inline error only | Explicit “اللون محجوز” state + refreshed colors | اختيار لون آخر |
| `request-failed` | Timeout/server/unavailable | Generic connection line | “تعذر إكمال الطلب” | إعادة المحاولة |
| `rate-limited` | Discovery rate limit | Generic connection line | “محاولات كثيرة” | إعادة المحاولة بعد قليل |
| `session-expired` | Unauthorized/invalid session | Generic failure / reset | “انتهت صلاحية الدخول” | العودة للغرف |
| `protocol-mismatch` | Room/client protocol mismatch | Generic failure | “نسخة الغرفة مختلفة” | العودة للغرف |

## Gameplay / room lifecycle

| Reachable state | Trigger | Before this task | Unified UI now | Action |
|---|---|---|---|---|
| `creating-room` | Host create request in flight | Board + “بانتظار اللاعبين” too early | “جاري إنشاء الغرفة” | إلغاء |
| `joining-room` | Join request in flight | Board + generic waiting | “جاري الانضمام” | إلغاء |
| `restoring-room` | Saved tab identity is restored | Small transport pill / HUD text | “نستعيد الغرفة” | خروج |
| `waiting-players` | Authoritative room is `waiting` | Existing waiting card | Same card, clearer joined/target progress | خروج |
| Local player turn | Room `playing`, own turn | Clear turn HUD | Existing HUD | Play |
| Remote player turn | Room `playing`, other turn | Clear turn HUD | Existing HUD | Wait |
| `submitting-move` | Move request in flight | Board becomes inert with no reason | “جارٍ تثبيت الحركة” | None until acknowledgement |
| `reconnecting` | Transient poll/move failure | Tiny top pill only | Main state card: “انقطع الاتصال” | Automatic retry; خروج remains available |
| `connected` | Recovery succeeds | Pill silently disappears | “عاد الاتصال” confirmation, then returns to normal state | None |
| Round finished | Authoritative `finished`, match not complete | Score marker + automatic next round | Existing result path is already understandable | Automatic |
| Match finished | `matchComplete=true` | Score marker + rematch menu | Existing rematch path | إعادة المباراة |
| `room-cancelled` | Another player/host ends room | Result text was effectively hidden by gameplay chrome | Blocking state card | العودة للإعداد |

## State pattern

Every newly covered state uses the same contract:

1. **What happened?** One short title.
2. **What does it mean?** One short sentence.
3. **What can I do now?** Zero or one primary action. No dead buttons and no bare ellipsis.
4. **Where am I?** The same state ID/message/action is published to browser datasets for deterministic browser tests.

The transport remains authoritative and unchanged; these states only observe signals/room snapshots and present them.
