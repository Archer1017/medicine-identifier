/**
 * 浏览器语音识别封装。
 *
 * 不需要应用侧 API Key。可用性取决于浏览器是否提供 SpeechRecognition。
 */

export function isSpeechRecognitionAvailable() {
	if (typeof window === 'undefined') return false
	return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function createSpeechRecognition({ onResult, onError, onEnd } = {}) {
	if (!isSpeechRecognitionAvailable()) return null
	const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
	const recognition = new SpeechRecognition()
	recognition.lang = 'zh-CN'
	recognition.continuous = false
	recognition.interimResults = false
	recognition.maxAlternatives = 1
	recognition.onresult = (event) => {
		const text = event.results && event.results[0] && event.results[0][0]
			? event.results[0][0].transcript
			: ''
		if (typeof onResult === 'function') onResult(text)
	}
	recognition.onerror = (event) => {
		if (typeof onError === 'function') onError(event)
	}
	recognition.onend = () => {
		if (typeof onEnd === 'function') onEnd()
	}
	return recognition
}
