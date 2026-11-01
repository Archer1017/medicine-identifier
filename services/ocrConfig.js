/**
 * 百度云 OCR 配置。
 *
 * ============ 你需要做的（一次性） ============
 * 1. 打开 https://console.bce.baidu.com/ai/ 注册/登录百度智能云
 * 2. 进入「文字识别 OCR」→ 创建应用（免费领取额度）
 * 3. 在应用列表拿到 API Key 和 Secret Key
 * 4. 把下面两个值替换成你的（保持引号）
 * ============================================
 *
 * ⚠️ 安全提示：API Key/Secret 写在前端有泄露风险。
 *   - 个人测试没问题；
 *   - 正式上线建议放到自己的后端服务器，前端只调你的后端（见 USE_PROXY）。
 */

export const BAIDU_OCR = {
	// 你的百度 OCR API Key（必填）
	apiKey: '',
	// 你的百度 OCR Secret Key（必填）
	secretKey: '',

	// 使用哪个识别接口：
	// 'general_basic'  通用文字识别（标准版，免费额度多，够用）
	// 'accurate_basic' 通用文字识别（高精度版，识别更准，额度较少）
	recognizeType: 'general_basic'
}

/**
 * H5（浏览器）跨域说明：
 * 百度接口不允许浏览器直接跨域调用。H5 端有两种办法：
 *   A. 开发调试：在 manifest.json → h5 → devServer 配置 proxy 代理（见 README）
 *   B. 正式部署：用自己的后端转发（把 USE_PROXY 设为 true，填 proxyBase）
 *
 * App（手机）端不受跨域限制，可直接调用，无需代理。
 */
export const OCR_PROXY = {
	// H5 是否走自建后端代理（true 时用 proxyBase，false 时直连/走 devServer 代理）
	useProxy: false,
	// 你的后端代理地址（useProxy=true 时生效），后端负责转发到百度并回传结果
	proxyBase: 'https://your-backend.example.com/ocr'
}
