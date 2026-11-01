/**
 * NFC 读写服务。
 *
 * ⚠️ 平台约束：NFC 仅在 App（plus）真机可用，H5/小程序不支持。
 * uni-app App 端可通过 plus.nfc（部分基座）或 uni 插件市场的 NFC 插件读写。
 * 这里封装 Android 的 plus 原生调用思路，并对不支持的端做降级。
 *
 * 对外接口：
 * - isAvailable()          是否支持 NFC
 * - readTagId()            读取一次标签 UID（Promise<string|null>）
 * - writeMedicineId(id)    写入药品 id 到标签（Promise<bool>）
 * - initNfcListener()      App 启动时注册后台标签监听，碰触即跳转播报
 */

export function isAvailable() {
	// #ifdef APP-PLUS
	try {
		if (typeof plus !== 'undefined' && plus.os.name === 'Android') {
			const NfcAdapter = plus.android.importClass('android.nfc.NfcAdapter')
			const main = plus.android.runtimeMainActivity()
			const adapter = NfcAdapter.getDefaultAdapter(main)
			return !!(adapter && adapter.isEnabled())
		}
	} catch (e) {
		console.error('NFC isAvailable error', e)
	}
	// #endif
	return false
}

/**
 * 读取一次标签 UID。
 * App 端通过 foreground dispatch 监听到的 Intent 中解析标签 ID。
 * 简化实现：借助 initNfcListener 已注册的监听，读取最近一次标签。
 */
let lastTagId = null
let tagResolvers = []

export function readTagId(timeout = 20000) {
	return new Promise((resolve) => {
		// #ifdef APP-PLUS
		if (!isAvailable()) {
			resolve(null)
			return
		}
		let done = false
		const resolver = (id) => {
			if (done) return
			done = true
			resolve(id)
		}
		tagResolvers.push(resolver)
		setTimeout(() => {
			// 超时
			const idx = tagResolvers.indexOf(resolver)
			if (idx >= 0) tagResolvers.splice(idx, 1)
			resolver(null)
		}, timeout)
		return
		// #endif
		// 非 App 端不支持
		resolve(null)
	})
}

/**
 * 把药品 id 以文本写入标签。返回是否成功。
 * 需要标签处于可写状态；实际写入通过 plus 的 NDEF API。
 */
export function writeMedicineId(medicineId) {
	return new Promise((resolve) => {
		// #ifdef APP-PLUS
		try {
			// 真机写入需拿到当前 Tag 对象并构造 NdefMessage。
			// 不同基座 API 略有差异，此处留统一接口，接入插件后实现。
			console.warn('NFC 写入需接入原生实现，当前仅绑定 UID 即可定位')
			resolve(false)
			return
		} catch (e) {
			console.error('writeMedicineId error', e)
			resolve(false)
			return
		}
		// #endif
		resolve(false)
	})
}

/** 从 Intent 解析标签 UID，转十六进制大写字符串 */
function parseTagId(intent) {
	try {
		const NfcAdapter = plus.android.importClass('android.nfc.NfcAdapter')
		plus.android.importClass('android.nfc.Tag')
		const tag = intent.getParcelableExtra(NfcAdapter.EXTRA_TAG)
		if (!tag) return null
		const idBytes = tag.getId()
		let hex = ''
		for (let i = 0; i < idBytes.length; i++) {
			let b = idBytes[i] & 0xff
			hex += ('0' + b.toString(16)).slice(-2)
		}
		return hex.toUpperCase()
	} catch (e) {
		console.error('parseTagId error', e)
		return null
	}
}

/** 处理一次标签发现：通知等待中的 readTagId，或跳转播报页 */
function onTagDiscovered(tagId) {
	if (!tagId) return
	lastTagId = tagId
	// 优先满足正在等待读取的调用（绑定流程）
	if (tagResolvers.length > 0) {
		const resolvers = tagResolvers.slice()
		tagResolvers = []
		resolvers.forEach((r) => r(tagId))
		return
	}
	// 否则视为“碰触播报”场景，跳到结果页
	uni.navigateTo({
		url: '/pages/nfc-result/nfc-result?tagId=' + encodeURIComponent(tagId)
	})
}

/** App 启动注册前台标签监听 */
export function initNfcListener() {
	// #ifdef APP-PLUS
	try {
		if (typeof plus === 'undefined' || plus.os.name !== 'Android') return
		const main = plus.android.runtimeMainActivity()
		const NfcAdapter = plus.android.importClass('android.nfc.NfcAdapter')
		const adapter = NfcAdapter.getDefaultAdapter(main)
		if (!adapter) return

		// 监听新到的 NFC Intent（前台派发）
		main.onNewIntent = function(intent) {
			const action = intent.getAction()
			if (
				action === NfcAdapter.ACTION_NDEF_DISCOVERED ||
				action === NfcAdapter.ACTION_TECH_DISCOVERED ||
				action === NfcAdapter.ACTION_TAG_DISCOVERED
			) {
				const id = parseTagId(intent)
				onTagDiscovered(id)
			}
		}
		// 处理冷启动 Intent
		const launchIntent = main.getIntent()
		if (launchIntent) {
			const action = launchIntent.getAction()
			if (action && action.indexOf('android.nfc') === 0) {
				const id = parseTagId(launchIntent)
				if (id) setTimeout(() => onTagDiscovered(id), 800)
			}
		}
	} catch (e) {
		console.error('initNfcListener error', e)
	}
	// #endif
}
