/**
 * 语音合成（TTS）服务。
 *
 * 跨端策略：
 * - H5：使用浏览器 window.speechSynthesis（中文，可调语速）
 * - App（plus）：优先用原生 TTS（Android 通过 plus.android 调 TextToSpeech，
 *   iOS 通过 plus.ios 调 AVSpeechSynthesizer）。此处给出 Android 实现，
 *   iOS 留接口；也可换成 uni 插件市场的 TTS 插件。
 * - 小程序：多数不支持本地 TTS，降级为不发声（仅震动+文字）。
 *
 * 对上层暴露统一接口：speak / speakSegments / repeat / stop / nextSegment。
 */

import { getTtsRate } from './settings.js'

let lastSpoken = '' // 供“重复”指令
let segments = []
let segmentIndex = 0

// ---------------- 平台实现 ----------------

// #ifdef H5
function h5Speak(text, rate) {
	if (typeof window === 'undefined' || !window.speechSynthesis) return
	const u = new window.SpeechSynthesisUtterance(text)
	u.lang = 'zh-CN'
	u.rate = rate
	window.speechSynthesis.speak(u)
}

function h5Stop() {
	if (typeof window !== 'undefined' && window.speechSynthesis) {
		window.speechSynthesis.cancel()
	}
}
// #endif

// #ifdef APP-PLUS
let androidTts = null
let androidTtsReady = false
let iosSynthesizer = null

function ensureAndroidTts() {
	if (androidTts || typeof plus === 'undefined' || plus.os.name !== 'Android') return
	try {
		const Locale = plus.android.importClass('java.util.Locale')
		const TextToSpeech = plus.android.importClass('android.speech.tts.TextToSpeech')
		const main = plus.android.runtimeMainActivity()
		androidTts = new TextToSpeech(main, {
			onInit: function(status) {
				androidTtsReady = true
				try { androidTts.setLanguage(Locale.CHINESE) } catch (e) {}
			}
		})
	} catch (e) {
		console.error('Android TTS init error', e)
	}
}

function appSpeak(text, rate, queueMode) {
	if (typeof plus === 'undefined') return
	if (plus.os.name === 'Android') {
		ensureAndroidTts()
		if (androidTts) {
			try {
				androidTts.setSpeechRate(rate)
				// QUEUE_FLUSH = 0；QUEUE_ADD = 1
				androidTts.speak(text, queueMode === 'add' ? 1 : 0, null, 'utteranceId')
			} catch (e) {
				console.error('Android speak error', e)
			}
		}
	} else if (plus.os.name === 'iOS') {
		try {
			const AVSpeechSynthesizer = plus.ios.importClass('AVSpeechSynthesizer')
			const AVSpeechUtterance = plus.ios.importClass('AVSpeechUtterance')
			const AVSpeechSynthesisVoice = plus.ios.importClass('AVSpeechSynthesisVoice')
			if (!iosSynthesizer) iosSynthesizer = new AVSpeechSynthesizer()
			if (queueMode !== 'add') {
				try { iosSynthesizer.stopSpeakingAtBoundary(0) } catch (e) {}
			}
			const utterance = AVSpeechUtterance.speechUtteranceWithString(text)
			utterance.setVoice(AVSpeechSynthesisVoice.voiceWithLanguage('zh-CN'))
			utterance.setRate(Math.max(0.35, Math.min(0.6, rate * 0.5)))
			iosSynthesizer.speakUtterance(utterance)
		} catch (e) {
			console.error('iOS speak error', e)
		}
	}
}

function appStop() {
	if (typeof plus !== 'undefined' && plus.os.name === 'Android' && androidTts) {
		try { androidTts.stop() } catch (e) {}
	}
	if (typeof plus !== 'undefined' && plus.os.name === 'iOS' && iosSynthesizer) {
		try { iosSynthesizer.stopSpeakingAtBoundary(0) } catch (e) {}
	}
}
// #endif

// ---------------- 统一分发 ----------------

function platformSpeak(text) {
	const rate = getTtsRate()
	// #ifdef H5
	h5Speak(text, rate)
	return
	// #endif
	// #ifdef APP-PLUS
	appSpeak(text, rate, 'flush')
	return
	// #endif
	// 其它端（小程序）降级：无本地 TTS
	console.log('[TTS 降级] ' + text)
}

function platformStop() {
	// #ifdef H5
	h5Stop()
	return
	// #endif
	// #ifdef APP-PLUS
	appStop()
	return
	// #endif
}

// ---------------- 对外接口 ----------------

/** 朗读一段（会打断当前朗读），记入“可重复” */
export function speak(text) {
	if (!text || !text.trim()) return
	lastSpoken = text
	platformStop()
	platformSpeak(text)
}

/** 朗读但不记入重复缓存（实时对焦引导语用） */
export function speakTransient(text) {
	if (!text || !text.trim()) return
	platformSpeak(text)
}

/** 重复上一句 */
export function repeat() {
	if (lastSpoken) speak(lastSpoken)
}

/** 停止 */
export function stop() {
	platformStop()
	segments = []
	segmentIndex = 0
}

/**
 * 分段顺序朗读。segs 为字符串数组，逐段播报。
 * H5 的 speechSynthesis 会自动排队；App 端用简单串行。
 */
export function speakSegments(segs) {
	segments = (segs || []).filter((s) => s && s.trim())
	segmentIndex = 0
	lastSpoken = segments.join(' ')
	platformStop()
	// H5 直接把每段依次交给队列
	// #ifdef H5
	segments.forEach((s) => h5Speak(s, getTtsRate()))
	return
	// #endif
	// App 端逐段朗读（原生 TTS 的 QUEUE 由平台管理，这里顺序提交）
	// #ifdef APP-PLUS
	segments.forEach((s, index) => appSpeak(s, getTtsRate(), index === 0 ? 'flush' : 'add'))
	return
	// #endif
	console.log('[TTS 降级] ' + segments.join(' '))
}

/** 跳到下一段 */
export function nextSegment() {
	if (!segments.length) return
	platformStop()
	segmentIndex++
	if (segmentIndex < segments.length) {
		platformSpeak(segments[segmentIndex])
	}
}
