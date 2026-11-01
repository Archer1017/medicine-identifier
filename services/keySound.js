/**
 * 全局按键音。
 *
 * 目标：所有按钮、可点击控件、键盘按键按下时都有即时声音反馈。
 * 这个声音很短，不打断 TTS 语音旁白。
 */

let installed = false
let lastPlayAt = 0
let audioCtx = null

export function initKeySound() {
	if (installed) return
	installed = true

	// #ifdef H5
	if (typeof document !== 'undefined') {
		document.addEventListener('pointerdown', handlePointerDown, true)
		document.addEventListener('keydown', handleKeyDown, true)
	}
	// #endif
}

function handlePointerDown(event) {
	const target = event && event.target
	if (isInteractive(target)) playKeySound()
}

function handleKeyDown(event) {
	const key = event && event.key
	if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
		playKeySound()
	}
}

function isInteractive(node) {
	let el = node
	let depth = 0
	while (el && depth < 5) {
		const tag = String(el.tagName || '').toLowerCase()
		const role = el.getAttribute && el.getAttribute('role')
		if (
			tag === 'button' ||
			tag === 'input' ||
			tag === 'textarea' ||
			tag === 'select' ||
			role === 'button' ||
			role === 'tab' ||
			role === 'switch'
		) {
			return true
		}
		el = el.parentNode
		depth++
	}
	return false
}

export function playKeySound() {
	const now = Date.now()
	if (now - lastPlayAt < 80) return
	lastPlayAt = now

	// #ifdef H5
	playWebBeep()
	return
	// #endif

	try {
		uni.vibrateShort({ fail: () => {} })
	} catch (e) {}
}

function playWebBeep() {
	try {
		const AudioContext = window.AudioContext || window.webkitAudioContext
		if (!AudioContext) return
		if (!audioCtx) audioCtx = new AudioContext()
		if (audioCtx.state === 'suspended') audioCtx.resume()

		const osc = audioCtx.createOscillator()
		const gain = audioCtx.createGain()
		osc.type = 'sine'
		osc.frequency.value = 880
		gain.gain.setValueAtTime(0.0001, audioCtx.currentTime)
		gain.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.008)
		gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.07)
		osc.connect(gain)
		gain.connect(audioCtx.destination)
		osc.start()
		osc.stop(audioCtx.currentTime + 0.08)
	} catch (e) {}
}
