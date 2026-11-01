/**
 * Tesseract.js 本地开源 OCR。
 *
 * GitHub: https://github.com/naptha/tesseract.js
 * 不需要 API Key。H5/浏览器端通过 CDN 加载 tesseract.js 后在本机识别图片文字。
 */

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
let loadingPromise = null

export function isConfigured() {
	return true
}

function ensureBrowser() {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		throw new Error('本地开源 OCR 需要浏览器环境')
	}
}

function loadTesseract() {
	ensureBrowser()
	if (window.Tesseract) return Promise.resolve(window.Tesseract)
	if (loadingPromise) return loadingPromise

	loadingPromise = new Promise((resolve, reject) => {
		const script = document.createElement('script')
		script.src = TESSERACT_CDN
		script.async = true
		script.onload = () => {
			if (window.Tesseract) resolve(window.Tesseract)
			else reject(new Error('Tesseract.js 加载失败'))
		}
		script.onerror = () => reject(new Error('无法加载 Tesseract.js，请检查网络'))
		document.head.appendChild(script)
	})

	return loadingPromise
}

function imageToReadableSource(imagePath) {
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

export async function recognizeText(imagePath, onProgress) {
	const imageSource = await imageToReadableSource(imagePath)
	const Tesseract = await loadTesseract()
	const logger = (m) => {
		if (typeof onProgress === 'function') onProgress(m)
	}

	if (typeof Tesseract.createWorker === 'function') {
		const worker = await Tesseract.createWorker('chi_sim+eng', 1, { logger })
		try {
			const result = await worker.recognize(imageSource)
			return result && result.data && result.data.text ? result.data.text.trim() : ''
		} finally {
			await worker.terminate()
		}
	}

	const result = await Tesseract.recognize(imageSource, 'chi_sim+eng', { logger })
	return result && result.data && result.data.text ? result.data.text.trim() : ''
}

function normalizeTesseractLines(data) {
	const rawLines = data && data.lines ? data.lines : []
	const lines = rawLines.map((line, index) => {
		const text = String(line.text || '').trim()
		const bbox = line.bbox || {}
		const left = Number(bbox.x0 || 0)
		const top = Number(bbox.y0 || index)
		const width = Math.max(0, Number(bbox.x1 || 0) - Number(bbox.x0 || 0))
		const height = Math.max(0, Number(bbox.y1 || 0) - Number(bbox.y0 || 0))
		return {
			text,
			left,
			top,
			width: width || text.length,
			height: height || 1,
			area: (width || text.length) * (height || 1),
			confidence: Number(line.confidence || 0) / 100
		}
	}).filter((line) => line.text)

	if (lines.length) return lines
	return groupTesseractWords(data && data.words ? data.words : [])
}

function groupTesseractWords(words) {
	const normalized = (words || []).map((word) => {
		const text = String(word.text || '').trim()
		const bbox = word.bbox || {}
		const left = Number(bbox.x0 || 0)
		const top = Number(bbox.y0 || 0)
		const right = Number(bbox.x1 || left + text.length)
		const bottom = Number(bbox.y1 || top + 1)
		return {
			text,
			left,
			top,
			right,
			bottom,
			width: Math.max(1, right - left),
			height: Math.max(1, bottom - top),
			confidence: Number(word.confidence || 0) / 100
		}
	}).filter((word) => word.text)

	const rows = []
	normalized
		.sort((a, b) => (a.top - b.top) || (a.left - b.left))
		.forEach((word) => {
			const row = rows.find((item) => {
				const mid = (word.top + word.bottom) / 2
				return mid >= item.top - item.height * 0.35 && mid <= item.bottom + item.height * 0.35
			})
			if (row) {
				row.words.push(word)
				row.left = Math.min(row.left, word.left)
				row.top = Math.min(row.top, word.top)
				row.right = Math.max(row.right, word.right)
				row.bottom = Math.max(row.bottom, word.bottom)
				row.height = Math.max(1, row.bottom - row.top)
			} else {
				rows.push({
					words: [word],
					left: word.left,
					top: word.top,
					right: word.right,
					bottom: word.bottom,
					height: word.height
				})
			}
		})

	return rows.map((row) => {
		const wordsInRow = row.words.sort((a, b) => a.left - b.left)
		const text = wordsInRow.map((word) => word.text).join('')
		const width = Math.max(1, row.right - row.left)
		const height = Math.max(1, row.bottom - row.top)
		const confidence = wordsInRow.reduce((sum, word) => sum + word.confidence, 0) / Math.max(1, wordsInRow.length)
		return {
			text,
			left: row.left,
			top: row.top,
			width,
			height,
			area: width * height,
			confidence
		}
	}).filter((line) => line.text)
}

export async function recognizeLayout(imagePath, onProgress) {
	const imageSource = await imageToReadableSource(imagePath)
	const Tesseract = await loadTesseract()
	const logger = (m) => {
		if (typeof onProgress === 'function') onProgress(m)
	}

	if (typeof Tesseract.createWorker === 'function') {
		const worker = await Tesseract.createWorker('chi_sim+eng', 1, { logger })
		try {
			const result = await worker.recognize(imageSource)
			const data = result && result.data ? result.data : {}
			return { text: data.text ? data.text.trim() : '', lines: normalizeTesseractLines(data) }
		} finally {
			await worker.terminate()
		}
	}

	const result = await Tesseract.recognize(imageSource, 'chi_sim+eng', { logger })
	const data = result && result.data ? result.data : {}
	return { text: data.text ? data.text.trim() : '', lines: normalizeTesseractLines(data) }
}
