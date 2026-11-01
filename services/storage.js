/**
 * 本地数据存储服务。
 *
 * 纯本地存储，保护用户隐私，不上传任何数据。
 * uni-app 跨端一致性最好的本地存储是 uni.storage（key-value）。
 * 这里在其上封装一个轻量“表”结构，模拟数据库的增删改查。
 *
 * 存储的三类数据：
 * - medicines   药品列表
 * - schedules   服药计划（提醒）
 * - logs        服药日志
 *
 * 说明：若后续需要更强的关系型能力，App 端可换成 SQLite 插件，
 * 只要保持本文件导出的函数签名不变，上层无需改动。
 */

const KEY_MEDICINES = 'medicines'
const KEY_SCHEDULES = 'schedules'
const KEY_LOGS = 'logs'
const KEY_AUTO_ID = 'auto_id'
const KEY_SEEDED = 'seeded'

// ---------------- 基础读写 ----------------

function readList(key) {
	try {
		const v = uni.getStorageSync(key)
		return Array.isArray(v) ? v : []
	} catch (e) {
		console.error('readList error', key, e)
		return []
	}
}

function writeList(key, list) {
	try {
		uni.setStorageSync(key, list)
	} catch (e) {
		console.error('writeList error', key, e)
	}
}

/** 自增主键 */
function nextId() {
	let id = 0
	try {
		id = uni.getStorageSync(KEY_AUTO_ID) || 0
	} catch (e) {}
	id += 1
	uni.setStorageSync(KEY_AUTO_ID, id)
	return id
}

export function initDatabase() {
	// key-value 存储无需建表，确保基础 key 存在即可
	if (!Array.isArray(uni.getStorageSync(KEY_MEDICINES))) writeList(KEY_MEDICINES, [])
	if (!Array.isArray(uni.getStorageSync(KEY_SCHEDULES))) writeList(KEY_SCHEDULES, [])
	if (!Array.isArray(uni.getStorageSync(KEY_LOGS))) writeList(KEY_LOGS, [])
}

// ---------------- 过期计算工具 ----------------

/** 剩余天数（负数=已过期）；无有效期返回 null */
export function daysUntilExpiry(medicine) {
	if (!medicine.expiryDate) return null
	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const expiry = new Date(medicine.expiryDate)
	expiry.setHours(0, 0, 0, 0)
	return Math.round((expiry - today) / 86400000)
}

export function isExpired(medicine) {
	const d = daysUntilExpiry(medicine)
	return d !== null && d < 0
}

export function isExpiringSoon(medicine, days = 30) {
	const d = daysUntilExpiry(medicine)
	return d !== null && d <= days
}

// ---------------- Medicine CRUD ----------------

export function getAllMedicines() {
	const list = readList(KEY_MEDICINES)
	// 排序：正常(0) < 临期(1) < 过期(2)，过期排最后
	const rank = (m) => (isExpired(m) ? 2 : isExpiringSoon(m) ? 1 : 0)
	list.sort((a, b) => {
		const r = rank(a) - rank(b)
		if (r !== 0) return r
		return (b.createdAt || 0) - (a.createdAt || 0)
	})
	return list
}

export function getMedicine(id) {
	return readList(KEY_MEDICINES).find((m) => m.id === id) || null
}

export function getMedicineByNfc(tagId) {
	return readList(KEY_MEDICINES).find((m) => m.nfcTagId === tagId) || null
}

// ---------------- 药箱格子（slot）相关 ----------------
// 药品对象上的 slot 字段存放“格子编号”（字符串，如 "1" / "A3"）。
// 由 updateMedicine 直接合并写入，无需额外表。

/** 设置某药的存放格子（空字符串表示清除） */
export function setMedicineSlot(id, slot) {
	return updateMedicine({ id: id, slot: (slot || '').trim() })
}

/** 按格子编号找药（一个格子可能放多种药） */
export function getMedicinesBySlot(slot) {
	const key = (slot || '').trim()
	return readList(KEY_MEDICINES).filter((m) => (m.slot || '') === key)
}

/**
 * 返回所有已使用的格子及其药品，按格子编号排序。
 * [{ slot: '1', medicines: [...] }, ...]
 */
export function getSlotMap() {
	const list = readList(KEY_MEDICINES).filter((m) => m.slot && m.slot.trim())
	const map = {}
	list.forEach((m) => {
		const s = m.slot.trim()
		if (!map[s]) map[s] = []
		map[s].push(m)
	})
	return Object.keys(map)
		.sort((a, b) => a.localeCompare(b, 'zh', { numeric: true }))
		.map((slot) => ({ slot: slot, medicines: map[slot] }))
}

export function insertMedicine(medicine) {
	const list = readList(KEY_MEDICINES)
	const record = Object.assign({}, medicine, {
		id: nextId(),
		createdAt: medicine.createdAt || Date.now()
	})
	list.push(record)
	writeList(KEY_MEDICINES, list)
	return record
}

export function updateMedicine(medicine) {
	const list = readList(KEY_MEDICINES)
	const idx = list.findIndex((m) => m.id === medicine.id)
	if (idx >= 0) {
		list[idx] = Object.assign({}, list[idx], medicine)
		writeList(KEY_MEDICINES, list)
		return list[idx]
	}
	return null
}

export function deleteMedicine(id) {
	// 级联删除该药的计划与日志
	writeList(KEY_MEDICINES, readList(KEY_MEDICINES).filter((m) => m.id !== id))
	writeList(KEY_SCHEDULES, readList(KEY_SCHEDULES).filter((s) => s.medicineId !== id))
	writeList(KEY_LOGS, readList(KEY_LOGS).filter((l) => l.medicineId !== id))
}

// ---------------- Schedule CRUD ----------------

export function getSchedulesForMedicine(medicineId) {
	return readList(KEY_SCHEDULES)
		.filter((s) => s.medicineId === medicineId)
		.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
}

export function getAllEnabledSchedules() {
	return readList(KEY_SCHEDULES).filter((s) => s.enabled)
}

export function insertSchedule(schedule) {
	const list = readList(KEY_SCHEDULES)
	const record = Object.assign({ enabled: true, quantity: 1, timing: '' }, schedule, {
		id: nextId()
	})
	list.push(record)
	writeList(KEY_SCHEDULES, list)
	return record
}

export function updateSchedule(schedule) {
	const list = readList(KEY_SCHEDULES)
	const idx = list.findIndex((s) => s.id === schedule.id)
	if (idx >= 0) {
		list[idx] = Object.assign({}, list[idx], schedule)
		writeList(KEY_SCHEDULES, list)
		return list[idx]
	}
	return null
}

export function deleteSchedule(id) {
	writeList(KEY_SCHEDULES, readList(KEY_SCHEDULES).filter((s) => s.id !== id))
}

// ---------------- Log ----------------

export function insertLog(log) {
	const list = readList(KEY_LOGS)
	const record = Object.assign({}, log, { id: nextId() })
	list.push(record)
	writeList(KEY_LOGS, list)
	return record
}

export function getLogsForMedicine(medicineId) {
	return readList(KEY_LOGS)
		.filter((l) => l.medicineId === medicineId)
		.sort((a, b) => b.takenTime - a.takenTime)
}

// ---------------- 示例数据 ----------------

export function seedSampleIfEmpty() {
	if (uni.getStorageSync(KEY_SEEDED)) return
	const existing = readList(KEY_MEDICINES)
	if (existing.length > 0) {
		uni.setStorageSync(KEY_SEEDED, true)
		return
	}
	// 三种状态：正常 / 临期 / 过期，便于测试
	const samples = [
		{
			name: '布洛芬缓释胶囊',
			dosage: '每日两次，每次一粒，饭后服用',
			expiryDays: 400,
			precautions: '服药期间禁止饮酒，胃溃疡患者慎用',
			ingredients: '布洛芬 0.3克每粒',
			barcode: '0000000000001',
			stickerColor: '红色',
			confidence: 0.97
		},
		{
			name: '氯雷他定片',
			dosage: '每日一次，每次一片',
			expiryDays: 20,
			precautions: '服药后可能嗜睡，避免驾车',
			ingredients: '氯雷他定 10毫克每片',
			barcode: '6901234500028',
			stickerColor: '蓝色',
			confidence: 0.88
		},
		{
			name: '阿莫西林胶囊',
			dosage: '每日三次，每次两粒，饭前服用',
			expiryDays: -5,
			precautions: '青霉素过敏者禁用，需按疗程服完',
			ingredients: '阿莫西林 0.25克每粒',
			barcode: '6901234500011',
			stickerColor: '绿色',
			confidence: 0.93
		}
	]
	samples.forEach((s) => {
		const expiry = new Date()
		expiry.setDate(expiry.getDate() + s.expiryDays)
		insertMedicine({
			name: s.name,
			dosage: s.dosage,
			expiryDate: expiry.getTime(),
			precautions: s.precautions,
			ingredients: s.ingredients,
			barcode: s.barcode,
			stickerColor: s.stickerColor,
			confidence: s.confidence,
			nfcTagId: null,
			photoPath: null
		})
	})
	uni.setStorageSync(KEY_SEEDED, true)
}
