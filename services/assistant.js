/**
 * 首页 AI 辅助的轻量意图解析。
 * 先覆盖盲人高频操作：识别、保存、重复朗读、找药、打开页面、过期检查。
 */

import {
	getAllMedicines,
	isExpired,
	isExpiringSoon,
	daysUntilExpiry
} from './storage.js'

export const ASSISTANT_HELP_TEXT =
	'我是 AI 小助手。你可以和我聊天，问眼睛保护、白内障、青光眼、干眼等基础知识。也可以说：帮我识别药品，打开日历，打开药箱，找布洛芬在哪里，打开设置，或者检查过期药。'

function normalize(text) {
	return String(text || '')
		.toLowerCase()
		.replace(/[，。！？、,.!?；;：:\s]/g, '')
		.replace(/小助手|助手|帮我|请|麻烦|一下|这个|那个/g, '')
}

function hasAny(text, words) {
	return words.some((word) => text.indexOf(word) >= 0)
}

export function normalizeCommand(text) {
	return normalize(text)
}

export function matchMedicineFromText(text, medicines = getAllMedicines()) {
	const spoken = normalize(text)
	if (!spoken) return null

	let hit = medicines.find((m) => {
		const name = normalize(m.name)
		return spoken.indexOf(name) >= 0 || name.indexOf(spoken) >= 0
	})
	if (hit) return hit

	let best = null
	let bestScore = 0
	medicines.forEach((m) => {
		const name = normalize(m.name)
		let score = 0
		for (const ch of name) {
			if (spoken.indexOf(ch) >= 0) score++
		}
		if (score > bestScore) {
			bestScore = score
			best = m
		}
	})

	return bestScore >= 2 ? best : null
}

export function medicineLocationText(medicine) {
	if (!medicine) return ''
	const expiredWarn = isExpired(medicine) ? '注意，此药已过期，请勿服用。' : ''
	if (medicine.slot) {
		return medicine.name + ' 放在 ' + medicine.slot + ' 号格子。' + expiredWarn
	}
	return medicine.name + ' 还没有设置存放格子。请在药品详情页设置。' + expiredWarn
}

export function expirySummaryText(medicines = getAllMedicines()) {
	const expired = medicines.filter((m) => isExpired(m))
	const soon = medicines.filter((m) => !isExpired(m) && isExpiringSoon(m))

	if (!expired.length && !soon.length) {
		return '药箱里暂时没有过期或即将过期的药。'
	}

	const parts = []
	if (expired.length) {
		parts.push('已过期药品有，' + expired.map((m) => m.name).join('、') + '。请勿服用。')
	}
	if (soon.length) {
		parts.push('即将过期药品有，' + soon.map((m) => m.name + '，还剩' + daysUntilExpiry(m) + '天').join('；') + '。')
	}
	return parts.join('')
}

export function resolveAssistantIntent(text, context = {}) {
	const rawCommand = String(text || '').toLowerCase().replace(/[，。！？、,.!?；;：:\s]/g, '')
	const command = normalize(text)
	const medicines = context.medicines || getAllMedicines()

	if (!command) return { type: 'unknown' }

	if (
		(rawCommand.indexOf('小助手') >= 0 || rawCommand.indexOf('ai助手') >= 0 || rawCommand.indexOf('ai小助手') >= 0) &&
		hasAny(rawCommand, ['打开', '进入', '去'])
	) {
		return { type: 'openAssistant' }
	}

	if (hasAny(command, ['帮助', '怎么用', '你会什么', '可以做什么', '说明'])) {
		return { type: 'help' }
	}

	if (hasAny(command, ['首页', '主页', '主页面', '回首页', '回主页'])) {
		return { type: 'openHome' }
	}

	if (hasAny(command, ['添加服药计划', '新增服药计划', '设置服药计划', '添加吃药提醒', '设置吃药提醒', '添加提醒'])) {
		return { type: 'addSchedule' }
	}

	if (hasAny(command, ['日历', '服药日历', '服药计划', '吃药计划', '提醒日历', '吃药安排'])) {
		return { type: 'openCalendar' }
	}

	if (hasAny(command, ['小助手页面'])) {
		return { type: 'openAssistant' }
	}

	if (hasAny(command, ['保存', '存到药箱', '加入药箱', '放进药箱'])) {
		return { type: 'save' }
	}

	if (hasAny(command, ['重复', '再读', '再说', '重新朗读', '读一遍'])) {
		return { type: 'repeat' }
	}

	if (hasAny(command, ['设置', '语速', 'nfc', '震动'])) {
		return { type: 'openSettings' }
	}

	if (hasAny(command, ['药箱', '药盒', '我的药', '药品列表'])) {
		return { type: 'openCabinet' }
	}

	if (hasAny(command, ['过期', '临期', '快到期', '检查药'])) {
		return { type: 'expiryCheck' }
	}

	const medicine = matchMedicineFromText(command, medicines)
	if (medicine && hasAny(command, ['找', '在哪', '哪里', '位置', '格子', '放哪'])) {
		return { type: 'findMedicine', medicine }
	}

	if (hasAny(command, ['找药', '找一个药', '找某个药'])) {
		return { type: 'openFinder' }
	}

	if (hasAny(command, ['重新识别', '再识别', '重扫', '再扫', '重新扫描'])) {
		return { type: 'restartScan' }
	}

	if (hasAny(command, ['识别', '扫描', '拍照', '看看', '开始'])) {
		return { type: 'capture' }
	}

	if (medicine) {
		return { type: 'findMedicine', medicine }
	}

	return { type: 'unknown' }
}
