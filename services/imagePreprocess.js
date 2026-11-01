/**
 * 图片预处理：为药盒 OCR 生成多个识别版本。
 * H5 可用 canvas 生成：原图、中心裁剪、灰度增强、黑白二值化。
 * App 端如果不能用 canvas，则至少返回原图。
 */

function isDataUrl(value) {
	return typeof value === 'string' && value.indexOf('data:') === 0
}

function loadImage(dataUrl) {
	return new Promise((resolve, reject) => {
		if (typeof Image === 'undefined') {
			reject(new Error('当前环境不支持图像预处理'))
			return
		}
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = () => reject(new Error('图片加载失败'))
		img.src = dataUrl
	})
}

function drawVariant(img, options) {
	const crop = options.crop || { x: 0, y: 0, w: img.width, h: img.height }
	const scale = options.scale || 1
	const maxW = options.maxWidth || 1280
	const targetW = Math.min(maxW, Math.round(crop.w * scale))
	const targetH = Math.max(1, Math.round(targetW * crop.h / crop.w))
	const canvas = document.createElement('canvas')
	canvas.width = targetW
	canvas.height = targetH
	const ctx = canvas.getContext('2d', { willReadFrequently: true })
	ctx.imageSmoothingEnabled = true
	ctx.imageSmoothingQuality = 'high'
	ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, targetW, targetH)

	if (options.mode) {
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
		const data = imageData.data
		for (let i = 0; i < data.length; i += 4) {
			const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
			let value = gray
			if (options.mode === 'contrast') {
				value = Math.max(0, Math.min(255, (gray - 128) * 1.8 + 128))
			} else if (options.mode === 'binary') {
				value = gray > 150 ? 255 : 0
			}
			data[i] = value
			data[i + 1] = value
			data[i + 2] = value
		}
		ctx.putImageData(imageData, 0, 0)
	}

		return canvas.toDataURL('image/jpeg', options.quality || 0.86)
}

export async function buildOcrImageVariants(imageSource, options = {}) {
	if (!imageSource) return []
	if (!isDataUrl(imageSource)) return [imageSource]
	const purpose = typeof options === 'string' ? options : (options.purpose || 'front')

	// #ifdef H5
	try {
		const img = await loadImage(imageSource)
		const full = { x: 0, y: 0, w: img.width, h: img.height }
		const nameBand = {
			x: Math.round(img.width * 0.06),
			y: Math.round(img.height * 0.2),
			w: Math.round(img.width * 0.88),
			h: Math.round(img.height * 0.42)
		}
		const nameCenter = {
			x: Math.round(img.width * 0.1),
			y: Math.round(img.height * 0.16),
			w: Math.round(img.width * 0.8),
			h: Math.round(img.height * 0.58)
		}
		const center = {
			x: Math.round(img.width * 0.08),
			y: Math.round(img.height * 0.16),
			w: Math.round(img.width * 0.84),
			h: Math.round(img.height * 0.68)
		}
		const upper = {
			x: Math.round(img.width * 0.05),
			y: Math.round(img.height * 0.04),
			w: Math.round(img.width * 0.9),
			h: Math.round(img.height * 0.56)
		}
		const variants = purpose === 'supplement'
			? [
				drawVariant(img, { crop: full, scale: 1.3, mode: 'contrast', maxWidth: 1600 }),
				drawVariant(img, { crop: center, scale: 1.8, mode: 'contrast' }),
				drawVariant(img, { crop: upper, scale: 1.8, mode: 'contrast' }),
				drawVariant(img, { crop: full, scale: 1.2, mode: 'binary', maxWidth: 1500 })
			]
			: [
				drawVariant(img, { crop: nameBand, scale: 2.2, mode: 'contrast', maxWidth: 1800 }),
				drawVariant(img, { crop: nameCenter, scale: 2, mode: 'contrast', maxWidth: 1800 }),
				drawVariant(img, { crop: center, scale: 1.8, mode: 'contrast', maxWidth: 1600 }),
				drawVariant(img, { crop: upper, scale: 1.8, mode: 'contrast', maxWidth: 1600 }),
				drawVariant(img, { crop: nameBand, scale: 2.2, mode: 'binary', maxWidth: 1800 }),
				drawVariant(img, { crop: full, scale: 1.2, mode: 'contrast', maxWidth: 1500 })
			]
		return Array.from(new Set(variants.filter(Boolean)))
	} catch (e) {
		console.warn('image preprocess failed', e)
		return [imageSource]
	}
	// #endif

	return [imageSource]
}
