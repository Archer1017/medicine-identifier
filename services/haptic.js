/**
 * 震动反馈服务。所有反馈语音 + 震动双通道（无障碍要求）。
 *
 * 约定模式：
 * - 成功 = 两短震
 * - 失败 = 一长震
 * - 提醒 = 三短震
 *
 * uni.vibrateShort / uni.vibrateLong 各端支持良好；
 * 组合模式用 setTimeout 串联短震实现。
 */

import { vibrationEnabled } from './settings.js'

function short() {
	try {
		uni.vibrateShort({ fail: () => {} })
	} catch (e) {}
}

function long() {
	try {
		uni.vibrateLong({ fail: () => {} })
	} catch (e) {}
}

/** 成功：两短震 */
export function success() {
	if (!vibrationEnabled()) return
	short()
	setTimeout(short, 180)
}

/** 失败：一长震 */
export function failure() {
	if (!vibrationEnabled()) return
	long()
}

/** 提醒：三短震 */
export function reminder() {
	if (!vibrationEnabled()) return
	short()
	setTimeout(short, 160)
	setTimeout(short, 320)
}

/** 轻触反馈（拍照瞬间）——不受“仅语音”开关限制，属操作即时反馈 */
export function tap() {
	short()
}
