/**
 * 全局自动旁白。
 *
 * 启动后默认开启。页面 onShow 后延迟收集当前页可读内容：
 * - H5：优先从 DOM 读取 aria-label、按钮、输入框和可见文字。
 * - App：页面可提供 getNarrationText()，保证原生端也能读完整页面内容。
 */

import * as tts from './tts.js'

const KEY = 'app_narrator_enabled'
const READ_DELAY = 900
const MAX_SEGMENT_LEN = 72
const VO_ENHANCE_DELAY = 80
const MAX_LABEL_LEN = 32

let enabled = true
let timer = null
let lastSignature = ''
let lastAt = 0
let voiceOverObserver = null
let voiceOverTimer = null

function cleanText(text) {
	return String(text || '')
		.replace(/\s+/g, ' ')
		.replace(/[✓›]/g, '')
		.trim()
}

function uniqueLines(lines) {
	const out = []
	const seen = new Set()
	lines.forEach((line) => {
		const text = cleanText(line)
		if (!text || text === '—') return
		const key = text.replace(/[，。,. ]/g, '')
		if (seen.has(key)) return
		seen.add(key)
		out.push(text)
	})
	return out
}

function conciseText(text) {
	let value = cleanText(text)
	if (!value) return ''
	const directRules = [
		[/打开.*日历/, '打开日历'],
		[/打开.*药箱|打开.*药盒/, '打开药箱'],
		[/打开.*设置/, '打开设置'],
		[/打开.*小助手|AI小助手/, 'AI小助手'],
		[/保存.*服药计划|保存.*计划/, '保存计划'],
		[/保存.*药箱/, '保存到药箱'],
		[/重新.*扫描|重新.*识别/, '重新扫描'],
		[/重复.*朗读/, '重复朗读'],
		[/立即.*拍照|拍照识别/, '拍照识别'],
		[/朗读.*摆放提示|摆放提示/, '摆放提示'],
		[/语音.*填写.*计划/, '语音填写计划'],
		[/语音.*助手/, '语音助手'],
		[/发送.*文字|发送.*输入框/, '发送'],
		[/取消.*编辑|取消.*删除|取消/, '取消'],
		[/确认.*删除/, '确认删除'],
		[/删除.*药品/, '删除药品'],
		[/设置.*格子|修改.*格子/, '设置格子'],
		[/详情/, '查看详情'],
		[/绑定.*NFC|重新绑定.*NFC/, '绑定NFC'],
		[/设置.*提醒|添加.*提醒/, '设置提醒'],
		[/按药品/, '按药品浏览'],
		[/按格子/, '按格子浏览']
	]
	for (const [rule, replacement] of directRules) {
		if (rule.test(value)) return replacement
	}
	value = value
		.replace(/双击可?/g, '')
		.replace(/按住按钮/g, '按住')
		.replace(/可以/g, '')
		.replace(/当前已选中/g, '已选中')
		.replace(/当前/g, '')
		.replace(/，双击.*$/g, '')
		.replace(/。双击.*$/g, '')
		.replace(/，右侧.*$/g, '')
		.replace(/。右侧.*$/g, '')
		.replace(/，输入完成后.*$/g, '')
		.replace(/。输入完成后.*$/g, '')
		.replace(/，包括.*$/g, '')
		.replace(/。包括.*$/g, '')
		.replace(/，可以.*$/g, '')
		.replace(/。可以.*$/g, '')
	if (value.indexOf('，') >= 0 && value.length > MAX_LABEL_LEN) {
		value = value.split('，')[0]
	}
	if (value.indexOf('。') >= 0 && value.length > MAX_LABEL_LEN) {
		value = value.split('。')[0]
	}
	return cleanText(value)
}

function splitForSpeech(text) {
	const source = cleanText(text)
	if (!source) return []
	const pieces = []
	let buffer = ''
	for (const ch of source) {
		buffer += ch
		if ('。！？!?；;，'.indexOf(ch) >= 0) {
			const piece = cleanText(buffer)
			if (piece) pieces.push(piece)
			buffer = ''
		}
	}
	if (buffer) pieces.push(cleanText(buffer))
	const segments = []
	let current = ''
	pieces.forEach((piece) => {
		if ((current + piece).length > MAX_SEGMENT_LEN) {
			if (current) segments.push(current)
			current = piece
		} else {
			current += piece
		}
	})
	if (current) segments.push(current)
	return segments
}

function callMaybe(fn, ctx) {
	try {
		return typeof fn === 'function' ? fn.call(ctx) : ''
	} catch (e) {
		console.error('auto narrator getter error', e)
		return ''
	}
}

function fallbackPageText(vm) {
	if (!vm) return ''
	if (typeof vm.getNarrationText === 'function') return callMaybe(vm.getNarrationText, vm)

	const keys = [
		'pageSummary',
		'homeSummary',
		'monthSummary',
		'cabinetSummary',
		'finderSummary',
		'selectedSummary',
		'statusPanelLabel',
		'statusText'
	]
	const lines = []
	keys.forEach((key) => {
		const value = vm[key]
		if (typeof value === 'string') lines.push(value)
	})
	return uniqueLines(lines).map(conciseText).join('。')
}

// #ifdef H5
const DESCRIPTION_CLASS_RE = /(copy|sub|hint|status|title|label|value|headline|eyebrow|empty|meta|name|count|number|kicker|summary|section|message|role|text|caption|weekday|day-count|day-number|dose|slot|row)/i

function isHidden(el) {
	if (!el || el.nodeType !== 1) return false
	if (el.getAttribute('aria-hidden') === 'true') return true
	if (el.hidden) return true
	try {
		const style = window.getComputedStyle(el)
		return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0
	} catch (e) {
		return false
	}
}

function isNativeInteractive(el) {
	if (!el || el.nodeType !== 1) return false
	const tag = (el.tagName || '').toLowerCase()
	return tag === 'button' || tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'a'
}

function isInteractive(el) {
	if (!el || el.nodeType !== 1) return false
	const tag = (el.tagName || '').toLowerCase()
	const role = el.getAttribute('role')
	return isNativeInteractive(el) || role === 'button' || role === 'tab' || role === 'switch' || role === 'alert'
}

function closestInteractive(el) {
	let node = el && el.parentElement
	let depth = 0
	while (node && depth < 8) {
		if (isInteractive(node)) return node
		node = node.parentElement
		depth++
	}
	return null
}

function elementReadableText(el) {
	if (!el || el.nodeType !== 1) return ''
	const label = cleanText(el.getAttribute('aria-label'))
	if (label) return conciseText(label)
	const tag = (el.tagName || '').toLowerCase()
	if (tag === 'input' || tag === 'textarea') {
		return conciseText(el.value || el.getAttribute('placeholder') || el.getAttribute('title'))
	}
	return conciseText(el.innerText || el.textContent || el.getAttribute('title'))
}

function ensureRoleButtonKeyboard(el) {
	if (!el || el.__voiceOverKeyHandler || el.getAttribute('role') !== 'button') return
	el.__voiceOverKeyHandler = true
	el.addEventListener('keydown', (event) => {
		const key = event.key
		if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') return
		event.preventDefault()
		try { el.click() } catch (e) {}
	})
}

function enhanceInteractiveElement(el) {
	if (!el || el.nodeType !== 1 || isHidden(el)) return
	const text = elementReadableText(el)
	if (text && !el.getAttribute('aria-labelledby')) {
		el.setAttribute('aria-label', text)
	}
	if (!isNativeInteractive(el) && !el.hasAttribute('tabindex')) {
		el.setAttribute('tabindex', '0')
	}
	if (el.getAttribute('role') === 'button') ensureRoleButtonKeyboard(el)
	if (el.hasAttribute('disabled')) el.setAttribute('aria-disabled', 'true')
}

function shouldEnhanceDescription(el) {
	if (!el || el.nodeType !== 1 || isHidden(el) || isInteractive(el) || closestInteractive(el)) return false
	const tag = (el.tagName || '').toLowerCase()
	if (tag === 'script' || tag === 'style' || tag === 'template') return false
	const text = elementReadableText(el)
	if (!text || text.length > 80) return false
	const className = String(el.getAttribute('class') || '')
	if (DESCRIPTION_CLASS_RE.test(className)) return true
	return tag === 'uni-text' || tag === 'text' || tag === 'p' || tag === 'span' || tag === 'label'
}

function enhanceDescriptionElement(el) {
	const text = elementReadableText(el)
	if (!text) return
	if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', text)
	if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0')
	if (!el.getAttribute('role')) el.setAttribute('role', 'text')
	el.setAttribute('data-voiceover-readable', 'true')
}

function enhanceVoiceOverDom(root) {
	if (typeof document === 'undefined') return
	const scope = root && root.querySelectorAll ? root : document.body
	if (!scope) return
	try {
		document.documentElement.setAttribute('lang', 'zh-CN')
		document.documentElement.setAttribute('dir', 'ltr')
	} catch (e) {}

	const interactiveSelector = 'button,input,textarea,select,a,[role="button"],[role="tab"],[role="switch"],[role="alert"],[aria-label]'
	Array.from(scope.querySelectorAll(interactiveSelector) || []).forEach((el) => {
		if (isInteractive(el) || isNativeInteractive(el)) enhanceInteractiveElement(el)
	})

	Array.from(scope.querySelectorAll('uni-text,text,p,span,label,view,uni-view,div') || []).forEach((el) => {
		if (shouldEnhanceDescription(el)) enhanceDescriptionElement(el)
	})
}

function scheduleVoiceOverDomEnhance(root) {
	if (typeof document === 'undefined') return
	if (voiceOverTimer) clearTimeout(voiceOverTimer)
	voiceOverTimer = setTimeout(() => {
		voiceOverTimer = null
		enhanceVoiceOverDom(root || document.body)
	}, VO_ENHANCE_DELAY)
}

function initVoiceOverDomEnhancer() {
	if (typeof document === 'undefined') return
	scheduleVoiceOverDomEnhance(document.body)
	if (voiceOverObserver) return
	try {
		voiceOverObserver = new MutationObserver(() => scheduleVoiceOverDomEnhance(document.body))
		voiceOverObserver.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['class', 'style', 'aria-label', 'role']
		})
	} catch (e) {}
}

function extractNodeText(node, lines) {
	if (!node) return
	if (node.nodeType === 3) {
		const text = conciseText(node.textContent)
		if (text) lines.push(text)
		return
	}
	if (node.nodeType !== 1) return

	const el = node
	if (isHidden(el)) return
	const tag = (el.tagName || '').toLowerCase()
	if (tag === 'script' || tag === 'style') return

	const label = cleanText(el.getAttribute('aria-label'))
	if (label && isInteractive(el)) {
		lines.push(conciseText(label))
		return
	}

	if (tag === 'input' || tag === 'textarea') {
		const value = cleanText(el.value)
		const placeholder = cleanText(el.getAttribute('placeholder'))
		lines.push(conciseText(label || value || placeholder))
		return
	}

	Array.from(el.childNodes || []).forEach((child) => extractNodeText(child, lines))
}

function h5PageText(vm) {
	const root = (vm && vm.$el) || document.querySelector('.page-container') || document.body
	const lines = []
	extractNodeText(root, lines)
	return uniqueLines(lines).join('。')
}
// #endif

function pageText(vm) {
	let text = ''
	// #ifdef H5
	text = h5PageText(vm)
	// #endif
	if (!text) text = fallbackPageText(vm)
	return text
}

export function initAppNarrator() {
	try {
		const saved = uni.getStorageSync(KEY)
		if (saved === false) enabled = false
		else uni.setStorageSync(KEY, true)
	} catch (e) {
		enabled = true
	}
	if (enabled) {
		// #ifdef H5
		initVoiceOverDomEnhancer()
		// #endif
		setTimeout(() => {
			tts.speak('旁白已开启。进入每个页面后，我会自动朗读页面内容。')
		}, 600)
	}
}

export function setAppNarratorEnabled(next) {
	enabled = !!next
	try { uni.setStorageSync(KEY, enabled) } catch (e) {}
	if (!enabled) tts.stop()
}

export function isAppNarratorEnabled() {
	return enabled
}

export function schedulePageNarration(vm, delay = READ_DELAY) {
	if (!enabled) return
	// #ifdef H5
	scheduleVoiceOverDomEnhance(vm && vm.$el)
	// #endif
	if (timer) clearTimeout(timer)
	timer = setTimeout(() => {
		timer = null
		narratePage(vm)
	}, delay)
}

export function cancelPageNarration() {
	if (timer) {
		clearTimeout(timer)
		timer = null
	}
}

export function narratePage(vm) {
	if (!enabled) return
	const text = pageText(vm)
	if (!text) return
	const signature = cleanText(text).slice(0, 240)
	const now = Date.now()
	if (signature === lastSignature && now - lastAt < 1500) return
	lastSignature = signature
	lastAt = now
	const segments = splitForSpeech(text)
	if (segments.length) tts.speakSegments(segments)
}

export function createPageNarratorMixin() {
	return {
		onShow() {
			schedulePageNarration(this)
		},
		onHide() {
			cancelPageNarration()
		},
		onUnload() {
			cancelPageNarration()
		}
	}
}
