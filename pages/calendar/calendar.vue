<template>
	<view class="page-container calendar-page">
		<view class="calendar-header" :aria-label="monthSummary" role="button" tabindex="0" @click="speakMonthSummary">
			<text class="eyebrow">日历</text>
			<text class="headline">{{ monthTitle }}</text>
			<text class="header-copy">按天查看要吃什么药，也可以设置开始吃、每天时间和过期日期。</text>
		</view>

		<text class="status-banner" :aria-label="statusText" role="alert" v-if="statusText">{{ statusText }}</text>

		<view class="month-actions">
			<button class="month-button" @click="prevMonth" aria-label="上个月">上个月</button>
			<button class="month-button month-button-dark" @click="goToday" aria-label="回到今天">今天</button>
			<button class="month-button" @click="nextMonth" aria-label="下个月">下个月</button>
		</view>

		<view class="calendar-grid" aria-label="月历">
			<text v-for="w in weekLabels" :key="w" class="weekday">{{ w }}</text>
			<button
				v-for="day in calendarDays"
				:key="day.key"
				class="day-cell"
				:class="{ 'is-muted': !day.inMonth, 'is-selected': isSameDay(day.date, selectedDate), 'has-dose': Boolean(day.items.length) }"
				:aria-label="dayLabel(day)"
				@click="selectDate(day.date)"
			>
				<text class="day-number">{{ day.date.getDate() }}</text>
				<text class="day-count">{{ day.items.length ? day.items.length + '项' : '无' }}</text>
			</button>
		</view>

		<view class="selected-panel" :aria-label="selectedSummary" role="button" tabindex="0" @click="speakSelectedDay">
			<view class="panel-head">
				<text class="panel-title">{{ selectedTitle }}</text>
				<text class="panel-count">{{ selectedItems.length }} 项</text>
			</view>
			<view v-if="selectedItems.length === 0" class="empty-day">
				<text class="empty-text">这一天没有服药计划</text>
			</view>
			<view v-else>
				<view v-for="item in selectedItems" :key="item.schedule.id" class="dose-row" role="button" tabindex="0" :aria-label="doseLabel(item)" @click.stop="speakDose(item)">
					<view class="dose-main">
						<text class="dose-time">{{ timeLabel(item.schedule) }}</text>
						<text class="dose-name">{{ item.medicine.name }}</text>
						<text class="dose-meta">{{ rangeLabel(item) }}</text>
					</view>
					<button class="dose-edit" :aria-label="'编辑 ' + item.medicine.name + ' 的服药计划'" @click.stop="editSchedule(item)">编辑</button>
				</view>
			</view>
		</view>

		<button class="add-button" @click="startAdd" aria-label="添加服药计划">添加服药计划</button>

		<view v-if="editing" class="editor">
			<text class="editor-title">{{ editingScheduleId ? '编辑计划' : '添加计划' }}</text>

			<button
				class="plan-voice-button"
				:class="{ 'is-recording': planRecording }"
				:aria-label="planVoiceLabel"
				@touchstart.stop.prevent="beginPlanVoice('touch')"
				@touchend.stop.prevent="endPlanVoice('touch')"
				@touchcancel.stop.prevent="cancelPlanVoice"
				@mousedown.stop.prevent="beginPlanVoice('mouse')"
				@mouseup.stop.prevent="endPlanVoice('mouse')"
				@mouseleave.stop.prevent="cancelPlanVoice"
			>
				<text class="plan-voice-title">{{ planRecording ? '松开填写' : '语音填写计划' }}</text>
				<text class="plan-voice-sub">{{ planRecording ? '正在听' : '可说药品、时间、开始日期、过期日期、保存' }}</text>
			</button>

			<picker mode="selector" :range="medicineNames" :value="selectedMedicineIndex" aria-label="选择药品">
				<view class="pick-row" role="button" tabindex="0" :aria-label="'选择药品，当前 ' + currentMedicineName">
					<text class="pick-label">药品</text>
					<text class="pick-value">{{ currentMedicineName }}</text>
				</view>
			</picker>

			<picker mode="date" :value="startDateText" aria-label="选择开始服用日期" @change="onStartDateChange">
				<view class="pick-row" role="button" tabindex="0" :aria-label="'开始服用日期，当前 ' + startDateText">
					<text class="pick-label">开始吃</text>
					<text class="pick-value">{{ startDateText }}</text>
				</view>
			</picker>

			<picker mode="time" :value="timeText" aria-label="选择每天服药时间" @change="onTimeChange">
				<view class="pick-row" role="button" tabindex="0" :aria-label="'每天服药时间，当前 ' + timeText">
					<text class="pick-label">每天时间</text>
					<text class="pick-value">{{ timeText }}</text>
				</view>
			</picker>

			<picker mode="date" :value="expiryDateText" aria-label="选择药品过期日期" @change="onExpiryDateChange">
				<view class="pick-row" role="button" tabindex="0" :aria-label="'过期日期，当前 ' + expiryDateText">
					<text class="pick-label">过期日期</text>
					<text class="pick-value">{{ expiryDateText }}</text>
				</view>
			</picker>

			<view class="editor-actions">
				<button class="editor-button editor-button-dark" @click="savePlan" :aria-label="'保存 ' + currentMedicineName + ' 的服药计划，时间 ' + timeText + '，开始日期 ' + startDateText + '，过期日期 ' + expiryDateText">保存</button>
				<button class="editor-button" @click="cancelEdit" aria-label="取消编辑服药计划，不保存本次修改">取消</button>
			</view>
			<button v-if="editingScheduleId" class="delete-button" @click="deletePlan" aria-label="删除这个服药计划">删除这个计划</button>
		</view>
		<voice-assistant context="calendar" :delegate-unknown="editing" @intent="handleVoiceIntent" @heard="statusText = '语音助手听到：' + $event" />
	</view>
</template>

<script>
	import VoiceAssistant from '../../components/voice-assistant/voice-assistant.vue'
	import {
		getAllMedicines,
		getAllEnabledSchedules,
		insertSchedule,
		updateSchedule,
		updateMedicine,
		deleteSchedule
	} from '../../services/storage.js'
	import { scheduleDaily } from '../../services/notification.js'
	import { createSpeechRecognition } from '../../services/browserSpeech.js'
	import * as tts from '../../services/tts.js'
	import * as haptic from '../../services/haptic.js'

	function formatDateValue(date) {
		const y = date.getFullYear()
		const m = ('0' + (date.getMonth() + 1)).slice(-2)
		const d = ('0' + date.getDate()).slice(-2)
		return y + '-' + m + '-' + d
	}

	export default {
		components: {
			VoiceAssistant
		},
		data() {
			const today = new Date()
			return {
				viewYear: today.getFullYear(),
				viewMonth: today.getMonth(),
				selectedDate: today,
				medicines: [],
				schedules: [],
				statusText: '',
				editing: false,
				editingScheduleId: null,
				selectedMedicineIndex: 0,
				planRecording: false,
				planLastTouchAt: 0,
				planStartedAt: 0,
				planSpeechRecognition: null,
				planSpeechHandled: false,
				planVoiceTimer: null,
				form: {
					startDate: formatDateValue(today),
					hour: 8,
					minute: 0,
					expiryDate: formatDateValue(new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()))
				},
				weekLabels: ['一', '二', '三', '四', '五', '六', '日']
			}
		},
		computed: {
			monthTitle() {
				return this.viewYear + '年' + (this.viewMonth + 1) + '月'
			},
			monthSummary() {
				return this.monthTitle + '日历。这个月共有 ' + this.monthItems.length + ' 个服药安排。点某一天可以朗读当天要吃什么药。'
			},
			monthItems() {
				return this.schedules.filter((s) => {
					const d = new Date(this.viewYear, this.viewMonth, 1)
					const last = new Date(this.viewYear, this.viewMonth + 1, 0)
					return this.scheduleActiveOnRange(s, d, last)
				})
			},
			calendarDays() {
				const first = new Date(this.viewYear, this.viewMonth, 1)
				const offset = (first.getDay() + 6) % 7
				const start = new Date(this.viewYear, this.viewMonth, 1 - offset)
				const days = []
				for (let i = 0; i < 42; i++) {
					const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
					days.push({
						key: this.formatDate(d),
						date: d,
						inMonth: d.getMonth() === this.viewMonth,
						items: this.itemsForDate(d)
					})
				}
				return days
			},
			selectedTitle() {
				const d = this.selectedDate
				return (d.getMonth() + 1) + '月' + d.getDate() + '日'
			},
			selectedItems() {
				return this.itemsForDate(this.selectedDate)
			},
			selectedSummary() {
				if (!this.selectedItems.length) return this.selectedTitle + '没有服药计划。'
				return this.selectedTitle + '需要服用：' + this.selectedItems.map((x) => this.timeLabel(x.schedule) + x.medicine.name).join('，')
			},
			medicineNames() {
				return this.medicines.map((m) => m.name)
			},
			currentMedicine() {
				return this.medicines[this.selectedMedicineIndex] || null
			},
			currentMedicineName() {
				return this.currentMedicine ? this.currentMedicine.name : '没有药品'
			},
			startDateText() {
				return this.form.startDate
			},
			expiryDateText() {
				return this.form.expiryDate
			},
			timeText() {
				return ('0' + this.form.hour).slice(-2) + ':' + ('0' + this.form.minute).slice(-2)
			},
			planVoiceLabel() {
				return this.planRecording
					? '语音填写计划正在听，说完后松开。可以说药品名称、每天时间、开始日期、过期日期、保存或取消'
					: '语音填写计划，按住说话。示例，药品布洛芬，时间早上八点，开始今天，过期下个月十号，保存'
			}
		},
		onShow() {
			this.refresh()
			tts.speak('日历页面。可以查看每天吃什么药，也可以点添加服药计划。底部语音助手可以说添加服药计划、打开药箱、扫描药品。')
		},
		onHide() {
			this.clearPlanVoice()
		},
		onUnload() {
			this.clearPlanVoice()
		},
		methods: {
			getNarrationText() {
				const parts = ['日历。功能：查看每天吃什么药、添加服药计划、切换月份。']
				if (this.editing) {
					parts.push((this.editingScheduleId ? '编辑计划' : '添加计划') + '。功能：语音填写、选药、选时间、保存、取消。')
				} else {
					parts.push('功能：上个月、今天、下个月、添加服药计划。')
				}
				parts.push('语音助手：添加计划、保存、取消、打开药箱、扫描药品。')
				return parts.join('。')
			},
			clearPlanVoice() {
				if (this.planVoiceTimer) { clearTimeout(this.planVoiceTimer); this.planVoiceTimer = null }
				this.planRecording = false
				// #ifdef H5
				if (this.planSpeechRecognition) {
					try { this.planSpeechRecognition.abort() } catch (e) {}
					this.planSpeechRecognition = null
				}
				// #endif
			},
			refresh() {
				this.medicines = getAllMedicines()
				this.schedules = getAllEnabledSchedules()
			},
			formatDate(date) {
				return formatDateValue(date)
			},
			dateStart(date) {
				return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
			},
			isSameDay(a, b) {
				return this.formatDate(a) === this.formatDate(b)
			},
			medicineById(id) {
				return this.medicines.find((m) => m.id === id) || null
			},
			scheduleActiveOnDate(schedule, date) {
				const day = this.dateStart(date)
				const start = schedule.startDate ? this.dateStart(new Date(schedule.startDate)) : 0
				const medicine = this.medicineById(schedule.medicineId)
				const endSource = schedule.endDate || (medicine && medicine.expiryDate)
				const end = endSource ? this.dateStart(new Date(endSource)) : Infinity
				return schedule.enabled && day >= start && day <= end
			},
			scheduleActiveOnRange(schedule, startDate, endDate) {
				const start = schedule.startDate ? this.dateStart(new Date(schedule.startDate)) : 0
				const medicine = this.medicineById(schedule.medicineId)
				const endSource = schedule.endDate || (medicine && medicine.expiryDate)
				const end = endSource ? this.dateStart(new Date(endSource)) : Infinity
				return schedule.enabled && start <= this.dateStart(endDate) && end >= this.dateStart(startDate)
			},
			itemsForDate(date) {
				return this.schedules
					.filter((s) => this.scheduleActiveOnDate(s, date))
					.map((s) => ({ schedule: s, medicine: this.medicineById(s.medicineId) }))
					.filter((x) => x.medicine)
					.sort((a, b) => a.schedule.hour * 60 + a.schedule.minute - (b.schedule.hour * 60 + b.schedule.minute))
			},
			timeLabel(schedule) {
				return ('0' + schedule.hour).slice(-2) + ':' + ('0' + schedule.minute).slice(-2)
			},
			dayLabel(day) {
				const dateText = (day.date.getMonth() + 1) + '月' + day.date.getDate() + '日'
				const monthText = day.inMonth ? '' : '，不是当前月份'
				const selectedText = this.isSameDay(day.date, this.selectedDate) ? '，当前选中' : ''
				return dateText + monthText + selectedText + '，' + (day.items.length ? '有' + day.items.length + '个服药计划' : '没有服药计划') + '，双击查看当天安排'
			},
			doseLabel(item) {
				return '服药计划，' + this.timeLabel(item.schedule) + '，服用 ' + item.medicine.name + '，' + this.rangeLabel(item) + '。双击朗读，右侧编辑按钮可修改'
			},
			rangeLabel(item) {
				const start = item.schedule.startDate || '未设置开始日期'
				const expiry = item.medicine.expiryDate ? this.formatDate(new Date(item.medicine.expiryDate)) : '未设置过期日期'
				return '开始吃：' + start + '；过期：' + expiry
			},
			speakMonthSummary() {
				haptic.tap()
				this.statusText = this.monthSummary
				tts.speak(this.statusText)
			},
			selectDate(date) {
				haptic.tap()
				this.selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
				this.statusText = this.selectedSummary
				tts.speak(this.statusText)
			},
			speakSelectedDay() {
				haptic.tap()
				this.statusText = this.selectedSummary
				tts.speak(this.statusText)
			},
			speakDose(item) {
				haptic.tap()
				this.statusText = this.doseLabel(item)
				tts.speak(this.statusText)
			},
			prevMonth() {
				const d = new Date(this.viewYear, this.viewMonth - 1, 1)
				this.viewYear = d.getFullYear()
				this.viewMonth = d.getMonth()
				this.statusText = '已切换到 ' + this.monthTitle
				tts.speak(this.statusText)
			},
			nextMonth() {
				const d = new Date(this.viewYear, this.viewMonth + 1, 1)
				this.viewYear = d.getFullYear()
				this.viewMonth = d.getMonth()
				this.statusText = '已切换到 ' + this.monthTitle
				tts.speak(this.statusText)
			},
			goToday() {
				const today = new Date()
				this.viewYear = today.getFullYear()
				this.viewMonth = today.getMonth()
				this.selectDate(today)
			},
			startAdd() {
				if (!this.medicines.length) {
					haptic.failure()
					this.statusText = '药箱里还没有药品，请先识别并保存药品'
					tts.speak(this.statusText)
					return
				}
				const selected = this.formatDate(this.selectedDate)
				this.editing = true
				this.editingScheduleId = null
				this.selectedMedicineIndex = 0
				this.form = { startDate: selected, hour: 8, minute: 0, expiryDate: selected }
				this.statusText = '正在添加服药计划。可以手动选择，也可以按住语音填写计划，说药品名称、每天时间、开始日期、过期日期，最后说保存。'
				tts.speak(this.statusText)
			},
			editSchedule(item) {
				const idx = this.medicines.findIndex((m) => m.id === item.medicine.id)
				this.editing = true
				this.editingScheduleId = item.schedule.id
				this.selectedMedicineIndex = idx >= 0 ? idx : 0
				this.form = {
					startDate: item.schedule.startDate || this.formatDate(this.selectedDate),
					hour: item.schedule.hour,
					minute: item.schedule.minute,
					expiryDate: item.medicine.expiryDate ? this.formatDate(new Date(item.medicine.expiryDate)) : this.formatDate(this.selectedDate)
				}
				this.statusText = '正在编辑 ' + item.medicine.name + ' 的服药计划'
				tts.speak(this.statusText)
			},
			beginPlanVoice(source) {
				if (source === 'touch') this.planLastTouchAt = Date.now()
				if (source === 'mouse' && Date.now() - this.planLastTouchAt < 700) return
				if (this.planRecording) return
				if (!this.editing) return
				this.planRecording = true
				this.planSpeechHandled = false
				this.planStartedAt = Date.now()
				haptic.tap()
				tts.stop()
				tts.speakTransient('语音填写计划，我在听，请说')

				// #ifdef H5
				if (this.startH5PlanSpeech()) return
				// #endif

				this.planRecording = false
				haptic.failure()
				this.statusText = '当前环境不支持免密语音识别，请使用页面选择器'
				tts.speak(this.statusText)
			},
			endPlanVoice(source) {
				if (source === 'mouse' && Date.now() - this.planLastTouchAt < 700) return
				if (!this.planRecording) return
				if (Date.now() - this.planStartedAt < 350) {
					this.cancelPlanVoice()
					this.statusText = '请按住语音填写计划，说完后松开'
					tts.speak(this.statusText)
					return
				}
				// #ifdef H5
				if (this.planSpeechRecognition) {
					try { this.planSpeechRecognition.stop() } catch (e) {}
					this.planVoiceTimer = setTimeout(() => {
						if (!this.planSpeechHandled) this.handlePlanSpeech('')
					}, 900)
					return
				}
				// #endif
				this.planRecording = false
			},
			cancelPlanVoice() {
				this.clearPlanVoice()
			},
			// #ifdef H5
			startH5PlanSpeech() {
				try {
					const recognition = createSpeechRecognition({
						onResult: (text) => this.handlePlanSpeech(text),
						onError: () => this.handlePlanSpeech(''),
						onEnd: () => {
							this.planRecording = false
							this.planSpeechRecognition = null
						}
					})
					if (!recognition) return false
					this.planSpeechRecognition = recognition
					recognition.start()
					return true
				} catch (e) {
					console.error('calendar plan speech error', e)
					this.planSpeechRecognition = null
					return false
				}
			},
			// #endif
			// #ifndef H5
			startH5PlanSpeech() { return false },
			// #endif
			handlePlanSpeech(text) {
				if (this.planVoiceTimer) { clearTimeout(this.planVoiceTimer); this.planVoiceTimer = null }
				this.planSpeechHandled = true
				this.planRecording = false
				this.planSpeechRecognition = null
				const spoken = (text || '').trim()
				if (!spoken) {
					haptic.failure()
					this.statusText = '没听清，请再按住语音填写计划说一次'
					tts.speak(this.statusText)
					return
				}
				this.statusText = '语音填写听到：' + spoken
				this.applyPlanVoiceCommand(spoken)
			},
			applyPlanVoiceCommand(spoken) {
				if (!this.editing) {
					this.startAdd()
					return
				}
				const text = String(spoken || '').trim()
				if (!text) return
				if (/保存|确定|完成|好了|提交/.test(text)) {
					this.savePlan()
					return
				}
				if (/取消|不要|退出|关闭/.test(text)) {
					this.cancelEdit()
					return
				}

				const changes = []
				const medicineIndex = this.matchMedicineIndex(text)
				if (medicineIndex >= 0) {
					this.selectedMedicineIndex = medicineIndex
					changes.push('药品 ' + this.currentMedicineName)
				}

				const time = this.parseVoiceTime(text)
				if (time) {
					this.form.hour = time.hour
					this.form.minute = time.minute
					changes.push('每天时间 ' + this.timeText)
				}

				const startDate = this.parseVoiceDate(text, 'start')
				if (startDate) {
					this.form.startDate = startDate
					changes.push('开始吃 ' + startDate)
				}

				const expiryDate = this.parseVoiceDate(text, 'expiry')
				if (expiryDate) {
					this.form.expiryDate = expiryDate
					changes.push('过期日期 ' + expiryDate)
				}

				if (changes.length) {
					haptic.success()
					this.statusText = '已设置：' + changes.join('，') + '。需要保存时请说保存。'
					tts.speak(this.statusText)
					return
				}

				haptic.failure()
				this.statusText = '没有听出要设置哪一项。可以说：药品布洛芬，时间早上八点，开始今天，过期下个月十号，或者保存。'
				tts.speak(this.statusText)
			},
			matchMedicineIndex(text) {
				const spoken = this.normalizeVoiceText(text)
				if (!spoken) return -1
				let bestIndex = -1
				let bestScore = 0
				this.medicines.forEach((m, index) => {
					const name = this.normalizeVoiceText(m.name)
					if (!name) return
					if (spoken.indexOf(name) >= 0 || name.indexOf(spoken) >= 0) {
						bestIndex = index
						bestScore = 999
						return
					}
					let score = 0
					for (const ch of name) {
						if (spoken.indexOf(ch) >= 0) score++
					}
					if (score > bestScore) {
						bestScore = score
						bestIndex = index
					}
				})
				return bestScore >= 2 ? bestIndex : -1
			},
			normalizeVoiceText(text) {
				return String(text || '').toLowerCase().replace(/[，。！？、,.!?；;：:\s]/g, '').replace(/药品|药名|选择|换成|设置|服用|吃/g, '')
			},
			parseVoiceTime(text) {
				const raw = String(text || '')
				const normalized = this.replaceChineseNumbers(raw)
				let match = normalized.match(/(\d{1,2})[:：](\d{1,2})/)
				if (!match) match = normalized.match(/(\d{1,2})(?:点|时)(半|(\d{1,2})分?)?/)
				if (!match) return null

				let hour = parseInt(match[1], 10)
				let minute = 0
				if (match[2] === '半') minute = 30
				else if (match[3]) minute = parseInt(match[3], 10)
				else if (match[2] && /^\d+$/.test(match[2])) minute = parseInt(match[2], 10)

				if (/下午|晚上|傍晚|中午/.test(raw) && hour < 12) hour += 12
				if (/凌晨|早上|上午/.test(raw) && hour === 12) hour = 0
				if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
				return { hour, minute }
			},
			parseVoiceDate(text, kind) {
				const raw = String(text || '')
				const isStart = kind === 'start'
				const hasStartWord = /开始|从|今天开始|明天开始/.test(raw)
				const hasExpiryWord = /过期|到期|有效期|截止|结束/.test(raw)
				if (isStart && hasExpiryWord && !hasStartWord) return null
				if (!isStart && hasStartWord && !hasExpiryWord) return null
				if (isStart && !hasStartWord && hasExpiryWord) return null
				if (!isStart && !hasExpiryWord) return null

				const base = new Date()
				const scopedRaw = this.dateScopeText(raw, kind)
				const normalized = this.replaceChineseNumbers(scopedRaw)
				let date = null
				if (/今天/.test(scopedRaw)) date = base
				else if (/明天/.test(scopedRaw)) date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1)
				else if (/后天/.test(scopedRaw)) date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 2)

				let match = normalized.match(/下个月(\d{1,2})(?:号|日)?/)
				if (!date && match) date = new Date(base.getFullYear(), base.getMonth() + 1, parseInt(match[1], 10))

				match = normalized.match(/(\d{1,2})月(\d{1,2})(?:号|日)?/)
				if (!date && match) date = new Date(base.getFullYear(), parseInt(match[1], 10) - 1, parseInt(match[2], 10))

				match = normalized.match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})(?:号|日)?/)
				if (!date && match) date = new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10))

				if (!date || Number.isNaN(date.getTime())) return null
				return this.formatDate(date)
			},
			dateScopeText(text, kind) {
				const raw = String(text || '')
				if (kind === 'expiry') {
					const match = raw.match(/(?:过期|到期|有效期|截止|结束)(.*)$/)
					return match ? match[1] : raw
				}
				const match = raw.match(/(?:开始|从)(.*?)(?:过期|到期|有效期|截止|结束|$)/)
				return match ? match[1] : raw
			},
			replaceChineseNumbers(text) {
				return String(text || '').replace(/[零〇一二两三四五六七八九十]{1,3}/g, (part) => {
					const value = this.chineseNumberToInt(part)
					return value === null ? part : String(value)
				})
			},
			chineseNumberToInt(text) {
				const map = { 零: 0, '〇': 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
				if (/^\d+$/.test(text)) return parseInt(text, 10)
				if (text === '十') return 10
				const tenIndex = text.indexOf('十')
				if (tenIndex >= 0) {
					const left = text.slice(0, tenIndex)
					const right = text.slice(tenIndex + 1)
					const tens = left ? map[left] : 1
					const ones = right ? map[right] : 0
					if (typeof tens !== 'number' || typeof ones !== 'number') return null
					return tens * 10 + ones
				}
				if (text.length === 1 && typeof map[text] === 'number') return map[text]
				return null
			},
			onMedicineChange(e) {
				this.selectedMedicineIndex = parseInt(e.detail.value, 10) || 0
				tts.speak('已选择 ' + this.currentMedicineName)
			},
			onStartDateChange(e) {
				this.form.startDate = e.detail.value
				tts.speak('开始吃的日期，' + this.form.startDate)
			},
			onTimeChange(e) {
				const parts = e.detail.value.split(':')
				this.form.hour = parseInt(parts[0], 10)
				this.form.minute = parseInt(parts[1], 10)
				tts.speak('每天服药时间，' + this.timeText)
			},
			onExpiryDateChange(e) {
				this.form.expiryDate = e.detail.value
				tts.speak('过期日期，' + this.form.expiryDate)
			},
			savePlan() {
				const medicine = this.currentMedicine
				if (!medicine) return
				const expiry = new Date(this.form.expiryDate)
				expiry.setHours(23, 59, 59, 999)
				const updatedMedicine = updateMedicine({ id: medicine.id, expiryDate: expiry.getTime() }) || medicine
				let schedule = null
				const payload = {
					medicineId: medicine.id,
					hour: this.form.hour,
					minute: this.form.minute,
					quantity: 1,
					timing: '',
					enabled: true,
					startDate: this.form.startDate,
					endDate: this.form.expiryDate
				}
				if (this.editingScheduleId) {
					schedule = updateSchedule(Object.assign({ id: this.editingScheduleId }, payload))
				} else {
					schedule = insertSchedule(payload)
				}
				this.editing = false
				this.refresh()
				if (schedule) scheduleDaily(updatedMedicine, schedule)
				haptic.success()
				this.statusText = '已保存 ' + medicine.name + ' 的服药计划。从 ' + this.form.startDate + ' 开始，每天 ' + this.timeText + ' 服用，过期日期 ' + this.form.expiryDate
				tts.speak(this.statusText)
			},
			cancelEdit() {
				this.editing = false
				this.statusText = '已取消编辑服药计划'
				tts.speak(this.statusText)
			},
			deletePlan() {
				if (!this.editingScheduleId) return
				deleteSchedule(this.editingScheduleId)
				this.editing = false
				this.refresh()
				haptic.success()
				this.statusText = '已删除这个服药计划'
				tts.speak(this.statusText)
			},
			handleVoiceIntent(payload) {
				const spoken = payload && payload.spoken ? payload.spoken : ''
				if (this.editing) {
					this.applyPlanVoiceCommand(spoken)
					return
				}
				if (this.isAddPlanCommand(spoken)) {
					this.startAdd()
					return
				}
				if (/保存|确定|完成/.test(spoken) && this.editing) {
					this.savePlan()
					return
				}
				if (/取消|不要/.test(spoken) && this.editing) {
					this.cancelEdit()
				}
			},
			isAddPlanCommand(text) {
				return /添加|新增|设置|建立/.test(text) && /计划|提醒|吃药|服药/.test(text)
			}
		}
	}
</script>

<style>
	.calendar-page {
		background-color: #ffffff;
		color: #000000;
		box-sizing: border-box;
		padding: 20px 18px 0;
	}
	.calendar-header {
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
		font-size: 32px;
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
	.month-actions {
		display: flex;
		flex-direction: row;
		margin-top: 12px;
	}
	.month-button {
		flex: 1;
		min-height: 58px;
		margin: 0;
		padding: 0;
		border: 2px solid #000000;
		border-radius: 0;
		background-color: #ffffff;
		color: #000000;
		font-size: 18px;
		font-weight: 800;
	}
	.month-button + .month-button {
		margin-left: 8px;
	}
	.month-button-dark {
		background-color: #000000;
		color: #ffffff;
	}
	button::after {
		border: 0;
	}
	.calendar-grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 4px;
		margin-top: 12px;
	}
	.weekday {
		min-height: 30px;
		text-align: center;
		font-size: 15px;
		font-weight: 900;
		color: #555555;
	}
	.day-cell {
		min-height: 62px;
		margin: 0;
		padding: 6px 2px;
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
	.day-cell.is-muted {
		border-color: #999999;
		color: #777777;
	}
	.day-cell.has-dose {
		background-color: #000000;
		color: #ffffff;
	}
	.day-cell.is-selected {
		outline: 4px solid #000000;
		outline-offset: 2px;
	}
	.day-number {
		font-size: 20px;
		line-height: 1;
		font-weight: 900;
		color: inherit;
	}
	.day-count {
		margin-top: 6px;
		font-size: 12px;
		line-height: 1;
		font-weight: 800;
		color: inherit;
	}
	.selected-panel,
	.editor {
		margin-top: 14px;
		padding: 16px;
		border: 2px solid #000000;
		background-color: #ffffff;
		box-sizing: border-box;
	}
	.panel-head {
		display: flex;
		flex-direction: row;
		align-items: center;
		border-bottom: 2px solid #000000;
		padding-bottom: 12px;
	}
	.panel-title {
		flex: 1;
		font-size: 24px;
		font-weight: 900;
		color: #000000;
	}
	.panel-count {
		font-size: 17px;
		font-weight: 800;
		color: #555555;
	}
	.empty-day {
		padding: 22px 0 8px;
	}
	.empty-text {
		font-size: 20px;
		line-height: 1.4;
		font-weight: 700;
		color: #444444;
	}
	.dose-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		padding: 14px 0;
		border-bottom: 2px solid #000000;
	}
	.dose-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.dose-time {
		font-size: 28px;
		line-height: 1;
		font-weight: 900;
		color: #000000;
	}
	.dose-name {
		margin-top: 8px;
		font-size: 22px;
		line-height: 1.25;
		font-weight: 800;
		color: #000000;
	}
	.dose-meta {
		margin-top: 6px;
		font-size: 16px;
		line-height: 1.35;
		font-weight: 600;
		color: #444444;
	}
	.dose-edit {
		width: 66px;
		min-height: 48px;
		margin: 0 0 0 12px;
		padding: 0;
		border: 2px solid #000000;
		border-radius: 0;
		background-color: #000000;
		color: #ffffff;
		font-size: 17px;
		font-weight: 900;
	}
	.add-button {
		width: 100%;
		min-height: 76px;
		margin: 14px 0 0;
		padding: 0 18px;
		border: 2px solid #000000;
		border-radius: 0;
		background-color: #000000;
		color: #ffffff;
		font-size: 23px;
		font-weight: 900;
	}
	.editor-title {
		display: block;
		font-size: 24px;
		line-height: 1.2;
		font-weight: 900;
		color: #000000;
		margin-bottom: 12px;
	}
	.plan-voice-button {
		width: 100%;
		min-height: 74px;
		margin: 0 0 12px;
		padding: 0 14px;
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
	.plan-voice-button.is-recording {
		background-color: #ffffff;
		color: #000000;
	}
	.plan-voice-title {
		font-size: 22px;
		line-height: 1.15;
		font-weight: 900;
		color: inherit;
	}
	.plan-voice-sub {
		margin-top: 6px;
		font-size: 15px;
		line-height: 1.25;
		font-weight: 700;
		color: inherit;
		opacity: 0.86;
	}
	.pick-row {
		min-height: 68px;
		padding: 12px 0;
		border-top: 2px solid #000000;
		display: flex;
		flex-direction: row;
		align-items: center;
	}
	.pick-label {
		width: 92px;
		font-size: 18px;
		font-weight: 800;
		color: #555555;
	}
	.pick-value {
		flex: 1;
		text-align: right;
		font-size: 20px;
		line-height: 1.3;
		font-weight: 900;
		color: #000000;
	}
	.editor-actions {
		display: flex;
		flex-direction: row;
		margin-top: 14px;
	}
	.editor-button {
		flex: 1;
		min-height: 64px;
		margin: 0;
		padding: 0;
		border: 2px solid #000000;
		border-radius: 0;
		background-color: #ffffff;
		color: #000000;
		font-size: 20px;
		font-weight: 900;
	}
	.editor-button + .editor-button {
		margin-left: 10px;
	}
	.editor-button-dark {
		background-color: #000000;
		color: #ffffff;
	}
	.delete-button {
		width: 100%;
		min-height: 62px;
		margin: 12px 0 0;
		padding: 0 16px;
		border: 2px solid #000000;
		border-radius: 0;
		background-color: #ffffff;
		color: #000000;
		font-size: 20px;
		font-weight: 900;
	}
</style>
