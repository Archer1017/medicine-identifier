<template>
	<view class="page-container cabinet-page">
		<view class="cabinet-header" :aria-label="cabinetSummary" role="button" tabindex="0" @click="speakCabinetSummary">
			<view class="header-copy">
				<text class="eyebrow">我的药箱</text>
				<text class="headline">按状态查看药品</text>
			</view>
			<view class="summary-row">
				<view class="summary-block">
					<text class="summary-number">{{ medicines.length }}</text>
					<text class="summary-label">种药品</text>
				</view>
				<view class="summary-block summary-attention">
					<text class="summary-number">{{ attentionCount }}</text>
					<text class="summary-label">项需注意</text>
				</view>
			</view>
		</view>

		<text class="status-banner" :aria-label="statusText" role="alert" v-if="statusText">{{ statusText }}</text>

		<view v-if="medicines.length === 0" class="empty" role="button" tabindex="0" aria-label="药箱是空的。请到识别页拍照添加药品" @click="speakEmpty">
			<text class="empty-title" role="alert">药箱是空的</text>
			<text class="empty-copy">请到识别页拍照添加药品，保存后会显示在这里。</text>
		</view>

		<scroll-view v-else scroll-y class="list">
			<view
				v-for="item in medicines"
				:key="item.id"
				class="med-item"
				:class="statusClass(item)"
			>
				<view
					class="med-main"
					:aria-label="semanticLabel(item)"
					role="button"
					tabindex="0"
					@click="speakMedicine(item)"
				>
					<view class="med-topline">
						<text class="med-name">{{ item.name }}</text>
						<text class="status-tag">{{ statusTag(item) }}</text>
					</view>
					<text class="med-next">{{ nextDoseLabel(item) }}</text>
					<text class="med-expiry">{{ expiryLabel(item) }}</text>
					<text class="med-slot">{{ slotLabel(item) }}</text>
				</view>
				<view class="item-actions">
					<button class="item-button" :aria-label="'设置 ' + item.name + ' 的存放格子'" @click.stop="setSlot(item)">格子</button>
					<button class="item-button item-button-dark" :aria-label="'打开 ' + item.name + ' 的详情'" @click.stop="openDetail(item)">详情</button>
				</view>
			</view>
		</scroll-view>
		<voice-assistant context="cabinet" @heard="statusText = '语音助手听到：' + $event" />
	</view>
</template>

<script>
	import VoiceAssistant from '../../components/voice-assistant/voice-assistant.vue'
	import {
		getAllMedicines,
		getSchedulesForMedicine,
		setMedicineSlot,
		isExpired,
		isExpiringSoon,
		daysUntilExpiry
	} from '../../services/storage.js'
	import * as tts from '../../services/tts.js'
	import * as haptic from '../../services/haptic.js'

	export default {
		components: {
			VoiceAssistant
		},
		data() {
			return {
				medicines: [],
				statusText: ''
			}
		},
		computed: {
			attentionCount() {
				return this.medicines.filter((m) => isExpired(m) || isExpiringSoon(m)).length
			},
			cabinetSummary() {
				return '药箱页面，共有 ' + this.medicines.length + ' 种药品，' + this.attentionCount + ' 项需要注意。点药品卡片会朗读药品信息，点格子按钮可以设置存放格子，点详情按钮查看完整信息。'
			}
		},
		onShow() {
			this.refresh()
			tts.speak('药箱页面。点药品卡片会朗读信息，点格子可以设置存放格子。底部语音助手可以打开日历、扫描器、找药或设置。')
		},
		methods: {
			getNarrationText() {
				if (!this.medicines.length) return '药箱。功能：添加药品、语音助手。'
				return '药箱。功能：查看药品、设置格子、查看详情、语音助手。共有 ' + this.medicines.length + ' 种药。'
			},
			refresh() {
				this.medicines = getAllMedicines()
			},
			speakCabinetSummary() {
				haptic.tap()
				this.statusText = this.cabinetSummary
				tts.speak(this.statusText)
			},
			speakEmpty() {
				haptic.tap()
				this.statusText = '药箱是空的。请到识别页拍照添加药品。'
				tts.speak(this.statusText)
			},
			statusPhrase(m) {
				if (isExpired(m)) return '已过期，请勿服用'
				if (isExpiringSoon(m)) return '即将过期，还剩' + daysUntilExpiry(m) + '天'
				return ''
			},
			statusTag(m) {
				if (isExpired(m)) return '已过期'
				if (isExpiringSoon(m)) return '临期'
				return '正常'
			},
			statusClass(m) {
				if (isExpired(m)) return 'is-expired'
				if (isExpiringSoon(m)) return 'is-warning'
				return 'is-normal'
			},
			expiryLabel(m) {
				const days = daysUntilExpiry(m)
				if (days === null) return '未记录有效期'
				if (days < 0) return '已过期 ' + Math.abs(days) + ' 天'
				if (days === 0) return '今天到期'
				return '有效期还剩 ' + days + ' 天'
			},
			slotLabel(m) {
				return m.slot ? ('格子：' + m.slot + ' 号') : '格子：未设置'
			},
			nextDoseLabel(m) {
				const schedules = getSchedulesForMedicine(m.id).filter((s) => s.enabled)
				if (schedules.length === 0) return '未设置服药提醒'
				const now = new Date()
				const nowMin = now.getHours() * 60 + now.getMinutes()
				let next = schedules[0]
				for (const s of schedules) {
					if (s.hour * 60 + s.minute >= nowMin) { next = s; break }
				}
				const hh = ('0' + next.hour).slice(-2)
				const mm = ('0' + next.minute).slice(-2)
				return '下次服用 ' + hh + ':' + mm
			},
			// 合并为一句完整语义描述
			semanticLabel(m) {
				const parts = [m.name]
				const status = this.statusPhrase(m)
				if (status) parts.push(status)
				parts.push(this.nextDoseLabel(m))
				parts.push(this.slotLabel(m))
				parts.push('双击朗读。右侧可设置格子或查看详情')
				return parts.join('，')
			},
			medicineSpeech(m) {
				const parts = [m.name]
				const status = this.statusPhrase(m)
				if (status) parts.push(status)
				parts.push(this.nextDoseLabel(m))
				parts.push(this.expiryLabel(m))
				parts.push(this.slotLabel(m))
				parts.push('可以点右侧格子按钮设置存放位置，或点详情查看完整信息')
				return parts.join('。')
			},
			speakMedicine(m) {
				haptic.tap()
				this.statusText = this.medicineSpeech(m)
				tts.speak(this.statusText)
			},
			setSlot(m) {
				if (!m) return
				haptic.tap()
				this.statusText = '正在为 ' + m.name + ' 设置存放格子。请选择一号到十二号格子，或清除格子设置。'
				tts.speak(this.statusText)
				const slots = []
				for (let i = 1; i <= 12; i++) slots.push(i + ' 号格子')
				slots.push('清除格子设置')
				uni.showActionSheet({
					itemList: slots,
					success: (res) => {
						let slot = ''
						if (res.tapIndex < 12) slot = String(res.tapIndex + 1)
						setMedicineSlot(m.id, slot)
						this.refresh()
						haptic.success()
						if (slot) {
							this.statusText = '已把 ' + m.name + ' 设置在 ' + slot + ' 号格子'
						} else {
							this.statusText = '已清除 ' + m.name + ' 的格子设置'
						}
						tts.speak(this.statusText)
					},
					fail: () => {
						this.statusText = '已取消设置格子'
						tts.speak(this.statusText)
					}
				})
			},
			openDetail(m) {
				haptic.tap()
				tts.speak('打开 ' + m.name + ' 的详情')
				uni.navigateTo({ url: '/pages/detail/detail?id=' + m.id })
			}
		}
	}
</script>

<style>
	.cabinet-page {
		background-color: #ffffff;
		color: #000000;
		box-sizing: border-box;
		padding: 20px 18px 0;
	}
	.cabinet-header {
		padding: 18px 0 16px;
		border-bottom: 3px solid #000000;
	}
	.header-copy {
		display: flex;
		flex-direction: column;
	}
	.eyebrow {
		font-size: 16px;
		font-weight: 700;
		color: #555555;
	}
	.headline {
		margin-top: 6px;
		font-size: 32px;
		line-height: 1.2;
		font-weight: 800;
		color: #000000;
	}
	.summary-row {
		display: flex;
		flex-direction: row;
		margin-top: 18px;
	}
	.summary-block {
		flex: 1;
		min-height: 86px;
		padding: 14px 16px;
		border: 2px solid #000000;
		background-color: #ffffff;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	.summary-attention {
		margin-left: 12px;
		background-color: #000000;
		color: #ffffff;
	}
	.summary-number {
		font-size: 34px;
		line-height: 1;
		font-weight: 900;
	}
	.summary-label {
		margin-top: 8px;
		font-size: 17px;
		font-weight: 700;
	}
	.status-banner {
		display: block;
		margin-top: 12px;
		padding: 14px 16px;
		border: 2px solid #000000;
		background-color: #000000;
		color: #ffffff;
		font-size: 20px;
		line-height: 1.35;
		font-weight: 800;
	}
	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 72px 14px;
		text-align: center;
	}
	.empty-title {
		font-size: 30px;
		line-height: 1.25;
		font-weight: 900;
		color: #000000;
	}
	.empty-copy {
		margin-top: 14px;
		font-size: 20px;
		line-height: 1.45;
		font-weight: 600;
		color: #444444;
	}
	.list {
		flex: 1;
		height: 100%;
		padding-top: 12px;
		box-sizing: border-box;
	}
	.med-item {
		display: flex;
		flex-direction: row;
		align-items: center;
		min-height: 118px;
		margin-bottom: 12px;
		padding: 18px 0 18px 16px;
		border: 2px solid #000000;
		background-color: #ffffff;
		box-sizing: border-box;
	}
	.med-item.is-expired {
		background-color: #000000;
		color: #ffffff;
	}
	.med-item.is-warning {
		border-width: 3px;
	}
	.med-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.med-topline {
		display: flex;
		flex-direction: row;
		align-items: flex-start;
	}
	.med-name {
		flex: 1;
		font-size: 25px;
		line-height: 1.25;
		font-weight: 800;
		color: inherit;
	}
	.status-tag {
		margin-left: 10px;
		padding: 5px 9px;
		border: 2px solid currentColor;
		font-size: 15px;
		line-height: 1;
		font-weight: 900;
		color: inherit;
		white-space: nowrap;
	}
	.med-next {
		font-size: 20px;
		line-height: 1.35;
		margin-top: 12px;
		font-weight: 700;
		color: inherit;
	}
	.med-expiry {
		font-size: 18px;
		line-height: 1.35;
		margin-top: 4px;
		font-weight: 600;
		color: inherit;
		opacity: 0.78;
	}
	.med-slot {
		font-size: 18px;
		line-height: 1.35;
		margin-top: 4px;
		font-weight: 800;
		color: inherit;
	}
	.item-actions {
		width: 80px;
		margin-left: 12px;
		border-left: 2px solid currentColor;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		align-self: stretch;
		color: inherit;
	}
	.item-button {
		width: 58px;
		min-height: 42px;
		margin: 4px 0;
		padding: 0;
		border: 2px solid currentColor;
		border-radius: 0;
		background-color: #ffffff;
		color: #000000;
		font-size: 16px;
		line-height: 1;
		font-weight: 800;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
	}
	.item-button::after {
		border: 0;
	}
	.item-button-dark {
		background-color: #000000;
		color: #ffffff;
	}
	.med-item.is-expired .item-button {
		background-color: #000000;
		color: #ffffff;
	}
	.med-item.is-expired .item-button-dark {
		background-color: #ffffff;
		color: #000000;
	}
</style>
