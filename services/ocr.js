/**
 * OCR 识别 + 安全校验服务。
 *
 * 识别引擎优先级：
 * 1. OpenAI 视觉识别（若已配置）
 * 2. 百度高精度/通用 OCR（若已配置）
 * 3. Tesseract.js 本地开源 OCR
 *
 * 识别后统一做药品库交叉校验并计算置信度。
 * 页面只调 recognizeFromImage(imagePath)，不关心底层引擎。
 */

import { loadDrugReference, matchByBarcode, matchByText } from './drugReference.js'
import { recognizeText as recognizeTesseractText, recognizeLayout as recognizeTesseractLayout, isConfigured as tesseractConfigured } from './tesseractOcr.js'
import { recognizeText as recognizeBaiduText, recognizeLayout as recognizeBaiduLayout, isConfigured as baiduConfigured } from './baiduOcr.js'
import { recognizeMedicineImage, isConfigured as openaiConfigured } from './openaiVision.js'
import { recognizeText as recognizeOcrSpaceText, recognizeLayout as recognizeOcrSpaceLayout, isConfigured as ocrSpaceConfigured } from './ocrSpace.js'
import { detectBarcode, isBarcodeDetectorAvailable } from './barcode.js'
import { buildOcrImageVariants } from './imagePreprocess.js'

/**
 * 真实识别：调用 Tesseract.js 提取药盒文字。
 * 返回 { rawText, name, dosage, ingredients, precautions, expiryText, barcode, baseConfidence }。
 */
async function realRecognize(imagePath, purpose = 'front') {
	const strictLargestName = purpose === 'front'
	await loadDrugReference()
	const variants = await buildOcrImageVariants(imagePath, { purpose })
	const attempts = []
	let barcode = ''

	if (isBarcodeDetectorAvailable()) {
		for (const image of variants.slice(0, 3)) {
			barcode = await detectBarcode(image)
			if (barcode) break
		}
		if (barcode) {
			attempts.push({
				engine: 'barcode',
				name: '',
				rawText: '',
				dosage: '',
				ingredients: '',
				precautions: '',
				expiryText: '',
				barcode,
				baseConfidence: 0.98
			})
		}
	}

	for (let i = 0; i < variants.length; i++) {
		const image = variants[i]
		if (openaiConfigured()) {
			try {
				const result = await recognizeMedicineImage(image)
				const name = normalizeAcceptedName(result.name || '') || extractMedicineName(result.name || '')
				attempts.push({
					engine: 'openai',
					name,
					rawText: result.rawText || '',
					dosage: result.dosage || '',
					ingredients: result.ingredients || '',
					precautions: result.precautions || '',
					expiryText: result.expiryText || '',
					barcode,
					nameSource: name ? 'vision-largest-font' : '',
					variantIndex: i,
					baseConfidence: Math.min(0.94, Math.max(0.35, result.confidence || 0.65))
				})
				if (name && Number(result.confidence || 0) >= 0.82) break
			} catch (e) {
				console.warn('OpenAI vision attempt failed', e)
			}
		}
	}

	for (let i = 0; i < variants.length; i++) {
		const image = variants[i]
		if (baiduConfigured()) {
			try {
				const layout = await recognizeBaiduLayout(image)
				const attempt = layoutResult('baidu', layout, barcode, 0.76, { strictLargestName, variantIndex: i })
				attempts.push(attempt)
				if (attempt.name && matchByText(attempt.name)) break
			} catch (e) {
				console.warn('Baidu OCR attempt failed', e)
				if (!strictLargestName) {
					try {
						const text = await recognizeBaiduText(image)
						const attempt = textResult('baidu-text', text, barcode, 0.58)
						attempts.push(attempt)
						if (attempt.name && matchByText(attempt.name)) break
					} catch (fallbackError) {
						console.warn('Baidu text fallback failed', fallbackError)
					}
				}
			}
		}
	}

	for (let i = 0; i < variants.slice(0, 4).length; i++) {
		const image = variants[i]
		if (ocrSpaceConfigured()) {
			try {
				const layout = await recognizeOcrSpaceLayout(image)
				const attempt = layoutResult('ocrspace', layout, barcode, 0.6, { strictLargestName, variantIndex: i })
				attempts.push(attempt)
				if (attempt.name && matchByText(attempt.name)) break
			} catch (e) {
				console.warn('OCR.Space attempt failed', e)
				if (!strictLargestName) {
					try {
						const text = await recognizeOcrSpaceText(image)
						const attempt = textResult('ocrspace-text', text, barcode, 0.42)
						attempts.push(attempt)
						if (attempt.name && matchByText(attempt.name)) break
					} catch (fallbackError) {
						console.warn('OCR.Space text fallback failed', fallbackError)
					}
				}
			}
		}
	}

	for (let i = 0; i < variants.length; i++) {
		const image = variants[i]
		if (tesseractConfigured()) {
			try {
				const layout = await recognizeTesseractLayout(image)
				const attempt = layoutResult('tesseract', layout, barcode, 0.5, { strictLargestName, variantIndex: i })
				attempts.push(attempt)
				if (attempt.name && matchByText(attempt.name)) break
			} catch (e) {
				console.warn('Tesseract OCR attempt failed', e)
				if (!strictLargestName) {
					try {
						const text = await recognizeTesseractText(image)
						const attempt = textResult('tesseract-text', text, barcode, 0.34)
						attempts.push(attempt)
						if (attempt.name && matchByText(attempt.name)) break
					} catch (fallbackError) {
						console.warn('Tesseract text fallback failed', fallbackError)
					}
				}
			}
		}
	}

	if (!attempts.length) {
		throw new Error('没有可用 OCR 引擎，或所有识别引擎都失败')
	}

	return chooseBestRaw(attempts)
}

function layoutResult(engine, layout, barcode, engineConfidence, options = {}) {
	const rawText = String((layout && layout.text) || '').trim()
	const largest = extractLargestMedicineName((layout && layout.lines) || [], rawText, options)
	const name = largest.name || ''
	const charCount = rawText.replace(/\s+/g, '').length
	const matched = name ? matchByText(name) : null
	const cropBoost = Math.max(0, 0.1 - Number(options.variantIndex || 0) * 0.025)
	const baseConfidence = Math.min(
		0.9,
		Math.max(0.18, engineConfidence + cropBoost + charCount / 500 + (largest.confidence || 0) * 0.22 + (matched ? 0.12 : 0))
	)
	return {
		engine,
		name,
		rawText,
		dosage: extractDosage(rawText),
		ingredients: extractIngredients(rawText),
		precautions: extractPrecautions(rawText),
		expiryText: extractExpiryText(rawText),
		barcode: barcode || '',
		nameSource: largest.source || '',
		largestLineText: largest.lineText || '',
		nameConfidence: largest.confidence || 0,
		variantIndex: options.variantIndex || 0,
		baseConfidence
	}
}

function textResult(engine, text, barcode, engineConfidence) {
	const charCount = (text || '').replace(/\s+/g, '').length
	const name = extractMedicineName(text)
	const matched = name ? matchByText(name) : null
	const baseConfidence = Math.min(0.72, Math.max(0.12, engineConfidence + charCount / 500 + (matched ? 0.1 : 0)))
	return {
		engine,
		name,
		rawText: text || '',
		dosage: extractDosage(text),
		ingredients: extractIngredients(text),
		precautions: extractPrecautions(text),
		expiryText: extractExpiryText(text),
		barcode: barcode || '',
		nameSource: name ? 'text-fallback' : '',
		nameConfidence: name ? 0.35 : 0,
		baseConfidence
	}
}

function chooseBestRaw(attempts) {
	let best = null
	let bestScore = -1
	for (const item of attempts) {
		const name = normalizeAcceptedName(item.name || '')
		const matchedByName = name ? matchByText(name) : null
		const matched = item.barcode ? matchByBarcode(item.barcode) : matchedByName
		let score = item.baseConfidence || 0
		if (item.barcode && matchByBarcode(item.barcode)) score += 0.5
		if (matchedByName) score += 0.4
		if (item.nameSource === 'largest-font' || item.nameSource === 'vision-largest-font') score += 0.28
		if (item.nameSource === 'name-crop-text') score += 0.16
		if (name) score += 0.14
		else if (item.engine !== 'barcode') score -= 0.24
		if (item.nameConfidence) score += Math.min(0.2, item.nameConfidence * 0.18)
		if ((item.rawText || '').length > 20) score += 0.06
		if (item.name && !name) score -= 0.5
		if (score > bestScore) {
			bestScore = score
			best = Object.assign({}, item, { name })
		}
	}
	return best
}

/**
 * 识别入口。返回：
 * {
 *   medicine: {...},        // 组装好的药品对象（未入库）
 *   confidence: 0-1,
 *   matchedDatabase: bool,
 *   level: 'high'|'medium'|'low',
 *   confidencePrefix: '',   // 朗读前缀警告语
 *   rawText
 * }
 */
export async function recognizeFromImage(imagePath) {
	let raw
	try {
		await loadDrugReference()
		if (openaiConfigured() || baiduConfigured() || ocrSpaceConfigured() || tesseractConfigured()) {
			raw = await realRecognize(imagePath, 'front')
		} else {
			throw new Error('没有可用 OCR 引擎')
		}
	} catch (e) {
		console.error('OCR 识别失败：', e)
		throw e
	}

	let matched = null
	let confidence = raw.baseConfidence
	let matchedDatabase = false

	// 1) 条形码精确匹配（最高优先级）
	if (raw.barcode) {
		matched = matchByBarcode(raw.barcode)
		if (matched) {
			confidence = 0.98
			matchedDatabase = true
		}
	}
	// 2) 文本模糊匹配
	if (!matched && raw.name) {
		const m = matchByText(raw.name)
		if (m) {
			matched = m.ref
			confidence = Math.max(m.score, confidence)
			matchedDatabase = true
		}
	}

	let medicine
	if (matched) {
		// 命中数据库：用标准信息覆盖 OCR
		medicine = {
			name: matched.name,
			dosage: matched.dosage,
			precautions: matched.precautions,
			ingredients: matched.ingredients,
			barcode: matched.barcode,
			expiryDate: null, // 有效期需用户/OCR 补充，示例留空
			stickerColor: '',
			nfcTagId: null,
			confidence: confidence,
			photoPath: imagePath || null
		}
	} else {
		medicine = {
			name: raw.name || '',
			dosage: raw.dosage || '',
			precautions: raw.precautions || '',
			ingredients: raw.ingredients || '',
			barcode: raw.barcode || '',
			expiryDate: null,
			stickerColor: '',
			nfcTagId: null,
			confidence: confidence,
			photoPath: imagePath || null
		}
	}

	if (!matchedDatabase) confidence = Math.min(confidence, 0.65)
	const level = confidence >= 0.9 ? 'high' : confidence >= 0.6 ? 'medium' : 'low'
	const confidencePrefix =
		level === 'high'
			? ''
			: level === 'medium'
			? '注意，部分信息可能不准确。'
			: matchedDatabase
			? '警告，无法确认，请找人帮忙核实。'
			: '警告，未能在药品库中确认此药，请不要按本次结果服药。'

	return {
		medicine,
		confidence,
		matchedDatabase,
		level,
		confidencePrefix,
		rawText: raw.rawText
	}
}

export async function recognizeSupplementFromImage(imagePath, baseMedicine) {
	await loadDrugReference()
	const raw = await realRecognize(imagePath, 'supplement')
	const rawText = raw.rawText || ''
	const base = baseMedicine || {}
	const dosage = raw.dosage || extractDosage(rawText) || base.dosage || ''
	const ingredients = raw.ingredients || extractIngredients(rawText) || base.ingredients || ''
	const precautions = raw.precautions || extractPrecautions(rawText) || base.precautions || ''
	const expiryText = raw.expiryText || extractExpiryText(rawText)
	const expiryDate = parseExpiryDate(expiryText) || base.expiryDate || null
	const medicine = Object.assign({}, base, {
		dosage,
		ingredients,
		precautions,
		expiryDate
	})
	return {
		medicine,
		rawText,
		confidence: Math.min(0.85, Math.max(0.35, raw.baseConfidence || 0.45)),
		fields: {
			dosage: !!dosage,
			ingredients: !!ingredients,
			precautions: !!precautions,
			expiryDate: !!expiryDate
		}
	}
}

const NAME_PREFIX_PATTERN = /(通用名称|商品名称|药品名称|药物名称|品名|名称)\s*[:：]?/
const NAME_PREFIX_GLOBAL_PATTERN = /(通用名称|商品名称|药品名称|药物名称|品名|名称)\s*[:：]?/g
const FORM_WORD_PATTERN = /(片|分散片|咀嚼片|胶囊|软胶囊|颗粒|口服液|滴眼液|眼膏|软膏|喷雾剂|丸|散|糖浆|混悬液|注射液|凝胶|滴丸|贴膏|乳膏|水剂|洗剂|酊|栓|露|膏|滴剂)/
const INFO_WORD_PATTERN = /(批准文号|批准|国药准字|生产批号|产品批号|批号|生产日期|有效期|失效期|规格|用法|用量|服法|成份|成分|主要成份|主要成分|功能主治|主治|适应症|禁忌|不良反应|注意事项|贮藏|储藏|包装|说明书|执行标准|许可证|生产企业|生产厂家|厂家|厂址|地址|电话|网址|扫码|二维码|条形码|条码|注册商标|商标|请仔细|本品|咨询|监制|委托)/
const COMPANY_WORD_PATTERN = /(有限公司|公司|药业|制药|药厂|集团|股份|厂家|厂址|地址|电话)/
const GENERIC_NAME_PATTERN = /^(药品|药物|药名|名称|片|片剂|胶囊|胶囊剂|软胶囊|颗粒|颗粒剂|口服液|滴眼液|眼药水|眼膏|软膏|喷雾剂|丸|散|糖浆|混悬液|注射液|凝胶|滴丸|贴膏|乳膏|水剂|洗剂|酊|栓|露|膏|滴剂|OTC|RX|处方药|非处方药|甲类|乙类|外用药)$/i

function extractLargestMedicineName(layoutLines, fallbackText, options = {}) {
	const lines = normalizeLayoutLines(layoutLines)
	if (lines.length) {
		const maxHeight = Math.max.apply(null, lines.map((line) => line.height || 1))
		const maxArea = Math.max.apply(null, lines.map((line) => line.area || 1))
		const visuallySorted = lines
			.slice()
			.sort((a, b) => (b.height - a.height) || (b.area - a.area) || (a.top - b.top))

		const dominant = visuallySorted
			.filter((line, index) => index < 8 && ((line.height || 1) >= maxHeight * 0.62 || (line.area || 1) >= maxArea * 0.36))
			.slice(0, 6)

		const candidates = []
		dominant.forEach((line, index) => {
			collectCandidateTexts(line.text).forEach((text) => {
				const candidate = scoreNameCandidate(text, line.text, [line], index, maxHeight, maxArea)
				if (candidate) candidates.push(candidate)
			})
		})

		const byTop = dominant.slice().sort((a, b) => (a.top - b.top) || (a.left - b.left))
		for (let i = 0; i < byTop.length - 1; i++) {
			const first = byTop[i]
			const second = byTop[i + 1]
			if (!canJoinProminentLines(first, second, maxHeight)) continue
			const joined = first.text + second.text
			collectCandidateTexts(joined).forEach((text) => {
				const candidate = scoreNameCandidate(text, joined, [first, second], i + 1, maxHeight, maxArea)
				if (candidate) candidates.push(candidate)
			})
		}

		const best = candidates.sort((a, b) => b.score - a.score)[0]
		if (best && best.score >= 58) {
			const matched = matchByText(best.name)
			return {
				name: matched ? matched.ref.name : best.name,
				lineText: best.lineText,
				source: 'largest-font',
				confidence: Math.min(0.92, Math.max(0.45, best.score / 100))
			}
		}

		return {
			name: '',
			lineText: '',
			source: '',
			confidence: 0
		}
	}

	if (options.strictLargestName && Number(options.variantIndex || 0) <= 1) {
		const croppedName = extractMedicineName(fallbackText)
		if (croppedName) {
			const matched = matchByText(croppedName)
			return {
				name: matched ? matched.ref.name : croppedName,
				lineText: croppedName,
				source: 'name-crop-text',
				confidence: matched ? 0.72 : 0.52
			}
		}
	}

	if (options.strictLargestName) {
		return {
			name: '',
			lineText: '',
			source: '',
			confidence: 0
		}
	}

	const fallbackName = extractMedicineName(fallbackText)
	return {
		name: fallbackName,
		lineText: fallbackName,
		source: fallbackName ? 'text-fallback' : '',
		confidence: fallbackName ? 0.34 : 0
	}
}

function normalizeLayoutLines(layoutLines) {
	return (layoutLines || []).map((line, index) => {
		const text = String(line && line.text ? line.text : '').trim()
		const width = Math.max(1, Number(line && line.width ? line.width : text.length || 1))
		const height = Math.max(1, Number(line && line.height ? line.height : 1))
		const area = Math.max(1, Number(line && line.area ? line.area : width * height))
		return {
			text,
			left: Number(line && line.left ? line.left : 0),
			top: Number(line && line.top ? line.top : index),
			width,
			height,
			area,
			confidence: Number(line && line.confidence ? line.confidence : 0.5)
		}
	}).filter((line) => line.text)
}

function collectCandidateTexts(rawText) {
	const pieces = []
	const push = (value) => {
		const cleaned = cleanNameCandidate(value).text
		if (cleaned && pieces.indexOf(cleaned) < 0) pieces.push(cleaned)
	}

	push(rawText)
	String(rawText || '')
		.split(/[\s　、，,。；;：:|/\\()[\]（）【】《》<>]+/)
		.forEach(push)

	return pieces
}

function scoreNameCandidate(text, rawLine, sourceLines, visualIndex, maxHeight, maxArea) {
	const cleaned = cleanNameCandidate(text)
	const name = cleaned.text
	if (!name) return null
	if (isGenericMedicineWord(name)) return null

	const matched = matchByText(name)
	const chineseCount = countChinese(name)
	if (!matched && chineseCount < 2) return null
	if (!matched && name.length > 28) return null
	if (!matched && !cleaned.hadNamePrefix && !FORM_WORD_PATTERN.test(name)) return null
	if (isNonNameLine(rawLine, name, cleaned.hadNamePrefix, matched)) return null

	const primary = sourceLines[0] || { height: 1, area: 1, confidence: 0.5 }
	const heightRatio = Math.min(1.2, (primary.height || 1) / Math.max(1, maxHeight || 1))
	const areaRatio = Math.min(1.2, (primary.area || 1) / Math.max(1, maxArea || 1))
	const numericRatio = countNumericAndLatin(name) / Math.max(1, name.length)
	let score = heightRatio * 64 + areaRatio * 16

	if (visualIndex === 0) score += 12
	else if (visualIndex === 1) score += 7
	else if (visualIndex === 2) score += 3
	if (cleaned.hadNamePrefix) score += 18
	if (FORM_WORD_PATTERN.test(name)) score += 18
	if (matched) score += 24 + matched.score * 12
	if (chineseCount >= 3 && chineseCount <= 18) score += 6
	if (name.length >= 3 && name.length <= 20) score += 4
	if (numericRatio > 0.45 && !matched && !FORM_WORD_PATTERN.test(name)) score -= 18
	if (!matched && !FORM_WORD_PATTERN.test(name) && name.length <= 2) score -= 16

	return {
		name,
		lineText: String(rawLine || '').trim(),
		score
	}
}

function canJoinProminentLines(first, second, maxHeight) {
	if (!first || !second) return false
	const heightGap = Math.abs((first.height || 1) - (second.height || 1)) / Math.max(first.height || 1, second.height || 1)
	const verticalGap = Math.abs((second.top || 0) - (first.top || 0))
	const combinedLength = String(first.text || '').length + String(second.text || '').length
	if (heightGap > 0.32) return false
	if (verticalGap > Math.max(18, maxHeight * 2.8)) return false
	if (combinedLength > 34) return false
	return true
}

function cleanNameCandidate(text) {
	const raw = String(text || '').trim()
	const hadNamePrefix = NAME_PREFIX_PATTERN.test(raw)
	let compact = fixCommonOcrMistakes(raw)
	compact = compact.replace(NAME_PREFIX_GLOBAL_PATTERN, '')
	compact = compact.replace(/[（(][^）)]*(批准|国药|规格|生产|厂家|公司|OTC|非处方|处方|医保|条码|二维码)[^）)]*[）)]/g, '')
	compact = compact.replace(/\b(OTC|RX|Rx)\b/g, '')
	compact = compact.replace(/(甲类|乙类|非处方药|处方药|外用药|医保|基药|儿童装|成人装)/g, '')
	compact = compact.replace(/(批准文号|国药准字|生产企业|生产厂家|厂家|厂址|规格|有效期|失效期|生产日期|批号|条形码|条码|二维码|扫码).*$/g, '')
	compact = compact.replace(/(用法用量|用法|用量|服法|成份|成分|功能主治|主治|适应症|禁忌|不良反应|注意事项|贮藏|储藏|包装|说明书|执行标准).*$/g, '')
	compact = compact.replace(/(每盒|每瓶|每板|每支|每袋|每片|每粒).*$/g, '')
	compact = compact.replace(/[0-9]+(\.[0-9]+)?\s*(mg|g|ml|mL|ML|毫克|克|毫升|μg|ug|UG|IU|单位).*$/g, '')
	compact = compact.replace(/(片|分散片|咀嚼片|胶囊|软胶囊|颗粒|口服液|滴眼液|眼膏|软膏|喷雾剂|丸|散|糖浆|混悬液|注射液|凝胶|滴丸|贴膏|乳膏|水剂|洗剂|酊|栓|露|膏|滴剂)(?:[0-9]+.*)?$/g, '$1')
	compact = compact.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
	compact = compact.replace(/^(OTC|RX)+/i, '').replace(/(OTC|RX)+$/i, '')
	return { text: compact, hadNamePrefix }
}

function normalizeAcceptedName(text) {
	const raw = String(text || '')
	const parsed = cleanNameCandidate(raw)
	const cleaned = parsed.text
	if (!cleaned || isGenericMedicineWord(cleaned)) return ''
	const matched = matchByText(cleaned)
	if (!matched && !parsed.hadNamePrefix && !FORM_WORD_PATTERN.test(cleaned)) return ''
	if (isNonNameLine(raw, cleaned, parsed.hadNamePrefix, matched)) return ''
	return cleaned
}

function isNonNameLine(rawLine, name, hadNamePrefix, matched) {
	const raw = String(rawLine || '')
	if (!hadNamePrefix && INFO_WORD_PATTERN.test(raw)) return true
	if (!matched && COMPANY_WORD_PATTERN.test(raw + name)) return true
	if (/^(国药准字|国药|H[0-9]|Z[0-9]|S[0-9])/i.test(name)) return true
	if (/^[0-9A-Za-z]+$/.test(name) && !matched) return true
	if (/^[0-9]+(片|粒|袋|支|盒|瓶|板|毫升|克|毫克)$/i.test(name)) return true
	return false
}

function isGenericMedicineWord(text) {
	const compact = String(text || '').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
	return !compact || GENERIC_NAME_PATTERN.test(compact)
}

function countChinese(text) {
	const match = String(text || '').match(/[\u4e00-\u9fa5]/g)
	return match ? match.length : 0
}

function countNumericAndLatin(text) {
	const match = String(text || '').match(/[A-Za-z0-9]/g)
	return match ? match.length : 0
}

function extractMedicineName(text) {
	const source = String(text || '')
		.replace(/\r/g, '\n')
		.split(/\n|。|，|,|；|;|\s{2,}/)
		.map((s) => s.trim())
		.filter(Boolean)

	const dosageWords = /(用法|用量|规格|成份|成分|功能|主治|禁忌|不良|批准|国药|生产|有效期|贮藏|包装|说明书|企业|公司|地址|电话|注册|商标|请仔细)/
	const formWords = /(片|胶囊|颗粒|口服液|滴眼液|眼膏|软膏|喷雾剂|丸|散|糖浆|混悬液|注射液|凝胶|滴丸|贴膏|乳膏)/
	const namePrefix = /(通用名称|商品名称|药品名称|名称)[:：]?/
	let best = ''
	let bestScore = 0

	source.forEach((line) => {
		let compact = line.replace(namePrefix, '').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
		if (!compact || dosageWords.test(compact)) return
		compact = fixCommonOcrMistakes(compact)
		if (isGenericMedicineWord(compact)) return
		let score = 0
		if (namePrefix.test(line)) score += 6
		if (formWords.test(compact)) score += 4
		if (/^[\u4e00-\u9fa5A-Za-z0-9]{2,24}$/.test(compact)) score += 2
		if (compact.length >= 3 && compact.length <= 18) score += 2
		if (/^[\u4e00-\u9fa5]{2,}/.test(compact)) score += 1
		if (/[药医械准字号]/.test(compact)) score -= 2
		if (score > bestScore) {
			bestScore = score
			best = compact
		}
	})

	return bestScore >= 4 ? best : ''
}

function fixCommonOcrMistakes(text) {
	return String(text || '')
		.replace(/胶囊囊/g, '胶囊')
		.replace(/滴眼夜/g, '滴眼液')
		.replace(/口服夜/g, '口服液')
		.replace(/维生索/g, '维生素')
		.replace(/阿莫酉林/g, '阿莫西林')
		.replace(/氯雷他啶/g, '氯雷他定')
}

function extractLineAfter(text, pattern) {
	const lines = String(text || '').split(/\n|。|；|;/).map((s) => s.trim()).filter(Boolean)
	const hit = lines.find((line) => pattern.test(line))
	return hit ? hit.replace(pattern, '').replace(/^[:：]/, '').trim() : ''
}

function extractDosage(text) {
	const source = String(text || '')
	const direct = extractLineAfter(source, /(用法用量|用法|用量|服法)/)
	if (direct) return cleanInfoLine(direct)
	const match = source.match(/(一日|每日|每天|1日|日服)\s*[一二三四五六七八九十0-9]+\s*(次|回)[，,、\s]*(一次|每次)?\s*[一二三四五六七八九十0-9半]+\s*(片|粒|袋|支|丸|滴|毫升|ml|mL)?/i)
	if (match) return cleanInfoLine(match[0])
	const english = source.match(/([0-9]+)\s*(次|回)\s*(\/|每)?\s*(日|天).*?([0-9]+)\s*(片|粒|袋|支|丸|滴)/)
	return english ? cleanInfoLine(english[0]) : ''
}

function extractIngredients(text) {
	return cleanInfoLine(extractLineAfter(text, /(成份|成分|主要成份|主要成分)/))
}

function extractPrecautions(text) {
	return cleanInfoLine(extractLineAfter(text, /(注意事项|禁忌|不良反应)/))
}

function extractExpiryText(text) {
	const source = String(text || '')
	const match = source.match(/(有效期至|有效期|生产日期|失效期|EXP|Exp)[:：]?\s*([0-9]{4}[-./年][0-9]{1,2}[-./月][0-9]{1,2}|[0-9]{4}[-./年][0-9]{1,2})/i)
	return match ? match[0] : ''
}

function cleanInfoLine(text) {
	return String(text || '')
		.replace(/\s+/g, '')
		.replace(/^[:：]/, '')
		.slice(0, 80)
}

function parseExpiryDate(text) {
	const source = String(text || '')
	let match = source.match(/([0-9]{4})[-./年]([0-9]{1,2})[-./月]([0-9]{1,2})/)
	if (match) {
		const d = new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10), 23, 59, 59, 999)
		return Number.isNaN(d.getTime()) ? null : d.getTime()
	}
	match = source.match(/([0-9]{4})[-./年]([0-9]{1,2})/)
	if (match) {
		const d = new Date(parseInt(match[1], 10), parseInt(match[2], 10), 0, 23, 59, 59, 999)
		return Number.isNaN(d.getTime()) ? null : d.getTime()
	}
	return null
}
