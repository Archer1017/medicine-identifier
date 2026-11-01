/**
 * 本地参考药品库服务。
 * 用于 OCR 结果的交叉校验：能匹配到标准记录时，用标准信息覆盖 OCR 结果。
 * 纯本地内置，离线可用、保护隐私。生产环境可替换为联网药监局数据库。
 */

import referenceData from './drugReferenceData.js'

let refs = []
let loaded = false

/** 载入内置参考库（JS 模块，跨端可靠） */
export function loadDrugReference() {
	return new Promise((resolve) => {
		if (loaded) {
			resolve(refs)
			return
		}
		try {
			refs = referenceData || []
			loaded = true
		} catch (e) {
			console.error('loadDrugReference error', e)
			refs = []
		}
		resolve(refs)
	})
}

/** 条形码精确匹配 */
export function matchByBarcode(barcode) {
	if (!barcode) return null
	return refs.find((r) => r.barcode === barcode) || null
}

/**
 * 药名 / 别名文本模糊匹配。
 * 返回 { ref, score }，score 为 0-1 置信度。
 */
export function matchByText(ocrText) {
	if (!ocrText) return null
	const normalized = normalizeText(ocrText)
	if (isGenericQuery(normalized)) return null
	let best = null
	let bestScore = 0
	for (const r of refs) {
		const candidates = [r.name].concat(r.aliases || [])
		for (const c of candidates) {
			const candidate = normalizeText(c)
			if (isGenericQuery(candidate)) continue
			const score = scoreCandidate(normalized, candidate, normalizeText(r.name))
			if (score > bestScore) {
				bestScore = score
				best = r
			}
		}
	}
	if (!best || bestScore < 0.48) return null
	return { ref: best, score: bestScore }
}

function normalizeText(text) {
	return String(text || '')
		.toLowerCase()
		.replace(/[^\u4e00-\u9fa5a-z0-9]/g, '')
		.replace(/o/g, '0')
		.replace(/l/g, '1')
		.replace(/通用名称|商品名称|药品名称|名称|规格|批准文号|国药准字|生产企业|有限公司/g, '')
		.replace(/盐酸|马来酸|醋酸/g, '')
}

function isGenericQuery(text) {
	return /^(药品|药物|药名|名称|片|片剂|胶囊|胶囊剂|软胶囊|颗粒|颗粒剂|口服液|滴眼液|眼药水|眼膏|软膏|喷雾剂|丸|散|糖浆|混悬液|注射液|凝胶|滴丸|贴膏|乳膏|水剂|洗剂|酊|栓|露|膏|滴剂|otc|rx|处方药|非处方药|甲类|乙类|外用药)$/.test(text)
}

function scoreCandidate(haystack, candidate, fullName) {
	if (!haystack || !candidate) return 0
	if (haystack.indexOf(candidate) >= 0) {
		const ratio = Math.min(1, candidate.length / Math.max(fullName.length, 1))
		return 0.78 + 0.2 * ratio
	}
	if (candidate.indexOf(haystack) >= 0 && haystack.length >= 3) {
		return Math.min(0.9, 0.62 + haystack.length / Math.max(candidate.length, 1) * 0.25)
	}

	const lcs = longestCommonSubsequence(candidate, haystack)
	const coverage = lcs / candidate.length
	const uniqueChars = Array.from(new Set(candidate.split('')))
	const overlap = uniqueChars.filter((ch) => haystack.indexOf(ch) >= 0).length / uniqueChars.length

	if (candidate.length <= 2 && coverage < 1) return 0
	if (lcs < 2) return 0
	const formBonus = /(片|胶囊|颗粒|滴眼液|眼膏|口服液|散|丸)/.test(haystack) && /(片|胶囊|颗粒|滴眼液|眼膏|口服液|散|丸)/.test(candidate) ? 0.08 : 0
	return Math.max(coverage * 0.76, overlap * 0.62) + formBonus
}

function longestCommonSubsequence(a, b) {
	const dp = new Array(b.length + 1).fill(0)
	for (let i = 1; i <= a.length; i++) {
		let prev = 0
		for (let j = 1; j <= b.length; j++) {
			const tmp = dp[j]
			dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1])
			prev = tmp
		}
	}
	return dp[b.length]
}
