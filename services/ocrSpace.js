/**
 * OCR.Space 免费 OCR 兜底。
 *
 * 说明：
 * - 公开版不预置 key，需要自行配置。
 * - 正式使用请到 https://ocr.space/ocrapi 申请免费 key 后替换。
 */

export const OCR_SPACE = {
	enabled: true,
	apiKey: '',
	endpoint: 'https://api.ocr.space/parse/image'
}

export function isConfigured() {
	return !!(OCR_SPACE.enabled && OCR_SPACE.apiKey && OCR_SPACE.endpoint)
}

function formEncode(data) {
	return Object.keys(data)
		.map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
		.join('&')
}

function imageToBase64Image(imagePath) {
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
					reader.onloadend = (e) => resolve(e.target.result || '')
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

function normalizeLines(data) {
	const parsed = data.ParsedResults || []
	const lines = []
	parsed.forEach((item) => {
		const overlayLines = item.TextOverlay && item.TextOverlay.Lines ? item.TextOverlay.Lines : []
		overlayLines.forEach((line) => {
			const text = String(line.LineText || '').trim()
			if (!text) return
			const words = line.Words || []
			const leftValues = words.map((w) => Number(w.Left || 0)).filter((n) => Number.isFinite(n))
			const topValues = words.map((w) => Number(w.Top || 0)).filter((n) => Number.isFinite(n))
			const rightValues = words.map((w) => Number(w.Left || 0) + Number(w.Width || 0)).filter((n) => Number.isFinite(n))
			const bottomValues = words.map((w) => Number(w.Top || 0) + Number(w.Height || line.MaxHeight || 0)).filter((n) => Number.isFinite(n))
			const left = leftValues.length ? Math.min.apply(null, leftValues) : 0
			const top = Number(line.MinTop || (topValues.length ? Math.min.apply(null, topValues) : 0))
			const height = Number(line.MaxHeight || (bottomValues.length ? Math.max.apply(null, bottomValues) - top : 0))
			const width = rightValues.length ? Math.max.apply(null, rightValues) - left : words.reduce((sum, w) => sum + Number(w.Width || 0), 0)
			lines.push({ text, left, top, width, height, area: width * height, confidence: 0.6 })
		})
		if (!overlayLines.length && item.ParsedText) {
			String(item.ParsedText).split(/\n/).forEach((text, index) => {
				const clean = text.trim()
				if (clean) lines.push({ text: clean, left: 0, top: index, width: clean.length, height: 1, area: clean.length, confidence: 0.35 })
			})
		}
	})
	return lines
}

async function requestOcr(imagePath, engine, overlay) {
	const base64Image = await imageToBase64Image(imagePath)
	return new Promise((resolve, reject) => {
		uni.request({
			url: OCR_SPACE.endpoint,
			method: 'POST',
			header: {
				'content-type': 'application/x-www-form-urlencoded',
				apikey: OCR_SPACE.apiKey
			},
			data: formEncode({
				base64Image,
				language: 'chs',
				OCREngine: engine,
				scale: true,
				detectOrientation: true,
				isOverlayRequired: overlay
			}),
			success: (res) => {
				const data = res.data || {}
				if (data.IsErroredOnProcessing) {
					const message = (data.ErrorMessage && data.ErrorMessage.join ? data.ErrorMessage.join('；') : data.ErrorMessage) || 'OCR.Space 识别失败'
					reject(new Error(message))
					return
				}
				resolve(data)
			},
			fail: (err) => reject(new Error('OCR.Space 请求失败：' + JSON.stringify(err)))
		})
	})
}

export async function recognizeText(imagePath, engine = 2) {
	const data = await requestOcr(imagePath, engine, false)
	const parsed = data.ParsedResults || []
	const text = parsed.map((item) => item.ParsedText || '').filter(Boolean).join('\n')
	return text.trim()
}

export async function recognizeLayout(imagePath, engine = 2) {
	const data = await requestOcr(imagePath, engine, true)
	const parsed = data.ParsedResults || []
	const text = parsed.map((item) => item.ParsedText || '').filter(Boolean).join('\n').trim()
	return { text, lines: normalizeLines(data) }
}
