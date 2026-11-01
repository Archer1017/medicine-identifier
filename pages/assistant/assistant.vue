<template>
	<view class="page-container assistant-page">
		<view class="assistant-header" :aria-label="pageSummary" role="button" tabindex="0" @click="speakSummary">
			<text class="eyebrow">AI小助手</text>
			<text class="headline">可以聊天，也可以问眼睛知识</text>
			<text class="header-copy">说“打开药箱”“打开日历”“扫描药品”可以直接跳转。所有页面底部都有语音助手。</text>
		</view>

		<text class="status-banner" :aria-label="statusText" role="alert" v-if="statusText">{{ statusText }}</text>

		<view class="quick-grid">
			<button class="quick-button" @click="sendQuick('怎么保护眼睛')" aria-label="询问小助手，怎么保护眼睛">护眼</button>
			<button class="quick-button quick-button-dark" @click="sendQuick('白内障是什么')" aria-label="询问小助手，白内障是什么">白内障</button>
			<button class="quick-button quick-button-dark" @click="sendQuick('青光眼要注意什么')" aria-label="询问小助手，青光眼要注意什么">青光眼</button>
			<button class="quick-button" @click="sendQuick('打开药箱')" aria-label="让小助手打开我的药箱页面">去药箱</button>
		</view>

		<scroll-view scroll-y class="chat-list">
			<view v-for="(msg, index) in messages" :key="index" class="message" :class="msg.role === 'user' ? 'from-user' : 'from-assistant'" role="button" tabindex="0" :aria-label="messageLabel(msg)" @click="speakMessage(msg)">
				<text class="message-role">{{ msg.role === 'user' ? '我' : '助手' }}</text>
				<text class="message-text">{{ msg.text }}</text>
			</view>
		</scroll-view>

		<view class="input-panel">
			<input class="text-input" v-model="typedText" confirm-type="send" placeholder="输入想问的话" aria-label="输入想问小助手的话，输入完成后点发送" @confirm="sendTyped" />
			<button class="send-button" @click="sendTyped" aria-label="发送输入框里的文字给小助手">发送</button>
		</view>

		<button
			class="voice-button"
			:class="{ 'voice-button-active': recording }"
			:aria-label="voiceLabel"
			@touchstart.stop.prevent="beginVoice('touch')"
			@touchend.stop.prevent="endVoice('touch')"
			@touchcancel.stop.prevent="cancelVoice"
			@mousedown.stop.prevent="beginVoice('mouse')"
			@mouseup.stop.prevent="endVoice('mouse')"
			@mouseleave.stop.prevent="cancelVoice"
		>
			<text class="voice-text">{{ recording ? '松开发送' : '按住说话' }}</text>
			<text class="voice-sub">{{ recording ? '正在听' : '聊天或说页面名称' }}</text>
		</button>
	</view>
</template>

<script>
	import { createSpeechRecognition } from '../../services/browserSpeech.js'
	import { answerAssistant } from '../../services/assistantChat.js'
	import {
		ASSISTANT_HELP_TEXT,
		expirySummaryText,
		medicineLocationText
	} from '../../services/assistant.js'
	import { getAllMedicines } from '../../services/storage.js'
	import { highlightSlot } from '../../services/pillbox.js'
	import * as tts from '../../services/tts.js'
	import * as haptic from '../../services/haptic.js'

	export default {
		data() {
			return {
				messages: [
					{ role: 'assistant', text: '我在。你可以和我聊天，问眼睛知识，也可以说打开药箱、打开日历、识别药品。' }
				],
				statusText: '',
				typedText: '',
				recording: false,
				lastTouchAt: 0,
				startedAt: 0,
				speechRecognition: null,
				speechHandled: false,
				autoTimer: null
			}
		},
		computed: {
			pageSummary() {
				return 'AI小助手页面。可以按住说话聊天，问眼睛知识，也可以说打开药箱、打开日历、找药、设置或识别药品。'
			},
			voiceLabel() {
				return this.recording ? '小助手正在听，说完后松开发送' : '按住说话，和小助手聊天或说页面名称。松开后发送'
			}
		},
		onShow() {
			tts.speak('AI小助手页面。按住说话，可以聊天、问眼睛知识，也可以说打开药箱、打开日历或扫描药品。所有页面底部都有语音助手。')
		},
		onHide() {
			this.cancelVoice()
			tts.stop()
		},
		methods: {
			getNarrationText() {
				return 'AI小助手。功能：聊天、问眼睛知识、打开页面、文字发送、按住说话。'
			},
			speakSummary() {
				haptic.tap()
				this.statusText = this.pageSummary
				tts.speak(this.statusText)
			},
			addMessage(role, text) {
				this.messages.push({ role, text })
				if (this.messages.length > 20) this.messages.shift()
			},
			speakMessage(msg) {
				haptic.tap()
				tts.speak(msg.text)
			},
			messageLabel(msg) {
				return (msg.role === 'user' ? '我说，' : '小助手说，') + msg.text + '。双击可朗读这条消息'
			},
			sendQuick(text) {
				this.handleUserText(text)
			},
			sendTyped() {
				const text = (this.typedText || '').trim()
				if (!text) {
					tts.speak('请输入想问的话，或按住说话。')
					return
				}
				this.typedText = ''
				this.handleUserText(text)
			},
			beginVoice(source) {
				if (source === 'touch') this.lastTouchAt = Date.now()
				if (source === 'mouse' && Date.now() - this.lastTouchAt < 700) return
				if (this.recording) return
				this.recording = true
				this.speechHandled = false
				this.startedAt = Date.now()
				this.statusText = '我在听，请说'
				haptic.tap()
				tts.stop()
				tts.speakTransient('我在听，请说')

				// #ifdef H5
				if (this.startH5Speech()) return
				// #endif

				this.recording = false
				haptic.failure()
				this.statusText = '当前环境不支持免密语音识别'
				tts.speak('当前环境不支持免密语音识别。请使用文字输入。')
			},
			endVoice(source) {
				if (source === 'mouse' && Date.now() - this.lastTouchAt < 700) return
				if (!this.recording) return
				if (Date.now() - this.startedAt < 350) {
					this.cancelVoice()
					this.statusText = '请按住后再说话'
					tts.speak('请按住按钮，说完后松开。')
					return
				}
				// #ifdef H5
				if (this.speechRecognition) {
					try { this.speechRecognition.stop() } catch (e) {}
					this.autoTimer = setTimeout(() => {
						if (!this.speechHandled) this.handleSpeechText('')
					}, 900)
					return
				}
				// #endif
				this.recording = false
			},
			cancelVoice() {
				if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null }
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
						onResult: (text) => this.handleSpeechText(text),
						onError: () => this.handleSpeechText(''),
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
					console.error('assistant speech error', e)
					this.speechRecognition = null
					return false
				}
			},
			// #endif
			// #ifndef H5
			startH5Speech() { return false },
			// #endif
			handleSpeechText(text) {
				if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null }
				this.speechHandled = true
				this.recording = false
				this.speechRecognition = null
				const spoken = (text || '').trim()
				if (!spoken) {
					haptic.failure()
					this.statusText = '没听清，请再试一次'
					tts.speak('没听清，请再按住说一次，或使用文字输入。')
					return
				}
				this.handleUserText(spoken)
			},
			async handleUserText(text) {
				this.addMessage('user', text)
				this.statusText = '听到：' + text
				tts.speak('听到，' + text)
				const result = await answerAssistant(text, this.messages)
				if (result.kind === 'intent') {
					await this.executeIntent(result.intent)
					return
				}
				this.addMessage('assistant', result.text)
				this.statusText = result.text
				tts.speak(result.text)
			},
			async executeIntent(intent) {
				switch (intent.type) {
					case 'openCalendar':
						this.replyAndNavigate('打开日历', () => uni.navigateTo({ url: '/pages/calendar/calendar' }))
						break
					case 'openHome':
						this.replyAndNavigate('回到首页', () => uni.switchTab({ url: '/pages/scan/scan' }))
						break
					case 'openCabinet':
						this.replyAndNavigate('打开我的药箱', () => uni.switchTab({ url: '/pages/cabinet/cabinet' }))
						break
					case 'openFinder':
						this.replyAndNavigate('打开找药页面', () => uni.switchTab({ url: '/pages/finder/finder' }))
						break
					case 'openSettings':
						this.replyAndNavigate('打开设置', () => uni.switchTab({ url: '/pages/settings/settings' }))
						break
					case 'openAssistant':
						this.reply('已经在 AI 小助手页面。你可以直接和我说话。')
						break
					case 'capture':
					case 'restartScan':
						this.replyAndNavigate('打开扫描器，开始识别药品', () => uni.switchTab({ url: '/pages/scanner/scanner' }))
						break
					case 'findMedicine':
						await this.speakMedicineLocation(intent.medicine)
						break
					case 'expiryCheck':
						this.reply(expirySummaryText(getAllMedicines()))
						break
					case 'help':
						this.reply(ASSISTANT_HELP_TEXT)
						break
					default:
						this.reply('我还没理解。你可以问我眼睛知识，也可以说打开药箱、打开日历、识别药品。')
				}
			},
			reply(text) {
				this.addMessage('assistant', text)
				this.statusText = text
				tts.speak(text)
			},
			replyAndNavigate(text, navigate) {
				this.reply(text)
				setTimeout(navigate, 450)
			},
			async speakMedicineLocation(medicine) {
				if (!medicine) {
					this.reply('没有找到这种药。请再说一次药名，或打开找药页面。')
					return
				}
				const text = medicineLocationText(medicine)
				this.reply(text)
				if (medicine.slot) {
					const ok = await highlightSlot(medicine.slot)
					if (ok) haptic.success()
				}
			}
		}
	}
</script>

<style>
	.assistant-page {
		background-color: #ffffff;
		color: #000000;
		box-sizing: border-box;
		padding: 20px 18px 0;
	}
	.assistant-header {
		padding: 18px 0 16px;
		border-bottom: 3px solid #000000;
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
		font-size: 31px;
		line-height: 1.2;
		font-weight: 800;
		color: #000000;
	}
	.header-copy {
		margin-top: 10px;
		font-size: 18px;
		line-height: 1.4;
		font-weight: 700;
		color: #444444;
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
	.quick-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		margin-top: 12px;
	}
	.quick-button {
		min-height: 62px;
		margin: 0;
		padding: 0 10px;
		border: 2px solid #000000;
		border-radius: 0;
		background-color: #ffffff;
		color: #000000;
		font-size: 19px;
		line-height: 1;
		font-weight: 900;
	}
	.quick-button-dark {
		background-color: #000000;
		color: #ffffff;
	}
	button::after {
		border: 0;
	}
	.chat-list {
		flex: 1;
		height: 100%;
		margin-top: 12px;
		box-sizing: border-box;
	}
	.message {
		padding: 14px 0;
		border-bottom: 2px solid #000000;
		display: flex;
		flex-direction: column;
	}
	.message-role {
		font-size: 15px;
		line-height: 1;
		font-weight: 900;
		color: #555555;
	}
	.message-text {
		margin-top: 8px;
		font-size: 20px;
		line-height: 1.45;
		font-weight: 700;
		color: #000000;
	}
	.from-user .message-text {
		font-weight: 900;
	}
	.input-panel {
		display: flex;
		flex-direction: row;
		margin-top: 10px;
		border: 2px solid #000000;
	}
	.text-input {
		flex: 1;
		min-height: 60px;
		padding: 0 14px;
		font-size: 19px;
		font-weight: 700;
		color: #000000;
		box-sizing: border-box;
	}
	.send-button {
		width: 72px;
		min-height: 60px;
		margin: 0;
		padding: 0;
		border: 0;
		border-left: 2px solid #000000;
		border-radius: 0;
		background-color: #000000;
		color: #ffffff;
		font-size: 18px;
		font-weight: 900;
	}
	.voice-button {
		width: 100%;
		min-height: 92px;
		margin: 12px 0 18px;
		padding: 0 20px;
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
	.voice-button-active {
		background-color: #ffffff;
		color: #000000;
	}
	.voice-text {
		font-size: 28px;
		line-height: 1.15;
		font-weight: 900;
		color: inherit;
	}
	.voice-sub {
		margin-top: 8px;
		font-size: 17px;
		line-height: 1.2;
		font-weight: 700;
		color: inherit;
		opacity: 0.8;
	}
</style>
