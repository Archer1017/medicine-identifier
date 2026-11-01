/**
 * 百度语音识别（ASR）服务。
 *
 * 用于「语音说出药名找药」：录一段音 → 送百度识别 → 返回文字。
 * 复用 ocrConfig.js 里的百度账号（同一个应用可同时开 OCR + 语音）。
 *
 * ⚠️ 说明：
 * - 百度语音识别要求音频格式 pcm/wav/amr，采样率 16000。
 *   uni 的录音各端默认格式不同，App 端可指定 format 'wav'。
 * - H5 端浏览器录音格式受限，跨域也需代理；建议语音找药在手机 App 端用。
 * - 未配置 Key 或识别失败时，上层会自动降级到“列表选择”找药，不会卡死。
 */

import { BAIDU_OCR, OCR_PROXY } from './ocrConfig.js'

const TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token'
const ASR_URL = 'https://vop.baidu.com/server_api'

let cachedToken = null
let tokenExpireAt = 0

function fetchToken() {
	return new Promise((resolve, reject) => {
		if (cachedToken && Date.now() < tokenExpireAt) {
			resolve(cachedToken)
			return
		}
		uni.request({
			url: TOKEN_URL,
			method: 'GET',
			data: {
				grant_type: 'client_credentials',
				client_id: BAIDU_OCR.apiKey,
				client_secret: BAIDU_OCR.secretKey
			},
			success: (res) => {
				const data = res.data || {}
				if (data.access_token) {
					cachedToken = data.access_token
					tokenExpireAt = Date.now() + (data.expires_in - 86400) * 1000
					resolve(cachedToken)
				} else {
					reject(new Error('获取百度 token 失败'))
				}
			},
			fail: () => reject(new Error('token 请求失败'))
		})
	})
}

export function isConfigured() {
	return (
		BAIDU_OCR.apiKey &&
		BAIDU_OCR.apiKey.indexOf('在此填入') < 0 &&
		BAIDU_OCR.secretKey &&
		BAIDU_OCR.secretKey.indexOf('在此填入') < 0
	)
}

/** 录音文件转 base64（App 端用 plus 文件系统） */
function audioToBase64(filePath) {
	return new Promise((resolve, reject) => {
		// #ifdef APP-PLUS
		try {
			plus.io.resolveLocalFileSystemURL(filePath, (entry) => {
				entry.file((file) => {
					const reader = new plus.io.FileReader()
					reader.onloadend = (e) => {
						const r = e.target.result || ''
						resolve({ base64: r.substring(r.indexOf(',') + 1), size: file.size })
					}
					reader.onerror = () => reject(new Error('读取录音失败'))
					reader.readAsDataURL(file)
				}, () => reject(new Error('读取录音对象失败')))
			}, () => reject(new Error('定位录音文件失败')))
			return
		} catch (e) {
			reject(e)
			return
		}
		// #endif

		// 其它端
		try {
			const fs = uni.getFileSystemManager && uni.getFileSystemManager()
			if (fs) {
				fs.readFile({
					filePath: filePath,
					encoding: 'base64',
					success: (r) => resolve({ base64: r.data, size: 0 }),
					fail: () => reject(new Error('读取录音失败'))
				})
				return
			}
		} catch (e) {}
		reject(new Error('当前端不支持录音转码'))
	})
}

/**
 * 识别一段录音，返回识别到的文字。
 * @param {string} filePath 录音文件路径
 * @param {number} durationMs 录音时长（毫秒，百度需要用它推算 speech 长度，可选）
 */
export async function recognizeAudio(filePath, durationMs) {
	if (OCR_PROXY.useProxy) {
		// 走自建后端代理（H5 上线用）
		const { base64 } = await audioToBase64(filePath)
		return proxyRecognize(base64)
	}

	const token = await fetchToken()
	const { base64 } = await audioToBase64(filePath)

	return new Promise((resolve, reject) => {
		uni.request({
			url: ASR_URL,
			method: 'POST',
			header: { 'content-type': 'application/json' },
			data: {
				format: 'wav', // App 端录音指定为 wav
				rate: 16000,
				channel: 1,
				cuid: 'yaopin_app',
				token: token,
				dev_pid: 1537, // 普通话（含标点）
				speech: base64
				// len 由服务端根据 speech 推断，省略
			},
			success: (res) => {
				const data = res.data || {}
				if (data.err_no === 0 && data.result && data.result.length) {
					resolve(data.result[0])
				} else {
					reject(new Error('语音识别失败：' + (data.err_msg || '未知错误')))
				}
			},
			fail: () => reject(new Error('语音识别请求失败'))
		})
	})
}

function proxyRecognize(base64) {
	return new Promise((resolve, reject) => {
		uni.request({
			url: OCR_PROXY.proxyBase.replace(/\/ocr$/, '/asr'),
			method: 'POST',
			data: { speech: base64, format: 'wav', rate: 16000 },
			success: (res) => {
				const data = res.data || {}
				if (typeof data.text === 'string') resolve(data.text)
				else if (data.result && data.result.length) resolve(data.result[0])
				else reject(new Error('代理返回格式不正确'))
			},
			fail: () => reject(new Error('语音代理请求失败'))
		})
	})
}
