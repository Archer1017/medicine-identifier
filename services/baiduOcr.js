/**
 * 百度云 OCR 客户端。
 *
 * 职责：把一张图片（H5 的 dataURL / App 的本地路径）送到百度 OCR，
 * 返回识别出的纯文本。上层 ocr.js 再拿这段文本做药品库交叉校验。
 *
 * 流程：
 *   1. 用 apiKey + secretKey 换 access_token（有缓存，30 天有效）
 *   2. 图片转 base64
 *   3. 调用文字识别接口，拼接所有行文本返回
 */

import { BAIDU_OCR, OCR_PROXY } from './ocrConfig.js'

const TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token'
const OCR_URL_BASE = 'https://aip.baidubce.com/rest/2.0/ocr/v1/'

let cachedToken = null
let tokenExpireAt = 0

// ---------------- access_token ----------------

function fetchToken() {
	return new Promise((resolve, reject) => {
		// token 未过期直接用
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
					// expires_in 单位秒，提前 1 天过期以防边界
					tokenExpireAt = Date.now() + (data.expires_in - 86400) * 1000
					resolve(cachedToken)
				} else {
					reject(new Error('获取百度 token 失败：' + JSON.stringify(data)))
				}
			},
			fail: (err) => reject(new Error('token 请求失败：' + JSON.stringify(err)))
		})
	})
}

// ---------------- 图片转 base64 ----------------

function imageToBase64(imagePath) {
	return new Promise((resolve, reject) => {
		if (!imagePath) {
			reject(new Error('没有可识别的图片'))
			return
		}

		// H5：dataURL 直接截掉前缀即是 base64
		// #ifdef H5
		if (typeof imagePath === 'string' && imagePath.indexOf('data:') === 0) {
			resolve(imagePath.substring(imagePath.indexOf(',') + 1))
			return
		}
		// #endif

		// App：用文件系统读为 base64
		// #ifdef APP-PLUS
		try {
			plus.io.resolveLocalFileSystemURL(imagePath, (entry) => {
				entry.file((file) => {
					const reader = new plus.io.FileReader()
					reader.onloadend = (e) => {
						const result = e.target.result || ''
						resolve(result.substring(result.indexOf(',') + 1))
					}
					reader.onerror = () => reject(new Error('读取图片失败'))
					reader.readAsDataURL(file)
				}, () => reject(new Error('读取文件对象失败')))
			}, () => reject(new Error('定位图片文件失败')))
			return
		} catch (e) {
			reject(e)
			return
		}
		// #endif

		// 其它端：尝试用 uni 的文件管理器读
		try {
			const fs = uni.getFileSystemManager && uni.getFileSystemManager()
			if (fs) {
				fs.readFile({
					filePath: imagePath,
					encoding: 'base64',
					success: (r) => resolve(r.data),
					fail: () => reject(new Error('读取图片失败'))
				})
				return
			}
		} catch (e) {}
		reject(new Error('当前端不支持图片转码'))
	})
}

// ---------------- 识别 ----------------

/**
 * 识别图片文字。返回 Promise<string>（识别到的整段文本，行以换行分隔）。
 */
export async function recognizeText(imagePath) {
	const base64 = await imageToBase64(imagePath)

	// 走自建后端代理（H5 正式部署推荐）
	if (OCR_PROXY.useProxy) {
		return proxyRecognize(base64)
	}

	const token = await fetchToken()
	const url = OCR_URL_BASE + BAIDU_OCR.recognizeType + '?access_token=' + token

	return new Promise((resolve, reject) => {
		uni.request({
			url: url,
			method: 'POST',
			header: { 'content-type': 'application/x-www-form-urlencoded' },
			data: { image: base64 },
			success: (res) => {
				const data = res.data || {}
				if (data.error_code) {
					reject(new Error('百度 OCR 错误 ' + data.error_code + '：' + data.error_msg))
					return
				}
				const words = (data.words_result || []).map((w) => w.words)
				resolve(words.join('\n'))
			},
			fail: (err) => reject(new Error('OCR 请求失败：' + JSON.stringify(err)))
		})
	})
}

export async function recognizeLayout(imagePath) {
	const base64 = await imageToBase64(imagePath)

	if (OCR_PROXY.useProxy) {
		const text = await proxyRecognize(base64)
		return {
			text,
			lines: String(text || '').split(/\n/).map((line, index) => ({
				text: line.trim(),
				left: 0,
				top: index,
				width: line.length,
				height: 1,
				area: line.length,
				confidence: 0.55
			})).filter((line) => line.text)
		}
	}

	const token = await fetchToken()
	const url = OCR_URL_BASE + BAIDU_OCR.recognizeType + '?access_token=' + token

	return new Promise((resolve, reject) => {
		uni.request({
			url: url,
			method: 'POST',
			header: { 'content-type': 'application/x-www-form-urlencoded' },
			data: { image: base64, recognize_granularity: 'big', vertexes_location: true },
			success: (res) => {
				const data = res.data || {}
				if (data.error_code) {
					reject(new Error('百度 OCR 错误 ' + data.error_code + '：' + data.error_msg))
					return
				}
				const lines = (data.words_result || []).map((w, index) => {
					const loc = w.location || {}
					const text = String(w.words || '').trim()
					const width = Number(loc.width || text.length)
					const height = Number(loc.height || 1)
					return {
						text,
						left: Number(loc.left || 0),
						top: Number(loc.top || index),
						width,
						height,
						area: width * height,
						confidence: w.probability && w.probability.average ? Number(w.probability.average) : 0.65
					}
				}).filter((line) => line.text)
				resolve({ text: lines.map((line) => line.text).join('\n'), lines })
			},
			fail: (err) => reject(new Error('OCR 请求失败：' + JSON.stringify(err)))
		})
	})
}

// 自建后端代理：把 base64 发给你的后端，后端转发百度并回传 { text }
function proxyRecognize(base64) {
	return new Promise((resolve, reject) => {
		uni.request({
			url: OCR_PROXY.proxyBase,
			method: 'POST',
			data: { image: base64, type: BAIDU_OCR.recognizeType },
			success: (res) => {
				const data = res.data || {}
				if (typeof data.text === 'string') resolve(data.text)
				else if (data.words_result) resolve(data.words_result.map((w) => w.words).join('\n'))
				else reject(new Error('代理返回格式不正确'))
			},
			fail: (err) => reject(new Error('代理请求失败：' + JSON.stringify(err)))
		})
	})
}

/** 配置是否已填写 */
export function isConfigured() {
	return (
		BAIDU_OCR.apiKey &&
		BAIDU_OCR.apiKey.indexOf('在此填入') < 0 &&
		BAIDU_OCR.secretKey &&
		BAIDU_OCR.secretKey.indexOf('在此填入') < 0
	)
}
