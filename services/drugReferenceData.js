/**
 * 内置参考药品库数据。
 *
 * 以 JS 模块导出（而非放在 static/ 下用 require 读），
 * 保证各端打包后都能可靠取到。生产环境可替换为联网数据源。
 */
export default [
	{
		name: '布洛芬缓释胶囊',
		aliases: ['布洛芬', '芬必得'],
		barcode: '0000000000001',
		dosage: '每日两次，每次一粒，饭后服用',
		precautions: '服药期间禁止饮酒，胃溃疡患者慎用',
		ingredients: '布洛芬 0.3克每粒'
	},
	{
		name: '阿莫西林胶囊',
		aliases: ['阿莫西林'],
		barcode: '6901234500011',
		dosage: '每日三次，每次两粒，饭前服用',
		precautions: '青霉素过敏者禁用，需按疗程服完',
		ingredients: '阿莫西林 0.25克每粒'
	},
	{
		name: '氯雷他定片',
		aliases: ['氯雷他定', '开瑞坦'],
		barcode: '6901234500028',
		dosage: '每日一次，每次一片',
		precautions: '服药后可能嗜睡，避免驾车',
		ingredients: '氯雷他定 10毫克每片'
	},
	{
		name: '二甲双胍片',
		aliases: ['二甲双胍'],
		barcode: '6901234500035',
		dosage: '每日两次，每次一片，随餐服用',
		precautions: '肾功能不全者禁用，定期复查',
		ingredients: '盐酸二甲双胍 0.5克每片'
	},
	{
		name: '维生素C片',
		aliases: ['维C', '维生素C'],
		barcode: '6901234500042',
		dosage: '每日一次，每次一片，饭后服用',
		precautions: '不宜长期大剂量服用',
		ingredients: '维生素C 100毫克每片'
	},
	{
		name: '左氧氟沙星滴眼液',
		aliases: ['左氧氟沙星', '可乐必妥', '滴眼液'],
		barcode: '',
		dosage: '遵医嘱滴眼使用',
		precautions: '眼部感染用药需遵医嘱，若疼痛或视力下降应及时就医',
		ingredients: '左氧氟沙星'
	},
	{
		name: '玻璃酸钠滴眼液',
		aliases: ['玻璃酸钠', '人工泪液', '海露'],
		barcode: '',
		dosage: '遵医嘱或说明书滴眼使用',
		precautions: '若眼痛、红肿或视力下降，请及时就医',
		ingredients: '玻璃酸钠'
	},
	{
		name: '妥布霉素地塞米松滴眼液',
		aliases: ['妥布霉素地塞米松', '典必殊'],
		barcode: '',
		dosage: '遵医嘱滴眼使用',
		precautions: '含激素成分，不应自行长期使用',
		ingredients: '妥布霉素、地塞米松'
	},
	{
		name: '对乙酰氨基酚片',
		aliases: ['对乙酰氨基酚', '扑热息痛', '泰诺'],
		barcode: '',
		dosage: '按说明书或医嘱服用',
		precautions: '肝功能异常者慎用，避免与其他含对乙酰氨基酚药物重复服用',
		ingredients: '对乙酰氨基酚'
	},
	{
		name: '蒙脱石散',
		aliases: ['蒙脱石', '思密达'],
		barcode: '',
		dosage: '按说明书或医嘱服用',
		precautions: '与其他药物同服需间隔时间',
		ingredients: '蒙脱石'
	},
	{
		name: '奥美拉唑肠溶胶囊',
		aliases: ['奥美拉唑', '洛赛克'],
		barcode: '',
		dosage: '按说明书或医嘱服用',
		precautions: '长期胃部不适应就医明确原因',
		ingredients: '奥美拉唑'
	},
	{
		name: '盐酸左氧氟沙星片',
		aliases: ['左氧氟沙星片', '左氧氟沙星', '可乐必妥片'],
		barcode: '',
		dosage: '按说明书或医嘱服用',
		precautions: '喹诺酮类药物需遵医嘱使用，孕妇和儿童慎用',
		ingredients: '盐酸左氧氟沙星'
	},
	{
		name: '罗红霉素胶囊',
		aliases: ['罗红霉素'],
		barcode: '',
		dosage: '按说明书或医嘱服用',
		precautions: '肝功能异常者慎用',
		ingredients: '罗红霉素'
	},
	{
		name: '头孢克肟胶囊',
		aliases: ['头孢克肟', '世福素'],
		barcode: '',
		dosage: '按说明书或医嘱服用',
		precautions: '头孢过敏者禁用，服药期间避免饮酒',
		ingredients: '头孢克肟'
	},
	{
		name: '头孢拉定胶囊',
		aliases: ['头孢拉定'],
		barcode: '',
		dosage: '按说明书或医嘱服用',
		precautions: '头孢过敏者禁用，服药期间避免饮酒',
		ingredients: '头孢拉定'
	},
	{
		name: '盐酸西替利嗪片',
		aliases: ['西替利嗪', '仙特明'],
		barcode: '',
		dosage: '按说明书或医嘱服用',
		precautions: '服药后可能嗜睡，避免驾车',
		ingredients: '盐酸西替利嗪'
	},
	{
		name: '马来酸氯苯那敏片',
		aliases: ['氯苯那敏', '扑尔敏'],
		barcode: '',
		dosage: '按说明书或医嘱服用',
		precautions: '服药后可能嗜睡，避免驾车',
		ingredients: '马来酸氯苯那敏'
	},
	{
		name: '复方氨酚烷胺胶囊',
		aliases: ['氨酚烷胺', '感康', '快克'],
		barcode: '',
		dosage: '按说明书或医嘱服用',
		precautions: '避免与其他含对乙酰氨基酚的感冒药重复服用',
		ingredients: '对乙酰氨基酚、金刚烷胺等'
	},
	{
		name: '板蓝根颗粒',
		aliases: ['板蓝根'],
		barcode: '',
		dosage: '按说明书或医嘱服用',
		precautions: '糖尿病患者注意含糖制剂',
		ingredients: '板蓝根'
	},
	{
		name: '连花清瘟胶囊',
		aliases: ['连花清瘟', '莲花清瘟'],
		barcode: '',
		dosage: '按说明书或医嘱服用',
		precautions: '脾胃虚寒者慎用',
		ingredients: '连翘、金银花等'
	},
	{
		name: '藿香正气水',
		aliases: ['藿香正气', '霍香正气水'],
		barcode: '',
		dosage: '按说明书或医嘱服用',
		precautions: '部分制剂含酒精，服用后避免驾驶',
		ingredients: '广藿香油、紫苏叶油等'
	},
	{
		name: '开塞露',
		aliases: ['开塞露甘油'],
		barcode: '',
		dosage: '外用，按说明书或医嘱使用',
		precautions: '仅供外用，不可口服',
		ingredients: '甘油'
	},
	{
		name: '红霉素眼膏',
		aliases: ['红霉素眼药膏', '红霉素眼膏'],
		barcode: '',
		dosage: '遵医嘱或说明书涂眼使用',
		precautions: '眼部感染用药需遵医嘱',
		ingredients: '红霉素'
	},
	{
		name: '妥布霉素滴眼液',
		aliases: ['妥布霉素', '托百士'],
		barcode: '',
		dosage: '遵医嘱滴眼使用',
		precautions: '抗生素滴眼液需遵医嘱使用',
		ingredients: '妥布霉素'
	},
	{
		name: '七叶洋地黄双苷滴眼液',
		aliases: ['七叶洋地黄双苷', '施图伦'],
		barcode: '',
		dosage: '遵医嘱滴眼使用',
		precautions: '眼部不适持续应及时就医',
		ingredients: '七叶亭苷、洋地黄苷'
	},
	{
		name: '普拉洛芬滴眼液',
		aliases: ['普拉洛芬'],
		barcode: '',
		dosage: '遵医嘱滴眼使用',
		precautions: '眼部炎症用药需遵医嘱',
		ingredients: '普拉洛芬'
	},
	{
		name: '醋酸泼尼松龙滴眼液',
		aliases: ['泼尼松龙滴眼液', '百力特'],
		barcode: '',
		dosage: '遵医嘱滴眼使用',
		precautions: '激素类滴眼液不可自行长期使用',
		ingredients: '醋酸泼尼松龙'
	},
	{
		name: '氟米龙滴眼液',
		aliases: ['氟米龙', '氟美童'],
		barcode: '',
		dosage: '遵医嘱滴眼使用',
		precautions: '激素类滴眼液不可自行长期使用',
		ingredients: '氟米龙'
	},
	{
		name: '盐酸奥洛他定滴眼液',
		aliases: ['奥洛他定', '帕坦洛'],
		barcode: '',
		dosage: '遵医嘱滴眼使用',
		precautions: '过敏性结膜炎用药需遵医嘱',
		ingredients: '盐酸奥洛他定'
	},
	{
		name: '拉坦前列素滴眼液',
		aliases: ['拉坦前列素', '适利达'],
		barcode: '',
		dosage: '遵医嘱滴眼使用',
		precautions: '青光眼用药必须遵医嘱，不可自行停药',
		ingredients: '拉坦前列素'
	},
	{
		name: '马来酸噻吗洛尔滴眼液',
		aliases: ['噻吗洛尔', '马来酸噻吗洛尔'],
		barcode: '',
		dosage: '遵医嘱滴眼使用',
		precautions: '心肺疾病患者需咨询医生',
		ingredients: '马来酸噻吗洛尔'
	}
]
