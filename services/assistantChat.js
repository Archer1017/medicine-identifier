/**
 * AI 小助手对话服务。
 *
 * 优先做本地安全回答和页面意图识别；如果配置了 OpenAI，则可用云端模型
 * 生成更自然的聊天回答。医疗相关回答只做健康科普，不替代医生诊断。
 */

import { OPENAI_VISION, OPENAI_PROXY } from './openaiConfig.js'
import { getAllMedicines } from './storage.js'
import { ASSISTANT_HELP_TEXT, resolveAssistantIntent } from './assistant.js'

const RESPONSES_URL = 'https://api.openai.com/v1/responses'

function normalize(text) {
	return String(text || '').toLowerCase().replace(/\s/g, '')
}

function hasAny(text, words) {
	return words.some((word) => text.indexOf(word) >= 0)
}

function openAIConfigured() {
	if (OPENAI_PROXY.useProxy) return !!OPENAI_PROXY.visionProxyBase
	return (
		OPENAI_VISION.apiKey &&
		OPENAI_VISION.apiKey.indexOf('在此填入') < 0 &&
		OPENAI_VISION.apiKey.indexOf('YOUR_') < 0
	)
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
	return chunks.join('\n').trim()
}

export function localAssistantReply(text) {
	const q = normalize(text)
	if (!q) return '我在，你可以问我眼睛护理知识，也可以说打开药箱、打开日历、识别药品。'

	if (hasAny(q, ['眼睛突然看不见', '突然看不清', '视野缺损', '眼痛', '剧烈头痛', '眼外伤', '化学品', '飞蚊突然变多', '闪光感'])) {
		return '这可能是眼科急症信号，比如视网膜、青光眼急性发作或眼外伤等问题。请尽快去眼科急诊，或让身边人立即协助就医。'
	}

	if (hasAny(q, ['白内障'])) {
		return '白内障常见表现是视力逐渐下降、看东西发雾、怕光、夜间看不清。早期可定期复查，明显影响生活时通常需要眼科评估是否手术。'
	}

	if (hasAny(q, ['青光眼', '眼压'])) {
		return '青光眼和眼压、视神经损伤有关，可能慢慢损害视野。很多人早期没有明显感觉，所以需要眼压、眼底和视野检查。若眼痛、头痛、恶心并视力下降，应尽快急诊。'
	}

	if (hasAny(q, ['干眼', '眼干', '涩', '酸胀'])) {
		return '干眼常见于长时间用眼、眨眼少、空气干燥或睑板腺问题。可以先减少连续用眼、热敷眼睑、保持眨眼，并咨询医生选择合适人工泪液。不要自行长期使用含激素眼药水。'
	}

	if (hasAny(q, ['近视', '远视', '散光', '老花'])) {
		return '近视、远视、散光和老花都属于屈光问题，需要验光确认。成人视力变化明显时，建议做一次眼科检查，排除白内障、眼底病变等原因。'
	}

	if (hasAny(q, ['糖尿病', '眼底', '视网膜'])) {
		return '糖尿病可能影响眼底视网膜，即使视力暂时正常也建议定期查眼底。若出现视物变形、黑影、突然视力下降，要尽快看眼科。'
	}

	if (hasAny(q, ['保护眼睛', '护眼', '用眼', '疲劳'])) {
		return '日常护眼可以记住三点：连续近距离用眼后休息，保持合适光线和距离，定期做眼科检查。若已经有眼病或视力明显变化，应按医生建议复查。'
	}

	if (hasAny(q, ['你好', '在吗', '陪我', '聊天', '无聊'])) {
		return '我在。你可以和我聊天，也可以让我帮你打开药箱、日历、找药，或者问我一些眼睛护理知识。'
	}

	if (hasAny(q, ['谢谢', '感谢'])) {
		return '不用谢。我会尽量用简单清楚的话回答，也可以帮你直接打开需要的页面。'
	}

	return '我听到了。这个问题我可以先简单陪你聊，但如果是眼睛不舒服、视力变化或用药问题，最好让眼科医生确认。你也可以说打开药箱、打开日历、识别药品。'
}

function buildPrompt(text, history) {
	const recent = (history || []).slice(-6).map((m) => (m.role === 'user' ? '用户：' : '助手：') + m.text).join('\n')
	return [
		'你是一个面向盲人用户的中文语音助手。',
		'回答要短、清楚、适合朗读。每次尽量不超过120个中文字符。',
		'可以闲聊，也可以回答基础眼科健康科普。',
		'不要做诊断，不要开处方，不要建议自行使用处方眼药。',
		'遇到突然视力下降、眼痛、外伤、化学品入眼、闪光感或大量飞蚊，要建议尽快眼科急诊。',
		'如果用户想打开页面，只用自然语言确认，不要编造页面内容。',
		recent ? '最近对话：\n' + recent : '',
		'用户刚刚说：' + text
	].filter(Boolean).join('\n')
}

function openAIReply(text, history) {
	const prompt = buildPrompt(text, history)
	if (OPENAI_PROXY.useProxy) {
		return Promise.reject(new Error('当前代理只配置了视觉接口，未配置聊天接口'))
	}
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
				input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }]
			},
			success: (res) => {
				const data = res.data || {}
				if (data.error) {
					reject(new Error(data.error.message || 'OpenAI 返回错误'))
					return
				}
				resolve(extractOutputText(data) || localAssistantReply(text))
			},
			fail: () => reject(new Error('OpenAI 聊天请求失败'))
		})
	})
}

export async function answerAssistant(text, history = []) {
	const intent = resolveAssistantIntent(text, { medicines: getAllMedicines() })
	if (!['unknown', 'help'].includes(intent.type)) {
		return { kind: 'intent', intent }
	}
	if (intent.type === 'help') {
		return { kind: 'text', text: ASSISTANT_HELP_TEXT }
	}
	if (openAIConfigured()) {
		try {
			const textReply = await openAIReply(text, history)
			return { kind: 'text', text: textReply }
		} catch (e) {
			console.error('assistant chat fallback', e)
		}
	}
	return { kind: 'text', text: localAssistantReply(text) }
}
