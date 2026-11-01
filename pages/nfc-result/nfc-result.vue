<template>
	<view class="page-container nfc-result">
		<block v-if="medicine">
			<text class="med-title" :aria-label="titleLabel" role="alert">{{ medicine.name }}</text>
			<button class="a11y-btn a11y-btn-primary" @click="speakAgain" :aria-label="'再次朗读 ' + medicine.name + ' 的药品信息'">再次朗读</button>
			<button class="a11y-btn a11y-btn-secondary" @click="goBack" aria-label="返回上一页">返回</button>
		</block>

		<block v-else-if="checked">
			<text class="med-title" role="alert">这张贴纸还没有绑定药品</text>
			<button class="a11y-btn a11y-btn-primary" @click="goScan" aria-label="打开扫描器，识别并录入新药">去识别录入新药</button>
			<button class="a11y-btn a11y-btn-secondary" @click="goBack" aria-label="返回上一页">返回</button>
		</block>

		<view v-else class="empty">
			<text class="status-text">正在读取…</text>
		</view>
		<voice-assistant context="nfc" />
	</view>
</template>

<script>
	import VoiceAssistant from '../../components/voice-assistant/voice-assistant.vue'
	import {
		getMedicineByNfc,
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
				tagId: null,
				medicine: null,
				checked: false
			}
		},
		computed: {
			titleLabel() {
				const m = this.medicine
				if (!m) return ''
				return m.name + (isExpired(m) ? '，已过期，请勿服用' : '')
			}
		},
		onLoad(options) {
			this.tagId = options.tagId ? decodeURIComponent(options.tagId) : null
			this.lookup()
		},
		onUnload() {
			tts.stop()
		},
		methods: {
			getNarrationText() {
				if (!this.checked) return '正在读取 NFC 贴纸。'
				if (!this.medicine) return 'NFC未绑定。功能：录入新药、返回、语音助手。'
				return 'NFC药品。功能：再次朗读、返回、语音助手。'
			},
			lookup() {
				this.medicine = this.tagId ? getMedicineByNfc(this.tagId) : null
				this.checked = true
				if (!this.medicine) {
					haptic.failure()
					tts.speak('这张贴纸还没有绑定药品。是否录入新药？')
					return
				}
				haptic.success()
				this.speakAgain()
			},
			speakAgain() {
				const m = this.medicine
				if (!m) return
				const segs = []
				if (isExpired(m)) segs.push('警告，' + m.name + ' 已过期，请勿服用。')
				segs.push('药名，' + m.name + '。')
				if (m.dosage) segs.push('用法用量，' + m.dosage + '。')
				if (m.expiryDate && !isExpired(m) && isExpiringSoon(m)) {
					segs.push('注意，还有' + daysUntilExpiry(m) + '天过期。')
				}
				if (m.precautions) segs.push('注意事项，' + m.precautions + '。')
				tts.speakSegments(segs)
			},
			goScan() {
				tts.speak('打开扫描器')
				uni.switchTab({ url: '/pages/scanner/scanner' })
			},
			goBack() {
				uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/scan/scan' }) })
			}
		}
	}
</script>

<style>
	.nfc-result {
		padding: 24px;
		justify-content: center;
	}
	.med-title {
		font-size: 28px;
		font-weight: bold;
		text-align: center;
		padding: 24px 0;
		color: #1a1a1a;
	}
	.empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
