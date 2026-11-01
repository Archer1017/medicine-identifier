<template>
	<view v-if="mode === 'home'" class="page-container home-page">
		<view class="home-header" :aria-label="homeSummary" role="button" tabindex="0" @click="speakHomeSummary">
			<text class="home-eyebrow">首页</text>
			<text class="home-title">药品分辨器</text>
			<text class="home-subtitle">点任意入口会朗读并执行</text>
		</view>

		<text class="home-status" :aria-label="statusText" role="alert" v-if="statusText && statusText !== '首页'">{{ statusText }}</text>

		<view class="home-grid">
			<button class="home-tile" aria-label="日历，打开服药日历，可以设置每天吃什么药" @click.stop="openCalendar">
				<text class="home-tile-text">日历</text>
				<text class="home-tile-sub">今日提醒</text>
			</button>
			<button class="home-tile home-tile-dark" aria-label="药盒，打开我的药箱，查看和管理已保存药品" @click.stop="openCabinet">
				<text class="home-tile-text">药盒</text>
				<text class="home-tile-sub">我的药箱</text>
			</button>
			<button class="home-tile home-tile-dark" aria-label="AI小助手，打开聊天助手，可以聊天、问眼睛知识或语音跳转页面" @click.stop="openAssistantHelp">
				<text class="home-tile-text">ai小助手</text>
				<text class="home-tile-sub">语音帮助</text>
			</button>
			<button class="home-tile" aria-label="设置，打开设置页面，可以调整语速、提醒方式和 NFC 功能" @click.stop="openSettings">
				<text class="home-tile-text">设置</text>
				<text class="home-tile-sub">偏好设置</text>
			</button>
		</view>

		<button
			class="home-voice-button"
			:class="{ 'home-voice-button-active': assistantRecording }"
			:aria-label="assistantAriaLabel"
			@touchstart.stop.prevent="beginAssistantVoice('touch')"
			@touchend.stop.prevent="endAssistantVoice('touch')"
			@touchcancel.stop.prevent="cancelAssistantVoice"
			@mousedown.stop.prevent="beginAssistantVoice('mouse')"
			@mouseup.stop.prevent="endAssistantVoice('mouse')"
			@mouseleave.stop.prevent="cancelAssistantVoice"
		>
			<text class="home-voice-text">{{ assistantRecording ? '松开执行' : '语音助手' }}</text>
			<text class="home-voice-sub">{{ assistantRecording ? '正在聆听' : '按住说话' }}</text>
		</button>
	</view>

	<view v-else class="page-container scan-page">
		<!-- 摄像头预览区（对盲人无视觉意义，aria-hidden 让读屏跳过） -->
		<view class="preview" aria-hidden="true">
			<!-- #ifdef APP-PLUS -->
			<camera
				v-if="showCamera"
				class="camera"
				device-position="back"
				flash="auto"
				@error="onCameraError"
			></camera>
			<!-- #endif -->
			<!-- #ifdef H5 -->
			<!-- getUserMedia 的 video 会被动态插入到这个容器里 -->
			<view class="h5-preview"></view>
			<!-- #endif -->
			<!-- #ifndef APP-PLUS || H5 -->
			<view class="camera-placeholder">请在手机 App 或浏览器中体验摄像头</view>
			<!-- #endif -->
			<view class="scan-frame"></view>
			<view class="preview-caption">
				<text class="preview-caption-text">{{ previewLabel }}</text>
			</view>
		</view>

		<!-- 控制区：状态文字 + 按钮，线性排列 -->
		<view class="controls">
			<!-- 状态文字作为无障碍实时播报焦点 -->
			<view class="status-panel" role="button" tabindex="0" aria-live="polite" :aria-label="statusPanelLabel" @click="repeatStatus">
				<text class="status-kicker">{{ statusKicker }}</text>
				<text class="status-text">{{ statusText }}</text>
			</view>

			<!-- 结果态：保存 / 重新识别 / 重复朗读 -->
			<block v-if="state === 'result'">
				<button class="a11y-btn a11y-btn-primary" @click="saveToBox" aria-label="保存识别到的药品到药箱">保存到药箱</button>
				<button class="a11y-btn a11y-btn-secondary" @click="restartScan" aria-label="重新打开摄像头识别药品">重新识别</button>
				<button class="a11y-btn a11y-btn-secondary" @click="repeatSpeak" aria-label="重复朗读刚才的识别结果">重复朗读</button>
			</block>

			<!-- 错误态：重试 -->
			<block v-else-if="state === 'error'">
				<button class="a11y-btn a11y-btn-primary" @click="startScan" aria-label="重新打开摄像头识别药品">重新识别</button>
			</block>

			<!-- 引导 / 拍照中：手动拍照兜底（正常自动拍照，无需点击） -->
			<block v-else>
				<button
					class="a11y-btn a11y-btn-primary"
					:disabled="state === 'capturing' || state === 'recognizing'"
					:aria-disabled="state === 'capturing' || state === 'recognizing'"
					@click="capture"
					:aria-label="captureAriaLabel"
				>{{ captureBtnLabel }}</button>
			</block>

			<button
				class="a11y-btn ai-assistant-btn"
				:class="{ 'ai-assistant-btn-active': assistantRecording }"
				:aria-label="assistantAriaLabel"
				@touchstart.prevent="beginAssistantVoice('touch')"
				@touchend.prevent="endAssistantVoice('touch')"
				@touchcancel.prevent="cancelAssistantVoice"
				@mousedown.prevent="beginAssistantVoice('mouse')"
				@mouseup.prevent="endAssistantVoice('mouse')"
				@mouseleave.prevent="cancelAssistantVoice"
			>{{ assistantBtnLabel }}</button>
			<text class="assistant-hint">{{ assistantHint }}</text>
		</view>
	</view>
</template>

<script>
	import { recognizeFromImage } from '../../services/ocr.js'
	import { insertMedicine, getAllMedicines } from '../../services/storage.js'
	import { createSpeechRecognition } from '../../services/browserSpeech.js'
	import { highlightSlot } from '../../services/pillbox.js'
	import {
		ASSISTANT_HELP_TEXT,
		expirySummaryText,
		medicineLocationText,
		resolveAssistantIntent
	} from '../../services/assistant.js'
	import * as tts from '../../services/tts.js'
	import * as haptic from '../../services/haptic.js'

	export default {
		data() {
			return {
				showCamera: false,
				mode: 'home', // home | scanner
				state: 'guiding', // guiding | capturing | recognizing | result | error
				statusText: '首页',
				result: null,
				cameraCtx: null,
				autoTimer: null,
				guideTimer: null,
				guideStep: 0,
				// H5 摄像头相关
				h5Stream: null,
				h5Video: null,
				// AI 辅助语音相关
				assistantRecording: false,
				assistantTimer: null,
				assistantStartedAt: 0,
				assistantIgnoreStop: false,
				lastTouchAt: 0,
				h5SpeechRecognition: null,
				h5SpeechHandled: false
			}
		},
		computed: {
			captureBtnLabel() {
				if (this.state === 'capturing') return '正在拍照…'
				if (this.state === 'recognizing') return '正在识别…'
				return '立即拍照'
			},
			previewLabel() {
				if (this.state === 'result') return '识别完成'
				if (this.state === 'recognizing') return '正在分析'
				if (this.state === 'capturing') return '正在拍照'
				return '对准药盒'
			},
			statusKicker() {
				if (this.assistantRecording) return 'AI 辅助正在听'
				if (this.state === 'result') return '识别结果'
				if (this.state === 'error') return '需要处理'
				return '实时提示'
			},
			assistantBtnLabel() {
				return this.assistantRecording ? '松开执行' : '语音助手，按住说话'
			},
			assistantHint() {
				return this.assistantRecording
					? '正在聆听，说完后松开'
					: '可说：找布洛芬、打开日历、打开药箱、打开设置'
			},
			assistantAriaLabel() {
				return this.assistantRecording
					? '语音助手正在聆听，说完后松开按钮执行'
					: '语音助手，按住按钮说话，可以控制页面'
			},
			captureAriaLabel() {
				if (this.state === 'capturing') return '正在拍照，请保持不动'
				if (this.state === 'recognizing') return '正在识别药品，请稍候'
				return '立即拍照识别当前画面中的药品'
			},
			statusPanelLabel() {
				return this.statusKicker + '，' + this.statusText + '。双击可重复朗读当前提示'
			},
			homeSummary() {
				return '药品分辨器首页。上方有日历、药盒、AI小助手、设置四个入口。底部是语音助手，按住后说话，可以说扫描药品、打开药箱、打开设置、找某一种药。'
			}
		},
		onLoad() {
			tts.speak('药品分辨器首页。点日历打开服药日历，点药盒打开药箱，点AI小助手聊天，点设置进入设置。底部语音助手可以按住说话。')
		},
		onShow() {
			if (this.consumePendingAssistantAction()) return
			if (this.mode === 'scanner' && this.state !== 'result' && this.state !== 'recognizing') {
				this.startScan()
			}
		},
		onHide() {
			this.clearTimers()
			this.cancelAssistantVoice()
			this.stopH5Camera()
		},
		onUnload() {
			this.clearTimers()
			this.cancelAssistantVoice()
			this.stopH5Camera()
			tts.stop()
		},
		methods: {
			getNarrationText() {
				if (this.mode === 'home') return '首页。功能：打开日历、药箱、AI小助手、设置、语音助手。'
				const parts = [this.statusPanelLabel]
				if (this.state === 'result') parts.push('功能：保存药品、重新识别、重复朗读。')
				else if (this.state === 'error') parts.push('功能：重新识别、语音助手。')
				else parts.push('功能：拍照识别、语音助手。')
				return parts.join('。')
			},
			speakHomeSummary() {
				haptic.tap()
				tts.speak(this.homeSummary)
			},
			repeatStatus() {
				haptic.tap()
				tts.speak(this.statusText)
			},

			consumePendingAssistantAction() {
				let action = ''
				try { action = uni.getStorageSync('assistant_pending_action') || '' } catch (e) {}
				if (!action) return false
				try { uni.removeStorageSync('assistant_pending_action') } catch (e) {}
				if (action === 'capture') {
					this.startScan()
					return true
				}
				return false
			},

			openCalendar() {
				haptic.tap()
				tts.speak('打开日历')
				uni.navigateTo({ url: '/pages/calendar/calendar' })
			},

			openCabinet() {
				haptic.tap()
				tts.speak('打开药盒，也就是我的药箱')
				uni.switchTab({ url: '/pages/cabinet/cabinet' })
			},

			openAssistantHelp() {
				haptic.tap()
				tts.speak('打开 AI 小助手')
				uni.navigateTo({ url: '/pages/assistant/assistant' })
			},

			openSettings() {
				haptic.tap()
				tts.speak('打开设置')
				uni.switchTab({ url: '/pages/settings/settings' })
			},

			clearTimers() {
				if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null }
				if (this.guideTimer) { clearTimeout(this.guideTimer); this.guideTimer = null }
				if (this.assistantTimer) { clearTimeout(this.assistantTimer); this.assistantTimer = null }
			},

			stopCamera() {
				this.showCamera = false
				this.stopH5Camera()
			},

			startScan() {
				this.mode = 'scanner'
				this.clearTimers()
				this.result = null
				this.state = 'guiding'
				this.showCamera = true
				this.statusText = '正在启动摄像头'

				// #ifdef APP-PLUS
				this.statusText = '请将药品放在镜头前'
				tts.speak('请将药品放在镜头前')
				try { this.cameraCtx = uni.createCameraContext() } catch (e) { this.cameraCtx = null }
				this.runGuidance()
				// 模拟“画面清晰”后自动拍照（真机接实时取帧后由检测结果驱动）
				this.autoTimer = setTimeout(() => {
					if (this.state === 'guiding') this.capture()
				}, 4500)
				return
				// #endif

				// #ifdef H5
				this.startH5Camera()
				return
				// #endif

				// 其它端（小程序）：无实时摄像头方案，提示真机体验
				this.statusText = '请在手机 App 中使用摄像头识别'
				tts.speak('请在手机应用中使用摄像头识别')
			},

			// ---------------- H5：getUserMedia 自动开摄像头 ----------------
			// #ifdef H5
			async startH5Camera() {
				this.statusText = '正在打开摄像头'
				tts.speak('正在打开摄像头')
				try {
					if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
						throw new Error('浏览器不支持摄像头')
					}
					// 优先后置摄像头
					const stream = await navigator.mediaDevices.getUserMedia({
						video: { facingMode: { ideal: 'environment' } },
						audio: false
					})
					this.h5Stream = stream

					// 动态创建 video 播放预览
					const video = document.createElement('video')
					video.setAttribute('playsinline', '')
					video.setAttribute('webkit-playsinline', '')
					video.muted = true
					video.autoplay = true
					video.srcObject = stream
					video.style.width = '100%'
					video.style.height = '100%'
					video.style.objectFit = 'cover'

					// 插入到预览容器
					const box = this.$el && this.$el.querySelector('.h5-preview')
					if (box) {
						box.innerHTML = ''
						box.appendChild(video)
					}
					this.h5Video = video
					await video.play().catch(() => {})

					this.statusText = '请将药品对准摄像头，正在自动识别'
					tts.speak('请将药品对准摄像头，正在自动识别')

					// 摄像头稳定后自动截帧识别（零点击）
					this.autoTimer = setTimeout(() => {
						if (this.state === 'guiding') this.capture()
					}, 3000)
				} catch (e) {
					console.error('startH5Camera error', e)
					this.fail('无法打开摄像头，请在浏览器允许相机权限后重试')
				}
			},

			stopH5Camera() {
				try {
					if (this.h5Stream) {
						this.h5Stream.getTracks().forEach((t) => t.stop())
						this.h5Stream = null
					}
					if (this.h5Video) {
						this.h5Video.srcObject = null
						this.h5Video = null
					}
				} catch (e) {}
			},

			// 从 video 当前帧截图，返回 dataURL
			grabH5Frame() {
				const video = this.h5Video
				if (!video || !video.videoWidth) return null
				const canvas = document.createElement('canvas')
				const sourceW = video.videoWidth
				const sourceH = video.videoHeight
				const cropX = Math.round(sourceW * 0.06)
				const cropY = Math.round(sourceH * 0.08)
				const cropW = Math.round(sourceW * 0.88)
				const cropH = Math.round(sourceH * 0.84)
				const targetW = Math.min(1800, cropW)
				const targetH = Math.round(targetW * cropH / cropW)
				canvas.width = targetW
				canvas.height = targetH
				const ctx = canvas.getContext('2d')
				ctx.imageSmoothingEnabled = true
				ctx.imageSmoothingQuality = 'high'
				ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH)
				return canvas.toDataURL('image/jpeg', 0.95)
			},
			// #endif

			// #ifndef H5
			stopH5Camera() {},
			// #endif

			// App 端分步播报引导语，模拟对焦过程
			runGuidance() {
				const steps = ['再靠近一点', '请保持不动']
				const tick = () => {
					if (this.state !== 'guiding') return
					if (this.guideStep < steps.length) {
						this.statusText = steps[this.guideStep]
						tts.speakTransient(steps[this.guideStep])
						this.guideStep++
						this.guideTimer = setTimeout(tick, 1600)
					}
				}
				this.guideStep = 0
				this.guideTimer = setTimeout(tick, 1600)
			},

			onCameraError(e) {
				console.error('camera error', e)
				this.fail('摄像头启动失败，请检查相机权限')
			},

			capture() {
				if (this.state === 'capturing' || this.state === 'recognizing') return
				this.clearTimers()
				this.state = 'capturing'
				this.statusText = '正在拍照'
				haptic.tap() // 拍照瞬间短震

				// #ifdef APP-PLUS
				if (this.cameraCtx) {
					this.cameraCtx.takePhoto({
						quality: 'high',
						success: (res) => this.recognize(res.tempImagePath),
						fail: (err) => {
							console.error('takePhoto fail', err)
							this.recognize(null)
						}
					})
					return
				}
				// #endif

				// #ifdef H5
				{
					const dataUrl = this.grabH5Frame()
					this.recognize(dataUrl)
					return
				}
				// #endif

				this.recognize(null)
			},

			async recognize(imagePath) {
				this.state = 'recognizing'
				this.statusText = '正在用多种方式识别药品，请稍候'
				tts.speak(this.statusText)
				let result = null
				try {
					result = await recognizeFromImage(imagePath)
				} catch (e) {
					console.error('recognize error', e)
					haptic.failure()
					this.fail(this.recognizeErrorText(e))
					return
				}

				if (!result || !result.medicine || !result.medicine.name) {
					haptic.failure()
					this.fail('没有识别到清楚的药品名称。请把药盒有大字药名的一面对准摄像头，放近一点，保持不动后重新扫描。')
					return
				}

				this.result = result
				this.state = 'result'
				this.statusText = result.medicine.name

				// 后处理不能影响识别结果展示。
				try {
					this.stopCamera()
				} catch (e) {
					console.error('stop camera after recognize error', e)
				}
				try {
					haptic.success()
					this.speakResult(result)
				} catch (e) {
					console.error('speak result error', e)
					tts.speak('识别完成，药名，' + result.medicine.name)
				}
			},

			recognizeErrorText(e) {
				const message = (e && e.message) || ''
				if (message.indexOf('Tesseract') >= 0 || message.indexOf('开源 OCR') >= 0) {
					return '本地开源 OCR 加载失败，请检查网络后重试'
				}
				if (message.indexOf('浏览器环境') >= 0) {
					return '本地开源 OCR 需要在 H5 浏览器环境中使用'
				}
				if (message.indexOf('没有可识别的图片') >= 0) {
					return '没有拿到照片，请重新拍照'
				}
				if (message.indexOf('读取图片') >= 0 || message.indexOf('转码') >= 0) {
					return '照片读取失败，请重新拍照'
				}
				return '识别失败，请重新识别'
			},

			speakResult(result) {
				const m = result.medicine
				const segs = []
				if (result.confidencePrefix) segs.push(result.confidencePrefix)
				segs.push(`药名，${m.name}。`)
				if (!result.matchedDatabase && result.rawText) {
					segs.push(`识别到的文字包括，${result.rawText.replace(/\n/g, '，')}。`)
				}
				if (m.dosage) segs.push(`用法用量，${m.dosage}。`)
				if (m.expiryDate) {
					const d = new Date(m.expiryDate)
					segs.push(`有效期至，${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日。`)
				}
				if (m.precautions) segs.push(`注意事项，${m.precautions}。`)
				if (m.ingredients) segs.push(`主要成分，${m.ingredients}。`)
				segs.push('识别完成。可以选择保存到药箱，或重新识别。')
				tts.speakSegments(segs)
			},

			saveToBox() {
				if (!this.result) return
				try {
					insertMedicine(this.result.medicine)
					haptic.success()
					tts.speak('已保存到药箱')
					this.restartScan()
				} catch (e) {
					console.error('save error', e)
					haptic.failure()
					tts.speak('保存失败，请重试')
				}
			},

			restartScan() {
				this.startScan()
			},

			repeatSpeak() {
				tts.repeat()
			},

			// ---------------- AI 辅助：按住说话，松开执行 ----------------
			beginAssistantVoice(source) {
				if (source === 'touch') this.lastTouchAt = Date.now()
				if (source === 'mouse' && Date.now() - this.lastTouchAt < 700) return
				if (this.assistantRecording) return

				this.clearTimers()
				this.assistantRecording = true
				this.assistantIgnoreStop = false
				this.assistantStartedAt = Date.now()
				this.h5SpeechHandled = false
				this.statusText = '我在听，请说出你想做的事'
				haptic.tap()
				tts.stop()
				tts.speakTransient('我在听，请说')

				// #ifdef H5
				if (this.startH5AssistantSpeech()) return
				// #endif

				this.assistantRecording = false
				haptic.failure()
				this.statusText = '当前环境不支持免密语音识别'
				tts.speak('当前环境不支持免密语音识别。请使用浏览器语音输入，或改用页面按钮操作。')
			},

			endAssistantVoice(source) {
				if (source === 'mouse' && Date.now() - this.lastTouchAt < 700) return
				if (!this.assistantRecording) return

				const elapsed = Date.now() - this.assistantStartedAt
				if (elapsed < 350) {
					this.cancelAssistantVoice()
					this.statusText = '请按住后再说话'
					tts.speak('请按住按钮，说完后松开')
					return
				}

				this.assistantRecording = false
				this.assistantIgnoreStop = false
				if (this.assistantTimer) { clearTimeout(this.assistantTimer); this.assistantTimer = null }

				// #ifdef H5
				if (this.h5SpeechRecognition) {
					try { this.h5SpeechRecognition.stop() } catch (e) {}
					this.assistantTimer = setTimeout(() => {
						if (!this.h5SpeechHandled) this.handleAssistantText('')
					}, 900)
					return
				}
				// #endif

				this.handleAssistantText('')
			},

			cancelAssistantVoice() {
				if (this.assistantTimer) { clearTimeout(this.assistantTimer); this.assistantTimer = null }
				this.assistantRecording = false
				this.assistantIgnoreStop = true
				// #ifdef H5
				if (this.h5SpeechRecognition) {
					try { this.h5SpeechRecognition.abort() } catch (e) {}
					this.h5SpeechRecognition = null
				}
				// #endif
			},

			// #ifdef H5
			startH5AssistantSpeech() {
				try {
					const recognition = createSpeechRecognition({
						onResult: (text) => this.handleAssistantText(text),
						onError: (event) => {
							console.error('h5 speech error', event)
							this.handleAssistantText('')
						},
						onEnd: () => {
							this.h5SpeechRecognition = null
							this.assistantRecording = false
						}
					})
					if (!recognition) return false
					this.h5SpeechRecognition = recognition
					recognition.start()
					this.assistantTimer = setTimeout(() => {
						if (this.assistantRecording) this.endAssistantVoice('auto')
					}, 8000)
					return true
				} catch (e) {
					console.error('startH5AssistantSpeech error', e)
					this.h5SpeechRecognition = null
					return false
				}
			},
			// #endif

			// #ifndef H5
			startH5AssistantSpeech() { return false },
			// #endif

			async handleAssistantText(text) {
				if (this.assistantTimer) { clearTimeout(this.assistantTimer); this.assistantTimer = null }
				this.h5SpeechHandled = true
				this.assistantRecording = false
				// #ifdef H5
				this.h5SpeechRecognition = null
				// #endif

				const spoken = (text || '').trim()
				if (!spoken) {
					haptic.failure()
					this.statusText = '没听清，请再试一次'
					tts.speak('没听清，请再按住说一次')
					return
				}

				const intent = resolveAssistantIntent(spoken, {
					medicines: getAllMedicines(),
					hasResult: !!this.result
				})
				this.statusText = '听到：' + spoken
				await this.executeAssistantIntent(intent)
			},

			async executeAssistantIntent(intent) {
				switch (intent.type) {
					case 'capture':
						tts.speak('打开扫描器，开始识别药品')
						uni.switchTab({ url: '/pages/scanner/scanner' })
						break
					case 'restartScan':
						tts.speak('打开扫描器，重新识别')
						uni.switchTab({ url: '/pages/scanner/scanner' })
						break
					case 'save':
						if (this.result) {
							this.saveToBox()
						} else {
							haptic.failure()
							tts.speak('现在还没有识别结果。请先识别药品，再保存到药箱。')
						}
						break
					case 'repeat':
						this.repeatSpeak()
						break
					case 'findMedicine':
						await this.speakAssistantLocation(intent.medicine)
						break
					case 'openFinder':
						tts.speak('打开找药页面')
						uni.switchTab({ url: '/pages/finder/finder' })
						break
					case 'openCabinet':
						tts.speak('打开我的药箱')
						uni.switchTab({ url: '/pages/cabinet/cabinet' })
						break
					case 'openHome':
						tts.speak('已经在首页')
						this.mode = 'home'
						this.stopCamera()
						break
					case 'openCalendar':
						tts.speak('打开日历')
						uni.navigateTo({ url: '/pages/calendar/calendar' })
						break
					case 'openAssistant':
						tts.speak('打开 AI 小助手')
						uni.navigateTo({ url: '/pages/assistant/assistant' })
						break
					case 'openSettings':
						tts.speak('打开设置')
						uni.switchTab({ url: '/pages/settings/settings' })
						break
					case 'expiryCheck':
						this.statusText = '正在检查过期药'
						tts.speak(expirySummaryText(getAllMedicines()))
						break
					case 'help':
						tts.speak(ASSISTANT_HELP_TEXT)
						break
					default:
						haptic.failure()
						tts.speak('我还没理解。你可以说，识别药品，保存到药箱，找某一种药，打开药箱，或者打开设置。')
						break
				}
			},

			async speakAssistantLocation(medicine) {
				if (!medicine) {
					haptic.failure()
					tts.speak('没有找到这种药。请再说一次药名，或打开找药页面。')
					return
				}
				this.statusText = medicine.slot
					? medicine.name + ' 在 ' + medicine.slot + ' 号格子'
					: medicine.name + ' 尚未设置格子'
				tts.speak(medicineLocationText(medicine))
				if (medicine.slot) {
					const ok = await highlightSlot(medicine.slot)
					if (ok) haptic.success()
				}
			},

			fail(msg) {
				this.state = 'error'
				this.statusText = msg
				tts.speak(msg)
			}
		}
	}
</script>

<style>
	.home-page {
		background-color: #ffffff;
		color: #000000;
		box-sizing: border-box;
		padding: 20px 18px 0;
		display: flex;
		flex-direction: column;
	}
	.home-header {
		padding: 18px 0 16px;
		border-bottom: 3px solid #000000;
		display: flex;
		flex-direction: column;
	}
	.home-eyebrow {
		font-size: 16px;
		font-weight: 700;
		color: #555555;
	}
	.home-title {
		margin-top: 6px;
		font-size: 38px;
		line-height: 1.2;
		font-weight: 800;
		color: #000000;
		letter-spacing: 0;
	}
	.home-subtitle {
		margin-top: 10px;
		font-size: 19px;
		line-height: 1.4;
		font-weight: 700;
		color: #444444;
	}
	.home-status {
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
	.home-grid {
		width: 100%;
		margin-top: 14px;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	.home-tile {
		width: 100%;
		min-height: 148px;
		margin: 0;
		padding: 16px 12px;
		border: 2px solid #000000;
		border-radius: 0;
		background-color: #ffffff;
		color: #000000;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
	}
	.home-tile-dark {
		background-color: #000000;
		color: #ffffff;
	}
	.home-tile::after,
	.home-voice-button::after {
		border: 0;
	}
	.home-tile-text {
		font-size: 30px;
		line-height: 1.18;
		font-weight: 900;
		color: inherit;
		text-align: center;
	}
	.home-tile-sub {
		margin-top: 10px;
		font-size: 17px;
		line-height: 1.2;
		font-weight: 700;
		color: inherit;
		opacity: 0.76;
		text-align: center;
	}
	.home-voice-button {
		width: 100%;
		min-height: 108px;
		margin: 14px 0 18px;
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
	.home-voice-button-active {
		background-color: #ffffff;
		color: #000000;
	}
	.home-voice-text {
		font-size: 31px;
		line-height: 1.18;
		font-weight: 900;
		color: inherit;
		text-align: center;
	}
	.home-voice-sub {
		margin-top: 10px;
		font-size: 18px;
		line-height: 1.2;
		font-weight: 700;
		color: inherit;
		opacity: 0.8;
		text-align: center;
	}
	.scan-page {
		background-color: #ffffff;
	}
	.preview {
		flex: 3;
		min-height: 280px;
		background-color: #000000;
		position: relative;
		overflow: hidden;
	}
	.camera {
		width: 100%;
		height: 100%;
	}
	.h5-preview {
		width: 100%;
		height: 100%;
	}
	.camera-placeholder {
		color: #ffffff;
		text-align: center;
		padding-top: 120px;
		font-size: 18px;
	}
	.scan-frame {
		position: absolute;
		left: 12%;
		right: 12%;
		top: 16%;
		bottom: 16%;
		border: 3px solid rgba(255, 255, 255, 0.92);
		border-radius: 18px;
		box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.18);
		pointer-events: none;
	}
	.scan-frame::before,
	.scan-frame::after {
		content: '';
		position: absolute;
		left: 18px;
		right: 18px;
		height: 2px;
		background-color: rgba(255, 255, 255, 0.7);
	}
	.scan-frame::before {
		top: 34%;
	}
	.scan-frame::after {
		bottom: 34%;
	}
	.preview-caption {
		position: absolute;
		left: 20px;
		right: 20px;
		bottom: 18px;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}
	.preview-caption-text {
		min-height: 34px;
		padding: 6px 16px;
		border-radius: 999px;
		background-color: rgba(0, 0, 0, 0.72);
		color: #ffffff;
		font-size: 18px;
		font-weight: 700;
		letter-spacing: 0;
	}
	.controls {
		flex: 2;
		padding: 18px 18px 22px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		background-color: #ffffff;
		border-top: 3px solid #000000;
		border-top-left-radius: 0;
		border-top-right-radius: 0;
		margin-top: -18px;
		position: relative;
		z-index: 2;
	}
	.status-panel {
		min-height: 94px;
		padding: 14px 16px;
		margin-bottom: 10px;
		border: 2px solid #000000;
		border-radius: 0;
		background-color: #ffffff;
		display: flex;
		flex-direction: column;
		justify-content: center;
		box-sizing: border-box;
	}
	.status-kicker {
		font-size: 15px;
		font-weight: 700;
		color: #555555;
		margin-bottom: 6px;
	}
	.status-panel .status-text {
		padding: 0;
		text-align: left;
		font-size: 26px;
		line-height: 1.25;
		color: #000000;
	}
	.ai-assistant-btn {
		background-color: #000000;
		color: #ffffff;
		border: 0;
	}
	.ai-assistant-btn-active {
		background-color: #ffffff;
		color: #000000;
		border: 2px solid #000000;
		transform: scale(0.985);
	}
	.assistant-hint {
		display: block;
		min-height: 24px;
		margin-top: 2px;
		font-size: 16px;
		line-height: 1.45;
		text-align: center;
		color: #444444;
	}
</style>
