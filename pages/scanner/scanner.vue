<template>
	<view class="page-container scanner-page">
		<view class="camera-area" aria-hidden="true">
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
			<view class="h5-preview"></view>
			<!-- #endif -->
			<!-- #ifndef APP-PLUS || H5 -->
			<view class="camera-placeholder">请在手机 App 或浏览器中体验摄像头</view>
			<!-- #endif -->
			<view class="scan-frame"></view>
		</view>

		<view class="control-panel">
			<view
				class="status-panel"
				role="button"
				tabindex="0"
				aria-live="polite"
				:aria-label="statusPanelLabel"
				@click="speakStatus"
			>
				<text class="status-kicker">{{ statusKicker }}</text>
				<text class="status-text">{{ statusText }}</text>
			</view>

			<block v-if="state === 'supplementReady'">
				<button class="action-button action-button-dark" @click="startSupplementScan" aria-label="继续扫描说明面，识别一天吃几次和产品信息">继续扫描说明</button>
				<button class="action-button" @click="finishWithoutSupplement" aria-label="跳过说明面，直接查看当前识别结果">跳过说明</button>
				<button class="action-button" @click="restartScan" aria-label="重新打开摄像头扫描药品正面">重新扫描</button>
			</block>

			<block v-else-if="state === 'result'">
				<button class="action-button action-button-dark" @click="saveToBox" aria-label="保存识别到的药品到药箱">保存到药箱</button>
				<button class="action-button" @click="restartScan" aria-label="重新打开摄像头扫描药品">重新扫描</button>
				<button class="action-button" @click="repeatSpeak" aria-label="重复朗读刚才的识别结果">重复朗读</button>
			</block>

			<block v-else-if="state === 'error'">
				<button class="action-button action-button-dark" @click="restartScan" aria-label="重新打开摄像头扫描药品">重新扫描</button>
				<button class="action-button" @click="speakPositionHelp" aria-label="朗读药品摆放提示，包括往左、往右、靠近、拿远和翻面">摆放提示</button>
			</block>

			<block v-else>
				<button class="action-button action-button-dark" :disabled="state === 'capturing' || state === 'recognizing'" :aria-disabled="state === 'capturing' || state === 'recognizing'" @click="capture" aria-label="立即拍照识别当前画面中的药品">立即拍照</button>
				<button class="action-button" @click="speakPositionHelp" aria-label="朗读药品摆放提示，包括往左、往右、靠近、拿远和翻面">摆放提示</button>
			</block>
			<voice-assistant context="scanner" />
		</view>
	</view>
</template>

<script>
	import VoiceAssistant from '../../components/voice-assistant/voice-assistant.vue'
	import { recognizeFromImage, recognizeSupplementFromImage } from '../../services/ocr.js'
	import { insertMedicine } from '../../services/storage.js'
	import * as tts from '../../services/tts.js'
	import * as haptic from '../../services/haptic.js'

	export default {
		components: {
			VoiceAssistant
		},
		data() {
			return {
				showCamera: false,
				state: 'idle', // idle | guiding | capturing | recognizing | supplementReady | supplementGuiding | result | error
				statusText: '准备打开摄像头',
				result: null,
				scanStep: 'front',
				cameraCtx: null,
				h5Stream: null,
				h5Video: null,
				guideTimer: null,
				autoTimer: null,
				guideIndex: 0,
				guideSteps: [
					'请把药品正面朝上，放在手机后方镜头前。',
					'请把药盒放在画面中间。',
					'如果听到我提示方向，就慢慢移动，不要太快。',
					'请往左一点。',
					'请往右一点。',
					'请靠近一点。',
					'请拿远一点。',
					'如果这一面没有药名，请翻个面。',
					'请保持不动，准备拍照。'
				]
			}
		},
		computed: {
			statusKicker() {
				if (this.state === 'result') return '识别结果'
				if (this.state === 'supplementReady' || this.state === 'supplementGuiding') return '补充信息'
				if (this.state === 'error') return '需要处理'
				if (this.state === 'recognizing') return '正在识别'
				if (this.state === 'capturing') return '正在拍照'
				return '扫描引导'
			},
			statusPanelLabel() {
				return this.statusKicker + '，' + this.statusText + '。双击可重复朗读当前提示'
			}
		},
		onShow() {
			this.startScan()
		},
		onHide() {
			this.clearTimers()
			this.stopCamera()
			tts.stop()
		},
		onUnload() {
			this.clearTimers()
			this.stopCamera()
			tts.stop()
		},
		methods: {
			getNarrationText() {
				const parts = ['扫描器。' + this.statusText]
				if (this.state === 'result') parts.push('功能：保存药品、重新扫描、重复朗读。')
				else if (this.state === 'supplementReady') parts.push('功能：继续扫描说明、跳过说明、重新扫描。')
				else if (this.state === 'error') parts.push('功能：重新扫描、摆放提示。')
				else parts.push('功能：拍照识别、摆放提示、语音助手。')
				return parts.join('。')
			},
			clearTimers() {
				if (this.guideTimer) { clearTimeout(this.guideTimer); this.guideTimer = null }
				if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null }
			},
			startScan() {
				this.clearTimers()
				this.result = null
				this.scanStep = 'front'
				this.state = 'guiding'
				this.statusText = '正在打开摄像头'
				this.showCamera = true
				haptic.tap()

				// #ifdef APP-PLUS
				try { this.cameraCtx = uni.createCameraContext() } catch (e) { this.cameraCtx = null }
				this.statusText = '摄像头已打开，请把药品正面朝上放到镜头前'
				tts.speak(this.statusText)
				this.runGuidance()
				this.autoTimer = setTimeout(() => {
					if (this.state === 'guiding') this.capture()
				}, 12500)
				return
				// #endif

				// #ifdef H5
				this.startH5Camera()
				return
				// #endif

				this.fail('请在手机 App 或浏览器中使用摄像头扫描')
			},
			restartScan() {
				this.startScan()
			},
			startSupplementScan() {
				if (!this.result || !this.result.medicine) return
				this.clearTimers()
				this.scanStep = 'supplement'
				this.state = 'supplementGuiding'
				this.showCamera = true
				this.statusText = '请翻到药盒背面或说明面，对准用法用量、成分、注意事项和有效期'
				haptic.tap()
				tts.speak(this.statusText)

				// #ifdef APP-PLUS
				try { this.cameraCtx = uni.createCameraContext() } catch (e) { this.cameraCtx = null }
				this.autoTimer = setTimeout(() => {
					if (this.state === 'supplementGuiding') this.capture()
				}, 9000)
				return
				// #endif

				// #ifdef H5
				this.startH5Camera()
				this.autoTimer = setTimeout(() => {
					if (this.state === 'supplementGuiding') this.capture()
				}, 9000)
				return
				// #endif
			},
			finishWithoutSupplement() {
				this.state = 'result'
				this.statusText = '已跳过说明面，可以保存到药箱'
				haptic.tap()
				this.speakResult(this.result)
			},
			runGuidance() {
				this.guideIndex = 0
				const tick = () => {
					if (this.state !== 'guiding') return
					if (this.guideIndex >= this.guideSteps.length) return
					const text = this.guideSteps[this.guideIndex]
					this.statusText = text
					tts.speakTransient(text)
					this.guideIndex++
					this.guideTimer = setTimeout(tick, 1400)
				}
				this.guideTimer = setTimeout(tick, 1200)
			},
			speakPositionHelp() {
				haptic.tap()
				const text = this.scanStep === 'supplement'
					? '请把药盒背面或说明面朝向摄像头，尽量让用法用量、一天几次、每次多少、注意事项和有效期进入画面。'
					: '第一步请扫正面药名。把药名朝向摄像头，放在画面中间。如果这一面没有药名，请翻个面。识别药名后，我会提示继续扫描说明面。'
				this.statusText = text
				tts.speak(text)
			},
			speakStatus() {
				haptic.tap()
				tts.speak(this.statusText)
			},
			// #ifdef H5
			async startH5Camera() {
				try {
					if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
						throw new Error('浏览器不支持摄像头')
					}
					const stream = await navigator.mediaDevices.getUserMedia({
						video: { facingMode: { ideal: 'environment' } },
						audio: false
					})
					this.h5Stream = stream
					const video = document.createElement('video')
					video.setAttribute('playsinline', '')
					video.setAttribute('webkit-playsinline', '')
					video.muted = true
					video.autoplay = true
					video.srcObject = stream
					video.style.width = '100%'
					video.style.height = '100%'
					video.style.objectFit = 'cover'
					const box = this.$el && this.$el.querySelector('.h5-preview')
					if (box) {
						box.innerHTML = ''
						box.appendChild(video)
					}
					this.h5Video = video
					await video.play().catch(() => {})
					this.statusText = this.scanStep === 'supplement'
						? '摄像头已打开，请对准用法用量和说明文字'
						: '摄像头已打开，请把药品正面朝上放到镜头前'
					tts.speak(this.statusText)
					if (this.scanStep === 'front') this.runGuidance()
					this.autoTimer = setTimeout(() => {
						if (this.state === 'guiding' || this.state === 'supplementGuiding') this.capture()
					}, this.scanStep === 'supplement' ? 9000 : 12500)
				} catch (e) {
					console.error('start scanner camera error', e)
					this.fail('无法打开摄像头，请允许相机权限后重新扫描')
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
			stopCamera() {
				this.showCamera = false
				this.stopH5Camera()
			},
			onCameraError(e) {
				console.error('scanner camera error', e)
				this.fail('摄像头启动失败，请检查相机权限')
			},
			capture() {
				if (this.state === 'capturing' || this.state === 'recognizing') return
				this.clearTimers()
				this.state = 'capturing'
				this.statusText = this.scanStep === 'supplement' ? '正在拍说明面，请保持不动' : '正在拍照，请保持不动'
				haptic.tap()
				tts.speak(this.statusText)

				// #ifdef APP-PLUS
				if (this.cameraCtx) {
					this.cameraCtx.takePhoto({
						quality: 'high',
						success: (res) => this.recognize(res.tempImagePath),
						fail: () => this.recognize(null)
					})
					return
				}
				// #endif

				// #ifdef H5
				this.recognize(this.grabH5Frame())
				return
				// #endif

				this.recognize(null)
			},
			async recognize(imagePath) {
				this.state = 'recognizing'
				if (this.scanStep === 'supplement') {
					await this.recognizeSupplement(imagePath)
					return
				}
				this.statusText = '正在识别药品名称，请稍候'
				tts.speak(this.statusText)
				try {
					const result = await recognizeFromImage(imagePath)
					if (!result || !result.medicine || !result.medicine.name) {
						this.fail('没有识别到清楚的药品名称。请把药盒有大字药名的一面对准摄像头，放近一点，保持不动后重新扫描。')
						return
					}
					this.result = result
					this.state = 'supplementReady'
					this.stopCamera()
					haptic.success()
					this.speakFrontResult(result)
				} catch (e) {
					console.error('scanner recognize error', e)
					this.fail('识别失败。请把药盒放到画面中间，药名朝向摄像头；如果这一面没有药名，请翻个面后重新扫描。')
				}
			},
			async recognizeSupplement(imagePath) {
				this.statusText = '正在识别用法用量和产品信息，请稍候'
				tts.speak(this.statusText)
				try {
					const supplement = await recognizeSupplementFromImage(imagePath, this.result && this.result.medicine)
					this.result = Object.assign({}, this.result, {
						medicine: supplement.medicine,
						supplementRawText: supplement.rawText
					})
					this.state = 'result'
					this.stopCamera()
					haptic.success()
					this.speakResult(this.result)
				} catch (e) {
					console.error('supplement recognize error', e)
					this.state = 'result'
					this.stopCamera()
					haptic.failure()
					tts.speak('补充信息没有识别清楚。已保留药名结果，可以保存，也可以重新扫描。')
					this.speakResult(this.result)
				}
			},
			speakFrontResult(result) {
				const m = result.medicine
				this.statusText = '识别到 ' + m.name + '。请再扫说明面补全用法用量'
				const segs = []
				if (result.confidencePrefix) segs.push(result.confidencePrefix)
				segs.push('识别到药品，' + m.name + '。')
				segs.push('为了识别一天吃几次、每次吃多少，请翻到药盒背面或说明面，然后点继续扫描说明。')
				tts.speakSegments(segs)
			},
			speakResult(result) {
				const m = result.medicine
				this.statusText = '识别到 ' + m.name
				const segs = []
				if (result.confidencePrefix) segs.push(result.confidencePrefix)
				segs.push('识别到药品，' + m.name + '。')
				if (m.dosage) segs.push('用法用量，' + m.dosage + '。')
				else segs.push('还没有识别到用法用量，请查看说明书或重新扫描说明面。')
				if (m.precautions) segs.push('注意事项，' + m.precautions + '。')
				if (m.ingredients) segs.push('主要成分，' + m.ingredients + '。')
				if (m.expiryDate) {
					const d = new Date(m.expiryDate)
					segs.push('有效期至，' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日。')
				}
				segs.push('可以保存到药箱，或重新扫描。')
				tts.speakSegments(segs)
			},
			saveToBox() {
				if (!this.result) return
				try {
					insertMedicine(this.result.medicine)
					haptic.success()
					this.statusText = '已保存到药箱'
					tts.speak(this.statusText)
				} catch (e) {
					console.error('scanner save error', e)
					this.fail('保存失败，请重试')
				}
			},
			repeatSpeak() {
				tts.repeat()
			},
			fail(text) {
				this.clearTimers()
				this.state = 'error'
				this.statusText = text
				haptic.failure()
				tts.speak(text)
			}
		}
	}
</script>

<style>
	.scanner-page {
		background-color: #ffffff;
		color: #000000;
		box-sizing: border-box;
	}
	.camera-area {
		flex: 1;
		min-height: 360px;
		background-color: #000000;
		position: relative;
		overflow: hidden;
	}
	.camera,
	.h5-preview {
		width: 100%;
		height: 100%;
	}
	.camera-placeholder {
		color: #ffffff;
		text-align: center;
		padding-top: 140px;
		font-size: 18px;
	}
	.scan-frame {
		position: absolute;
		left: 10%;
		right: 10%;
		top: 14%;
		bottom: 14%;
		border: 4px solid #ffffff;
		box-sizing: border-box;
		pointer-events: none;
	}
	.scan-frame::before,
	.scan-frame::after {
		content: '';
		position: absolute;
		background-color: #ffffff;
	}
	.scan-frame::before {
		left: 18%;
		right: 18%;
		top: 50%;
		height: 3px;
	}
	.scan-frame::after {
		top: 18%;
		bottom: 18%;
		left: 50%;
		width: 3px;
	}
	.control-panel {
		padding: 16px 18px 18px;
		border-top: 3px solid #000000;
		background-color: #ffffff;
	}
	.status-panel {
		min-height: 108px;
		padding: 14px 16px;
		border: 2px solid #000000;
		background-color: #ffffff;
		display: flex;
		flex-direction: column;
		justify-content: center;
		box-sizing: border-box;
	}
	.status-kicker {
		font-size: 16px;
		font-weight: 800;
		color: #555555;
	}
	.status-text {
		margin-top: 8px;
		font-size: 25px;
		line-height: 1.28;
		font-weight: 900;
		color: #000000;
	}
	.action-button {
		width: 100%;
		min-height: 70px;
		margin: 10px 0 0;
		padding: 0 18px;
		border: 2px solid #000000;
		border-radius: 0;
		background-color: #ffffff;
		color: #000000;
		font-size: 22px;
		font-weight: 900;
	}
	.action-button-dark {
		background-color: #000000;
		color: #ffffff;
	}
	button::after {
		border: 0;
	}
</style>
