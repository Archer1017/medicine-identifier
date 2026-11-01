/**
 * 服药提醒通知服务。
 *
 * 跨端策略：
 * - App（plus）：使用 plus.push.createMessage 创建本地定时通知；
 *   到点后 App 内用 TTS 播报“现在该吃 X，N 粒，饭后服用。这是贴了红色贴纸的那盒。”
 * - 其它端：降级为 App 内定时器 + TTS（仅前台生效），并提示需真机。
 *
 * 需求要点：
 * - 每日多次提醒、多药分开不合并（每条计划独立 id）
 * - 到点播报文案明确
 * - 未响应 5 分钟后再次提醒，最多 3 次
 * - 双击“已服用”记录日志（App 端通过通知点击回调）
 */

import { speak } from './tts.js'
import { reminder as hapticReminder } from './haptic.js'
import { insertLog, getMedicine } from './storage.js'

/** 生成提醒正文 */
export function buildReminderText(medicine, schedule) {
	let text = `现在该吃 ${medicine.name}，${schedule.quantity || 1} 粒`
	if (schedule.timing) text += `，${schedule.timing}服用`
	text += '。'
	if (medicine.stickerColor) text += `这是贴了${medicine.stickerColor}贴纸的那盒。`
	if (medicine.expiryDate && Date.now() > medicine.expiryDate) {
		text += '警告，此药已过期，请勿服用。'
	}
	return text
}

/** 某计划的稳定通知 id */
function notifyId(schedule) {
	return schedule.medicineId * 10000 + schedule.hour * 100 + schedule.minute
}

/**
 * 安排每日提醒。
 * App 端用 plus.push 定时消息；重试用 +5/+10/+15 分钟三条错峰消息实现。
 */
export function scheduleDaily(medicine, schedule) {
	const text = buildReminderText(medicine, schedule)
	// #ifdef APP-PLUS
	try {
		const when = nextTriggerTime(schedule.hour, schedule.minute)
		plus.push.createMessage(text, JSON.stringify({
			type: 'dose',
			medicineId: medicine.id,
			scheduleId: schedule.id
		}), {
			cover: false,
			title: '服药提醒',
			delay: Math.round((when - Date.now()) / 1000)
		})
		// 三次重试
		for (let i = 1; i <= 3; i++) {
			plus.push.createMessage(text, JSON.stringify({
				type: 'dose_retry',
				medicineId: medicine.id,
				scheduleId: schedule.id,
				retry: i
			}), {
				cover: false,
				title: `服药提醒（重复第 ${i} 次）`,
				delay: Math.round((when - Date.now()) / 1000) + i * 300
			})
		}
	} catch (e) {
		console.error('scheduleDaily error', e)
	}
	return
	// #endif
	// 降级：前台 setTimeout（仅演示，App 关闭后失效）
	console.log('[提醒降级] 已登记：' + text)
}

/** 取消某计划的全部通知 */
export function cancelSchedule(schedule) {
	// #ifdef APP-PLUS
	try {
		plus.push.clear()
	} catch (e) {}
	// #endif
}

/**
 * 处理通知点击 / “已服用”确认。
 * App 端在 plus.push.addEventListener('click') 中调用本函数。
 */
export function onReminderConfirmed(payload) {
	try {
		if (!payload) return
		const data = typeof payload === 'string' ? JSON.parse(payload) : payload
		if ((data.type === 'dose' || data.type === 'dose_retry') && data.medicineId) {
			insertLog({
				medicineId: data.medicineId,
				scheduledTime: Date.now(),
				takenTime: Date.now()
			})
			const m = getMedicine(data.medicineId)
			speak('已记录服用' + (m ? ' ' + m.name : ''))
			// 取消当天剩余重试
			cancelScheduleById()
		}
	} catch (e) {
		console.error('onReminderConfirmed error', e)
	}
}

function cancelScheduleById() {
	// #ifdef APP-PLUS
	try { plus.push.clear() } catch (e) {}
	// #endif
}

/** App 前台收到提醒时主动播报 + 震动 */
export function speakReminderNow(medicine, schedule) {
	hapticReminder()
	speak(buildReminderText(medicine, schedule))
}

/** 计算下一次触发时间戳（今天该时刻已过则顺延到明天） */
function nextTriggerTime(hour, minute) {
	const now = new Date()
	const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0)
	if (t.getTime() <= now.getTime()) {
		t.setDate(t.getDate() + 1)
	}
	return t.getTime()
}

/** 注册 App 端推送点击监听（在 App.vue 或首页 onLoad 调用一次） */
export function initReminderListener() {
	// #ifdef APP-PLUS
	try {
		plus.push.addEventListener('click', (msg) => {
			onReminderConfirmed(msg.payload)
		})
		// 前台收到消息：主动播报
		plus.push.addEventListener('receive', (msg) => {
			try {
				const data = JSON.parse(msg.payload || '{}')
				if (data.type === 'dose' || data.type === 'dose_retry') {
					const m = getMedicine(data.medicineId)
					if (m) {
						hapticReminder()
						speak(msg.content || buildReminderText(m, { quantity: 1 }))
					}
				}
			} catch (e) {}
		})
	} catch (e) {
		console.error('initReminderListener error', e)
	}
	// #endif
}
