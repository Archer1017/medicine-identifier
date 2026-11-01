<template>
	<view class="page-container detail">
		<block v-if="medicine">
			<!-- 信息块：整块一个语义节点，一次读完 -->
			<view class="info-block" :aria-label="fullInfoLabel" role="text">
				<text v-for="(line, idx) in infoLines" :key="idx" class="info-line">{{ line }}</text>
			</view>

			<!-- 操作按钮 -->
			<button class="a11y-btn a11y-btn-primary" @click="readAll" aria-label="朗读全部信息">朗读全部信息</button>
			<button class="a11y-btn a11y-btn-secondary" @click="setSlot" :aria-label="slotBtnLabel">{{ slotBtnLabel }}</button>
			<button class="a11y-btn a11y-btn-secondary" @click="setReminder" :aria-label="reminderBtnLabel">{{ reminderBtnLabel }}</button>
			<button class="a11y-btn a11y-btn-secondary" @click="bindNfc" :aria-label="nfcBtnLabel">{{ nfcBtnLabel }}</button>

			<!-- 删除：内联二次确认，不用弹窗（弹窗会打断读屏焦点） -->
			<button
				v-if="!confirmingDelete"
				class="a11y-btn a11y-btn-secondary"
				@click="startDelete"
				:aria-label="'删除 ' + medicine.name + '，需要再次确认'"
			>删除此药品</button>
			<block v-else>
				<button class="a11y-btn a11y-btn-primary" @click="confirmDelete" :aria-label="'确认删除 ' + medicine.name + '，删除后会从药箱移除'">确认删除</button>
				<button class="a11y-btn a11y-btn-secondary" @click="cancelDelete" :aria-label="'取消删除 ' + medicine.name">取消删除</button>
			</block>
		</block>

		<view v-else class="empty">
			<text class="status-text" role="alert">药品不存在</text>
		</view>
		<voice-assistant context="detail" />
	</view>
</template>

<script>
	import VoiceAssistant from '../../components/voice-assistant/voice-assistant.vue'
	import {
		getMedicine,
		getSchedulesForMedicine,
		insertSchedule,
		deleteMedicine,
		updateMedicine,
		setMedicineSlot,
		isExpired,
		isExpiringSoon,
		daysUntilExpiry
	} from '../../services/storage.js'
	import { scheduleDaily } from '../../services/notification.js'
	import { isAvailable, readTagId, writeMedicineId } from '../../services/nfc.js'
	import { getSettings } from '../../services/settings.js'
	import * as tts from '../../services/tts.js'
	import * as haptic from '../../services/haptic.js'

	export default {
		components: {
			VoiceAssistant
		},
		data() {
			return {
				medicineId: null,
				medicine: null,
				schedules: [],
				confirmingDelete: false
			}
		},
		computed: {
			infoLines() {
				const m = this.medicine
				if (!m) return []
				const lines = []
				lines.push('用法用量：' + (m.dosage || '未填写'))
				if (m.expiryDate) {
					const d = new Date(m.expiryDate)
					let s = '有效期至：' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'
					if (isExpired(m)) s += '（已过期，请勿服用）'
					else if (isExpiringSoon(m)) s += '（即将过期，还剩' + daysUntilExpiry(m) + '天）'
					lines.push(s)
				}
				if (m.precautions) lines.push('注意事项：' + m.precautions)
				if (m.ingredients) lines.push('主要成分：' + m.ingredients)
				if (m.stickerColor) lines.push('贴纸颜色：' + m.stickerColor)
				if (m.slot) lines.push('存放格子：' + m.slot + ' 号')
				if (m.nfcTagId) lines.push('已绑定NFC贴纸')
				const c = new Date(m.createdAt)
				lines.push('录入时间：' + c.getFullYear() + '年' + (c.getMonth() + 1) + '月' + c.getDate() + '日')
				return lines
			},
			fullInfoLabel() {
				return (this.medicine ? this.medicine.name + ' 的详细信息。' : '') + this.infoLines.join('。')
			},
			reminderBtnLabel() {
				return this.schedules.length === 0
					? '设置服药提醒'
					: '添加服药提醒，当前已有' + this.schedules.length + '个'
			},
			nfcBtnLabel() {
				return this.medicine && this.medicine.nfcTagId ? '重新绑定NFC贴纸' : '绑定NFC贴纸'
			},
			slotBtnLabel() {
				return this.medicine && this.medicine.slot
					? '修改存放格子，当前 ' + this.medicine.slot + ' 号'
					: '设置存放格子'
			}
		},
		onLoad(options) {
			this.medicineId = parseInt(options.id, 10)
			this.load()
		},
		onShow() {
			if (this.medicine) {
				tts.speak(this.medicine.name + '详情页。可以朗读全部信息、设置存放格子、设置服药提醒、绑定NFC贴纸。底部语音助手可以打开其他页面。')
			}
		},
		onUnload() {
			tts.stop()
		},
		methods: {
			getNarrationText() {
				if (!this.medicine) return '药品不存在。'
				return this.medicine.name + '详情。功能：朗读信息、设置格子、设置提醒、绑定 NFC、删除药品、语音助手。'
			},
			load() {
				this.medicine = getMedicine(this.medicineId)
				this.schedules = getSchedulesForMedicine(this.medicineId)
				if (this.medicine) {
					uni.setNavigationBarTitle({ title: this.medicine.name })
				}
			},

			readAll() {
				const m = this.medicine
				if (!m) return
				const segs = ['药名，' + m.name + '。']
				if (m.dosage) segs.push('用法用量，' + m.dosage + '。')
				if (m.expiryDate) {
					const d = new Date(m.expiryDate)
					segs.push('有效期至，' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日。')
					if (isExpired(m)) segs.push('警告，此药已过期，请勿服用。')
				}
				if (m.precautions) segs.push('注意事项，' + m.precautions + '。')
				if (m.ingredients) segs.push('主要成分，' + m.ingredients + '。')
				tts.speakSegments(segs)
			},

			// 设置存放格子。用 actionSheet 选 1-12 号（读屏可逐项朗读），
			// 选中即写入。这样盲人以后能在“找药”页快速定位。
			setSlot() {
				const m = this.medicine
				if (!m) return
				tts.stop()
				const slots = []
				for (let i = 1; i <= 12; i++) slots.push(i + ' 号格子')
				slots.push('清除格子设置')
				uni.showActionSheet({
					itemList: slots,
					success: (res) => {
						let slot = ''
						if (res.tapIndex < 12) slot = String(res.tapIndex + 1)
						setMedicineSlot(m.id, slot)
						haptic.success()
						if (slot) {
							tts.speak('已把 ' + m.name + ' 记录在 ' + slot + ' 号格子。以后可以在找药页面查询。')
						} else {
							tts.speak('已清除 ' + m.name + ' 的格子设置')
						}
						this.load()
					},
					fail: () => {}
				})
			},

			setReminder() {
				const m = this.medicine
				if (!m) return
				tts.stop()
				this.pickTime()
			},

			// 快捷时间选择。用 actionSheet 提供常用服药时间点，
			// 每项文字明确，读屏可逐项朗读，选中即建提醒。
			pickTime() {
				const m = this.medicine
				uni.showActionSheet({
					itemList: ['08:00', '12:00', '18:00', '22:00'],
					success: (res) => {
						const times = [[8, 0], [12, 0], [18, 0], [22, 0]]
						const [hour, minute] = times[res.tapIndex]
						const timing = (m.dosage || '').indexOf('饭前') >= 0
							? '饭前'
							: (m.dosage || '').indexOf('饭后') >= 0 ? '饭后' : ''
						const schedule = insertSchedule({
							medicineId: m.id,
							hour, minute,
							quantity: 1,
							timing,
							enabled: true
						})
						scheduleDaily(m, schedule)
						haptic.success()
						const hh = ('0' + hour).slice(-2)
						const mm = ('0' + minute).slice(-2)
						tts.speak('已设置每日 ' + hh + ':' + mm + ' 提醒服用 ' + m.name)
						this.load()
					},
					fail: () => {}
				})
			},

			async bindNfc() {
				const m = this.medicine
				if (!m) return
				const settings = getSettings()
				if (!settings.nfcEnabled) {
					haptic.failure()
					tts.speak('NFC 功能未开启，请到设置页开启')
					return
				}
				// #ifndef APP-PLUS
				haptic.failure()
				tts.speak('NFC 仅在手机 App 端可用，请在真机体验')
				return
				// #endif
				tts.speak('请将手机贴近 NFC 贴纸')
				if (!isAvailable()) {
					haptic.failure()
					tts.speak('本设备不支持 NFC，或 NFC 未开启')
					return
				}
				const tagId = await readTagId()
				if (!tagId) {
					haptic.failure()
					tts.speak('未读到贴纸，请重试')
					return
				}
				await writeMedicineId(m.id)
				updateMedicine({ id: m.id, nfcTagId: tagId })
				haptic.success()
				tts.speak('绑定成功。以后碰触这张贴纸即可听到 ' + m.name + ' 的信息')
				this.load()
			},

			startDelete() {
				this.confirmingDelete = true
				tts.speak('确认删除 ' + this.medicine.name + ' 吗？双击确认删除，或选择取消。')
			},
			confirmDelete() {
				const m = this.medicine
				deleteMedicine(m.id)
				haptic.success()
				tts.speak('已删除 ' + m.name)
				uni.navigateBack()
			},
			cancelDelete() {
				this.confirmingDelete = false
				tts.speak('已取消删除')
			}
		}
	}
</script>

<style>
	.detail {
		padding: 16px;
	}
	.info-block {
		border: 2px solid #666666;
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 16px;
		display: flex;
		flex-direction: column;
	}
	.info-line {
		font-size: 20px;
		line-height: 1.5;
		padding: 6px 0;
		color: #1a1a1a;
	}
	.empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
