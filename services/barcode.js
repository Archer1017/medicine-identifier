/**
 * 浏览器条形码识别。
 * 支持 H5 中的 dataURL / 网络图片。识别到 EAN/UPC/Code128 等条码后，
 * ocr.js 会优先用本地药品库精确匹配。
 */

function imageToElement(imageSource) {
	return new Promise((resolve, reject) => {
		if (!imageSource || typeof Image === 'undefined') {
			reject(new Error('没有可识别的条码图片'))
			return
		}
		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => resolve(img)
		img.onerror = () => reject(new Error('条码图片读取失败'))
		img.src = imageSource
	})
}

export function isBarcodeDetectorAvailable() {
	// #ifdef H5
	return typeof window !== 'undefined' && typeof window.BarcodeDetector !== 'undefined'
	// #endif
	return false
}

export async function detectBarcode(imageSource) {
	if (!isBarcodeDetectorAvailable()) return ''
	if (!imageSource || typeof imageSource !== 'string') return ''
	if (imageSource.indexOf('data:') !== 0 && !/^https?:\/\//.test(imageSource)) return ''

	try {
		const detector = new window.BarcodeDetector({
			formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
		})
		const image = await imageToElement(imageSource)
		const codes = await detector.detect(image)
		const first = codes && codes[0]
		return first && first.rawValue ? String(first.rawValue).trim() : ''
	} catch (e) {
		console.warn('barcode detect failed', e)
		return ''
	}
}
