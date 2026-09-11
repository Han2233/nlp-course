/* ==========================================================================
   自然语言处理入门教程 —— 交互演示脚本
   原生 JavaScript，无任何外部依赖，离线可用。
   每个演示模块用 IIFE 包裹，彼此独立。
   ========================================================================== */

/* ============================================================
   通用工具函数
   ============================================================ */

// 限制数值范围
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// 格式化数字
const fmt = (v, d = 2) => Number(v).toFixed(d);

// HTML 转义：所有用到用户输入拼接 innerHTML 的地方都必须先转义，防止注入
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// 可复现的伪随机数生成器（固定种子：每次打开页面数据一致，方便对照）
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 准备高清 canvas（Retina 屏不模糊）
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

// 监听尺寸变化自动重绘
function watchSize(canvas, redraw) {
  new ResizeObserver(() => { setupCanvas(canvas); redraw(); }).observe(canvas);
}

/* ============================================================
   演示 1：文本预处理流水线
   分词 → 小写化 → 去停用词 → 词干提取，每一步都能单独开关
   ============================================================ */
(function () {
  const inputEl = document.getElementById('pp-input');
  const enBtn = document.getElementById('pp-en');
  const zhBtn = document.getElementById('pp-zh');
  const tokEl = document.getElementById('pp-tok');
  const lowerEl = document.getElementById('pp-lower');
  const stopEl = document.getElementById('pp-stop');
  const stemEl = document.getElementById('pp-stem');
  const outEl = document.getElementById('pp-output');
  const noteEl = document.getElementById('pp-note');

  const state = { lang: 'en' };

  // 英语停用词：高频但几乎不含语义（仅教学用的小集合）
  const EN_STOP = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'in', 'on', 'at', 'to',
    'of', 'for', 'and', 'or', 'but', 'with', 'by', 'from', 'it', 'this',
    'that', 'i', 'you', 'he', 'she', 'they', 'we',
  ]);
  // 中文停用词（教学小集合）
  const ZH_STOP = new Set(['的', '和', '了', '在', '中', '是', '很', '这', '那', '一']);

  // 中文词典：演示「词典最大匹配」分词。真实项目用 jieba（词库几十万）
  const ZH_DICT = new Set([
    '我们', '自然语言处理', '自然语言', '自然', '语言', '处理', '课程', '学习',
    '分词', '词向量', '词', '向量', '机器', '机器学习', '模型', '训练', '数据',
    '非常', '有趣', '今天', '天气', '很好', '适合', '公园', '跑步', '苹果',
    '好吃', '爱', '吃', '在', '的', '和',
  ]);

  // 英文分词：按连续字母切（真实分词器还会处理缩写、连字符等，这里只演示原理）
  function tokenizeEn(text) {
    return text.match(/[a-zA-Z]+/g) || [];
  }

  // 中文分词：正向最大匹配 FMM
  // 为什么贪心匹配最长词？中文里多数词确实越长越具体（如「自然语言处理」），
  // 这个简单策略在词典充分时效果不错，是理解「统计分词」的垫脚石。
  function fmm(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      let matched = '';
      for (let len = Math.min(6, text.length - i); len >= 1; len--) {
        const sub = text.slice(i, i + len);
        if (ZH_DICT.has(sub)) { matched = sub; break; }
      }
      tokens.push(matched || text[i]); // 词典没有的字按单字输出
      i += matched ? matched.length : 1;
    }
    return tokens;
  }

  // 简化版词干提取（Porter 词干器的教学版）：按规则砍后缀。
  // 顺序很重要：先处理长的（ing/ed），再处理短的（s/ly），否则 running 会先被砍成 runnings。
  function stemWord(w) {
    let s = w;
    const dedup = () => {
      // running → runn → run：去掉后缀后把双写辅音还原
      const last = s[s.length - 1];
      if (s.length > 2 && last === s[s.length - 2] && !'aeiou'.includes(last)) {
        s = s.slice(0, -1);
      }
    };
    if (s.length > 5 && s.endsWith('ing')) { s = s.slice(0, -3); dedup(); }
    else if (s.length > 4 && s.endsWith('ed')) { s = s.slice(0, -2); dedup(); }
    else if (s.length > 4 && s.endsWith('es')) { s = s.slice(0, -2); }
    else if (s.length > 3 && s.endsWith('s')) { s = s.slice(0, -1); }
    else if (s.length > 5 && s.endsWith('ly')) { s = s.slice(0, -2); }
    return s;
  }

  function render() {
    const raw = inputEl.value.trim();
    const isZh = state.lang === 'zh';
    const tokens = isZh ? fmm(raw) : tokenizeEn(raw);
    const lower = tokens.map((t) => t.toLowerCase());
    const stopSet = isZh ? ZH_STOP : EN_STOP;
    const kept = lower.filter((t) => !stopSet.has(t));
    const removed = lower.filter((t) => stopSet.has(t));
    const stemmed = kept.map((t) => (isZh ? t : stemWord(t)));

    const rows = [];
    rows.push({ label: '原始文本', chips: [{ t: raw || '（空）', cls: '' }] });
    if (tokEl.checked) {
      rows.push({ label: '分词', chips: tokens.map((t) => ({ t, cls: isZh ? 'zh' : '' })) });
    }
    if (lowerEl.checked) {
      rows.push({ label: '小写化', chips: lower.map((t) => ({ t, cls: isZh ? 'zh' : '' })) });
    }
    if (stopEl.checked) {
      // 被删的停用词用灰色删除线显示，让学生看到「丢了什么」
      rows.push({
        label: '去停用词',
        chips: kept.map((t) => ({ t, cls: isZh ? 'zh' : '' }))
          .concat(removed.map((t) => ({ t, cls: 'dim ' + (isZh ? 'zh' : '') }))),
      });
    }
    if (stemEl.checked) {
      rows.push({
        label: '词干提取',
        chips: stemmed.map((t) => ({ t, cls: isZh ? 'zh' : '' })),
      });
    }

    outEl.innerHTML = rows.map((r) =>
      '<div class="pp-row"><div class="pp-label">' + esc(r.label) + '</div>' +
      '<div class="pp-chips">' +
      r.chips.map((c) => '<span class="chip ' + c.cls + '">' + esc(c.t) + '</span>').join('') +
      '</div></div>'
    ).join('');

    let note = '';
    if (isZh) {
      note = '中文分词：词典最大匹配（内置 ' + ZH_DICT.size + ' 词的词典）。';
      if (stemEl.checked) note += '中文没有形态变化，词干提取不适用（已自动跳过）。';
    } else {
      note = '英文分词：按空格和标点切分。';
      if (stemEl.checked) note += '词干提取为简化版规则（砍 ing/ed/es/s/ly 后缀）。';
    }
    if (stopEl.checked && removed.length > 0) {
      note += ' 停用词过滤掉了 ' + removed.length + ' 个词：' + removed.join('、') + '。';
    }
    noteEl.textContent = note;
  }

  enBtn.addEventListener('click', () => {
    state.lang = 'en';
    enBtn.classList.add('on'); zhBtn.classList.remove('on');
    inputEl.value = 'The cats are running quickly through the park!';
    render();
  });
  zhBtn.addEventListener('click', () => {
    state.lang = 'zh';
    zhBtn.classList.add('on'); enBtn.classList.remove('on');
    inputEl.value = '我们在自然语言处理课程中学习分词和词向量';
    render();
  });
  inputEl.addEventListener('input', render);
  [tokEl, lowerEl, stopEl, stemEl].forEach((el) => el.addEventListener('change', render));
  render();
})();

/* ============================================================
   演示 2：TF-IDF 迷你搜索引擎
   4 篇文档 + 用户查询 → TF-IDF 向量 → 余弦相似度排名
   ============================================================ */
(function () {
  const inputEl = document.getElementById('srch-input');
  const btn = document.getElementById('srch-btn');
  const resultsEl = document.getElementById('srch-results');
  const idfEl = document.getElementById('srch-idf');

  // 语料：4 篇不同主题的小文档（预先分好词，避免演示里再跑一遍分词）
  const corpus = [
    { title: '体育', color: '#2563eb', tokens: '昨晚 进行 了 一场 激烈 的 足球 比赛 主队 在 最后 时刻 进球 获得 胜利'.split(' ') },
    { title: '科技', color: '#0e7490', tokens: '苹果 发布 了 新款 手机 搭载 人工智能 芯片 性能 提升 显著 手机 市场 竞争 更加 激烈'.split(' ') },
    { title: '美食', color: '#d97706', tokens: '这家 餐厅 的 招牌 菜 是 红烧 牛肉 面 口感 浓郁 深受 食客 喜爱 昨晚 排队 的 人 很多'.split(' ') },
    { title: '财经', color: '#16a34a', tokens: '央行 宣布 下调 存款 准备金 率 市场 普遍 认为 这 将 提振 股市 信心 昨晚 美股 上涨'.split(' ') },
  ];

  // 构建词典与统计量：df（多少篇文档包含该词）、idf（稀缺度权重）
  const vocab = new Set();
  corpus.forEach((d) => d.tokens.forEach((t) => vocab.add(t)));
  const df = new Map(), idf = new Map();
  vocab.forEach((w) => {
    const n = corpus.filter((d) => d.tokens.includes(w)).length;
    df.set(w, n);
    // 分母 +1 防止词出现在所有文档时 log(0)
    idf.set(w, Math.log(corpus.length / (1 + n)));
  });

  // 每篇文档的 TF-IDF 向量（归一化，方便余弦相似度直接点积）
  const docVecs = corpus.map((d) => {
    const total = d.tokens.length;
    const tf = {};
    d.tokens.forEach((t) => { tf[t] = (tf[t] || 0) + 1 / total; });
    const vec = {};
    let norm = 0;
    vocab.forEach((w) => {
      if (tf[w]) { vec[w] = tf[w] * idf.get(w); norm += vec[w] ** 2; }
    });
    norm = Math.sqrt(norm) || 1;
    Object.keys(vec).forEach((w) => { vec[w] /= norm; });
    return vec;
  });

  // 查询分词：优先空格切分；连续中文用词典贪心最大匹配
  function tokenizeQuery(q) {
    const out = [];
    for (const piece of q.trim().split(/\s+/)) {
      if (!piece) continue;
      if (vocab.has(piece)) { out.push(piece); continue; }
      let i = 0;
      while (i < piece.length) {
        let matched = '';
        for (let len = Math.min(5, piece.length - i); len >= 1; len--) {
          const sub = piece.slice(i, i + len);
          if (vocab.has(sub)) { matched = sub; break; }
        }
        if (matched) out.push(matched);
        i += matched ? matched.length : 1;
      }
    }
    return out;
  }

  function search() {
    const q = inputEl.value.trim();
    if (!q) {
      resultsEl.innerHTML = '<p class="pp-note">请输入查询，例如「昨晚 比赛」或「苹果手机 芯片」</p>';
      idfEl.innerHTML = '输入查询后，这里会显示查询词的 IDF 值（越稀缺的词权重越高）';
      return;
    }
    const terms = tokenizeQuery(q);
    if (terms.length === 0) {
      resultsEl.innerHTML = '<p class="pp-note">查询词不在词典中（词典共 ' + vocab.size + ' 个词）。试试：足球 / 手机 / 牛肉面 / 股市</p>';
      return;
    }

    // 查询向量：词频 × IDF，归一化
    const tf = {};
    terms.forEach((t) => { tf[t] = (tf[t] || 0) + 1; });
    const qv = {};
    let qn = 0;
    Object.keys(tf).forEach((t) => {
      qv[t] = (tf[t] / terms.length) * idf.get(t);
      qn += qv[t] ** 2;
    });
    qn = Math.sqrt(qn) || 1;
    Object.keys(qv).forEach((t) => { qv[t] /= qn; });

    // 余弦相似度（向量已归一化 → 直接点积）
    const scored = corpus.map((d, i) => {
      const vec = docVecs[i];
      let sim = 0;
      Object.keys(qv).forEach((t) => { sim += (qv[t] || 0) * (vec[t] || 0); });
      return { d, i, sim };
    }).sort((a, b) => b.sim - a.sim);

    // 结果列表：排名 + 相似度条 + 摘要；点击展开该文档的 Top-5 关键词
    resultsEl.innerHTML = scored.map((s, rank) => {
      const top = topTerms(s.i);
      return '<div class="rank-item">' +
        '<div class="head">' +
        '<span class="rank-no">' + (rank + 1) + '</span>' +
        '<span class="tag-doc" style="background:' + s.d.color + '">' + esc(s.d.title) + '</span>' +
        '<span class="score">相似度 ' + fmt(s.sim, 3) + '</span>' +
        '</div>' +
        '<div class="sim-track"><div class="sim-fill" style="width:' +
          fmt(Math.max(0, s.sim) * 100, 1) + '%"></div></div>' +
        '<p class="snippet">' + esc(s.d.tokens.join(' ')) + '</p>' +
        '<button class="btn" data-idx="' + s.i + '">查看该文档 Top-5 关键词</button>' +
        '<div class="term-bars" id="tb-' + s.i + '" style="display:none">' + top + '</div>' +
        '</div>';
    }).join('');

    // 让每个「查看关键词」按钮可点击（用事件委托更省内存）
    resultsEl.querySelectorAll('button[data-idx]').forEach((b) => {
      b.addEventListener('click', () => {
        const box = document.getElementById('tb-' + b.dataset.idx);
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      });
    });

    // IDF 讲解：让学生看到「激烈」和「的」的权重差别
    idfEl.innerHTML = '查询词的 IDF（文档总数 N=4）：　' + terms.map((t) =>
      '「<b>' + esc(t) + '</b>」出现在 ' + df.get(t) + ' 篇文档 → IDF = <b>' + fmt(idf.get(t), 3) + '</b>'
    ).join('；　') + '。出现在越少文档里的词，权重越大。';
  }

  // 某文档 TF-IDF 权重最高的 5 个词（横向条形图）
  function topTerms(idx) {
    const vec = docVecs[idx];
    const entries = Object.keys(vec).sort((a, b) => vec[b] - vec[a]).slice(0, 5);
    const max = vec[entries[0]] || 1;
    return entries.map((w) =>
      '<div class="tbar"><span class="tname">' + esc(w) + '</span>' +
      '<span class="ttrack"><span class="tfill" style="width:' + fmt(vec[w] / max * 100, 1) + '%"></span></span>' +
      '<span class="tval">' + fmt(vec[w], 3) + '</span></div>'
    ).join('');
  }

  btn.addEventListener('click', search);
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
})();

/* ============================================================
   演示 3：朴素贝叶斯垃圾邮件分类器
   8 条小语料训练 → 用户输入 → log 空间逐步计算后验概率
   ============================================================ */
(function () {
  const inputEl = document.getElementById('nb-input');
  const btn = document.getElementById('nb-btn');
  const showBtn = document.getElementById('nb-show');
  const verdictEl = document.getElementById('nb-verdict');
  const stepsEl = document.getElementById('nb-steps');
  const corpusEl = document.getElementById('nb-corpus');

  // 训练语料：垃圾邮件常用词（免费/中奖/点击）与正常邮件用词明显不同，
  // 这样演示效果一目了然
  const corpus = [
    { cls: 'spam', words: '恭喜 您 获得 免费 大奖 点击 链接 领取'.split(' ') },
    { cls: 'spam', words: '限时 优惠 免费 点击 立即 参与 抽奖'.split(' ') },
    { cls: 'spam', words: '免费 赠送 手机 点击 链接 抢购'.split(' ') },
    { cls: 'spam', words: '中奖 通知 您的 手机 号 获得 免费 大奖'.split(' ') },
    { cls: 'ham', words: '明天 下午 三点 开会 请 准时 参加'.split(' ') },
    { cls: 'ham', words: '晚上 一起 吃饭 吗 我 请客'.split(' ') },
    { cls: 'ham', words: '周末 去 爬山 吧 天气 不错'.split(' ') },
    { cls: 'ham', words: '请 把 会议 纪要 发 给 我 谢谢'.split(' ') },
  ];

  // 统计：词表、每类总词数、每类中每个词的出现次数
  const vocab = new Set();
  corpus.forEach((m) => m.words.forEach((w) => vocab.add(w)));
  const V = vocab.size;
  const total = { spam: 0, ham: 0 };
  const count = { spam: {}, ham: {} };
  corpus.forEach((m) => {
    m.words.forEach((w) => {
      total[m.cls]++;
      count[m.cls][w] = (count[m.cls][w] || 0) + 1;
    });
  });

  // 拉普拉斯平滑后的条件概率：P(w|cls) = (count+1)/(total+V)
  // 为什么 +V？保证所有词的概率加起来恰好等于 1
  function pWord(w, cls) {
    return ((count[cls][w] || 0) + 1) / (total[cls] + V);
  }

  // 输入分词：空格优先，连续中文做词典贪心匹配；词典外的字归入「未登录词」
  function tokenize(text) {
    const out = [];
    for (const piece of text.trim().split(/\s+/)) {
      if (!piece) continue;
      if (vocab.has(piece)) { out.push(piece); continue; }
      let i = 0;
      while (i < piece.length) {
        let matched = '';
        for (let len = Math.min(4, piece.length - i); len >= 1; len--) {
          const sub = piece.slice(i, i + len);
          if (vocab.has(sub)) { matched = sub; break; }
        }
        out.push(matched || piece[i]);
        i += matched ? matched.length : 1;
      }
    }
    return out;
  }

  function classify() {
    const words = tokenize(inputEl.value);
    if (words.length === 0) {
      verdictEl.innerHTML = '<p class="pp-note">请输入文本</p>';
      stepsEl.innerHTML = '';
      return;
    }

    // 先验概率：两类各 4 条，各 0.5
    const priorSpam = 4 / 8, priorHam = 4 / 8;
    // 在 log 空间累加，避免几百个小数连乘下溢成 0
    let logS = Math.log(priorSpam), logH = Math.log(priorHam);

    const rows = words.map((w) => {
      const ps = pWord(w, 'spam'), ph = pWord(w, 'ham');
      logS += Math.log(ps);
      logH += Math.log(ph);
      const known = vocab.has(w);
      return '<tr><td>' + esc(w) + (known ? '' : ' <span style="color:#94a3b8;font-size:12px">(未登录词)</span>') + '</td>' +
        '<td>' + (count.spam[w] || 0) + '</td><td>' + (count.ham[w] || 0) + '</td>' +
        '<td>' + fmt(ps, 3) + '</td><td>' + fmt(ph, 3) + '</td></tr>';
    }).join('');

    // 把 log 概率变回概率（softmax 归一化）
    const eS = Math.exp(logS), eH = Math.exp(logH);
    const pSpam = eS / (eS + eH), pHam = 1 - pSpam;
    const isSpam = pSpam > 0.5;

    stepsEl.innerHTML =
      '<p style="margin:8px 0 4px"><b>逐步计算（log 空间）</b>　log P(垃圾) = log(0.5) = ' + fmt(Math.log(priorSpam), 2) +
      '，log P(正常) = log(0.5) = ' + fmt(Math.log(priorHam), 2) + '</p>' +
      '<table class="tb nb-table"><tr><th>词</th><th>垃圾中次数</th><th>正常中次数</th><th>P(w|垃圾)</th><th>P(w|正常)</th></tr>' +
      rows + '</table>' +
      '<div class="nb-steps">log P(垃圾) + Σ log P(w|垃圾) = <b>' + fmt(logS, 2) + '</b><br>' +
      'log P(正常) + Σ log P(w|正常) = <b>' + fmt(logH, 2) + '</b><br>' +
      '后验概率 P(垃圾|文本) = e^' + fmt(logS, 2) + ' / (e^' + fmt(logS, 2) + ' + e^' + fmt(logH, 2) + ') = <b>' + fmt(pSpam, 3) + '</b></div>';

    // 概率条：红 = 垃圾邮件概率，绿 = 正常邮件概率
    verdictEl.innerHTML =
      '<div class="nb-verdict">' +
      '<div class="prob-track">' +
      '<div class="prob-spam" style="width:' + fmt(pSpam * 100, 1) + '%">' + (pSpam > 0.04 ? '垃圾 ' + fmt(pSpam * 100, 1) + '%' : '') + '</div>' +
      '<div class="prob-ham" style="width:' + fmt(pHam * 100, 1) + '%">' + (pHam > 0.04 ? '正常 ' + fmt(pHam * 100, 1) + '%' : '') + '</div>' +
      '</div>' +
      '<b style="color:' + (isSpam ? '#dc2626' : '#16a34a') + '">判定：' + (isSpam ? '垃圾邮件' : '正常邮件') + '</b>' +
      '</div>';
  }

  // 展开/收起训练语料
  let corpusVisible = false;
  showBtn.addEventListener('click', () => {
    corpusVisible = !corpusVisible;
    corpusEl.style.display = corpusVisible ? 'block' : 'none';
    if (corpusVisible) {
      corpusEl.innerHTML = '<b>训练语料（8 条）：</b><br>' + corpus.map((m) =>
        '<span style="color:' + (m.cls === 'spam' ? '#dc2626' : '#16a34a') + '">[' +
        (m.cls === 'spam' ? '垃圾' : '正常') + ']</span> ' + esc(m.words.join(' '))
      ).join('<br>');
    }
  });

  btn.addEventListener('click', classify);
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') classify(); });
  classify();
})();

/* ============================================================
   演示 4+：Bigram 计数工厂
   3 句迷你语料：点击词 → 高亮「上一个词位置」与后继词 → 计数表 → 概率
   ============================================================ */
(function () {
  const toksEl = document.getElementById('ngf-toks');
  const corpusEl = document.getElementById('ngf-corpus');
  const tableEl = document.getElementById('ngf-table');
  const infoEl = document.getElementById('ngf-info');

  // 3 句迷你语料，与正文 5.1 的手算例子完全一致
  const CORPUS = [
    ['我', '爱', '吃', '苹果'],
    ['我', '爱', '学习'],
    ['他', '爱', '吃', '西瓜'],
  ];
  const VOCAB = ['我', '爱', '吃', '苹果', '学习', '他', '西瓜'];
  const V = VOCAB.length;

  let sel = '爱';

  function render() {
    // 词条按钮
    toksEl.innerHTML = VOCAB.map((w) =>
      '<button class="btn' + (w === sel ? ' on' : '') + '" data-w="' + w + '">' + w + '</button>'
    ).join('');

    // 语料展示：黄色 = 作为「上一个词」的位置；绿色 = 它的后继词
    corpusEl.innerHTML = '<h4 style="margin:12px 0 6px">语料（黄 = 上一个词「' + esc(sel) + '」，绿 = 它右边的后继词）</h4>' +
      CORPUS.map((sent, si) =>
        '<div class="sent-line">' +
        sent.map((w, wi) => {
          const isPrev = w === sel && wi < sent.length - 1;   // 必须是句中的位置（后面还有词）
          const isSucc = isPrev;                               // 后继词由下一行判断
          const isSuccWord = wi > 0 && sent[wi - 1] === sel;
          let cls = 'chip zh';
          if (isPrev) cls += ' hl';
          if (isSuccWord) cls += ' succ';
          return '<span class="' + cls + '">' + esc(w) + '</span> ';
        }).join('') + '</div>'
      ).join('');

    // 计数：只在「后面还有词」的位置统计（这才是 bigram 的「上一个词」）
    let total = 0;
    const succCount = {};
    CORPUS.forEach((sent) => {
      sent.forEach((w, i) => {
        if (w === sel && i < sent.length - 1) {
          total++;
          const s = sent[i + 1];
          succCount[s] = (succCount[s] || 0) + 1;
        }
      });
    });
    const succs = Object.keys(succCount).sort((a, b) => succCount[b] - succCount[a]);

    // 计数表 + 加一平滑概率
    let rows = '';
    succs.forEach((s) => {
      const c = succCount[s];
      const p = (c + 1) / (total + V);
      rows += '<tr><td>' + esc(s) + '</td><td>' + c + '</td><td>' +
        'P(' + esc(s) + '|' + esc(sel) + ') = (' + c + '+1)/(' + total + '+' + V + ') = <b>' + fmt(p, 3) + '</b></td></tr>';
    });
    // 没出现过的后继词（平滑后概率 = 1/(total+V)）
    const unseen = VOCAB.filter((w) => w !== sel && !(w in succCount));
    if (unseen.length > 0) {
      const p = 1 / (total + V);
      rows += '<tr><td style="color:var(--ink-faint)">' + unseen.map(esc).join('、') + '（未出现）</td><td>0</td><td>' +
        'P(·|' + esc(sel) + ') = (0+1)/(' + total + '+' + V + ') = <b>' + fmt(p, 3) + '</b></td></tr>';
    }

    tableEl.innerHTML = '<h4 style="margin:12px 0 6px">计数与概率表</h4>' +
      '<table class="tb" style="font-size:14px"><tr><th>后继词</th><th>出现次数</th><th>加一平滑后的概率</th></tr>' + rows + '</table>';

    infoEl.innerHTML =
      '「<b>' + esc(sel) + '</b>」作为上一个词共出现 <b>' + total + '</b> 次' +
      (total === 0 ? '——它从未出现在句中位置（都在句尾），所以所有后继词的概率都靠平滑给出 1/' + V + ' ≈ ' + fmt(1 / V, 3) + '，这就是数据稀疏。' : '。') +
      (total > 0 ? '　词典大小 V = ' + V + '。<br>例：P(吃|' + esc(sel) + ') = (count(' + esc(sel) + ',吃)+1)/(count(' + esc(sel) + ')+V) = ' +
        '(' + (succCount['吃'] || 0) + '+1)/(' + total + '+' + V + ') = <b>' + fmt(((succCount['吃'] || 0) + 1) / (total + V), 3) + '</b>' : '');
  }

  toksEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-w]');
    if (!b) return;
    sel = b.dataset.w;
    render();
  });
  render();
})();

/* ============================================================
   演示 4：Bigram 语言模型
   小语料统计二元组合 → 预测下一个词 / 随机生成 / 困惑度
   ============================================================ */
(function () {
  const inputEl = document.getElementById('ng-prefix');
  const predBtn = document.getElementById('ng-predict');
  const genBtn = document.getElementById('ng-gen');
  const predEl = document.getElementById('ng-pred');
  const genEl = document.getElementById('ng-genout');
  const infoEl = document.getElementById('ng-info');

  // 语料（已分词，空格分隔）。刻意选短句：生成的句子会「不像人话」，
  // 正好说明语言模型的本质 = 语料的统计浓缩，语料小 → 能力小
  const corpus = [
    '我 爱 吃 苹果'.split(' '),
    '我 爱 吃 香蕉'.split(' '),
    '我 爱 机器 学习'.split(' '),
    '机器 学习 很 有趣'.split(' '),
    '我 每天 都 学习 机器 学习'.split(' '),
    '他 爱 吃 西瓜'.split(' '),
    '他们 在 公园 里 跑步'.split(' '),
    '公园 里 有 很多 人'.split(' '),
    '学习 使 人 进步'.split(' '),
    '我 爱 学习 和 跑步'.split(' '),
  ];

  const BOS = '<s>';  // 句首虚拟词：让第一个词也有「上一个词」

  // 统计一元/二元计数
  const uni = {}, bi = {};
  corpus.forEach((s) => {
    s.forEach((w, i) => {
      uni[w] = (uni[w] || 0) + 1;
      const prev = i === 0 ? BOS : s[i - 1];
      const key = prev + ' ' + w;
      bi[key] = (bi[key] || 0) + 1;
    });
  });
  uni[BOS] = corpus.length;
  const vocab = new Set(Object.keys(uni));
  const V = vocab.size;

  // 加一平滑后的条件概率：P(w|prev) = (count(prev,w)+1) / (count(prev)+V)
  function pNext(prev, w) {
    const b = bi[prev + ' ' + w] || 0;
    return (b + 1) / ((uni[prev] || 0) + V);
  }

  // 某个词之后的所有候选词的概率分布（按概率降序）
  function distribution(prev) {
    const list = [];
    vocab.forEach((w) => { if (w !== BOS) list.push({ w, p: pNext(prev, w) }); });
    return list.sort((a, b) => b.p - a.p);
  }

  function predict() {
    const prev = inputEl.value.trim().split(/\s+/).pop() || BOS;
    const dist = distribution(prev);
    const top = dist.slice(0, 5);
    predEl.innerHTML =
      '<p style="margin:10px 0 4px"><b>「' + esc(prev) + '」后面最可能的词（加一平滑）：</b></p>' +
      top.map((d) =>
        '<div class="ngram-item"><span class="w">' + esc(d.w) + '</span>' +
        '<span class="track"><span class="fill" style="width:' + fmt(d.p / top[0].p * 100, 1) + '%"></span></span>' +
        '<span class="p">' + fmt(d.p, 3) + '</span></div>'
      ).join('') +
      '<p class="pp-note" style="margin-top:8px">示例计算：P(' + esc(top[0].w) + ' | ' + esc(prev) + ') = (' +
      (bi[prev + ' ' + top[0].w] || 0) + ' + 1) / (' + (uni[prev] || 0) + ' + ' + V + ') = ' +
      fmt(top[0].p, 3) + '。＋1 是拉普拉斯平滑，＋V 保证概率和为 1。</p>';
  }

  // 随机生成：按概率轮盘抽样逐个续写。每次都不同——这就是「创造性」的来源
  function generate() {
    const first = inputEl.value.trim().split(/\s+/).pop() || null;
    const start = first && vocab.has(first) ? first : Array.from(vocab).filter((w) => w !== BOS)[Math.floor(Math.random() * (V - 1))];
    const seq = [start];
    let prev = start;
    for (let i = 0; i < 9; i++) {
      const dist = distribution(prev);
      // 轮盘抽样：按概率随机选（而非总选最大概率的），生成才有多样性
      let r = Math.random(), acc = 0, chosen = dist[dist.length - 1].w;
      for (const d of dist) {
        acc += d.p;
        if (r <= acc) { chosen = d.w; break; }
      }
      seq.push(chosen);
      prev = chosen;
    }
    genEl.innerHTML = seq.map((w) => '<span class="w">' + esc(w) + '</span>').join('');
    showPerplexity();
  }

  // 困惑度：模型对语料里每个词的平均「惊讶程度」。用训练语料本身评估
  // （严格说应该用没见过的测试语料，这里为了简单直接演示计算方法）
  function showPerplexity() {
    let sumLog = 0, N = 0;
    corpus.forEach((s) => {
      s.forEach((w, i) => {
        const prev = i === 0 ? BOS : s[i - 1];
        sumLog += Math.log2(pNext(prev, w));
        N++;
      });
    });
    const ppl = Math.pow(2, -sumLog / N);
    infoEl.innerHTML =
      '语料：' + corpus.length + ' 句 / ' + N + ' 词，词典 V = ' + V + '。<br>' +
      '困惑度 PPL = 2^(−Σ log₂ P(w|前词) / N) = <b>' + fmt(ppl, 1) + '</b>。' +
      '含义：平均每个词像是在 ' + fmt(ppl, 0) + ' 个候选里猜。语料越大、主题越一致，PPL 越低。';
  }

  predBtn.addEventListener('click', predict);
  genBtn.addEventListener('click', generate);
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') predict(); });
  predict();
  showPerplexity();
})();

/* ============================================================
   演示 5：词向量空间可视化
   真实词向量是几百维的，这里用精心布局的 2D 坐标示意其结构：
   同类词聚在一起，且「国王−男人+女人≈王后」的类比在几何上成立
   ============================================================ */
(function () {
  const canvas = document.getElementById('wv-canvas');
  const pairsEl = document.getElementById('wv-pairs');
  const infoEl = document.getElementById('wv-info');
  const legendEl = document.getElementById('wv-legend');

  // 词表（名称 + 2D 坐标）。坐标刻意设计成：类比向量在几何上成立
  const CATS = [
    { name: '动物', color: '#0d9488', words: [['猫', 2.8, 1.0], ['狗', 3.4, 0.4], ['老虎', 2.2, 0.3], ['兔子', 3.1, 1.7], ['大象', 2.0, 1.9], ['狮子', 2.9, -0.5]] },
    { name: '水果美食', color: '#d97706', words: [['苹果', -2.8, -0.6], ['香蕉', -2.2, -1.2], ['西瓜', -3.4, -1.4], ['牛肉', -2.6, -1.9], ['蛋糕', -3.2, -2.2], ['葡萄', -3.8, -0.9]] },
    { name: '城市', color: '#8b5cf6', words: [['北京', 4.8, 3.4], ['上海', 5.4, 3.0], ['东京', 5.2, 3.9], ['伦敦', 4.4, 3.7], ['巴黎', 4.6, 4.3], ['纽约', 4.0, 4.0]] },
    { name: '人物', color: '#ef4444', words: [['国王', -4.6, 4.2], ['王后', -5.0, 3.6], ['男人', -3.8, 4.4], ['女人', -4.2, 3.8], ['孩子', -4.0, 5.0], ['医生', -3.4, 4.1]] },
    { name: '动作', color: '#2563eb', words: [['跑步', 1.4, -2.0], ['游泳', 1.0, -2.7], ['散步', 1.9, -2.6], ['跳舞', 0.5, -2.2], ['阅读', 0.4, -1.6]] },
    { name: '科技', color: '#db2777', words: [['计算机', 0.2, 1.2], ['手机', -0.2, 1.7], ['机器人', 0.7, 0.9], ['芯片', -0.8, 1.4], ['程序', 0.3, 0.4], ['网络', -0.6, 0.6]] },
    { name: '自然', color: '#16a34a', words: [['太阳', 5.0, -2.0], ['月亮', 4.4, -2.5], ['星星', 5.6, -2.7], ['河流', 4.2, -1.4], ['山', 3.6, -1.1], ['雨', 5.0, -1.2]] },
  ];
  const words = [];
  CATS.forEach((c) => c.words.forEach(([n, x, y]) => words.push({ name: n, x, y, color: c.color })));
  const byName = {};
  words.forEach((w) => { byName[w.name] = w; });

  // 四个可选的类比对
  const PAIRS = [['国王', '王后'], ['北京', '上海'], ['猫', '狗'], ['跑步', '游泳']];
  let pairIdx = 0;
  let clicked = null;  // 最近点击的词

  const VIEW = { x0: -6, x1: 6, y0: -5.5, y1: 5.5 };

  function cosSim(a, b) {
    // 2D 向量余弦相似度（等价于归一化后点积）
    const na = Math.hypot(a.x, a.y) || 1, nb = Math.hypot(b.x, b.y) || 1;
    return (a.x * b.x + a.y * b.y) / (na * nb);
  }
  function nearest(word, exclude, k) {
    return words
      .filter((w) => w !== word && w !== exclude)
      .map((w) => ({ w, s: cosSim(word, w) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, k);
  }

  function draw() {
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const px = (x) => (w / 2) + (x / (VIEW.x1 - VIEW.x0)) * (w - 120);
    const py = (y) => (h / 2) - (y / (VIEW.y1 - VIEW.y0)) * (h - 56);

    const pair = PAIRS[pairIdx];
    const A = byName[pair[0]], B = byName[pair[1]];
    // 类比结果 D = C + (B − A)（C 为最近点击的词）
    let C = null, D = null, Dword = null;
    if (clicked) {
      C = byName[clicked];
      const dx = B.x - A.x, dy = B.y - A.y;
      const dxn = C.x + dx, dyn = C.y + dy;
      // 找到离 (dxn, dyn) 最近的词
      let best = null, bs = -Infinity;
      words.forEach((w2) => {
        if (w2 === C) return;
        const s = cosSim({ x: dxn, y: dyn }, w2);
        if (s > bs) { bs = s; best = w2; }
      });
      D = { x: dxn, y: dyn };
      Dword = best;
    }

    // 类比平行四边形（画在最底层）
    if (C && D) {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(px(A.x), py(A.y)); ctx.lineTo(px(C.x), py(C.y));
      ctx.moveTo(px(B.x), py(B.y)); ctx.lineTo(px(D.x), py(D.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#0f766e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px(A.x), py(A.y)); ctx.lineTo(px(B.x), py(B.y));
      ctx.moveTo(px(C.x), py(C.y)); ctx.lineTo(px(D.x), py(D.y));
      ctx.stroke();
      // D 的目标点（可能不是词本身，画空心圆）
      ctx.strokeStyle = '#0f766e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px(D.x), py(D.y), 8, 0, Math.PI * 2); ctx.stroke();
    }

    // 被选中词的近邻连线
    if (clicked) {
      const sel = byName[clicked];
      nearest(sel, null, 5).forEach((n, i) => {
        ctx.strokeStyle = 'rgba(13, 148, 136, ' + (0.55 - i * 0.1) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(px(sel.x), py(sel.y));
        ctx.lineTo(px(n.w.x), py(n.w.y));
        ctx.stroke();
      });
    }

    // 词点 + 标签
    words.forEach((w2) => {
      const isA = w2 === A, isB = w2 === B, isC = w2 === C, isD = w2 === Dword;
      const isSel = clicked === w2.name;
      const r = isSel || isD ? 8 : (isA || isB || isC ? 7 : 5);
      ctx.fillStyle = w2.color;
      ctx.beginPath(); ctx.arc(px(w2.x), py(w2.y), r, 0, Math.PI * 2); ctx.fill();
      if (isSel || isD) {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = '#334155';
      ctx.font = (isSel || isD ? 'bold ' : '') + '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(w2.name, px(w2.x), py(w2.y) + r + 2);
    });
  }

  function updateInfo() {
    if (!clicked) {
      infoEl.innerHTML = '点击左侧画布上的任意词：显示它的最近邻；再结合右侧的「类比对」观察向量算术。';
      return;
    }
    const pair = PAIRS[pairIdx];
    const A = byName[pair[0]], B = byName[pair[1]];
    const C = byName[clicked];
    const dx = B.x - A.x, dy = B.y - A.y;
    const D = { x: C.x + dx, y: C.y + dy };
    const Dword = nearest(D, C, 1)[0];
    const nbs = nearest(C, null, 5).map((n) => n.w.name + '(' + fmt(n.s, 2) + ')').join('，');

    infoEl.innerHTML =
      '<b>' + esc(C.name) + '</b> 的最近邻：' + nbs + '。<br><br>' +
      '类比对：' + esc(A.name) + ' → ' + esc(B.name) +
      '，方向向量 B−A = (' + fmt(dx, 1) + ', ' + fmt(dy, 1) + ')。<br>' +
      'C + (B − A) = ' + esc(C.name) + ' + (' + fmt(dx, 1) + ', ' + fmt(dy, 1) + ') = (' +
      fmt(D.x, 1) + ', ' + fmt(D.y, 1) + ') → 最接近的词：<b>' + esc(Dword.w.name) + '</b>（余弦相似度 ' +
      fmt(Dword.s, 2) + '）。<br><br>' +
      '<span style="color:#0f766e">这就是「国王 − 男人 + 女人 ≈ 王后」的原理：语义关系在向量空间里就是方向。</span>';
  }

  // 画布点击：找到 24px 内最近的词
  canvas.addEventListener('click', (e) => {
    const { w, h } = setupCanvas(canvas);
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const px = (x) => (w / 2) + (x / (VIEW.x1 - VIEW.x0)) * (w - 120);
    const py = (y) => (h / 2) - (y / (VIEW.y1 - VIEW.y0)) * (h - 56);
    let best = null, bd = 24;
    words.forEach((w2) => {
      const d = Math.hypot(px(w2.x) - mx, py(w2.y) - my);
      if (d < bd) { bd = d; best = w2; }
    });
    if (best) {
      clicked = best.name;
      draw();
      updateInfo();
    }
  });

  // 类比对切换
  pairsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-pair]');
    if (!btn) return;
    pairIdx = parseInt(btn.dataset.pair, 10);
    pairsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    draw();
    updateInfo();
  });

  // 图例
  legendEl.innerHTML = CATS.map((c) =>
    '<span><span class="sw" style="background:' + c.color + '"></span>' + c.name + '</span>'
  ).join('');

  watchSize(canvas, draw);
  draw();
  updateInfo();
})();

/* ============================================================
   演示 6：注意力矩阵
   "The cat sat on the mat" → 「猫 坐 在 垫子 上」
   点击任意目标词，看它对每个源词的注意力权重（Softmax 后）
   ============================================================ */
(function () {
  const gridEl = document.getElementById('att-grid');
  const infoEl = document.getElementById('att-info');

  const SRC = ['The', 'cat', 'sat', 'on', 'the', 'mat'];
  const TGT = ['猫', '坐', '在', '垫子', '上'];

  // 相似度分数 s = Q·Kᵀ 的结果（手工设计：猫↔cat、坐↔sat 等强对齐；
  // 真实模型里这些分数由词向量点积自动算出）
  const SCORES = [
    [0.2, 4.0, 0.6, 0.1, 0.1, 0.3],
    [0.1, 0.5, 3.8, 0.4, 0.1, 0.2],
    [0.1, 0.2, 0.5, 3.6, 0.2, 0.3],
    [0.1, 0.3, 0.2, 0.3, 0.2, 3.9],
    [0.1, 0.2, 0.2, 3.2, 0.1, 0.4],
  ];
  const D = 4;             // 演示用的 d_k
  const scale = Math.sqrt(D);  // 缩放因子 √d_k

  // 每个目标词（行）的注意力权重：softmax(s / √d)
  const WEIGHTS = SCORES.map((row) => {
    const scaled = row.map((s) => s / scale);
    const exps = scaled.map((v) => Math.exp(v));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sum);
  });

  let selRow = 1;

  function render() {
    // 表头：空角 + 源词
    let html = '<table class="att"><tr><th></th>' +
      SRC.map((s) => '<th>' + esc(s) + '</th>').join('') + '</tr>';
    // 每个目标词一行
    TGT.forEach((t, i) => {
      html += '<tr><td class="rowlab">' + esc(t) + '</td>' +
        SRC.map((_, j) => {
          const wgt = WEIGHTS[i][j];
          const alpha = wgt / Math.max(...WEIGHTS[i]);
          const bg = 'rgba(13, 148, 136, ' + fmt(alpha * 0.8, 2) + ')';
          const fg = alpha > 0.55 ? '#ffffff' : '#0f766e';
          return '<td data-row="' + i + '" data-col="' + j + '" style="background:' + bg + ';color:' + fg + '"' +
            (i === selRow ? ' class="sel"' : '') + '>' + fmt(wgt * 100, 0) + '%</td>';
        }).join('') + '</tr>';
    });
    html += '</table>';
    gridEl.innerHTML = html;
    showCalc(selRow);
  }

  function showCalc(i) {
    const row = SCORES[i];
    const scaled = row.map((s) => s / scale);
    const exps = scaled.map((v) => Math.exp(v));
    const sum = exps.reduce((a, b) => a + b, 0);
    const maxJ = WEIGHTS[i].indexOf(Math.max(...WEIGHTS[i]));
    infoEl.innerHTML =
      '<b>目标词「' + esc(TGT[i]) + '」的注意力计算：</b>' +
      '分数 s = [' + row.map((v) => fmt(v, 1)).join(', ') + ']；' +
      '除以 &#8730;d（d=' + D + '，&#8730;d=' + fmt(scale, 1) + '）→ [' + scaled.map((v) => fmt(v, 2)).join(', ') + ']；' +
      'Softmax 归一化 → 权重 [' + WEIGHTS[i].map((v) => fmt(v, 2)).join(', ') + ']。<br>' +
      '权重最高的是源词 <b>' + esc(SRC[maxJ]) + '</b>（' + fmt(WEIGHTS[i][maxJ] * 100, 0) + '%）——翻译「' +
      esc(TGT[i]) + '」时，模型主要在「看」这个词的位置。';
  }

  // 事件委托：点表格任意单元格 = 选择该行
  gridEl.addEventListener('click', (e) => {
    const td = e.target.closest('td[data-row]');
    if (!td) return;
    selRow = parseInt(td.dataset.row, 10);
    render();
  });

  render();
})();

/* ============================================================
   演示 7：BERT 完形填空实验室（MLM 教学模拟）
   选句 → 展示 [MASK] 输入形式 → 模拟预测 top3
   ============================================================ */
(function () {
  const toksEl = document.getElementById('mlm-toks');
  const goBtn = document.getElementById('mlm-go');
  const outEl = document.getElementById('mlm-out');
  const infoEl = document.getElementById('mlm-info');

  // 预置例句：maskIdx = 被挖词在句子中的位置
  const ITEMS = [
    { sent: '今天 天气 很 好 我们 去 公园 野餐', maskIdx: 3, ans: '好', top: [['好', 0.62], ['不错', 0.21], ['冷', 0.05]] },
    { sent: '他 把 钥匙 忘 在 家 了', maskIdx: 5, ans: '家', top: [['家', 0.48], ['办公室', 0.27], ['车上', 0.11]] },
    { sent: '机器 学习 是 一门 研究 如何 让 计算机 自动 学习 的 科学', maskIdx: 9, ans: '学习', top: [['学习', 0.55], ['改进', 0.18], ['工作', 0.08]] },
    { sent: '手机 没电 了 我 到处 找 充电器', maskIdx: 7, ans: '充电器', top: [['充电器', 0.58], ['插座', 0.19], ['数据线', 0.09]] },
  ];

  let sel = 0;

  function renderToks() {
    toksEl.innerHTML = ITEMS.map((it, i) =>
      '<button class="btn' + (i === sel ? ' on' : '') + '" data-i="' + i + '">句子 ' + (i + 1) + '</button>'
    ).join('');
    outEl.innerHTML = '';
    infoEl.innerHTML = '选一句（或点已选中的句子换一句），然后点「让 BERT 填空」。';
  }

  toksEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    sel = parseInt(b.dataset.i, 10);
    renderToks();
  });

  goBtn.addEventListener('click', () => {
    const it = ITEMS[sel];
    const toks = it.sent.split(' ');
    // 80% 概率换成 [MASK]（模拟 BERT 的 80/10/10 策略；这里演示最常见的情形）
    const masked = toks.slice();
    masked[it.maskIdx] = '[MASK]';
    outEl.innerHTML =
      '<p style="margin:10px 0 4px"><b>① 输入序列（被挖的词换成 [MASK]）：</b></p>' +
      '<p style="font-family:var(--font-serif);font-size:15px">[CLS] ' +
      masked.map((t, i2) =>
        (i2 === it.maskIdx ? '<span style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:0 6px;font-weight:700;color:#92400e">' + t + '</span>' : t)
      ).join(' ') + ' [SEP]</p>' +
      '<p style="margin:10px 0 4px"><b>② BERT 在 [MASK] 位置的预测（模拟）：</b></p>' +
      it.top.map((t2) =>
        '<div class="ngram-item"><span class="w">' + t2[0] + '</span>' +
        '<span class="track"><span class="fill" style="width:' + Math.round(t2[1] / it.top[0][1] * 100) + '%"></span></span>' +
        '<span class="p">' + t2[1].toFixed(2) + '</span></div>'
      ).join('') +
      '<p style="margin:10px 0 0"><b>③ 损失计算：</b>模型的 [MASK] 输出是一个覆盖整个词表（约 3 万词）的 Softmax 概率分布，与正确答案「' + it.ans + '」做<strong>交叉熵</strong>，得到梯度回传更新参数。</p>';
    infoEl.innerHTML = '答案应为「<b>' + it.ans + '</b>」。真实 BERT 靠左右上下文双向注意力猜词：本演示为教学模拟，预置了 top3 概率；真实模型会在 3 万词表上输出完整分布。注意「' + it.top[0][0] + '」概率最高——上下文（前后文）越充分，预测越准。';
  });

  renderToks();
})();

/* ============================================================
   演示 8：NSP 下一句判断小测（4 组句对）
   ============================================================ */
(function () {
  const boxEl = document.getElementById('nsp-box');
  const submitBtn = document.getElementById('nsp-submit');
  const resetBtn = document.getElementById('nsp-reset');
  const scoreEl = document.getElementById('nsp-score');

  const ITEMS = [
    { a: '我早上起床后刷牙洗脸。', b: '然后我去公司上班。', ans: 0, exp: '话题连贯（晨起 → 上班），是真实下一句。' },
    { a: '他昨天买了一张电影票。', b: '香蕉含有丰富的钾元素。', ans: 1, exp: '两句毫无关联，是随机拼接的句子。' },
    { a: '小明参加高考取得了好成绩。', b: '他被理想大学录取了。', ans: 0, exp: '「高考好成绩 → 被录取」因果连贯，是下一句。' },
    { a: '这是一本关于烹饪的书。', b: '与此同时，木星是太阳系最大的行星。', ans: 1, exp: '话题从烹饪跳到天文，是随机句。' },
  ];
  const LABELS = ['是下一句', '不是下一句'];

  const st = { user: {}, answered: false };

  function render() {
    boxEl.innerHTML = ITEMS.map((it, i) =>
      '<div class="quiz-q" id="nsp-' + i + '" data-qi="' + i + '">' +
      '<div class="qtext">第 ' + (i + 1) + ' 组：<br>A：' + esc(it.a) + '<br>B：' + esc(it.b) + '</div>' +
      LABELS.map((lab, k) =>
        '<label class="opt"><input type="radio" name="nspq' + i + '" value="' + k + '"' +
        (st.user[i] === k ? ' checked' : '') + '> ' + lab + '</label>'
      ).join('') +
      '<div class="quiz-explain"><b>解析：</b>' + esc(it.exp) + '</div>' +
      '</div>'
    ).join('');
    scoreEl.style.display = 'none';
    st.answered = false;
  }

  boxEl.addEventListener('change', (e) => {
    if (e.target.type !== 'radio') return;
    const i = parseInt(e.target.closest('.quiz-q').dataset.qi, 10);
    st.user[i] = parseInt(e.target.value, 10);
  });

  submitBtn.addEventListener('click', () => {
    if (st.answered) return;
    let correct = 0;
    ITEMS.forEach((it, i) => {
      const el = document.getElementById('nsp-' + i);
      el.classList.add('done');
      const opts = el.querySelectorAll('label.opt');
      opts.forEach((lab, k) => { if (k === it.ans) lab.classList.add('correct'); });
      if (st.user[i] === it.ans) correct++;
      else if (st.user[i] !== undefined) opts[st.user[i]].classList.add('wrong');
    });
    st.answered = true;
    const pct = correct / ITEMS.length;
    scoreEl.style.display = 'block';
    scoreEl.innerHTML = '得分：<b>' + correct + ' / ' + ITEMS.length + '</b>　正确率 ' + fmt(pct * 100, 0) + '%' +
      '<div class="bar" style="height:12px;background:#d1fae5;border-radius:999px;overflow:hidden;margin-top:8px"><div style="height:100%;width:' + fmt(pct * 100, 0) + '%;background:linear-gradient(90deg,#0d9488,#0e7490)"></div></div>' +
      '<div style="font-size:14px;color:var(--ink-soft);margin-top:8px">' +
      (pct === 1 ? '句间关系判断满分——这就是 NSP 任务在训练的能力。' : 'NSP 考的就是「两句是否话题连贯」，回看解析找找语感。') + '</div>';
  });

  resetBtn.addEventListener('click', () => { st.user = {}; render(); });
  render();
})();

/* ============================================================
   页面级 UI：导航高亮 + 回到顶部
   ============================================================ */
(function () {
  const links = document.querySelectorAll('.nav a, .toc a');
  const sections = document.querySelectorAll('section.chapter');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        links.forEach((a) => {
          a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id);
        });
      }
    });
  }, { rootMargin: '-15% 0px -70% 0px' });
  sections.forEach((s) => obs.observe(s));

  const toTop = document.getElementById('toTop');
  window.addEventListener('scroll', () => {
    toTop.classList.toggle('show', window.scrollY > 600);
  }, { passive: true });
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
})();


