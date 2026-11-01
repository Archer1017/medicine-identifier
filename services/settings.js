/**
 * 用户偏好设置服务。
 * 记住语速、提醒方式、NFC 开关。使用 uni.storage 持久化。
 */

const KEY = 'user_settings'

// 语速档位对应 TTS speed / rate 值
export const SPEECH_RATE = {
	slow: { label: '慢', value: 0.7 },
	medium: { label: '中', value: 1.0 },
	fast: { label: '快', value: 1.4 }
}

const defaults = {
	speechRate: 'medium', // slow | medium | fast
	reminderMode: 'voiceAndVibration', // voiceAndVibration | voiceOnly
	nfcEnabled: true
}

let current = Object.assign({}, defaults)

export function loadSettings() {
	try {
		const saved = uni.getStorageSync(KEY)
		if (saved && typeof saved === 'object') {
			current = Object.assign({}, defaults, saved)
		}
	} catch (e) {
		console.error('loadSettings error', e)
	}
	return current
}

export function getSettings() {
	return current
}

export function updateSettings(patch) {
	current = Object.assign({}, current, patch)
	try {
		uni.setStorageSync(KEY, current)
	} catch (e) {
		console.error('updateSettings error', e)
	}
	return current
}

/** 当前语速对应的 TTS 速率值 */
export function getTtsRate() {
	return (SPEECH_RATE[current.speechRate] || SPEECH_RATE.medium).value
}

export function getSpeechRateLabel() {
	return (SPEECH_RATE[current.speechRate] || SPEECH_RATE.medium).label
}

/** 提醒是否含震动 */
export function vibrationEnabled() {
	return current.reminderMode === 'voiceAndVibration'
}
