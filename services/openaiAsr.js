/**
 * OpenAI 语音转文字服务。
 *
 * 用于首页 AI 辅助和找药页语音找药。
 */

import { OPENAI_VISION, OPENAI_SPEECH, OPENAI_PROXY } from './openaiConfig.js'

const TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions'

export function isConfigured() {
	if (OPENAI_PROXY.useProxy) return !!OPENAI_PROXY.speechProxyBase
	return (
		OPENAI_VISION.apiKey &&
		OPENAI_VISION.apiKey.indexOf('在此填入') < 0 &&
		OPENAI_VISION.apiKey.indexOf('YOUR_') < 0
	)
}

export function recognizeAudio(filePath) {
	if (!isConfigured()) {
		return Promise.reject(new Error('还没有配置 OpenAI API Key，不能识别语音'))
	}
	if (!filePath) {
		return Promise.reject(new Error('没有可识别的录音'))
	}
	return OPENAI_PROXY.useProxy ? proxyRecognize(filePath) : directRecognize(filePath)
}

function directRecognize(filePath) {
	return new Promise((resolve, reject) => {
		uni.uploadFile({
			url: TRANSCRIPTIONS_URL,
			filePath: filePath,
			name: 'file',
			header: {
				'authorization': 'Bearer ' + OPENAI_VISION.apiKey
			},
			formData: {
				model: OPENAI_SPEECH.model,
				language: OPENAI_SPEECH.language || 'zh',
				response_format: 'json'
			},
			success: (res) => {
				try {
					const data = typeof res.data === 'string' ? JSON.parse(res.data) : (res.data || {})
					if (data.error) {
						reject(new Error('OpenAI 语音识别错误：' + (data.error.message || JSON.stringify(data.error))))
						return
					}
					resolve(String(data.text || '').trim())
				} catch (e) {
					reject(new Error('OpenAI 语音识别返回格式不正确'))
				}
			},
			fail: (err) => reject(new Error('OpenAI 语音识别请求失败：' + JSON.stringify(err)))
		})
	})
}

function proxyRecognize(filePath) {
	return new Promise((resolve, reject) => {
		uni.uploadFile({
			url: OPENAI_PROXY.speechProxyBase,
			filePath: filePath,
			name: 'file',
			formData: {
				model: OPENAI_SPEECH.model,
				language: OPENAI_SPEECH.language || 'zh'
			},
			success: (res) => {
				try {
					const data = typeof res.data === 'string' ? JSON.parse(res.data) : (res.data || {})
					resolve(String(data.text || '').trim())
				} catch (e) {
					reject(new Error('OpenAI 语音代理返回格式不正确'))
				}
			},
			fail: (err) => reject(new Error('OpenAI 语音代理请求失败：' + JSON.stringify(err)))
		})
	})
}
