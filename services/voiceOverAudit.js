/**
 * 本文件只提供 H5/Mac VoiceOver 审计规则说明，不参与运行时导入。
 * 运行时增强在 appNarrator.js 内完成：
 * - 按钮、输入框、role=button 必须有 aria-label 或可见文本。
 * - 说明文字会被补 role=text、tabindex=0、aria-label。
 * - role=button 会支持 Enter/Space 键触发，便于 Mac VoiceOver 键盘操作。
 */

export const VOICE_OVER_TARGETS = [
	'button',
	'input',
	'textarea',
	'select',
	'[role="button"]',
	'[role="alert"]',
	'.copy',
	'.sub',
	'.hint',
	'.status',
	'.title',
	'.label',
	'.value'
]
