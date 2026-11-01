<template>
	<view class="page-container finder-page">
		<view class="finder-header" :aria-label="finderSummary" role="button" tabindex="0" @click="speakFinderSummary">
			<view class="header-copy">
				<text class="eyebrow">找药</text>
				<text class="headline">定位药品所在格子</text>
			</view>
			<view class="summary-row">
				<view class="summary-block">
					<text class="summary-number">{{ locatedCount }}</text>
					<text class="summary-label">已设置格子</text>
				</view>
				<view class="summary-block summary-inverse">
					<text class="summary-number">{{ unassignedCount }}</text>
					<text class="summary-label">未设置</text>
				</view>
			</view>
		</view>

		<view class="voice-panel" :class="{ 'is-recording': recording }" role="button" tabindex="0" :aria-label="voicePanelLabel" @click="speakVoiceHelp">
			<view class="voice-copy">
				<text class="voice-title">{{ recording ? '正在聆听' : '语音找药' }}</text>
				<text class="voice-sub">{{ recording ? '说出药名后会自动匹配' : '说出药名，直接播报格子位置' }}</text>
			</view>
			<button class="voice-button" @click.stop="voiceFind" :aria-label="voiceBtnLabel">
				<text class="voice-button-text">{{ recording ? '停止' : '开始' }}</text>
			</button>
		</view>

		<text class="status-banner" :aria-label="statusText" role="alert" v-if="statusText">{{ statusText }}</text>

		<view class="mode-switch" role="tablist" aria-label="找药浏览方式">
			<button
				class="mode-button"
				:class="{ active: mode === 'byMedicine' }"
				@click="setMode('byMedicine')"
				:aria-label="mode === 'byMedicine' ? '按药品浏览，当前已选中' : '切换到按药品浏览'"
			>按药品</button>
			<button
				class="mode-button"
				:class="{ active: mode === 'bySlot' }"
				@click="setMode('bySlot')"
				:aria-label="mode === 'bySlot' ? '按格子浏览，当前已选中' : '切换到按格子浏览'"
			>按格子</button>
		</view>

		<view class="list-header">
			<text class="list-title">{{ modeTitle }}</text>
			<text class="list-count">{{ modeCount }} 项</text>
		</view>

		<scroll-view scroll-y class="list">
			<block v-if="mode === 'byMedicine'">
				<view v-if="medicines.length === 0" class="empty" role="button" tabindex="0" aria-label="药箱是空的。请先到识别页添加药品" @click="speakEmptyMedicine">
					<text class="empty-title">药箱是空的</text>
					<text class="empty-copy">请先到识别页添加药品。</text>
				</view>
				<view
					v-for="m in medicines"
					:key="m.id"
					class="finder-row"
					:class="{ 'is-unassigned': !m.slot }"
					role="button"
					tabindex="0"
					:aria-label="medicineLabel(m)"
					@click="speakLocation(m)"
				>
					<view class="slot-mark" aria-hidden="true">
						<text class="slot-mark-main">{{ m.slot || '—' }}</text>
						<text class="slot-mark-sub">{{ m.slot ? '号格' : '未设' }}</text>
					</view>
					<view class="row-main">
						<view class="row-topline">
							<text class="row-title">{{ m.name }}</text>
							<text class="row-status">{{ m.slot ? '可定位' : '待设置' }}</text>
						</view>
						<text class="row-sub">{{ m.slot ? ('存放在 ' + m.slot + ' 号格子') : '尚未设置格子' }}</text>
					</view>
					<text class="chevron" aria-hidden="true">›</text>
				</view>
			</block>

			<block v-else>
				<view v-if="slotMap.length === 0" class="empty" role="button" tabindex="0" aria-label="没有格子记录。请在药箱页或药品详情页设置存放格子" @click="speakEmptySlot">
					<text class="empty-title">没有格子记录</text>
					<text class="empty-copy">请在药箱页或药品详情页设置存放格子。</text>
				</view>
				<view
					v-for="group in slotMap"
					:key="group.slot"
					class="finder-row"
					role="button"
					tabindex="0"
					:aria-label="slotLabel(group)"
					@click="speakSlot(group)"
				>
					<view class="slot-mark" aria-hidden="true">
						<text class="slot-mark-main">{{ group.slot }}</text>
						<text class="slot-mark-sub">号格</text>
					</view>
					<view class="row-main">
						<view class="row-topline">
							<text class="row-title">{{ group.slot }} 号格子</text>
							<text class="row-status">{{ group.medicines.length }} 种</text>
						</view>
						<text class="row-sub">{{ group.medicines.map(x => x.name).join('、') }}</text>
					</view>
					<text class="chevron" aria-hidden="true">›</text>
				</view>
			</block>
		</scroll-view>
		<voice-assistant context="finder" @heard="statusText = '语音助手听到：' + $event" />
	</view>
</template>

<script>
	import VoiceAssistant from '../../components/voice-assistant/voice-assistant.vue'
	import {
		getAllMedicines,
		getSlotMap,
		isExpired
	} from '../../services/storage.js'
	import { createSpeechRecognition } from '../../services/browserSpeech.js'
	import { highlightSlot } from '../../services/pillbox.js'
	import * as tts from '../../services/tts.js'
	import * as haptic from '../../services/haptic.js'

	export default {
		components: {
			VoiceAssistant
		},
		data() {
			return {
				mode: 'byMedicine', // byMedicine | bySlot
				medicines: [],
				slotMap: [],
				statusText: '',
				recording: false,
				recorder: null,
				speechRecognition: null
			}
		},
		computed: {
			voiceBtnLabel() {
				return this.recording ? '正在聆听，说出药名…' : '语音找药，说出药名'
			},
			voicePanelLabel() {
				return this.recording ? '正在聆听，说出药名后会自动匹配' : '语音找药。点开始，说出药名，直接播报格子位置'
			},
			finderSummary() {
				return '找药页面。共有 ' + this.medicines.length + ' 种药品，' + this.locatedCount + ' 种已经设置格子，' + this.unassignedCount + ' 种未设置格子。可以点开始语音找药，也可以按药品或按格子浏览。'
			},
			locatedCount() {
				return this.medicines.filter((m) => m.slot).length
			},
			unassignedCount() {
				return this.medicines.filter((m) => !m.slot).length
			},
			modeTitle() {
				return this.mode === 'byMedicine' ? '按药品选择' : '按格子浏览'
			},
			modeCount() {
				return this.mode === 'byMedicine' ? this.medicines.length : this.slotMap.length
			}
		},
		onShow() {
			this.refresh()
			// 进页面提示可用方式
			tts.speak('找药页面。可以双击语音找药说出药名，或在下方列表选择，或切换按格子浏览。')
		},
		onHide() {
			tts.stop()
			this.stopRecordingSilently()
		},
		methods: {
			getNarrationText() {
				const modeText = this.mode === 'byMedicine' ? '按药品浏览' : '按格子浏览'
				return '找药。功能：语音找药、' + modeText + '、朗读格子位置、语音助手。'
			},
			refresh() {
				this.medicines = getAllMedicines()
				this.slotMap = getSlotMap()
			},
			speakFinderSummary() {
				haptic.tap()
				this.statusText = this.finderSummary
				tts.speak(this.statusText)
			},
			speakVoiceHelp() {
				haptic.tap()
				this.statusText = this.voicePanelLabel
				tts.speak(this.statusText)
			},
			speakEmptyMedicine() {
				haptic.tap()
				this.statusText = '药箱是空的。请先到识别页添加药品。'
				tts.speak(this.statusText)
			},
			speakEmptySlot() {
				haptic.tap()
				this.statusText = '没有格子记录。请在药箱页或药品详情页设置存放格子。'
				tts.speak(this.statusText)
			},
			toggleMode() {
				this.mode = this.mode === 'byMedicine' ? 'bySlot' : 'byMedicine'
				this.refresh()
				tts.speak(this.mode === 'byMedicine' ? '已切换到按药品浏览' : '已切换到按格子浏览')
			},
			setMode(nextMode) {
				if (this.mode === nextMode) {
					haptic.tap()
					this.statusText = this.mode === 'byMedicine' ? '当前是按药品浏览' : '当前是按格子浏览'
					tts.speak(this.statusText)
					return
				}
				this.mode = nextMode
				this.refresh()
				this.statusText = this.mode === 'byMedicine' ? '已切换到按药品浏览' : '已切换到按格子浏览'
				tts.speak(this.statusText)
			},

			medicineLabel(m) {
				const loc = m.slot ? ('存放在 ' + m.slot + ' 号格子') : '尚未设置格子'
				return m.name + '，' + loc + '，双击朗读位置'
			},
			slotLabel(group) {
				return group.slot + ' 号格子，放有 ' + group.medicines.map((x) => x.name).join('、') + '，双击朗读'
			},

			// 播报某药所在位置 + 尝试点亮硬件格子
			async speakLocation(m) {
				haptic.tap()
				if (!m.slot) {
					this.statusText = m.name + ' 尚未设置格子'
					tts.speak(m.name + ' 还没有设置存放格子。请在药箱页点这个药的格子按钮设置。')
					return
				}
				const expiredWarn = isExpired(m) ? '注意，此药已过期，请勿服用。' : ''
				this.statusText = m.name + ' 在 ' + m.slot + ' 号格子'
				tts.speak(m.name + ' 放在 ' + m.slot + ' 号格子。' + expiredWarn)
				// 若已连实体药箱，点亮对应格子
				const ok = await highlightSlot(m.slot)
				if (ok) haptic.success()
			},

			async speakSlot(group) {
				haptic.tap()
				const names = group.medicines.map((x) => x.name).join('、')
				this.statusText = group.slot + ' 号格子：' + names
				tts.speak(group.slot + ' 号格子里放着，' + names + '。')
				const ok = await highlightSlot(group.slot)
				if (ok) haptic.success()
			},

			// ---------------- 语音找药 ----------------
			voiceFind() {
				if (this.recording) {
					this.statusText = '已停止聆听'
					tts.speak(this.statusText)
					this.finishRecording()
					return
				}
				// #ifdef H5
				if (this.startH5SpeechFind()) return
				// #endif
				haptic.failure()
				tts.speak('当前环境不支持免密语音识别。请在列表中选择药品。')
			},

			// #ifdef H5
			startH5SpeechFind() {
				try {
					const recognition = createSpeechRecognition({
						onResult: (text) => {
							this.recording = false
							this.speechRecognition = null
							this.statusText = text ? ('听到：' + text) : '没听清，请重试'
							if (text) this.matchAndSpeak(text)
							else tts.speak('没听清，请再试一次，或在列表中选择药品')
						},
						onError: (e) => {
							console.error('h5 speech find error', e)
							this.recording = false
							this.speechRecognition = null
							haptic.failure()
							tts.speak('没听清，请改用列表选择')
						},
						onEnd: () => {
							this.recording = false
							this.speechRecognition = null
						}
					})
					if (!recognition) return false
					this.speechRecognition = recognition
					this.recording = true
					this.statusText = '正在聆听，请说出药名'
					tts.speak('请说出药名')
					recognition.start()
					return true
				} catch (e) {
					console.error('startH5SpeechFind error', e)
					this.recording = false
					this.speechRecognition = null
					return false
				}
			},
			// #endif

			// #ifndef H5
			startH5SpeechFind() { return false },
			// #endif

			finishRecording() {
				try {
					if (this.speechRecognition) {
						this.speechRecognition.stop()
						return
					}
					if (this.recorder) this.recorder.stop()
				} catch (e) {}
			},

			stopRecordingSilently() {
				try {
					if (this.speechRecognition) this.speechRecognition.abort()
					if (this.recorder && this.recording) this.recorder.stop()
				} catch (e) {}
				this.speechRecognition = null
				this.recording = false
			},

			// 把识别到的文字与药名模糊匹配
			matchAndSpeak(spoken) {
				const text = (spoken || '').replace(/[\s，。、？!？]/g, '')
				if (!text) {
					tts.speak('没听清，请再试一次')
					return
				}
				// 先精确包含，再退而取字符重叠最多的
				let hit = this.medicines.find((m) => text.indexOf(m.name) >= 0 || m.name.indexOf(text) >= 0)
				if (!hit) {
					let best = null
					let bestScore = 0
					this.medicines.forEach((m) => {
						let score = 0
						for (const ch of m.name) {
							if (text.indexOf(ch) >= 0) score++
						}
						if (score > bestScore) { bestScore = score; best = m }
					})
					// 至少命中 2 个字才认
					if (bestScore >= 2) hit = best
				}
				if (hit) {
					this.speakLocation(hit)
				} else {
					haptic.failure()
					this.statusText = '没找到「' + spoken + '」'
					tts.speak('没有找到 ' + spoken + '。请再说一次，或在列表中选择。')
				}
			}
		}
	}
</script>

<style>
	.finder-page {
		background-color: #ffffff;
		color: #000000;
		box-sizing: border-box;
		padding: 20px 18px 0;
	}
	.finder-header {
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
	.summary-inverse {
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
	.voice-panel {
		margin-top: 14px;
		min-height: 108px;
		padding: 16px;
		border: 2px solid #000000;
		background-color: #ffffff;
		box-sizing: border-box;
		display: flex;
		flex-direction: row;
		align-items: center;
	}
	.voice-panel.is-recording {
		background-color: #000000;
		color: #ffffff;
	}
	.voice-copy {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.voice-title {
		font-size: 26px;
		line-height: 1.2;
		font-weight: 900;
		color: inherit;
	}
	.voice-sub {
		margin-top: 8px;
		font-size: 18px;
		line-height: 1.35;
		font-weight: 600;
		color: inherit;
		opacity: 0.78;
	}
	.voice-button {
		width: 82px;
		min-height: 70px;
		margin-left: 14px;
		padding: 0;
		border: 2px solid currentColor;
		border-radius: 0;
		background-color: #000000;
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
	}
	.voice-panel.is-recording .voice-button {
		background-color: #ffffff;
		color: #000000;
	}
	.voice-button::after,
	.mode-button::after {
		border: 0;
	}
	.voice-button-text {
		font-size: 22px;
		line-height: 1;
		font-weight: 900;
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
	.mode-switch {
		display: flex;
		flex-direction: row;
		margin-top: 12px;
		border: 2px solid #000000;
	}
	.mode-button {
		flex: 1;
		min-height: 56px;
		margin: 0;
		padding: 0;
		border-radius: 0;
		background-color: #ffffff;
		color: #000000;
		font-size: 19px;
		line-height: 1;
		font-weight: 800;
	}
	.mode-button + .mode-button {
		border-left: 2px solid #000000;
	}
	.mode-button.active {
		background-color: #000000;
		color: #ffffff;
	}
	.list-header {
		display: flex;
		flex-direction: row;
		align-items: center;
		padding: 18px 0 8px;
	}
	.list-title {
		flex: 1;
		font-size: 23px;
		line-height: 1.2;
		font-weight: 900;
		color: #000000;
	}
	.list-count {
		font-size: 16px;
		line-height: 1;
		font-weight: 800;
		color: #555555;
	}
	.list {
		flex: 1;
		height: 100%;
		box-sizing: border-box;
	}
	.finder-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		min-height: 112px;
		margin-bottom: 12px;
		padding: 16px 0 16px 14px;
		border: 2px solid #000000;
		background-color: #ffffff;
		color: #000000;
		box-sizing: border-box;
	}
	.finder-row.is-unassigned {
		border-style: dashed;
	}
	.slot-mark {
		width: 66px;
		min-height: 72px;
		border: 2px solid #000000;
		background-color: #000000;
		color: #ffffff;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
	}
	.is-unassigned .slot-mark {
		background-color: #ffffff;
		color: #000000;
	}
	.row-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		margin-left: 14px;
	}
	.row-topline {
		display: flex;
		flex-direction: row;
		align-items: flex-start;
	}
	.row-title {
		flex: 1;
		font-size: 24px;
		line-height: 1.25;
		font-weight: 800;
		color: inherit;
	}
	.row-status {
		margin-left: 10px;
		padding: 5px 8px;
		border: 2px solid currentColor;
		font-size: 14px;
		line-height: 1;
		font-weight: 900;
		color: inherit;
		white-space: nowrap;
	}
	.row-sub {
		font-size: 18px;
		line-height: 1.35;
		margin-top: 9px;
		font-weight: 600;
		color: inherit;
		opacity: 0.78;
	}
	.slot-mark-main {
		font-size: 27px;
		line-height: 1;
		font-weight: 900;
		color: inherit;
	}
	.slot-mark-sub {
		margin-top: 6px;
		font-size: 14px;
		line-height: 1;
		font-weight: 800;
		color: inherit;
	}
	.chevron {
		width: 52px;
		text-align: center;
		font-size: 34px;
		line-height: 1;
		color: inherit;
	}
	.empty {
		padding: 54px 16px;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.empty-title {
		font-size: 28px;
		line-height: 1.25;
		font-weight: 900;
		color: #000000;
	}
	.empty-copy {
		margin-top: 12px;
		font-size: 20px;
		line-height: 1.45;
		font-weight: 600;
		color: #444444;
	}
</style>
