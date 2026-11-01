/**
 * 实体药箱（硬件）接口 —— 预留占位。
 *
 * 目标：配合你朋友做的实体药箱。找到某药后，让对应格子“有反应”
 * （点亮 LED / 蜂鸣 / 弹开等），进一步帮助盲人定位。
 *
 * 现在是「软件记录版」：所有函数只做本地行为（语音提示），
 * 不真正连硬件。拿到你朋友的蓝牙通信协议后，把下面 TODO 处替换为
 * 真实的 uni.createBLEConnection / writeBLECharacteristicValue 调用即可，
 * 页面逻辑无需改动。
 *
 * 典型对接需要朋友提供：
 *   1. 蓝牙广播名 / Service UUID / Characteristic UUID
 *   2. “点亮第 N 个格子”对应的指令字节（协议）
 */

let connected = false
let deviceId = null

/** 硬件是否已连接 */
export function isConnected() {
	return connected
}

/**
 * 扫描并连接实体药箱（蓝牙）。
 * 现在为占位：直接返回未连接。接入时实现真实 BLE 流程。
 */
export function connect() {
	return new Promise((resolve) => {
		// #ifdef APP-PLUS
		// TODO: 真实蓝牙连接
		// uni.openBluetoothAdapter(...)
		// uni.startBluetoothDevicesDiscovery(...)
		// 找到药箱后 uni.createBLEConnection({ deviceId })
		// 成功后 connected = true; deviceId = ...
		// #endif
		console.log('[pillbox] 连接占位：未接入真实硬件')
		resolve(false)
	})
}

/**
 * 点亮 / 提示某个格子，帮助盲人定位。
 * @param {string} slot 格子编号
 * @returns {Promise<boolean>} 是否成功下发硬件指令
 */
export function highlightSlot(slot) {
	return new Promise((resolve) => {
		if (!connected) {
			// 未连硬件：软件降级，仅返回 false，由页面用语音播报位置
			resolve(false)
			return
		}
		// #ifdef APP-PLUS
		// TODO: 按协议把“点亮第 slot 格”指令写入特征值
		// const buffer = buildCommand(slot)
		// uni.writeBLECharacteristicValue({ deviceId, serviceId, characteristicId, value: buffer })
		// #endif
		console.log('[pillbox] highlightSlot 占位：', slot)
		resolve(false)
	})
}

/** 断开连接 */
export function disconnect() {
	// #ifdef APP-PLUS
	// if (deviceId) uni.closeBLEConnection({ deviceId })
	// #endif
	connected = false
	deviceId = null
}
