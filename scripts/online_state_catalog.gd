extends RefCounted

# UI-only state catalog. This file intentionally knows nothing about retries,
# transport mutations, room storage, or game rules. It gives every reachable
# online condition one short Arabic explanation and one clear next action.

const INVENTORY: Dictionary = {
	"room-checking": {
		"title": "نتحقق من الغرفة",
		"message": "نراجع الرمز وحالة الغرفة الآن.",
		"action": "none",
		"action_label": "",
	},
	"room-ready": {
		"title": "الغرفة جاهزة",
		"message": "اختر لونك ثم انضم.",
		"action": "join",
		"action_label": "اختيار اللون",
	},
	"room-not-found": {
		"title": "الغرفة غير موجودة",
		"message": "تأكد من الرمز أو اختر غرفة أخرى.",
		"action": "back",
		"action_label": "غرفة أخرى",
	},
	"room-full": {
		"title": "الغرفة ممتلئة",
		"message": "لا يوجد مقعد متاح في هذه الغرفة.",
		"action": "back",
		"action_label": "غرفة أخرى",
	},
	"room-started": {
		"title": "اللعبة بدأت",
		"message": "لا يمكن الانضمام لهذه الغرفة الآن.",
		"action": "back",
		"action_label": "غرفة أخرى",
	},
	"room-finished": {
		"title": "اللعبة انتهت",
		"message": "هذه الغرفة أنهت مباراتها.",
		"action": "back",
		"action_label": "غرفة أخرى",
	},
	"room-cancelled": {
		"title": "انتهت الغرفة",
		"message": "تم إنهاء الغرفة. ارجع لبدء لعبة أخرى.",
		"action": "exit",
		"action_label": "العودة للإعداد",
	},
	"invalid-room-code": {
		"title": "رمز الغرفة غير صحيح",
		"message": "رمز الغرفة يجب أن يتكون من رقمين.",
		"action": "back",
		"action_label": "تعديل الرمز",
	},
	"color-taken": {
		"title": "اللون محجوز",
		"message": "اختر لونًا آخر للانضمام.",
		"action": "choose-color",
		"action_label": "اختيار لون آخر",
	},
	"request-failed": {
		"title": "تعذر إكمال الطلب",
		"message": "تحقق من اتصالك ثم حاول مرة أخرى.",
		"action": "retry",
		"action_label": "إعادة المحاولة",
	},
	"rate-limited": {
		"title": "محاولات كثيرة",
		"message": "انتظر قليلًا ثم أعد المحاولة.",
		"action": "retry",
		"action_label": "إعادة المحاولة",
	},
	"session-expired": {
		"title": "انتهت صلاحية الدخول",
		"message": "ارجع للغرف وانضم من جديد.",
		"action": "back",
		"action_label": "العودة للغرف",
	},
	"protocol-mismatch": {
		"title": "نسخة الغرفة مختلفة",
		"message": "أعد فتح اللعبة ثم جرّب الانضمام من جديد.",
		"action": "back",
		"action_label": "العودة للغرف",
	},
	"creating-room": {
		"title": "جاري إنشاء الغرفة",
		"message": "نجهز رمز الدعوة الآن.",
		"action": "exit",
		"action_label": "إلغاء",
	},
	"joining-room": {
		"title": "جاري الانضمام",
		"message": "نثبت مقعدك في الغرفة.",
		"action": "exit",
		"action_label": "إلغاء",
	},
	"restoring-room": {
		"title": "نستعيد الغرفة",
		"message": "نحدّث آخر حالة للعبة.",
		"action": "exit",
		"action_label": "خروج",
	},
	"waiting-players": {
		"title": "بانتظار اللاعبين",
		"message": "شارك رمز الغرفة وانتظر اكتمال اللاعبين.",
		"action": "exit",
		"action_label": "خروج",
	},
	"submitting-move": {
		"title": "جارٍ تثبيت الحركة",
		"message": "ننتظر تأكيد الغرفة قبل الحركة التالية.",
		"action": "none",
		"action_label": "",
	},
	"reconnecting": {
		"title": "انقطع الاتصال",
		"message": "نحاول إعادة الاتصال تلقائيًا. لا تعد الحركة.",
		"action": "exit",
		"action_label": "خروج",
	},
	"connected": {
		"title": "عاد الاتصال",
		"message": "تم تحديث حالة اللعبة.",
		"action": "none",
		"action_label": "",
	},
}


static func get_state(state_id: String) -> Dictionary:
	var value: Variant = INVENTORY.get(state_id, INVENTORY["request-failed"])
	return (value as Dictionary).duplicate(true)


static func preview_error_state(error_code: String) -> String:
	match error_code:
		"room_not_found":
			return "room-not-found"
		"invalid_room_code":
			return "invalid-room-code"
		"rate_limited":
			return "rate-limited"
		_:
			return "request-failed"


static func request_error_state(error_code: String) -> String:
	match error_code:
		"room_not_found":
			return "room-not-found"
		"room_full":
			return "room-full"
		"room_not_waiting", "room_not_playing":
			return "room-started"
		"color_taken":
			return "color-taken"
		"invalid_room_code":
			return "invalid-room-code"
		"unauthorized", "invalid_session":
			return "session-expired"
		"online_protocol_mismatch":
			return "protocol-mismatch"
		"rate_limited":
			return "rate-limited"
		_:
			return "request-failed"
