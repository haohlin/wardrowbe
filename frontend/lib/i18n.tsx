'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Language = 'en' | 'zh';

type TranslationKey =
  | 'language.english'
  | 'language.chinese'
  | 'language.toggleLabel'
  | 'nav.dashboard'
  | 'nav.wardrobe'
  | 'nav.suggestOutfit'
  | 'nav.suggest'
  | 'nav.outfits'
  | 'nav.pairings'
  | 'nav.history'
  | 'nav.familyFeed'
  | 'nav.analytics'
  | 'nav.aiLearning'
  | 'nav.family'
  | 'nav.notifications'
  | 'nav.settings'
  | 'nav.home'
  | 'settings.title'
  | 'settings.description'
  | 'settings.language.title'
  | 'settings.language.description'
  | 'settings.language.current'
  | 'settings.ai.title'
  | 'settings.ai.description'
  | 'settings.ai.defaultConfigured'
  | 'settings.ai.defaultDetails'
  | 'settings.ai.noCustomEndpoints'
  | 'settings.ai.customEndpointHint'
  | 'settings.ai.addEndpoint'
  | 'settings.ai.save'
  | 'settings.ai.active'
  | 'settings.ai.disabled'
  | 'settings.ai.connected'
  | 'settings.ai.error'
  | 'settings.ai.testConnection'
  | 'settings.ai.name'
  | 'settings.ai.url'
  | 'settings.ai.visionModel'
  | 'settings.ai.textModel'
  | 'settings.ai.modelsAvailable'
  | 'settings.ai.vision'
  | 'settings.ai.text'
  | 'common.openSidebar'
  | 'common.toggleTheme'
  | 'common.signOut'
  | 'occasion.date'

const translations: Record<Language, Record<TranslationKey, string>> = {
  en: {
    'language.english': 'English',
    'language.chinese': '中文',
    'language.toggleLabel': 'Switch language',
    'nav.dashboard': 'Dashboard',
    'nav.wardrobe': 'Wardrobe',
    'nav.suggestOutfit': 'Suggest Outfit',
    'nav.suggest': 'Suggest',
    'nav.outfits': 'Outfits',
    'nav.pairings': 'Pairings',
    'nav.history': 'History',
    'nav.familyFeed': 'Family Feed',
    'nav.analytics': 'Analytics',
    'nav.aiLearning': 'AI Learning',
    'nav.family': 'Family',
    'nav.notifications': 'Notifications',
    'nav.settings': 'Settings',
    'nav.home': 'Home',
    'settings.title': 'Settings',
    'settings.description': 'Manage your preferences and account settings',
    'settings.language.title': 'Language',
    'settings.language.description': 'Switch the app interface between English and Chinese.',
    'settings.language.current': 'Interface Language',
    'settings.ai.title': 'AI Endpoints',
    'settings.ai.description': 'Configure AI endpoints for image analysis. Endpoints are tried in order from top to bottom.',
    'settings.ai.defaultConfigured': 'Server default is already configured for NVIDIA Inference Hub GPT-5.5.',
    'settings.ai.defaultDetails': 'Base URL: https://inference-api.nvidia.com/v1 · Vision/Text model: openai/openai/gpt-5.5 · API key is stored only in the backend .env file.',
    'settings.ai.noCustomEndpoints': 'No custom endpoints configured. Using the secure server default above.',
    'settings.ai.customEndpointHint': 'Only add a custom endpoint if you want to override the server default for this user.',
    'settings.ai.addEndpoint': 'Add Endpoint',
    'settings.ai.save': 'Save',
    'settings.ai.active': 'Active',
    'settings.ai.disabled': 'Disabled',
    'settings.ai.connected': 'Connected',
    'settings.ai.error': 'Error',
    'settings.ai.testConnection': 'Test Connection',
    'settings.ai.name': 'Name',
    'settings.ai.url': 'URL',
    'settings.ai.visionModel': 'Vision Model',
    'settings.ai.textModel': 'Text Model',
    'settings.ai.modelsAvailable': 'models available',
    'settings.ai.vision': 'Vision',
    'settings.ai.text': 'Text',
    'common.openSidebar': 'Open sidebar',
    'common.toggleTheme': 'Toggle theme',
    'common.signOut': 'Sign out',
    'occasion.date': 'Date',
  },
  zh: {
    'language.english': 'English',
    'language.chinese': '中文',
    'language.toggleLabel': '切换语言',
    'nav.dashboard': '仪表盘',
    'nav.wardrobe': '衣橱',
    'nav.suggestOutfit': '穿搭推荐',
    'nav.suggest': '推荐',
    'nav.outfits': '套装',
    'nav.pairings': '搭配',
    'nav.history': '历史',
    'nav.familyFeed': '家人动态',
    'nav.analytics': '分析',
    'nav.aiLearning': 'AI 学习',
    'nav.family': '家庭',
    'nav.notifications': '通知',
    'nav.settings': '设置',
    'nav.home': '首页',
    'settings.title': '设置',
    'settings.description': '管理你的偏好和账号设置',
    'settings.language.title': '语言',
    'settings.language.description': '在英文和中文界面之间切换。',
    'settings.language.current': '界面语言',
    'settings.ai.title': 'AI 端点',
    'settings.ai.description': '配置用于图片分析的 AI 端点。系统会按从上到下的顺序依次尝试。',
    'settings.ai.defaultConfigured': '服务器默认已配置为 NVIDIA Inference Hub GPT-5.5。',
    'settings.ai.defaultDetails': 'Base URL：https://inference-api.nvidia.com/v1 · 视觉/文本模型：openai/openai/gpt-5.5 · API Key 只保存在后端 .env 文件中。',
    'settings.ai.noCustomEndpoints': '未配置自定义端点。当前使用上方安全的服务器默认配置。',
    'settings.ai.customEndpointHint': '只有当你想为当前用户覆盖服务器默认配置时，才需要添加自定义端点。',
    'settings.ai.addEndpoint': '添加端点',
    'settings.ai.save': '保存',
    'settings.ai.active': '启用',
    'settings.ai.disabled': '停用',
    'settings.ai.connected': '已连接',
    'settings.ai.error': '错误',
    'settings.ai.testConnection': '测试连接',
    'settings.ai.name': '名称',
    'settings.ai.url': 'URL',
    'settings.ai.visionModel': '视觉模型',
    'settings.ai.textModel': '文本模型',
    'settings.ai.modelsAvailable': '个模型可用',
    'settings.ai.vision': '视觉',
    'settings.ai.text': '文本',
    'common.openSidebar': '打开侧边栏',
    'common.toggleTheme': '切换主题',
    'common.signOut': '退出登录',
    'occasion.date': '约会',
  },
};


type VisibleTextDictionary = Record<string, string>;

export const visibleTextTranslations: Record<Language, VisibleTextDictionary> = {
  en: {},
  zh: {
    // Global actions and states
    'Save': '保存',
    'Cancel': '取消',
    'Delete': '删除',
    'Edit': '编辑',
    'Close': '关闭',
    'Retry': '重试',
    'Dismiss': '关闭提示',
    'Discard': '放弃',
    'Keep editing': '继续编辑',
    'Discard changes': '放弃更改',
    'Loading...': '加载中...',
    'Loading more...': '加载更多...',
    'Search': '搜索',
    'Reset': '重置',
    'Clear': '清除',
    'Apply': '应用',
    'View all': '查看全部',
    'Yes': '是',
    'No': '否',
    'Required': '必填',
    'Optional': '可选',
    'Name': '名称',
    'Brand': '品牌',
    'Color': '颜色',
    'Type': '类型',
    'Notes': '备注',
    'Date': '日期',
    'Status': '状态',
    'Actions': '操作',
    'Active': '启用',
    'Disabled': '停用',
    'Connected': '已连接',
    'Error': '错误',
    'Member': '成员',
    'Admin': '管理员',
    'Account': '账号',
    'Email': '邮箱',
    'Body': '身体数据',
    'Gender Identity': '性别身份',
    'Gender': '性别',
    'Select gender': '选择性别',
    'Not specified': '未指定',
    'Female': '女性',
    'Male': '男性',
    'Non-binary': '非二元',
    'Prefer not to say': '不想透露',
    'Save Gender': '保存性别',
    'Gender saved': '性别已保存',
    'Failed to save gender': '保存性别失败',
    'Used for fit-aware outfit suggestions and realistic model try-on images.': '用于生成更贴合身形的穿搭建议和更真实的模特试穿图。',
    'This helps the AI choose gender-appropriate styling assumptions and model proportions. You can leave it unspecified.': '这会帮助 AI 选择合适的风格假设和模特比例，也可以不填写。',

    // Navigation / page titles
    'Dashboard': '仪表盘',
    'Wardrobe': '衣橱',
    'Suggest Outfit': '穿搭推荐',
    'Suggest': '推荐',
    'Outfits': '套装',
    'Good morning': '早上好',
    'Good afternoon': '下午好',
    'Good evening': '晚上好',
    "Let's find the perfect outfit for your day": '为你今天挑一套合适的穿搭',
    "What's the occasion?": '今天是什么场合？',
    'How should I suggest?': '想用哪种推荐方式？',
    'Select existing outfit': '选择已有穿搭',
    'Pick from saved/outfit-history looks that fit the current scenario and weather.': '从已保存/历史穿搭中选择符合当前场合和天气的造型。',
    'Generate new outfit with AI': '用 AI 生成新穿搭',
    'Create a fresh wardrobe combination and AI try-on image.': '创建新的衣橱组合，并生成 AI 试穿图。',
    'Preference for this suggestion': '本次推荐偏好',
    'Optional: tell the stylist what you want or want to avoid today.': '可选：告诉造型师今天想要或想避免什么。',
    'Example: clean minimalist, no bulky layering, warmer for tonight': '例如：干净极简、不要臃肿叠穿、今晚更保暖',
    'Finding your best saved look...': '正在寻找最合适的已有穿搭...',
    'Creating your look...': '正在生成你的穿搭...',
    'Creating your AI outfit suggestion and try-on preview...': '正在生成 AI 穿搭建议和试穿预览...',
    'AI is working': 'AI 正在处理',
    'AI task needs attention': 'AI 任务需要处理',
    'AI task finished': 'AI 任务已完成',
    'Dismiss AI task status': '关闭 AI 任务状态',
    'Finding or creating your AI outfit suggestion...': '正在查找或生成你的 AI 穿搭建议...',
    'Finding or creating your look...': '正在查找或生成你的穿搭...',
    'AI Suggestion': 'AI 推荐',
    'Choose from available outfits': '从可用穿搭中选择',
    'I found saved outfit previews that fit this occasion and weather.': '我找到了适合当前场合和天气的已保存穿搭预览。',
    'Available outfit': '可用穿搭',
    'Saved outfit preview': '已保存穿搭预览',
    'Use this outfit': '使用这套穿搭',
    'Your Outfit': '你的穿搭',
    'Start over': '重新开始',
    'Tip:': '提示：',
    'Try Another': '再试一套',
    'Love it': '喜欢',
    'Adjust this suggestion': '调整这套推荐',
    'Tell the stylist what to change, then generate a tweaked version.': '告诉造型师要改哪里，然后生成调整后的版本。',
    'Example: make it cleaner, less bulky, no shell under cardigan': '例如：更干净、别太臃肿、不要把冲锋衣放在开衫里面',
    'Tweak Suggestion': '微调推荐',
    'Pairings': '搭配',
    'History': '历史',
    'Family Feed': '家人动态',
    'Analytics': '分析',
    'AI Learning': 'AI 学习',
    'Family': '家庭',
    'Notifications': '通知',
    'Settings': '设置',
    'Home': '首页',
    'Loading your wardrobe...': '正在加载你的衣橱...',
    'Switch language': '切换语言',
    'Open sidebar': '打开侧边栏',
    'Toggle theme': '切换主题',
    'Sign out': '退出登录',

    // Dashboard
    "Today's Weather": '今日天气',
    'Location not set': '未设置位置',
    'Set Location': '设置位置',
    'Get Outfit Suggestion': '获取穿搭建议',
    'Pending Outfits': '待反馈穿搭',
    'Next Scheduled': '下个日程',
    'No schedules set up': '尚未设置日程',
    'Set Up Schedule': '设置日程',
    'This Week': '本周',
    'Quick Actions': '快捷操作',
    'Add New Item': '添加新单品',
    'Insights': '洞察',
    'Family Outfits': '家人穿搭',
    'Browse Family Outfits': '浏览家人穿搭',
    'Welcome back, Dev': '欢迎回来，Dev',
    'Welcome back,': '欢迎回来，',
    "Here’s what’s happening with your wardrobe": '这是你的衣橱近况',
    "Here's what's happening with your wardrobe": '这是你的衣橱近况',
    'outfits': '穿搭',
    'No channels configured': '尚未配置渠道',
    "You have 5 items you’ve never worn. Consider styling them!": '你有 5 件单品还没穿过，可以考虑搭配一下！',
    "You have 5 items you've never worn. Consider styling them!": '你有 5 件单品还没穿过，可以考虑搭配一下！',
    'See what your family is wearing and rate their outfits': '查看家人的穿搭并进行评价',
    '1 member in 大熊爪之家': '大熊爪之家有 1 位成员',
    'All Caught Up': '已全部处理',
    'No outfits waiting for your response': '没有等待你反馈的穿搭',
    'Outfit accepted': '已接受穿搭',
    'Outfit rejected': '已拒绝穿搭',
    'Failed to accept outfit': '接受穿搭失败',
    'Failed to reject outfit': '拒绝穿搭失败',
    'accepted': '已接受',
    'rejected': '已拒绝',
    'Coming up': '即将到来',
    'Common tasks to get you started': '开始使用的常用任务',
    'Add Channel': '添加渠道',
    'Add Your First Item': '添加第一件单品',
    'Get Your First Suggestion': '获取第一条建议',
    'Tomorrow': '明天',

    // Wardrobe and item dialogs
    'Add Items': '添加单品',
    'Single Upload': '单张上传',
    'Bulk Upload': '批量上传',
    'Upload photos of your clothing items': '上传你的服装照片',
    'Single Item': '单件上传',
    'Add Item': '添加单品',
    'Upload image': '上传图片',
    'Upload images': '上传图片',
    'Choose photo from library': '从相册选择照片',
    'Choose from your library or take a new photo': '从相册选择或拍摄新照片',
    'Add a clothing photo': '添加服装照片',
    'Drop image here': '把图片拖到这里',
    'Drop images here': '把图片拖到这里',
    'Drop the image here...': '把图片拖到这里...',
    'Drop the images here...': '把图片拖到这里...',
    'Drag & drop an image, or tap to select': '拖放一张图片，或点击选择',
    'Drag & drop multiple images, or tap to select': '拖放多张图片，或点击选择',
    'Up to 20 images (JPEG, PNG, WebP, or HEIC)': '最多 20 张图片（JPEG、PNG、WebP 或 HEIC）',
    'Click to upload': '点击上传',
    'JPEG, PNG, WebP, or HEIC': 'JPEG、PNG、WebP 或 HEIC',
    'Item name': '单品名称',
    'Name (optional)': '名称（可选）',
    'Brand name': '品牌名称',
    'Primary color': '主色',
    'Let AI detect...': '让 AI 自动识别...',
    '(AI will detect if empty)': '（留空时由 AI 自动识别）',
    'Any additional notes...': '其他备注...',
    'Additional notes...': '其他备注...',
    'Bulk item details': '批量单品详情',
    'Upload selected images': '上传已选择图片',
    'Ready to upload': '准备上传',
    'Select images to enable upload': '选择图片后即可上传',
    'Fill any fields you know, or leave them empty and let AI detect them.': '填写你知道的字段，或留空让 AI 自动识别。',
    'Clear All': '全部清除',
    'Upload More': '继续上传',
    'Done': '完成',
    'Upload Items': '上传单品',
    'Uploading...': '上传中...',
    'Upload': '上传',
    'Item': '单品',
    'Items': '单品',
    'Discard selected images?': '放弃已选择的图片？',
    'Discard selected images': '放弃已选择的图片',
    'Your selected images and item details will be lost.': '已选择的图片和单品详情将会丢失。',
    'Your wardrobe is empty': '你的衣橱还是空的',
    'Add your first clothing item to start getting personalized outfit suggestions.': '添加第一件服装单品，开始获取个性化穿搭建议。',
    'Add First Item': '添加第一件单品',
    'All types': '所有类型',
    'All item types': '所有单品类型',
    'All colors': '所有颜色',
    'Search wardrobe...': '搜索衣橱...',
    'AI Analyzing...': 'AI 分析中...',
    'Analysis Failed': '分析失败',
    'Needs washing': '需要清洗',
    'AI completeness:': 'AI 完整度：',
    'Re-analyze': '重新分析',
    'Mark washed': '标记已清洗',
    'Marked as washed': '已标记为清洗',
    'Delete this item?': '删除这件单品？',
    'Item deleted': '单品已删除',
    'Failed to delete': '删除失败',
    'Find matching outfits': '查找匹配穿搭',
    'Delete image': '删除图片',
    'Image rotated': '图片已旋转',
    'Background removed': '背景已移除',
    'Failed to rotate image': '旋转图片失败',
    'Failed to remove background': '移除背景失败',
    'Failed to mark as washed': '标记清洗失败',
    'Failed to delete items': '删除单品失败',
    'Failed to queue items for re-analysis': '加入重新分析队列失败',
    'Clear selection': '清除选择',
    'Select all': '全选',
    'Select page': '选择本页',
    'Delete selected': '删除所选',
    'Preview': '预览',

    // Sorts / filters / dropdowns
    'Newest first': '最新优先',
    'Oldest first': '最旧优先',
    'Recently worn': '最近穿过',
    'Least recently worn': '最久未穿',
    'Most worn': '穿着最多',
    'Least worn': '穿着最少',
    'Name A–Z': '名称 A–Z',
    'Name Z–A': '名称 Z–A',
    'All occasions': '所有场合',
    'All status': '所有状态',
    'Accepted': '已接受',
    'Rejected': '已拒绝',
    'Pending': '待处理',
    'Sent': '已发送',
    'Viewed': '已查看',
    'Expired': '已过期',

    // Suggestions / outfits / studio
    'Generate Pairings': '生成搭配',
    'Generate': '生成',
    'Generating...': '生成中...',
    'Condition': '天气情况',
    'Outfit Suggestion': '穿搭建议',
    'Back to outfit': '返回穿搭',
    'Back to outfits': '返回套装',
    'Save to Lookbook': '保存到造型册',
    'Give your lookbook entry a name before saving': '保存前请先给造型册条目命名',
    'AI had no new items to suggest': 'AI 没有新的单品建议',
    'Friday brunch': '周五早午餐',
    'Built around:': '围绕单品：',
    'Go to Wardrobe': '前往衣橱',
    'Get personalized outfit suggestions based on weather and occasion': '根据天气和场合获取个性化穿搭建议',
    'No items in your wardrobe yet. Add items first.': '衣橱里还没有单品。请先添加单品。',
    'My Looks': '我的造型',
    'Replacements': '替换方案',
    'No AI-generated outfits.': '暂无 AI 生成的穿搭。',
    'No pairing outfits generated.': '暂无搭配生成的穿搭。',
    'No replacement outfits.': '暂无替换穿搭。',
    'No saved looks yet. Create one with the Studio editor.': '暂无保存的造型。请用搭配工作室创建一个。',
    'No worn outfits recorded.': '暂无已穿记录。',
    'No outfits yet. Create your first look in the Studio!': '还没有穿搭。去搭配工作室创建第一个造型吧！',
    'Your looks, worn outfits, and AI suggestions': '你的造型、已穿记录和 AI 建议',
    'Search lookbook...': '搜索造型册...',
    'Failed to load outfits': '加载穿搭失败',
    'View toggle': '视图切换',
    'Failed to delete pairing': '删除搭配失败',
    'No other members yet': '还没有其他成员',
    'Pending Invites': '待处理邀请',
    'No recommendation history': '暂无推荐历史',
    'Model wearing the suggested outfit, front and back views': '模特正反面试穿推荐穿搭',
    'AI try-on preview with front and back views based on your saved body measurements.': '基于你保存的身体数据生成的 AI 正反面试穿预览。',
    'Compute Now': '立即计算',
    'Notification channel added': '通知渠道已添加',
    'Recommendation Settings': '推荐设置',

    // Feedback / family ratings
    'How did this outfit work out for you?': '这套穿搭实际效果如何？',
    'Did you wear this outfit?': '你穿了这套吗？',
    "Didn't wear this": '没有穿这套',
    'Comments (optional)': '评论（可选）',
    'Any thoughts about this outfit?': '对这套穿搭有什么想法？',
    'Add a comment (optional)': '添加评论（可选）',
    'Feedback submitted': '反馈已提交',
    'Failed to submit feedback': '提交反馈失败',
    'Failed to submit rating': '提交评分失败',
    'Failed to remove rating': '移除评分失败',
    'Average Rating': '平均评分',
    'Feedback Given': '已提供反馈',
    'Browse and rate your family members&apos; outfits': '浏览并评价家人的穿搭',
    'Browse and rate your family members’ outfits': '浏览并评价家人的穿搭',

    // Analytics / learning
    'Acceptance Rate': '接受率',
    'Outfits Generated': '已生成穿搭',
    'Total Items': '单品总数',
    'Total Wears': '穿着总次数',
    'Most Worn': '最常穿',
    'Never Worn': '从未穿过',
    'Most common colors in your wardrobe': '衣橱中最常见的颜色',
    'No color data yet': '暂无颜色数据',
    'No data yet': '暂无数据',
    'No items yet': '暂无单品',
    'Track your outfits': '记录你的穿搭',
    'Start tracking your outfits!': '开始记录你的穿搭吧！',
    'Time to try these?': '要不要试试这些？',
    'Your favorites': '你的最爱',
    'Your wardrobe insights and statistics': '你的衣橱洞察和统计数据',
    'Acceptance Rate Trend': '接受率趋势',
    'Breakdown by clothing type': '按服装类型拆分',
    "How you've responded to suggestions over time": '你对穿搭建议的反馈趋势',
    'How you&apos;ve responded to suggestions over time': '你对穿搭建议的反馈趋势',
    'All items have been worn!': '所有单品都已经穿过！',
    'Keep tracking!': '继续记录！',
    'Least Worn': '最少穿着',
    'Consider wearing these': '可以考虑穿这些',
    'Avg/month': '月均',
    'Last 6 months': '最近 6 个月',
    'Last worn': '上次穿着',
    'How the AI learns from your feedback': 'AI 如何从你的反馈中学习',
    'How you dress for different conditions': '不同天气下你的穿衣偏好',
    'Colors you tend to accept or reject': '你倾向接受或拒绝的颜色',
    'Item pairs that you consistently love together': '你一直喜欢一起穿的单品组合',
    'Add to favorite colors:': '添加到喜欢的颜色：',
    'Add to colors to avoid:': '添加到避免的颜色：',

    // Notifications
    'Add Notification Channel': '添加通知渠道',
    'Add Schedule': '添加日程',
    'Channel Type': '渠道类型',
    'Access Token': '访问令牌',
    'Email Address *': '邮箱地址 *',
    'Email address is required': '邮箱地址必填',
    'Mattermost': 'Mattermost',
    'Add a channel to start receiving outfit suggestions': '添加渠道以开始接收穿搭建议',
    'Add a schedule to receive daily outfit suggestions': '添加日程以接收每日穿搭建议',
    'Channel deleted': '渠道已删除',
    'Day': '日期',

    // Family
    'Family Setup': '家庭设置',
    'Create Family': '创建家庭',
    'Join Family': '加入家庭',
    'Join an existing family with an invite code': '使用邀请码加入已有家庭',
    'Join a family first': '请先加入一个家庭',
    'Joined family!': '已加入家庭！',
    'Family created!': '家庭已创建！',
    'Family Name': '家庭名称',
    'Family name': '家庭名称',
    'Family name updated!': '家庭名称已更新！',
    'Invite Code': '邀请码',
    'Invite someone by email': '通过邮箱邀请他人',
    'Invitation sent!': '邀请已发送！',
    "Invitations that haven't been accepted yet": '尚未接受的邀请',
    'Invitations that haven&apos;t been accepted yet': '尚未接受的邀请',
    'Invalid invite code': '邀请码无效',
    'Invalid invite code. Please check and try again.': '邀请码无效，请检查后重试。',
    'Leave Family?': '退出家庭？',
    'Members': '成员',
    'Failed to create family. Please try again.': '创建家庭失败，请重试。',
    'Failed to update name. Please try again.': '更新名称失败，请重试。',
    'Failed to send invite. Please try again.': '发送邀请失败，请重试。',
    'Failed to generate new code. Please try again.': '生成新邀请码失败，请重试。',

    // Onboarding / login
    'Backend Configuration Error': '后端配置错误',
    'Location saved!': '位置已保存！',
    'Could not detect location. Please enter manually.': '无法检测位置，请手动输入。',
    'Geolocation is not supported by your browser': '你的浏览器不支持地理定位',
    'City/Location Name': '城市/位置名称',
    'Get personalized outfits': '获取个性化穿搭',
    'Adjust how much you prefer each style': '调整你对每种风格的偏好程度',
    'Item added to your wardrobe!': '单品已添加到衣橱！',
    'Failed to upload item. Please try again.': '上传单品失败，请重试。',
    'Failed to upload items. Please try again.': '上传单品失败，请重试。',
    'Failed to complete setup. Please try again.': '完成设置失败，请重试。',
    'Failed to save preferences. Please try again.': '保存偏好失败，请重试。',
    'Failed to save location. Please try again.': '保存位置失败，请重试。',

    // Settings
    'Manage your preferences and account settings': '管理你的偏好和账号设置',
    'Language': '语言',
    'Interface Language': '界面语言',
    'AI Endpoints': 'AI 端点',
    'Configure AI endpoints for image analysis. Endpoints are tried in order from top to bottom.': '配置用于图片分析的 AI 端点。系统会按从上到下的顺序依次尝试。',
    'Server default is already configured for NVIDIA Inference Hub GPT-5.5.': '服务器默认已配置为 NVIDIA Inference Hub GPT-5.5。',
    'Base URL: https://inference-api.nvidia.com/v1 · Vision/Text model: openai/openai/gpt-5.5 · API key is stored only in the backend .env file.': 'Base URL：https://inference-api.nvidia.com/v1 · 视觉/文本模型：openai/openai/gpt-5.5 · API Key 只保存在后端 .env 文件中。',
    'No custom endpoints configured. Using the secure server default above.': '未配置自定义端点。当前使用上方安全的服务器默认配置。',
    'Only add a custom endpoint if you want to override the server default for this user.': '只有当你想为当前用户覆盖服务器默认配置时，才需要添加自定义端点。',
    'Add Endpoint': '添加端点',
    'Test Connection': '测试连接',
    'URL': 'URL',
    'Vision Model': '视觉模型',
    'Text Model': '文本模型',
    'models available': '个模型可用',
    'Vision': '视觉',
    'Text': '文本',
    'Location and timezone saved': '位置和时区已保存',
    'Location detected': '已检测到位置',
    'Failed to save location': '保存位置失败',
    'Measurements saved': '身体数据已保存',
    'Default Occasion': '默认场合',
    'Temperature Unit': '温度单位',
    'Celsius (°C)': '摄氏度 (°C)',
    'Fahrenheit (°F)': '华氏度 (°F)',
    'Layering Preference': '叠穿偏好',
    'Minimal layers': '少量叠穿',
    'Moderate layers': '适中叠穿',
    'Heavy layers': '厚重叠穿',
    'Avoid Repeat Items Within (days)': '避免重复单品天数',
    'Color Preferences': '颜色偏好',
    'Favorite Colors': '喜欢的颜色',
    'Colors to Avoid': '避免的颜色',
    'I feel cold easily': '我容易觉得冷',
    'I feel warm easily': '我容易觉得热',
    'Low (stick to favorites)': '低（偏向常用搭配）',
    'High (try new combinations)': '高（尝试新组合）',
    'Help AI recommend better-fitting outfits': '帮助 AI 推荐更合身的穿搭',
    'City / Location Name (optional)': '城市/位置名称（可选）',
    'Latitude': '纬度',
    'Longitude': '经度',
    'Latitude must be between -90 and 90': '纬度必须在 -90 到 90 之间',
    'Longitude must be between -180 and 180': '经度必须在 -180 到 180 之间',
    'Shirt Size': '上衣尺码',
    'Pants Size': '裤子尺码',
    'Dress Size': '连衣裙尺码',
    'Shoe Size': '鞋码',

    // Time zones / locations
    'Eastern Time (US)': '美国东部时间',
    'Central Time (US)': '美国中部时间',
    'London (UK)': '伦敦（英国）',
    'Berlin (EU Central)': '柏林（欧洲中部）',
    'Dubai (UAE)': '迪拜（阿联酋）',
    'India (IST)': '印度（IST）',
    'Auckland (NZ)': '奥克兰（新西兰）',

    // Clothing types
    'Shirt': '衬衫',
    'T-Shirt': 'T 恤',
    'Top': '上衣',
    'Polo': 'Polo 衫',
    'Blouse': '女式衬衫',
    'Tank Top': '背心',
    'Sweater': '毛衣',
    'Hoodie': '卫衣',
    'Cardigan': '开衫',
    'Vest': '马甲',
    'Pants': '裤子',
    'Jeans': '牛仔裤',
    'Shorts': '短裤',
    'Skirt': '半身裙',
    'Dress': '连衣裙',
    'Jumpsuit': '连体裤',
    'Jacket': '夹克',
    'Blazer': '西装外套',
    'Coat': '大衣',
    'Suit': '西装',
    'Shoes': '鞋子',
    'Sneakers': '运动鞋',
    'Boots': '靴子',
    'Sandals': '凉鞋',
    'Socks': '袜子',
    'Tie': '领带',
    'Hat': '帽子',
    'Scarf': '围巾',
    'Belt': '腰带',
    'Bag': '包',
    'Accessories': '配饰',

    // Colors
    'Black': '黑色',
    'Charcoal': '炭灰色',
    'Gray': '灰色',
    'White': '白色',
    'Cream': '米白色',
    'Beige': '米色',
    'Tan': '棕褐色',
    'Khaki': '卡其色',
    'Olive': '橄榄绿',
    'Army Green': '军绿色',
    'Green': '绿色',
    'Teal': '蓝绿色',
    'Navy': '海军蓝',
    'Blue': '蓝色',
    'Brown': '棕色',
    'Dark Brown': '深棕色',
    'Burgundy': '酒红色',
    'Red': '红色',
    'Pink': '粉色',
    'Purple': '紫色',
    'Yellow': '黄色',
    'Orange': '橙色',

    // Occasions / styles
    'Casual': '休闲',
    'Office': '办公',
    'Formal': '正式',
    'Sporty': '运动',
    'Outdoor': '户外',
    'minimalist': '极简',
    'bold': '大胆',
    'formal': '正式',
    'casual': '休闲',
    'sporty': '运动',

    // Placeholders and examples
    'e.g., Blue Oxford Shirt': '例如：蓝色牛津衬衫',
    'e.g., J.Crew': '例如：J.Crew',
    'e.g., New York, NY': '例如：上海，中国',
    'e.g., London, UK': '例如：上海，中国',
    'e.g., The Smith Family': '例如：林家',
    'e.g., ABC123XY': '例如：ABC123XY',
    'e.g., Local Ollama': '例如：本地 Ollama',
    'e.g., 51.5074': '例如：31.2304',
    'e.g., -0.1278': '例如：121.4737',
  },
};

const textNodeOriginals = new WeakMap<Text, string>();
const attributeOriginals = new WeakMap<Element, Record<string, string>>();
const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt'] as const;
let isApplyingVisibleTranslations = false;

function normalizeVisibleText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function withOriginalSpacing(original: string, translated: string): string {
  const leading = original.match(/^\s*/)?.[0] ?? '';
  const trailing = original.match(/\s*$/)?.[0] ?? '';
  // React often renders a label prefix and dynamic value as separate text nodes,
  // e.g. "Welcome back, " + user name. Preserving the English trailing space
  // after a Chinese comma produces "欢迎回来， Dev". Drop that separator for
  // Chinese punctuation prefixes; spacing is still preserved for normal labels.
  const normalized = normalizeVisibleText(original);
  const dropTrailingAfterChinesePrefix =
    trailing === ' ' &&
    /[，：、（]$/.test(translated) &&
    !/^\s/.test(original) &&
    normalized !== original;
  return `${leading}${translated}${dropTrailingAfterChinesePrefix ? '' : trailing}`;
}

const zhToEnVisibleTranslations: VisibleTextDictionary = Object.fromEntries(
  Object.entries(visibleTextTranslations.zh)
    .filter(([english]) => !['中文', 'English', 'EN'].includes(english))
    .map(([english, chinese]) => [chinese, english])
);

export function translateVisibleText(value: string, language: Language): string {
  const normalized = normalizeVisibleText(value);
  if (!normalized) return value;

  if (language === 'en') {
    const exactEnglish = zhToEnVisibleTranslations[normalized];
    if (exactEnglish) return withOriginalSpacing(value, exactEnglish);
    return value;
  }

  const dictionary = visibleTextTranslations[language];
  const exact = dictionary[normalized];
  if (exact) return withOriginalSpacing(value, exact);

  const dynamicRules: Array<[RegExp, (...matches: string[]) => string]> = [
    [/^Welcome back, (.+)$/, (name) => `欢迎回来，${name}`],
    [/^(\d+) member(?:s)? in (.+)$/, (count, family) => `${family} 有 ${count} 位成员`],
    [/^You have (\d+) item(?:s)? you(?:'|’)ve never worn\. Consider styling them!$/, (count) => `你有 ${count} 件单品还没穿过，可以考虑搭配一下！`],
    [/^(\d+) item(?:s)? uploaded successfully$/, (count) => `${count} 件单品上传成功`],
    [/^Failed to upload all (\d+) item(?:s)?$/, (count) => `${count} 件单品全部上传失败`],
    [/^(\d+) uploaded, (\d+) failed$/, (ok, failed) => `${ok} 件已上传，${failed} 件失败`],
    [/^(\d+) of (\d+) uploaded successfully$/, (ok, total) => `${total} 件中 ${ok} 件上传成功`],
    [/^(\d+) item(?:s)? failed$/, (count) => `${count} 件单品失败`],
    [/^Worn (\d+) time(?:s)?$/, (count) => `已穿 ${count} 次`],
    [/^(\d+)% chance of rain$/, (pct) => `降雨概率 ${pct}%`],
    [/^feels (.+)$/, (temp) => `体感 ${temp}`],
    [/^(\d+)% confident$/, (pct) => `${pct}% 置信度`],
    [/^AI completeness: (\d+)%$/, (pct) => `AI 完整度：${pct}%`],
    [/^(\d+) selected$/, (count) => `已选择 ${count} 项`],
    [/^(\d+) item(?:s)? selected$/, (count) => `已选择 ${count} 件单品`],
    [/^Page (\d+) of (\d+)$/, (page, total) => `第 ${page} 页，共 ${total} 页`],
    [/^(\d+) models available$/, (count) => `${count} 个模型可用`],
    [/^Last worn (.+)$/, (time) => `上次穿着：${time}`],
  ];

  for (const [pattern, formatter] of dynamicRules) {
    const match = normalized.match(pattern);
    if (match) return withOriginalSpacing(value, formatter(...match.slice(1)));
  }

  return value;
}

function shouldSkipElement(element: Element | null): boolean {
  if (!element) return true;
  const tagName = element.tagName.toLowerCase();
  if (['script', 'style', 'noscript', 'textarea', 'code', 'pre'].includes(tagName)) return true;
  if (element.closest('[data-i18n-skip="true"], [contenteditable="true"]')) return true;
  return false;
}

function restoreVisibleTranslations(root: ParentNode = document): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode() as Text | null;
  while (current) {
    const original = textNodeOriginals.get(current);
    if (original !== undefined) {
      // Some React-rendered nodes (sidebar/nav/header) are already localized via t().
      // If the runtime bridge first observes them while Chinese is active, the
      // stored "original" is Chinese. Restoring that verbatim makes English mode
      // look stuck. Always normalize the stored value back through the English
      // reverse dictionary when leaving Chinese mode.
      const restored = translateVisibleText(original, 'en');
      if (current.nodeValue !== restored) {
        current.nodeValue = restored;
      }
    }
    current = walker.nextNode() as Text | null;
  }

  const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll('*'))] : Array.from(root.querySelectorAll('*'));
  for (const element of elements) {
    const originals = attributeOriginals.get(element);
    if (!originals) continue;
    for (const [attribute, original] of Object.entries(originals)) {
      const restored = translateVisibleText(original, 'en');
      if (element.getAttribute(attribute) !== restored) {
        element.setAttribute(attribute, restored);
      }
    }
  }
}

function translateVisibleSubtree(language: Language, root: ParentNode = document): void {
  if (language === 'en') {
    restoreVisibleTranslations(root);
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkipElement(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return normalizeVisibleText(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  let current = walker.nextNode() as Text | null;
  while (current) {
    if (!textNodeOriginals.has(current)) {
      textNodeOriginals.set(current, current.nodeValue || '');
    }
    const original = textNodeOriginals.get(current) || '';
    const translated = translateVisibleText(original, language);
    if (translated !== current.nodeValue) {
      current.nodeValue = translated;
    }
    current = walker.nextNode() as Text | null;
  }

  const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll('*'))] : Array.from(root.querySelectorAll('*'));
  for (const element of elements) {
    if (shouldSkipElement(element)) continue;
    let originals = attributeOriginals.get(element);
    for (const attribute of TRANSLATABLE_ATTRIBUTES) {
      const currentValue = element.getAttribute(attribute);
      if (!currentValue) continue;
      if (!originals) {
        originals = {};
        attributeOriginals.set(element, originals);
      }
      if (!(attribute in originals)) {
        originals[attribute] = currentValue;
      }
      const translated = translateVisibleText(originals[attribute], language);
      if (translated !== currentValue) {
        element.setAttribute(attribute, translated);
      }
    }
  }
}

function applyVisibleTranslations(language: Language): void {
  if (typeof document === 'undefined' || isApplyingVisibleTranslations) return;
  isApplyingVisibleTranslations = true;
  try {
    translateVisibleSubtree(language, document);
  } finally {
    isApplyingVisibleTranslations = false;
  }
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    const saved = storage && typeof storage.getItem === 'function'
      ? storage.getItem('wardrowbe_language')
      : null;
    if (saved === 'en' || saved === 'zh') {
      setLanguageState(saved);
      document.documentElement.lang = saved === 'zh' ? 'zh-CN' : 'en';
      return;
    }

    const browserLanguage = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    setLanguageState(browserLanguage);
    document.documentElement.lang = browserLanguage === 'zh' ? 'zh-CN' : 'en';
  }, []);

  const setLanguage = (nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    if (storage && typeof storage.setItem === 'function') {
      storage.setItem('wardrowbe_language', nextLanguage);
    }
    document.documentElement.lang = nextLanguage === 'zh' ? 'zh-CN' : 'en';
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key: string) => translations[language][key as TranslationKey] || translations.en[key as TranslationKey] || translateVisibleText(key, language),
    }),
    [language]
  );

  useEffect(() => {
    applyVisibleTranslations(language);

    if (typeof document === 'undefined') return;
    const observer = new MutationObserver((mutations) => {
      if (isApplyingVisibleTranslations) return;
      const shouldApply = mutations.some((mutation) => {
        if (mutation.type === 'characterData') return true;
        if (mutation.type === 'childList') return mutation.addedNodes.length > 0;
        if (mutation.type === 'attributes') return TRANSLATABLE_ATTRIBUTES.includes(mutation.attributeName as typeof TRANSLATABLE_ATTRIBUTES[number]);
        return false;
      });
      if (!shouldApply) return;
      window.requestAnimationFrame(() => {
        const currentLanguage = document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
        applyVisibleTranslations(currentLanguage);
      });
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });

    return () => observer.disconnect();
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useI18n must be used within LanguageProvider');
  }
  return context;
}
