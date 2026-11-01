<script>
	import { initDatabase, seedSampleIfEmpty } from './services/storage.js'
	import { loadSettings } from './services/settings.js'
	import { loadDrugReference } from './services/drugReference.js'
	import { initNfcListener } from './services/nfc.js'
	import { initReminderListener } from './services/notification.js'
	import { initKeySound } from './services/keySound.js'
	import { initAppNarrator } from './services/appNarrator.js'

	export default {
		onLaunch: async function() {
			console.log('App Launch')
			try {
				// 初始化本地数据库（uni.storage 封装）
				initDatabase()
				// 载入用户偏好（语速/提醒方式/NFC 开关）
				loadSettings()
				// 载入内置参考药品库
				await loadDrugReference()
				// 首次启动写入示例药品
				seedSampleIfEmpty()
				// 全局按钮/按键即时声音反馈
				initKeySound()
				// App 启动后默认开启自动旁白，页面显示时自动朗读页面内容
				initAppNarrator()
				// App 端注册 NFC 后台监听（碰触贴纸唤起播报）
				// #ifdef APP-PLUS
				initNfcListener()
				// 注册服药提醒的点击/接收监听（“已服用”确认、前台播报）
				initReminderListener()
				// #endif
			} catch (e) {
				console.error('App 初始化失败', e)
			}
		},
		onShow: function() {
			console.log('App Show')
		},
		onHide: function() {
			console.log('App Hide')
		}
	}
</script>

<style>
	/* 全局公共样式：高对比、大字号，服务视障/低视力用户 */
	page {
		background-color: #ffffff;
		color: #000000;
		font-size: 18px;
	}

	.page-container {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	/* 无障碍大按钮 */
	.a11y-btn {
		width: 100%;
		min-height: 76px;
		line-height: 1.3;
		border-radius: 0;
		font-size: 22px;
		font-weight: 600;
		margin: 8px 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 20px;
		box-sizing: border-box;
	}

	button.a11y-btn::after {
		border: 0;
	}

	button.a11y-btn[disabled] {
		opacity: 0.72;
	}

	.a11y-btn-primary {
		background-color: #000000;
		color: #ffffff;
		border: 0;
	}

	.a11y-btn-secondary {
		background-color: #ffffff;
		color: #000000;
		border: 2px solid #000000;
	}

	.status-text {
		font-size: 26px;
		font-weight: bold;
		text-align: center;
		padding: 16px;
	}
</style>
