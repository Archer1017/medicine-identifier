/**
 * OpenAI 视觉识别客户端。
 *
 * 输入：H5 dataURL / App 本地图片路径 / 网络图片 URL。
 * 输出：{ name, rawText, dosage, ingredients, precautions, expiryText, confidence }
 */

import { OPENAI_VISION, OPENAI_PROXY } from './openaiConfig.js'

const RESPONSES_URL = 'https://api.openai.com/v1/responses'

export function isConfigured() {
	if (OPENAI_PROXY.useProxy) return !!OPENAI_PROXY.visionProxyBase
	return (
		OPENAI_VISION.apiKey &&
		OPENAI_VISION.apiKey.indexOf('在此填入') < 0 &&
		OPENAI_VISION.apiKey.indexOf('YOUR_') < 0
	)
}

function imageToDataUrl(imagePath) {
	return new Promise((resolve, reject) => {
		if (!imagePath) {
			reject(new Error('没有可识别的图片'))
			return
		}

		if (typeof imagePath === 'string' && imagePath.indexOf('data:') === 0) {
			resolve(imagePath)
			return
		}

		if (typeof imagePath === 'string' && /^https?:\/\//.test(imagePath)) {
			resolve(imagePath)
			return
		}

		// #ifdef APP-PLUS
		try {
			plus.io.resolveLocalFileSystemURL(imagePath, (entry) => {
				entry.file((file) => {
					const reader = new plus.io.FileReader()
					reader.onloadend = (e) => {
						resolve(e.target.result || '')
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

		try {
			const fs = uni.getFileSystemManager && uni.getFileSystemManager()
			if (fs) {
				fs.readFile({
					filePath: imagePath,
					encoding: 'base64',
					success: (r) => resolve('data:image/jpeg;base64,' + r.data),
					fail: () => reject(new Error('读取图片失败'))
				})
				return
			}
		} catch (e) {}

		reject(new Error('当前端不支持图片读取'))
	})
}

function safeParseJson(text) {
	const source = String(text || '').trim()
	if (!source) throw new Error('OpenAI 未返回识别内容')

	try {
		return JSON.parse(source)
	} catch (e) {
		const start = source.indexOf('{')
		const end = source.lastIndexOf('}')
		if (start >= 0 && end > start) {
			return JSON.parse(source.slice(start, end + 1))
		}
		throw new Error('OpenAI 返回内容不是 JSON')
	}
}

function extractOutputText(data) {
	if (typeof data.output_text === 'string') return data.output_text

	const chunks = []
	;(data.output || []).forEach((item) => {
		;(item.content || []).forEach((content) => {
			if (content.type === 'output_text' && content.text) chunks.push(content.text)
			if (content.type === 'text' && content.text) chunks.push(content.text)
		})
	})
	return chunks.join('\n')
}

function normalizeResult(parsed) {
	const result = parsed || {}
	return {
		name: String(result.name || '').trim(),
		rawText: String(result.rawText || result.raw_text || '').trim(),
		dosage: String(result.dosage || '').trim(),
		ingredients: String(result.ingredients || '').trim(),
		precautions: String(result.precautions || '').trim(),
		expiryText: String(result.expiryText || result.expiry_text || '').trim(),
		confidence: Number(result.confidence || 0)
	}
}

function buildPrompt() {
	return [
		'你是药盒/药瓶图片识别助手，只从图片中可见文字提取信息。',
		'优先识别包装正面最大、最醒目的中文药名。不要把批准文号、规格、厂家、广告语、适应症、说明文字当成药名。',
		'如果最大字体不是药名，或者药名看不清，name 返回空字符串。',
		'不要猜测，不要使用示例药名，不要补全图片中看不到的信息。',
		'如果药名看不清，name 返回空字符串。',
		'只返回 JSON，不要返回 Markdown。',
		'JSON 字段：name, rawText, dosage, ingredients, precautions, expiryText, confidence。',
		'confidence 是 0 到 1，表示你从图片确认药名的把握。'
	].join('\n')
}

function responseSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			name: { type: 'string' },
			rawText: { type: 'string' },
			dosage: { type: 'string' },
			ingredients: { type: 'string' },
			precautions: { type: 'string' },
			expiryText: { type: 'string' },
			confidence: { type: 'number' }
		},
		required: ['name', 'rawText', 'dosage', 'ingredients', 'precautions', 'expiryText', 'confidence']
	}
}

export async function recognizeMedicineImage(imagePath) {
	if (!isConfigured()) {
		throw new Error('还没有配置 OpenAI API Key，不能识别真实照片')
	}

	const imageUrl = await imageToDataUrl(imagePath)
	const prompt = buildPrompt()

	if (OPENAI_PROXY.useProxy) {
		return proxyRecognize(imageUrl, prompt)
	}

	return directRecognize(imageUrl, prompt)
}

function directRecognize(imageUrl, prompt) {
	return new Promise((resolve, reject) => {
		uni.request({
			url: RESPONSES_URL,
			method: 'POST',
			header: {
				'content-type': 'application/json',
				'authorization': 'Bearer ' + OPENAI_VISION.apiKey
			},
			data: {
				model: OPENAI_VISION.model,
				input: [
					{
						role: 'user',
						content: [
							{ type: 'input_text', text: prompt },
							{
								type: 'input_image',
								image_url: imageUrl,
								detail: OPENAI_VISION.imageDetail || 'high'
							}
						]
					}
				],
				text: {
					format: {
						type: 'json_schema',
						name: 'medicine_image_result',
						strict: true,
						schema: responseSchema()
					}
				}
			},
			success: (res) => {
				const data = res.data || {}
				if (data.error) {
					reject(new Error('OpenAI 错误：' + (data.error.message || JSON.stringify(data.error))))
					return
				}
				try {
					resolve(normalizeResult(safeParseJson(extractOutputText(data))))
				} catch (e) {
					reject(e)
				}
			},
			fail: (err) => reject(new Error('OpenAI 请求失败：' + JSON.stringify(err)))
		})
	})
}

function proxyRecognize(imageUrl, prompt) {
	return new Promise((resolve, reject) => {
		uni.request({
			url: OPENAI_PROXY.visionProxyBase,
			method: 'POST',
			header: { 'content-type': 'application/json' },
			data: { imageUrl, prompt },
			success: (res) => {
				const data = res.data || {}
				try {
					if (data.name || data.rawText || data.raw_text) {
						resolve(normalizeResult(data))
					} else if (typeof data.text === 'string') {
						resolve(normalizeResult(safeParseJson(data.text)))
					} else {
						resolve(normalizeResult(safeParseJson(extractOutputText(data))))
					}
				} catch (e) {
					reject(e)
				}
			},
			fail: (err) => reject(new Error('OpenAI 代理请求失败：' + JSON.stringify(err)))
		})
	})
}
