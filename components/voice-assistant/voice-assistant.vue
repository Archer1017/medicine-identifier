<template>
	<view class="voice-assistant">
		<button
			class="voice-assistant-button"
			:class="{ 'is-listening': recording }"
			:aria-label="buttonLabel"
			@touchstart.stop.prevent="beginVoice('touch')"
			@touchend.stop.prevent="endVoice('touch')"
			@touchcancel.stop.prevent="cancelVoice"
			@mousedown.stop.prevent="beginVoice('mouse')"
			@mouseup.stop.prevent="endVoice('mouse')"
			@mouseleave.stop.prevent="cancelVoice"
		>
			<text class="voice-title">{{ recording ? '松开执行' : '语音助手' }}</text>
			<text class="voice-sub">{{ recording ? '正在听' : '按住说话' }}</text>
		</button>
	</view>
</template>

<script>
	import { createSpeechRecognition } from '../../services/browserSpeech.js'
	import {
		ASSISTANT_HELP_TEXT,
		expirySummaryText,
		medicineLocationText,
		resolveAssistantIntent
	} from '../../services/assistant.js'
	import { getAllMedicines } from '../../services/storage.js'
	import { highlightSlot } from '../../services/pillbox.js'
	import * as tts from '../../services/tts.js'
	import * as haptic from '../../services/haptic.js'

	export default {
		name: 'VoiceAssistant',
		props: {
			context: {
				type: String,
				default: ''
			},
			delegateUnknown: {
				type: Boolean,
				default: false
			}
		},
		data() {
			return {
				recording: false,
				lastTouchAt: 0,
				startedAt: 0,
				speechRecognition: null,
				speechHandled: false,
				timer: null
			}
		},
		computed: {
			buttonLabel() {
				return this.recording ? '语音助手正在听，说完后松开执行' : '语音助手，按住说话，可以控制页面。可以说打开药箱、打开日历、扫描药品、找药或添加服药计划'
			}
		},
		methods: {
			beginVoice(source) {
				if (source === 'touch') this.lastTouchAt = Date.now()
				if (source === 'mouse' && Date.now() - this.lastTouchAt < 700) return
				if (this.recording) return
				this.recording = true
				this.speechHandled = false
				this.startedAt = Date.now()
				haptic.tap()
				tts.stop()
				tts.speakTransient('语音助手，我在听，请说')

				// #ifdef H5
				if (this.startH5Speech()) return
				// #endif

				this.recording = false
				haptic.failure()
				tts.speak('当前环境不支持免密语音识别。请使用页面按钮操作。')
			},
			endVoice(source) {
				if (source === 'mouse' && Date.now() - this.lastTouchAt < 700) return
				if (!this.recording) return
				if (Date.now() - this.startedAt < 350) {
					this.cancelVoice()
					tts.speak('请按住语音助手，说完后松开。')
					return
				}
				// #ifdef H5
				if (this.speechRecognition) {
					try { this.speechRecognition.stop() } catch (e) {}
					this.timer = setTimeout(() => {
						if (!this.speechHandled) this.handleText('')
					}, 900)
					return
				}
				// #endif
				this.recording = false
			},
			cancelVoice() {
				if (this.timer) { clearTimeout(this.timer); this.timer = null }
				this.recording = false
				// #ifdef H5
				if (this.speechRecognition) {
					try { this.speechRecognition.abort() } catch (e) {}
					this.speechRecognition = null
				}
				// #endif
			},
			// #ifdef H5
			startH5Speech() {
				try {
					const recognition = createSpeechRecognition({
						onResult: (text) => this.handleText(text),
						onError: () => this.handleText(''),
						onEnd: () => {
							this.recording = false
							this.speechRecognition = null
						}
					})
					if (!recognition) return false
					this.speechRecognition = recognition
					recognition.start()
					return true
				} catch (e) {
					console.error('voice assistant speech error', e)
					this.speechRecognition = null
					return false
				}
			},
			// #endif
			// #ifndef H5
			startH5Speech() { return false },
			// #endif
			handleText(text) {
				if (this.timer) { clearTimeout(this.timer); this.timer = null }
				this.speechHandled = true
				this.recording = false
				this.speechRecognition = null
				const spoken = (text || '').trim()
				if (!spoken) {
					haptic.failure()
					tts.speak('没听清，请再按住语音助手说一次。')
					return
				}
				this.$emit('heard', spoken)
				this.execute(spoken)
			},
			async execute(spoken) {
				const intent = resolveAssistantIntent(spoken, { medicines: getAllMedicines() })
				this.$emit('intent', { spoken, intent })
				if (this.delegateUnknown && (intent.type === 'unknown' || intent.type === 'capture')) {
					return
				}
				if (intent.type === 'unknown') {
					tts.speak('我还没理解。你可以说打开药箱、打开日历、打开找药、打开设置、扫描药品，或者添加服药计划。')
					return
				}
				switch (intent.type) {
					case 'capture':
					case 'restartScan':
						tts.speak('打开扫描器')
						uni.switchTab({ url: '/pages/scanner/scanner' })
						break
					case 'openHome':
						tts.speak('回到首页')
						uni.switchTab({ url: '/pages/scan/scan' })
						break
					case 'openCalendar':
						tts.speak('打开日历')
						uni.navigateTo({ url: '/pages/calendar/calendar' })
						break
					case 'addSchedule':
						if (this.context === 'calendar') {
							tts.speak('准备添加服药计划')
						} else {
							tts.speak('打开日历添加服药计划')
							uni.navigateTo({ url: '/pages/calendar/calendar' })
						}
						break
					case 'openCabinet':
						tts.speak('打开药箱')
						uni.switchTab({ url: '/pages/cabinet/cabinet' })
						break
					case 'openFinder':
						tts.speak('打开找药')
						uni.switchTab({ url: '/pages/finder/finder' })
						break
					case 'openSettings':
						tts.speak('打开设置')
						uni.switchTab({ url: '/pages/settings/settings' })
						break
					case 'openAssistant':
						tts.speak('打开 AI 小助手')
						uni.navigateTo({ url: '/pages/assistant/assistant' })
						break
					case 'findMedicine':
						await this.speakMedicineLocation(intent.medicine)
						break
					case 'expiryCheck':
						tts.speak(expirySummaryText(getAllMedicines()))
						break
					case 'help':
						tts.speak(ASSISTANT_HELP_TEXT)
						break
					default:
						this.$emit('unhandled', { spoken, intent })
				}
			},
			async speakMedicineLocation(medicine) {
				if (!medicine) {
					tts.speak('没有找到这种药。请再说一次药名，或打开找药页面。')
					return
				}
				tts.speak(medicineLocationText(medicine))
				if (medicine.slot) {
					const ok = await highlightSlot(medicine.slot)
					if (ok) haptic.success()
				}
			}
		}
	}
</script>

<style>
	.voice-assistant {
		padding: 12px 0 18px;
		background-color: #ffffff;
	}
	.voice-assistant-button {
		width: 100%;
		min-height: 82px;
		margin: 0;
		padding: 0 18px;
		border: 2px solid #000000;
		border-radius: 0;
		background-color: #000000;
		color: #ffffff;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
	}
	.voice-assistant-button.is-listening {
		background-color: #ffffff;
		color: #000000;
	}
	.voice-assistant-button::after {
		border: 0;
	}
	.voice-title {
		font-size: 25px;
		line-height: 1.15;
		font-weight: 900;
		color: inherit;
	}
	.voice-sub {
		margin-top: 8px;
		font-size: 16px;
		line-height: 1.2;
		font-weight: 700;
		color: inherit;
		opacity: 0.8;
	}
</style>
