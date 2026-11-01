<template>
	<view class="page-container settings">
		<!-- 语速 -->
		<text class="section" role="heading" aria-level="2">语速调节</text>
		<button
			v-for="opt in rateOptions"
			:key="opt.key"
			class="a11y-btn"
			:class="settings.speechRate === opt.key ? 'a11y-btn-primary' : 'a11y-btn-secondary'"
			:aria-label="'语速，' + opt.label + (settings.speechRate === opt.key ? '，已选中' : '，双击选择')"
			@click="setRate(opt.key)"
		>{{ opt.label }}{{ settings.speechRate === opt.key ? ' ✓' : '' }}</button>

		<!-- 提醒方式 -->
		<text class="section" role="heading" aria-level="2">提醒方式</text>
		<button
			v-for="opt in reminderOptions"
			:key="opt.key"
			class="a11y-btn"
			:class="settings.reminderMode === opt.key ? 'a11y-btn-primary' : 'a11y-btn-secondary'"
			:aria-label="'提醒方式，' + opt.label + (settings.reminderMode === opt.key ? '，已选中' : '，双击选择')"
			@click="setReminderMode(opt.key)"
		>{{ opt.label }}{{ settings.reminderMode === opt.key ? ' ✓' : '' }}</button>

		<!-- NFC 开关 -->
		<text class="section" role="heading" aria-level="2">NFC 功能</text>
		<button
			class="a11y-btn"
			:class="settings.nfcEnabled ? 'a11y-btn-primary' : 'a11y-btn-secondary'"
			:aria-label="'NFC 功能，开启' + (settings.nfcEnabled ? '，已选中' : '，双击开启')"
			@click="setNfc(true)"
		>开启{{ settings.nfcEnabled ? ' ✓' : '' }}</button>
		<button
			class="a11y-btn"
			:class="!settings.nfcEnabled ? 'a11y-btn-primary' : 'a11y-btn-secondary'"
			:aria-label="'NFC 功能，关闭' + (!settings.nfcEnabled ? '，已选中' : '，双击关闭')"
			@click="setNfc(false)"
		>关闭{{ !settings.nfcEnabled ? ' ✓' : '' }}</button>

		<!-- 使用帮助 -->
		<text class="section" role="heading" aria-level="2">使用帮助</text>
		<button class="a11y-btn a11y-btn-secondary" @click="readHelp" aria-label="朗读使用帮助，双击听取完整说明">双击此处朗读完整使用帮助</button>
		<voice-assistant context="settings" />
	</view>
</template>

<script>
	import VoiceAssistant from '../../components/voice-assistant/voice-assistant.vue'
	import { getSettings, updateSettings, getSpeechRateLabel } from '../../services/settings.js'
	import * as tts from '../../services/tts.js'

	const HELP_TEXT =
		'药品分辨器使用帮助。' +
		'第一，识别药品：打开应用会自动进入识别页并开启摄像头，把药盒对准镜头，按语音提示调整位置，画面清晰后会自动拍照并朗读药品信息。' +
		'第二，保存药品：识别后双击保存到药箱按钮即可。' +
		'第三，NFC贴纸：在药品详情页绑定一张NFC贴纸，以后手机碰触贴纸即可听到药品信息。' +
		'第四，服药提醒：在药品详情页设置提醒时间，到点后手机会通知并朗读该吃哪种药。' +
		'第五，双击通知上的已服用按钮记录服药。'

	export default {
		components: {
			VoiceAssistant
		},
		data() {
			return {
				settings: getSettings(),
				rateOptions: [
					{ key: 'slow', label: '慢' },
					{ key: 'medium', label: '中' },
					{ key: 'fast', label: '快' }
				],
				reminderOptions: [
					{ key: 'voiceAndVibration', label: '语音加震动' },
					{ key: 'voiceOnly', label: '仅语音' }
				]
			}
		},
		onShow() {
			tts.speak('设置页面。可以调整语速、提醒方式和 NFC 功能。底部语音助手可以打开其他页面。')
		},
		methods: {
			getNarrationText() {
				return '设置。功能：调语速、调提醒方式、开关 NFC、朗读帮助、语音助手。'
			},
			setRate(key) {
				this.settings = updateSettings({ speechRate: key })
				tts.speak('语速已设为' + getSpeechRateLabel())
			},
			setReminderMode(key) {
				this.settings = updateSettings({ reminderMode: key })
				tts.speak('提醒方式已设为' + (key === 'voiceAndVibration' ? '语音加震动' : '仅语音'))
			},
			setNfc(enabled) {
				this.settings = updateSettings({ nfcEnabled: enabled })
				tts.speak('NFC 功能已' + (enabled ? '开启' : '关闭'))
			},
			readHelp() {
				tts.speak(HELP_TEXT)
			}
		}
	}
</script>

<style>
	.settings {
		padding: 16px;
	}
	.section {
		display: block;
		font-size: 22px;
		font-weight: bold;
		margin: 20px 0 8px;
		color: #1a1a1a;
	}
</style>
