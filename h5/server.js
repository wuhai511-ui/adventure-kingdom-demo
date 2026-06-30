var express = require('express');
var cors = require('cors');
var jwt = require('jsonwebtoken');
var bcrypt = require('bcryptjs');
var path = require('path');
var fs = require('fs');
var multer = require('multer');
var upload = multer({ dest: 'public/uploads/', limits: { fileSize: 5 * 1024 * 1024 } });

var app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

var PORT = process.env.PORT || 3456;

// Load .env file (PM2 doesn't auto-source it)
try {
  var envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(function (line) {
      var m = line.match(/^\s*([^#=]+)\s*=\s*(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    });
  }
} catch (e) {}

var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('FATAL: JWT_SECRET 环境变量未设置！'); process.exit(1); }
var DB_PATH = path.join(__dirname, 'data.json');

// ===== JSON File Database =====
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch (e) { return { users: [], tasks: [], records: [], treasures: [], pets: [], badges: [], rewards: [], nextId: 1 }; }
}
function saveDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8'); }

var db = loadDB();
if (!db.users) db.users = []; if (!db.tasks) db.tasks = [];
if (!db.records) db.records = []; if (!db.treasures) db.treasures = [];
if (!db.pets) db.pets = []; if (!db.badges) db.badges = [];
if (!db.rewards) db.rewards = []; if (!db.nextId) db.nextId = 1;
saveDB(db);

// Seed tasks
if (db.tasks.length === 0) {
  var seeds = [
    { icon: '🛏️', name: '整理床铺', pinyin: 'zhěng lǐ chuáng pù', desc: '起床后把被子叠好', pts: 5, review: 'photo', cat: '家务', anim: 'bed' },
    { icon: '📚', name: '阅读三十分钟', pinyin: 'yuè dú', desc: '读完一本书或一个故事', pts: 15, review: 'photo', cat: '学习', anim: 'book' },
    { icon: '🦷', name: '认真刷牙洗脸', pinyin: 'rèn zhēn shuā yá', desc: '早晚各一次刷够两分钟', pts: 5, review: 'auto', cat: '习惯', anim: 'tooth' },
    { icon: '🏃', name: '运动二十分钟', pinyin: 'yùn dòng', desc: '跳绳跑步或户外玩耍', pts: 12, review: 'photo', cat: '运动', anim: 'run' },
    { icon: '🪢', name: '跳绳100个', pinyin: 'tiào shéng', desc: '连续或累计跳够100个', pts: 12, review: 'auto', cat: '运动', anim: 'rope' },
    { icon: '🏀', name: '拍篮球50下', pinyin: 'pāi lán qiú', desc: '连续拍篮球50下不掉球', pts: 10, review: 'auto', cat: '运动', anim: 'ball' },
    { icon: '🚴', name: '骑自行车15分钟', pinyin: 'qí zì xíng chē', desc: '在安全的地方骑够15分钟', pts: 15, review: 'confirm', cat: '运动', anim: 'bike' },
    { icon: '🤸', name: '做操跳舞10分钟', pinyin: 'zuò cāo tiào wǔ', desc: '跟着音乐运动跳起来', pts: 8, review: 'auto', cat: '运动', anim: 'dance' },
    { icon: '📝', name: '完成作业', pinyin: 'wán chéng zuò yè', desc: '认真做完今天的作业', pts: 20, review: 'photo', cat: '学习', anim: 'write' },
    { icon: '🍳', name: '帮厨小帮手', pinyin: 'bāng chú', desc: '帮爸爸妈妈准备一顿饭', pts: 18, review: 'confirm', cat: '家务', anim: 'cook' },
    { icon: '🥗', name: '自己收拾书包', pinyin: 'zì jǐ shōu shi', desc: '按课表整理好明天书本', pts: 6, review: 'photo', cat: '习惯', anim: 'bag' },
    { icon: '🦴', name: '倒垃圾', pinyin: 'dào lā jī', desc: '把家里垃圾打包扔掉', pts: 5, review: 'auto', cat: '家务', anim: 'trash' },
    { icon: '🧹', name: '整理书桌', pinyin: 'zhěng lǐ shū zhuō', desc: '把书本文具归位擦干净', pts: 8, review: 'photo', cat: '家务', anim: 'sweep' },
    { icon: '🐶', name: '照顾宠物', pinyin: 'zhào gù chǒng wù', desc: '给小宠物添食添水', pts: 5, review: 'auto', cat: '习惯', anim: 'pet' },
    { icon: '👕', name: '自己穿衣服', pinyin: 'zì jǐ chuān yī fu', desc: '早上自己选衣服穿好', pts: 8, review: 'photo', cat: '学龄前', anim: 'dress' },
    { icon: '🍚', name: '自己吃饭', pinyin: 'zì jǐ chī fàn', desc: '自己用小勺子吃饭不洒', pts: 8, review: 'confirm', cat: '学龄前', anim: 'eat' },
    { icon: '🧸', name: '玩具送回家', pinyin: 'wán jù sòng huí jiā', desc: '玩完玩具收进玩具箱', pts: 6, review: 'photo', cat: '学龄前', anim: 'teddy' },
    { icon: '🪥', name: '自己刷牙', pinyin: 'zì jǐ shuā yá', desc: '早晚自己挤牙膏刷牙', pts: 5, review: 'auto', cat: '学龄前', anim: 'tooth' },
    { icon: '🧼', name: '自己洗手', pinyin: 'zì jǐ xǐ shǒu', desc: '饭前便后用洗手液洗手', pts: 4, review: 'auto', cat: '学龄前', anim: 'wash' },
    { icon: '👋', name: '说你好和谢谢', pinyin: 'shuō nǐ hǎo', desc: '见到人主动打招呼说谢谢', pts: 5, review: 'auto', cat: '学龄前', anim: 'wave' },
    { icon: '📖', name: '认真听故事', pinyin: 'rèn zhēn tīng gù shì', desc: '安静听完一本绘本', pts: 12, review: 'confirm', cat: '学龄前', anim: 'read' },
    { icon: '🎨', name: '画一幅画', pinyin: 'huà yī fú huà', desc: '用水彩笔或蜡笔自由画画', pts: 10, review: 'photo', cat: '学龄前', anim: 'draw' },
    { icon: '🎤', name: '唱一首儿歌', pinyin: 'chàng yī shǒu ér gē', desc: '完整唱一首学过的儿歌', pts: 8, review: 'confirm', cat: '学龄前', anim: 'sing' },
    { icon: '😊', name: '不哭闹的一天', pinyin: 'bù kū nào', desc: '遇到不开心也好好说话', pts: 12, review: 'confirm', cat: '学龄前', anim: 'smile' }
  ];
  seeds.forEach(function (s, i) { db.tasks.push(Object.assign({ id: db.nextId++, userId: 0 }, s)); });
  saveDB(db);
  console.log('Seed tasks:', db.tasks.length);
}

function nextId() { var id = db.nextId; db.nextId++; saveDB(db); return id; }

// ===== Auth Middleware =====
function authMiddleware(req, res, next) {
  var token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ code: -1, msg: '请先登录' });
  try { req.userId = jwt.verify(token, JWT_SECRET).userId; next(); }
  catch (e) { return res.status(401).json({ code: -1, msg: '登录已过期' }); }
}

// ===== Auth Routes =====
app.post('/api/auth/register', function (req, res) {
  var p = req.body;
  if (!p.phone || !p.password) return res.json({ code: -1, msg: '手机号和密码不能为空' });
  if (db.users.find(function (u) { return u.phone === p.phone; })) return res.json({ code: -1, msg: '该手机号已注册' });
  if (p.password.length < 4) return res.json({ code: -1, msg: '密码至少4位' });

  var todayDay = (function(){var d=new Date().getDay();return d===0?7:d;})();
  var user = {
    id: nextId(), phone: p.phone, password_hash: bcrypt.hashSync(p.password, 10),
    child_name: p.childName || '小勇士', avatar: '🦊', role_emoji: '🦊',
    coins: 0, gems: 0, streak: 0, lastCheckin: null, xp: 0, current_level: 1, current_day: todayDay,
    wechat_openid: '', wechat_unionid: '', onboarding_done: false,
    pin_hash: null, pin_fails: 0, pin_locked_until: null,
    activeChild: 0,
    children: [{ id: 0, name: p.childName || '小勇士', avatar: '🦊',
                coins: 0, gems: 0, saved: 0, goal: 200, xp: 0, level: 1,
                streak: 0, lastCheckin: null, treasureOpened: false,
                combo: 0, todayGain: 0, spent: 0,
                currentLevel: 1, currentDay: todayDay,
                weekProgress: {1:[0,0,0,0,0,0,0],2:[0,0,0,0,0,0,0],3:[0,0,0,0,0,0,0]},
                dayDone: {} }]
  };
  db.users.push(user);

  // onboarding_done stays false until parent completes setup

  // Copy seed tasks
  db.tasks.filter(function (t) { return t.userId === 0; }).forEach(function (t) {
    db.tasks.push({ id: nextId(), userId: user.id, icon: t.icon, name: t.name, pinyin: t.pinyin, desc: t.desc, pts: t.pts, review: t.review, cat: t.cat, anim: t.anim, active: 1 });
  });
  // Default rewards
  // Default rewards from config
  GAME_CONFIG.defaultRewards.forEach(function(rw){
    db.rewards.push({ id: nextId(), userId: user.id, emoji: rw.emoji, name: rw.name, cost: rw.cost });
  });
  saveDB(db);

  var token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  return res.json({ code: 0, data: { token, user: { id: user.id, phone: user.phone, childName: user.child_name, wechatOpenid: '', wechatLinked: false, role: 'parent', onboardingDone: false } } });
});

app.post('/api/auth/login', function (req, res) {
  var p = req.body;
  var user = db.users.find(function (u) { return u.phone === p.phone; });
  if (!user) return res.json({ code: -1, msg: '手机号未注册' });
  if (!bcrypt.compareSync(p.password, user.password_hash)) return res.json({ code: -1, msg: '密码错误' });

  var token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  return res.json({ code: 0, data: { token, user: {
    id: user.id, phone: user.phone, childName: user.child_name, avatar: user.avatar,
    coins: user.coins, gems: user.gems, currentLevel: user.current_level, currentDay: user.current_day,
    wechatOpenid: user.wechat_openid || '', wechatLinked: !!user.wechat_openid,
    role: user.role || 'child', onboardingDone: user.onboarding_done !== false
  } } });
});

// ===== Task Routes =====
app.get('/api/tasks', authMiddleware, function (req, res) {
  var tasks = db.tasks.filter(function (t) { return t.userId === req.userId && t.active !== 0; });
  return res.json({ code: 0, data: tasks.map(function (t) { return { id: t.id, icon: t.icon, name: t.name, pinyin: t.pinyin, desc: t.desc, pts: t.pts, review: t.review, cat: t.cat, anim: t.anim }; }) });
});

app.post('/api/tasks', authMiddleware, function (req, res) {
  var t = req.body;
  var task = { id: nextId(), userId: req.userId, icon: t.icon || '📚', name: t.name, pinyin: t.pinyin || '', desc: t.desc || '', pts: t.pts || 5, review: t.review || 'photo', cat: t.cat || '自定义', anim: t.anim || 'bed', active: 1 };
  db.tasks.push(task); saveDB(db);
  return res.json({ code: 0, data: { id: task.id } });
});

app.delete('/api/tasks/:id', authMiddleware, function (req, res) {
  var task = db.tasks.find(function (t) { return t.id === parseInt(req.params.id) && t.userId === req.userId; });
  if (task) { task.active = 0; saveDB(db); }
  return res.json({ code: 0 });
});

// ===== Task Completion =====
app.post('/api/tasks/:id/complete', authMiddleware, function (req, res) {
  var taskId = parseInt(req.params.id);
  var level = req.body.level || 1, day = req.body.day || 1;
  var task = db.tasks.find(function (t) { return t.id === taskId && t.userId === req.userId; });
  if (!task) return res.json({ code: -1, msg: '任务不存在' });

  // Daily duplicates check
  if (db.records.find(function (r) { return r.userId === req.userId && r.taskId === taskId && r.level === level && r.day === day; }))
    return res.json({ code: -1, msg: '今天已经做过这个任务了' });

  // Daily limit check
  var todayCount = db.records.filter(function (r) { return r.userId === req.userId && r.level === level && r.day === day; }).length;
  if (todayCount >= GAME_CONFIG.maxTasksPerDay) return res.json({ code: -1, msg: '今日任务已满（最多'+GAME_CONFIG.maxTasksPerDay+'个）' });

  db.records.push({ id: nextId(), userId: req.userId, taskId, level, day, time: Date.now() });
  var user = db.users.find(function (u) { return u.id === req.userId; });
  user.coins += task.pts;
  var combo = todayCount;
  var comboBonus = combo * GAME_CONFIG.xpPerCombo;
  var xpGain = GAME_CONFIG.xpBase + comboBonus;
  user.xp += xpGain;
  var leveledUp = false;
  while (user.xp >= user.current_level * 100) {
    user.xp -= user.current_level * 100;
    user.current_level++;
    leveledUp = true;
  }
  saveDB(db);
  return res.json({ code: 0, data: { pts: task.pts, coins: user.coins, xp: user.xp, currentLevel: user.current_level, xpGain: xpGain, leveledUp: leveledUp } });
});

// ===== Progress =====
app.get('/api/progress', authMiddleware, function (req, res) {
  var level = parseInt(req.query.level) || 1;
  var records = db.records.filter(function (r) { return r.userId === req.userId && r.level === level; });
  var weekProgress = [0, 0, 0, 0, 0, 0, 0];
  var dayDone = {};
  records.forEach(function (r) {
    var d = r.day || 1;
    if (d >= 1 && d <= 7) weekProgress[d - 1]++;
    var dk = level + '_' + d;
    if (!dayDone[dk]) dayDone[dk] = {};
    dayDone[dk][r.taskId] = true;
  });
  return res.json({ code: 0, data: { weekProgress, dayDone } });
});

// ===== Treasure Box =====
app.post('/api/treasure', authMiddleware, function (req, res) {
  var today = new Date().toDateString();
  if (db.treasures.find(function (t) { return t.userId === req.userId && t.date === today; }))
    return res.json({ code: -1, msg: '今天已经开过了' });

  var rand = Math.random();
  var reward = rand < 0.65 ? { type: 'gold', value: 5 + Math.floor(Math.random() * 10) }
    : rand < 0.90 ? { type: 'gem', value: 3 + Math.floor(Math.random() * 5) }
    : { type: 'egg', value: 1 };

  db.treasures.push({ id: nextId(), userId: req.userId, date: today, type: reward.type, value: reward.value });
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (reward.type === 'gem') user.gems += reward.value; else user.coins += reward.value;
  saveDB(db);
  return res.json({ code: 0, data: reward });
});

// ===== Checkin =====
app.post('/api/checkin', authMiddleware, function (req, res) {
  var today = new Date().toISOString().slice(0, 10);
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (!user) return res.json({ code: -1, msg: '用户不存在' });
  if (user.lastCheckin === today) return res.json({ code: -1, msg: '今天已签到' });

  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (user.lastCheckin === yesterday) {
    user.streak++;
  } else {
    user.streak = 1;
  }

  var reward = CHECKIN_REWARDS[Math.min(user.streak - 1, 6)];
  user.lastCheckin = today;
  user.coins += reward;
  saveDB(db);
  return res.json({ code: 0, data: { streak: user.streak, reward: reward, coins: user.coins } });
});

app.get('/api/checkin/status', authMiddleware, function (req, res) {
  var today = new Date().toISOString().slice(0, 10);
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (!user) return res.json({ code: -1, msg: '用户不存在' });
  var checkedIn = user.lastCheckin === today;
  var todayReward = CHECKIN_REWARDS[Math.min(user.streak || 0, 6)];
  return res.json({ code: 0, data: { checkedIn: checkedIn, streak: user.streak || 0, todayReward: todayReward } });
});

// ===== Pets / Badges / Rewards =====
app.get('/api/pets', authMiddleware, function (req, res) {
  return res.json({ code: 0, data: db.pets.filter(function (p) { return p.userId === req.userId; }) });
});
app.post('/api/pets/hatch', authMiddleware, function (req, res) {
  var cost = GAME_CONFIG.eggCost;
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (!user || user.coins < cost) return res.json({ code: -1, msg: '金币不足，需要' + cost + '金币' });
  var pets = ['🐉','🐧','🐰','🐱','🐶','🦊'];
  var names = ['小火龙','冰冰鹅','萌萌兔','小橘猫','旺旺狗','小灵狐'];
  var xps = [60,20,10,5,5,5];
  var lvs = [3,1,1,1,1,1];
  var idx = db.pets.filter(function (p) { return p.userId === req.userId; }).length % 6;
  var pet = { id: nextId(), userId: req.userId, emoji: pets[idx], name: names[idx], level: lvs[idx], xp: xps[idx] };
  db.pets.push(pet);
  user.coins -= cost;
  saveDB(db);
  return res.json({ code: 0, data: pet });
});
app.post('/api/pets/:id/feed', authMiddleware, function (req, res) {
  var petId = parseInt(req.params.id);
  var pet = db.pets.find(function (p) { return p.id === petId && p.userId === req.userId; });
  if (!pet) return res.json({ code: -1, msg: '宠物不存在' });
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (!user || user.coins < 5) return res.json({ code: -1, msg: '金币不足' });
  user.coins -= 5;
  pet.xp = (pet.xp || 0) + 10;
  var leveledUp = false;
  if (pet.xp >= pet.level * 50) {
    pet.xp = 0;
    pet.level++;
    leveledUp = true;
  }
  saveDB(db);
  return res.json({ code: 0, data: { xp: pet.xp, level: pet.level, leveledUp: leveledUp, coins: user.coins } });
});
app.post('/api/pets/:id/rename', authMiddleware, function (req, res) {
  var petId = parseInt(req.params.id);
  var pet = db.pets.find(function (p) { return p.id === petId && p.userId === req.userId; });
  if (!pet) return res.json({ code: -1, msg: '宠物不存在' });
  var newName = (req.body.name || '').trim();
  if (!newName) return res.json({ code: -1, msg: '名字不能为空' });
  pet.name = newName;
  saveDB(db);
  return res.json({ code: 0, data: { name: pet.name } });
});
app.get('/api/badges', authMiddleware, function (req, res) {
  var all = [{ key: 'first', emoji: '🌱', name: '初出茅庐' }, { key: 'second', emoji: '⭐', name: '首次完成' },
    { key: 'reading', emoji: '📚', name: '阅读达人' }, { key: 'sport', emoji: '🏃', name: '运动健将' },
    { key: 'hygiene', emoji: '🦷', name: '卫生之星' }, { key: 'streak7', emoji: '🔥', name: '连续7天' },
    { key: 'week_full', emoji: '🏆', name: '全勤一周' }, { key: 'saver', emoji: '💎', name: '储蓄能手' },
    { key: 'pet_master', emoji: '🐾', name: '宠物大师' }];
  var got = db.badges.filter(function (b) { return b.userId === req.userId; });
  var result = all.map(function (a) { return Object.assign({}, a, { got: got.some(function (g) { return g.badge_key === a.key; }) }); });
  return res.json({ code: 0, data: result });
});
app.post('/api/badges/unlock', authMiddleware, function (req, res) {
  var key = req.body.key;
  var all = ['first','second','reading','sport','hygiene','streak7','week_full','saver','pet_master'];
  if (all.indexOf(key) < 0) return res.json({ code: -1, msg: '无效徽章' });
  var exists = db.badges.find(function (b) { return b.userId === req.userId && b.badge_key === key; });
  if (exists) return res.json({ code: 0, data: exists }); // already unlocked
  var map = { first: { emoji: '🌱', name: '初出茅庐' }, second: { emoji: '⭐', name: '首次完成' }, reading: { emoji: '📚', name: '阅读达人' },
    sport: { emoji: '🏃', name: '运动健将' }, hygiene: { emoji: '🦷', name: '卫生之星' }, streak7: { emoji: '🔥', name: '连续7天' },
    week_full: { emoji: '🏆', name: '全勤一周' }, saver: { emoji: '💎', name: '储蓄能手' }, pet_master: { emoji: '🐾', name: '宠物大师' } };
  var b = map[key];
  var badge = { id: nextId(), userId: req.userId, badge_key: key, emoji: b.emoji, name: b.name, unlock_time: Date.now() };
  db.badges.push(badge); saveDB(db);
  return res.json({ code: 0, data: badge });
});
app.get('/api/rewards', authMiddleware, function (req, res) {
  return res.json({ code: 0, data: db.rewards.filter(function (r) { return r.userId === req.userId; }) });
});
app.post('/api/rewards', authMiddleware, function (req, res) {
  var r = req.body;
  var reward = { id: nextId(), userId: req.userId, emoji: r.emoji || '🎁', name: r.name, cost: parseInt(r.cost) || 50 };
  db.rewards.push(reward); saveDB(db);
  return res.json({ code: 0, data: { id: reward.id } });
});
app.delete('/api/rewards/:id', authMiddleware, function (req, res) {
  var idx = db.rewards.findIndex(function (r) { return r.id === parseInt(req.params.id) && r.userId === req.userId; });
  if (idx >= 0) { db.rewards.splice(idx, 1); saveDB(db); }
  return res.json({ code: 0 });
});
app.post('/api/rewards/:id/redeem', authMiddleware, function (req, res) {
  var reward = db.rewards.find(function (r) { return r.id === parseInt(req.params.id) && r.userId === req.userId; });
  if (!reward) return res.json({ code: -1, msg: '奖励不存在' });
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (!user || user.coins < reward.cost) return res.json({ code: -1, msg: '金币不足' });
  user.coins -= reward.cost;
  saveDB(db);
  return res.json({ code: 0, data: { coins: user.coins, reward: reward } });
});

// ===== WeChat Link =====
app.post('/api/auth/link-wechat', authMiddleware, function (req, res) {
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (user) { user.wechat_openid = req.body.wechatOpenid || ''; user.wechat_unionid = req.body.wechatUnionid || ''; saveDB(db); }
  return res.json({ code: 0, msg: '微信账号已关联' });
});

// ===== PIN Lock =====
app.post('/api/auth/set-pin', authMiddleware, function (req, res) {
  var pin = req.body.pin;
  if (!/^\d{4}$/.test(pin)) return res.json({ code: -1, msg: 'PIN必须是4位数字' });
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (!user) return res.json({ code: -1, msg: '用户不存在' });
  user.pin_hash = bcrypt.hashSync(pin, 10);
  user.pin_fails = 0;
  user.pin_locked_until = null;
  saveDB(db);
  return res.json({ code: 0, msg: 'ok' });
});

app.post('/api/auth/verify-pin', authMiddleware, function (req, res) {
  var pin = req.body.pin;
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (!user) return res.json({ code: -1, msg: '用户不存在' });
  if (!user.pin_hash) return res.json({ code: -1, msg: '尚未设置PIN' });

  if (user.pin_locked_until && user.pin_locked_until > Date.now()) {
    var remaining = user.pin_locked_until - Date.now();
    return res.json({ code: -1, msg: 'PIN已锁定，请稍后再试', data: { locked: true, remainingLock: remaining } });
  }

  if (!bcrypt.compareSync(pin, user.pin_hash)) {
    user.pin_fails = (user.pin_fails || 0) + 1;
    if (user.pin_fails >= 5) {
      user.pin_locked_until = Date.now() + 30000;
    }
    saveDB(db);
    var remaining = user.pin_locked_until ? Math.max(0, user.pin_locked_until - Date.now()) : 0;
    return res.json({ code: -1, msg: 'PIN错误', data: { fails: user.pin_fails, locked: user.pin_fails >= 5, remainingLock: remaining } });
  }

  user.pin_fails = 0;
  user.pin_locked_until = null;
  saveDB(db);
  return res.json({ code: 0, data: { verified: true } });
});

app.get('/api/auth/pin-status', authMiddleware, function (req, res) {
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (!user) return res.json({ code: -1, msg: '用户不存在' });
  var locked = !!(user.pin_locked_until && user.pin_locked_until > Date.now());
  var remainingLock = locked ? Math.max(0, user.pin_locked_until - Date.now()) : 0;
  return res.json({ code: 0, data: { hasPin: !!user.pin_hash, locked: locked, remainingLock: remainingLock } });
});

// ===== Account Management =====
app.post('/api/auth/update-pin', authMiddleware, function (req, res) {
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (!user) return res.json({ code: -1, msg: '用户不存在' });
  var oldPin = req.body.oldPin;
  var newPin = req.body.newPin;
  if (!oldPin || !newPin) return res.json({ code: -1, msg: '旧PIN和新PIN不能为空' });
  if (!/^\d{4}$/.test(newPin)) return res.json({ code: -1, msg: 'PIN必须是4位数字' });
  if (!user.pin_hash) return res.json({ code: -1, msg: '尚未设置PIN' });
  if (!bcrypt.compareSync(oldPin, user.pin_hash)) return res.json({ code: -1, msg: '旧PIN错误' });
  user.pin_hash = bcrypt.hashSync(newPin, 10);
  user.pin_fails = 0;
  user.pin_locked_until = null;
  saveDB(db);
  return res.json({ code: 0, msg: 'PIN已更新' });
});

app.post('/api/auth/logout', authMiddleware, function (req, res) {
  return res.json({ code: 0, msg: '已注销' });
});

// ===== Multi-Child Support =====
app.get('/api/children', authMiddleware, function (req, res) {
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (!user) return res.json({ code: -1, msg: '用户不存在' });
  if (!user.children || user.children.length === 0) {
    var todayDay = (function(){var d=new Date().getDay();return d===0?7:d;})();
    user.children = [{ id: 0, name: user.child_name || '小勇士', avatar: user.avatar || '🦊',
      coins: user.coins || 0, gems: user.gems || 0, saved: 0, goal: 200, xp: user.xp || 0, level: 1,
      streak: user.streak || 0, lastCheckin: user.lastCheckin || null, treasureOpened: false,
      combo: 0, todayGain: 0, spent: 0,
      currentLevel: user.current_level || 1, currentDay: user.current_day || todayDay,
      weekProgress: {1:[0,0,0,0,0,0,0],2:[0,0,0,0,0,0,0],3:[0,0,0,0,0,0,0]},
      dayDone: {} }];
    user.activeChild = 0;
  }
  var summary = user.children.map(function (c) {
    return { id: c.id, name: c.name, avatar: c.avatar, coins: c.coins, gems: c.gems, level: c.level || 1 };
  });
  return res.json({ code: 0, data: { children: summary, activeChild: user.activeChild || 0 } });
});

app.post('/api/children', authMiddleware, function (req, res) {
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (!user) return res.json({ code: -1, msg: '用户不存在' });
  if (!user.children) user.children = [];
  var maxId = -1;
  for (var k = 0; k < user.children.length; k++) {
    if (user.children[k].id > maxId) maxId = user.children[k].id;
  }
  var newId = maxId + 1;
  var todayDay = (function(){var d=new Date().getDay();return d===0?7:d;})();
  var child = {
    id: newId,
    name: (req.body.name || '小勇士').trim(),
    avatar: req.body.avatar || '🦊',
    coins: 0, gems: 0, saved: 0, goal: 200, xp: 0, level: 1,
    streak: 0, lastCheckin: null, treasureOpened: false,
    combo: 0, todayGain: 0, spent: 0,
    currentLevel: 1, currentDay: todayDay,
    weekProgress: {1:[0,0,0,0,0,0,0],2:[0,0,0,0,0,0,0],3:[0,0,0,0,0,0,0]},
    dayDone: {}
  };
  user.children.push(child);
  saveDB(db);
  return res.json({ code: 0, data: { id: newId } });
});

app.post('/api/children/switch', authMiddleware, function (req, res) {
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (!user) return res.json({ code: -1, msg: '用户不存在' });
  if (!user.children) user.children = [];
  var targetId = req.body.childId;
  if (targetId === undefined || targetId === null) return res.json({ code: -1, msg: '请指定孩子ID' });
  targetId = parseInt(targetId);
  var targetIdx = -1;
  for (var m = 0; m < user.children.length; m++) {
    if (user.children[m].id === targetId) { targetIdx = m; break; }
  }
  if (targetIdx < 0) return res.json({ code: -1, msg: '孩子不存在' });
  var activeIdx = -1;
  var activeChildId = user.activeChild || 0;
  for (var n = 0; n < user.children.length; n++) {
    if (user.children[n].id === activeChildId) { activeIdx = n; break; }
  }
  if (activeIdx >= 0 && user.children[activeIdx]) {
    var cur = user.children[activeIdx];
    cur.coins = user.coins;
    cur.gems = user.gems;
    cur.xp = user.xp;
    cur.currentLevel = user.current_level;
    cur.currentDay = user.current_day;
    cur.streak = user.streak;
    cur.lastCheckin = user.lastCheckin;
  }
  var target = user.children[targetIdx];
  if (target) {
    user.coins = target.coins || 0;
    user.gems = target.gems || 0;
    user.xp = target.xp || 0;
    user.current_level = target.currentLevel || 1;
    user.current_day = target.currentDay || 1;
    user.streak = target.streak || 0;
    user.lastCheckin = target.lastCheckin || null;
    user.child_name = target.name || '小勇士';
    user.avatar = target.avatar || '🦊';
    user.role_emoji = target.avatar || '🦊';
  }
  user.activeChild = targetId;
  saveDB(db);
  return res.json({ code: 0, data: { childId: targetId } });
});

app.delete('/api/children/:id', authMiddleware, function (req, res) {
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (!user) return res.json({ code: -1, msg: '用户不存在' });
  if (!user.children || user.children.length <= 1) return res.json({ code: -1, msg: '至少保留一个孩子' });
  var childId = parseInt(req.params.id);
  var idx = -1;
  for (var p = 0; p < user.children.length; p++) {
    if (user.children[p].id === childId) { idx = p; break; }
  }
  if (idx < 0) return res.json({ code: -1, msg: '孩子不存在' });
  user.children.splice(idx, 1);
  if (user.activeChild === childId) {
    user.activeChild = user.children[0].id;
    var first = user.children[0];
    user.coins = first.coins || 0;
    user.gems = first.gems || 0;
    user.xp = first.xp || 0;
    user.current_level = first.currentLevel || 1;
    user.current_day = first.currentDay || 1;
    user.streak = first.streak || 0;
    user.lastCheckin = first.lastCheckin || null;
    user.child_name = first.name || '小勇士';
    user.avatar = first.avatar || '🦊';
    user.role_emoji = first.avatar || '🦊';
  }
  saveDB(db);
  return res.json({ code: 0, msg: '已删除' });
});

// ===== Level Titles =====
var LEVEL_TITLES = [
  { minLevel: 1, title: "小探险家" },
  { minLevel: 3, title: "勇敢冒险家" },
  { minLevel: 5, title: "魔法骑士" },
  { minLevel: 7, title: "传说勇士" },
  { minLevel: 10, title: "荣耀国王" }
];

// ===== Game Config =====
var GAME_CONFIG = {
  maxTasksPerDay: 10,
  xpBase: 40, xpPerCombo: 8,
  levels: [{ id:1, name:'新手冒险', icon:'🌱', color:'#7FD66E', desc:'第一周·养成好习惯', target:35 },
    { id:2, name:'进阶挑战', icon:'⭐', color:'#FFC93C', desc:'第二周·挑战自己', target:42 },
    { id:3, name:'大师之路', icon:'👑', color:'#B98CFF', desc:'第三周·成为大师', target:49 }],
  treasureRates: { gold: 0.65, gem: 0.25, egg: 0.10, goldMin: 5, goldMax: 14, gemMin: 3, gemMax: 7 },
  eggCost: 30,
  defaultRewards: [{ emoji:'📺', name:'看电视30分钟', cost:20 }, { emoji:'🎢', name:'周末游乐园', cost:200 }]
};
var CHECKIN_REWARDS = [1, 2, 3, 5, 8, 13, 21];

app.get('/api/config', function (req, res) {
  return res.json({ code: 0, data: GAME_CONFIG });
});

// ===== Level Info =====
app.get('/api/user/level-info', authMiddleware, function (req, res) {
  var u = db.users.find(function (x) { return x.id === req.userId; });
  if (!u) return res.json({ code: -1, msg: '用户不存在' });
  var level = u.current_level;
  var title = LEVEL_TITLES[0].title;
  for (var i = LEVEL_TITLES.length - 1; i >= 0; i--) {
    if (level >= LEVEL_TITLES[i].minLevel) { title = LEVEL_TITLES[i].title; break; }
  }
  return res.json({ code: 0, data: { xp: u.xp, currentLevel: level, nextLevelXp: level * 100, title: title } });
});

// ===== User Profile（返回 onboarding 状态） =====
app.get('/api/user/profile', authMiddleware, function (req, res) {
  var u = db.users.find(function (x) { return x.id === req.userId; });
  if (!u) return res.json({ code: -1, msg: '用户不存在' });
  return res.json({ code: 0, data: {
    id: u.id, phone: u.phone, childName: u.child_name, avatar: u.avatar,
    coins: u.coins, gems: u.gems, streak: u.streak, xp: u.xp,
    currentLevel: u.current_level, currentDay: u.current_day,
    wechatOpenid: u.wechat_openid || '', wechatLinked: !!u.wechat_openid,
    onboardingDone: u.onboarding_done !== false,
    activeChild: u.activeChild || 0,
    childrenCount: (u.children||[]).length
  } });
});

// ===== Onboarding Complete =====
app.post('/api/auth/onboard-done', authMiddleware, function (req, res) {
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (user) {
    user.onboarding_done = true;
    user.role = 'parent';
    user.parent_name = req.body.parentName || '国王爸爸';
    saveDB(db);
  }
  return res.json({ code: 0 });
});

// ===== Switch Role (parent ↔ child) =====
app.post('/api/auth/switch-role', authMiddleware, function (req, res) {
  var user = db.users.find(function (u) { return u.id === req.userId; });
  if (!user) return res.json({ code: -1, msg: '用户不存在' });
  var newRole = req.body.role;
  if (newRole === 'parent') {
    user.role = 'parent';
    saveDB(db);
    return res.json({ code: 0, data: { role: 'parent' } });
  }
  if (newRole === 'child') {
    var childId = parseInt(req.body.childId) || 0;
    var child = null;
    if (user.children) {
      for (var i = 0; i < user.children.length; i++) {
        if (user.children[i].id === childId) { child = user.children[i]; break; }
      }
    }
    if (!child) return res.json({ code: -1, msg: '孩子不存在' });
    user.role = 'child';
    user.activeChild = childId;
    user.child_name = child.name || '小勇士';
    user.avatar = child.avatar || '🦊';
    user.coins = child.coins || 0;
    user.gems = child.gems || 0;
    user.xp = child.xp || 0;
    user.current_level = child.currentLevel || 1;
    user.current_day = child.currentDay || 1;
    user.streak = child.streak || 0;
    user.lastCheckin = child.lastCheckin || null;
    saveDB(db);
    return res.json({ code: 0, data: { role: 'child', childId: childId } });
  }
  return res.json({ code: -1, msg: '无效的角色' });
});

// ===== Photo Upload =====
var ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
var MAX_FILE_SIZE = 5 * 1024 * 1024;

app.post('/api/upload', authMiddleware, upload.single('photo'), function (req, res) {
  var file = req.file;
  var taskId = req.body.taskId ? parseInt(req.body.taskId) : null;

  if (!file) return res.json({ code: -1, msg: '未上传文件' });

  if (ALLOWED_TYPES.indexOf(file.mimetype) === -1) {
    fs.unlinkSync(file.path);
    return res.json({ code: -1, msg: '不支持的文件类型，仅允许 jpeg/png/webp' });
  }

  if (file.size > MAX_FILE_SIZE) {
    fs.unlinkSync(file.path);
    return res.json({ code: -1, msg: '文件大小超过5MB限制' });
  }

  var ext = path.extname(file.originalname) || '.jpg';
  var filename = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
  var destPath = path.join(__dirname, 'public', 'uploads', filename);
  fs.renameSync(file.path, destPath);
  var url = '/uploads/' + filename;

  // Record to records table with evidence
  if (taskId) {
    var task = db.tasks.find(function (t) { return t.id === taskId && t.userId === req.userId; });
    if (task) {
      var level = req.body.level ? parseInt(req.body.level) : 1;
      var day = req.body.day ? parseInt(req.body.day) : 1;
      db.records.push({
        id: nextId(), userId: req.userId, taskId: taskId, level: level, day: day,
        time: Date.now(), evidence: url
      });
      saveDB(db);
    }
  }

  return res.json({ code: 0, data: { url: url, taskId: taskId } });
});

// ===== SPA fallback =====
app.get('*', function (req, res) { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

app.listen(PORT, function () {
  console.log('冒险王国 H5 已启动: http://localhost:' + PORT);
});
