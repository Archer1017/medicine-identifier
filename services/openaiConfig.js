/**
 * OpenAI 视觉识别配置。
 *
 * 开发测试可以把 API Key 填在这里；正式上线不要把 Key 放在前端包里，
 * 建议改为自己的后端代理，由后端调用 OpenAI。
 */

export const OPENAI_VISION = {
	// 你的 OpenAI API Key（开发测试用）
	apiKey: '',

	// OpenAI Responses API 中支持图片输入的模型。
	// 如果你的账号暂时没有此模型，可在这里改成账号可用的视觉模型。
	model: 'gpt-5.6',

	// low 更省，高精度药盒文字可改为 high。
	imageDetail: 'high'
}

export const OPENAI_SPEECH = {
	// 语音转文字模型，用于“按住说话”和“语音找药”。
	model: 'gpt-4o-mini-transcribe',
	language: 'zh'
}

export const OPENAI_PROXY = {
	// 正式上线建议设为 true，让前端只请求自己的后端。
	useProxy: false,
	// 你的视觉识别后端代理地址。后端接收 { imageUrl, prompt }，返回 OpenAI 的 JSON 结果或 { text }。
	visionProxyBase: 'https://your-backend.example.com/openai-vision',
	// 你的语音识别后端代理地址。后端接收录音文件，返回 { text }。
	speechProxyBase: 'https://your-backend.example.com/openai-speech'
}
