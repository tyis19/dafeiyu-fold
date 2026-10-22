// ==UserScript==
// @name         屏蔽大肥鱼-折叠
// @namespace    https://github.com/tyis19/dafeiyu-fold
// @version      1.8.0
// @description  屏蔽B站评论区里的大肥鱼，可展开查看已清评论与楼中楼
// @author       tyis19
// @match        https://www.bilibili.com/*
// @match        https://t.bilibili.com/*
// @match        https://space.bilibili.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @homepageURL  https://github.com/tyis19/dafeiyu-fold
// @supportURL   https://github.com/tyis19/dafeiyu-fold/issues
// @updateURL    https://raw.githubusercontent.com/tyis19/dafeiyu-fold/main/dafeiyu.user.js
// @downloadURL  https://raw.githubusercontent.com/tyis19/dafeiyu-fold/main/dafeiyu.user.js
// @license      MIT
// @noframes
// ==/UserScript==

/*
 * 屏蔽大肥鱼-折叠
 *
 * 本项目基于 ybyz2/bilibili-dafeiyu-blocker 修改而来（MIT License）
 *   原作者仓库：https://github.com/ybyz2/bilibili-dafeiyu-blocker
 *   原版权声明：Copyright (c) 2026 ybyz2
 *
 * 本仓库的修改部分：Copyright (c) 2026 tyis19
 * 贡献者：DeepSeek（协助性能分析、代码改写与文档撰写）
 *
 * 完整许可证文本见仓库根目录 LICENSE 文件
 */


(function () {
  'use strict';

  var W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  if (W.__dfy) return;
  W.__dfy = 1;

  /* ============ 配置 ============ */

  var HAS_GM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  var SKEY = 'dafeiyu.config.v2';
  var VALID_TIER = { cup: 1, standard: 1, kill: 1, atonly: 1 };
  var VALID_SUB  = { only: 1, whole: 1, none: 1 };

  var config = { tier: 'standard', sub: 'only', showCount: true };

  (function load() {
    var raw = null;
    try { raw = HAS_GM ? GM_getValue(SKEY, null) : W.localStorage.getItem(SKEY); }
    catch (e) { return; }
    if (!raw) return;
    try {
      var o = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!o || typeof o !== 'object') return;
      if (VALID_TIER[o.tier]) config.tier = o.tier;
      if (VALID_SUB[o.sub]) config.sub = o.sub;
      if (typeof o.showCount === 'boolean') config.showCount = o.showCount;
    } catch (e) {}
  })();

  function save() {
    var s = JSON.stringify(config);
    try {
      if (HAS_GM) GM_setValue(SKEY, s);
      else W.localStorage.setItem(SKEY, s);
    } catch (e) {}
  }

  /* ============ 判定 ============ */

  var RE_NAME  = /鱼|鲸/;
  var RE_BRAND = /大肥鱼|肥鱼|鲸鱼|大肥鲸|鲸鱼娘|本鲸|本鱼|本肥鱼|主人/;
  var RE_QUOTE = /^回复\s*@[\s\S]{0,40}?\s*[:：]\s*/;
  var RE_DASH  = /[\u2014\u2015\u2500]|--/;
  var RE_CHAR  = /[鱼鲸]/;
  var RE_PUNCT = /[：；]/;
  var RE_CORNER = /[「」]/;

  function textOf(r) {
    var c = r && r.content;
    return c && typeof c.message === 'string' ? c.message : '';
  }

  /* 剥掉「回复 @xxx：」系统前缀，只留正文 */
  function stripQuote(full) {
    if (full.charCodeAt(0) === 0x56DE /* 回 */ && full.charCodeAt(1) === 0x590D /* 复 */) {
      var m = RE_QUOTE.exec(full);
      if (m) return full.slice(m[0].length);
    }
    return full;
  }

  /*
   * 品牌词有 9 个分支，正则引擎要在正文每个位置逐个试一遍。
   * 这些词全都含「鱼 / 鲸 / 主 / 本」之一，所以先用 indexOf 快速排除：
   * 普通评论四次扫描就出局，根本摸不到正则。
   */
  function hasBrand(s) {
    if (s.indexOf('鱼') < 0 && s.indexOf('鲸') < 0 &&
        s.indexOf('主') < 0 && s.indexOf('本') < 0) return false;
    return RE_BRAND.test(s);
  }

  /*
   * 返回命中的原因，空串表示放行。
   * 「只屏蔽 @」严格只看正文；其余档位先过昵称，再按档位叠加：
   * cup 看品牌词，standard 加 @，kill 再叠加鱼鲸字 / 标点 / 破折号 / 「」。
   */
  function blockReason(r, tier) {
    var full = textOf(r);

    /* @ 只看剥掉系统前缀后的正文；关键词看完整原文 */
    var body = stripQuote(full);

    /* 只屏蔽 @：昵称、品牌词、标点一律不参与 */
    if (tier === 'atonly') return body.indexOf('@') !== -1 ? 'at' : '';

    /* 其余档位：账号名含鱼/鲸一律屏蔽（这条精度 100%，不参与档位取舍） */
    var m = r && r.member;
    if (m && RE_NAME.test(m.uname || m.name || '')) return 'name';

    if (hasBrand(full)) return 'brand';
    if (tier === 'cup') return '';
    if (body.indexOf('@') !== -1) return 'at';
    if (tier === 'standard') return '';
    if (RE_CHAR.test(full)) return 'char';
    if (RE_PUNCT.test(full)) return 'punct';
    if (RE_DASH.test(full)) return 'dash';
    if (RE_CORNER.test(full)) return 'corner';
    return '';
  }

  var WHY = {
    name: '昵称含鱼/鲸', brand: '品牌词', at: '含 @',
    char: '含鱼/鲸', punct: '含：；', dash: '含破折号', corner: '含「」'
  };

  /* ============ 已清计数 ============ */

  /*
   * 只统计「这份评论列表里真正不会出现在页面上的评论」，三条规矩：
   *   1. 同一个 rpid 只算一次 —— 翻页重叠、切排序、重复展开楼中楼都不会重复计数
   *   2. 一级评论首屏（换排序 / 换视频 / 刷新）时清零重算，不会一路累加
   *   3. 只有真的把改过的数据交给页面之后才记数 —— 构造响应失败就不记，
   *      避免出现「数字涨了但评论还在」
   *
   * 一条一级评论命中时，它的楼中楼被整楼带走。接口只给前 2~3 条预览，
   * 所以楼中楼按 rcount（真实条数）记，不会少算。
   */
  var stat = { r: 0, s: 0 };     /* 一级评论 / 楼中楼 */
  var counted = {};              /* 本轮已计过数的 rpid */
  var countedN = 0;
  var COUNT_CAP = 50000;

  /* 已清评论清单：只留内存里的最近 REC_CAP 条，刷新即清空 */
  var REC_CAP = 300;
  var records = [];
  var recTrimmed = false;
  var recVer = 0;
  var recCut = 0;              /* 累计从头部裁掉了多少条，增量删节点用 */
  var recOpen = false;
  var recTop = 0;
  var renderedN = 0;
  var renderedVer = 0;
  var renderedCut = 0;         /* 上次渲染时已裁掉的条数 */

  function statTotal() { return stat.r + stat.s; }

  function resetCount() {
    stat.r = 0;
    stat.s = 0;
    counted = {};
    countedN = 0;

    subGen++;                 /* 旧列表的在途楼中楼请求作废 */
    records = [];
    recTrimmed = false;
    recCut = 0;
    recVer++;
    renderedN = 0;
    renderedVer = -1;
    renderedCut = 0;
    recOpen = false;
    recTop = 0;
    /* 清单 DOM 不在这里动：本函数会在页面读接口数据的当口被调到，
       操作 DOM 会插队页面渲染。留给下一次 schedulePaint 统一处理。 */
  }

  /* items: [{ id, r, s, rec }]，id 为 null 时不去重 */
  function commitCount(items) {
    var k, it, key, changed = false;
    for (k = 0; k < items.length; k++) {
      it = items[k];
      if (it.id != null) {
        key = '' + it.id;
        if (counted[key]) continue;
        if (countedN >= COUNT_CAP) continue;
        counted[key] = 1;
        countedN++;
      }
      stat.r += it.r || 0;
      stat.s += it.s || 0;
      if (it.rec) {
        records.push(it.rec);
        if (records.length > REC_CAP) {
          /* 只从头部摘掉多出来的几条，记个数就行。
             旧版在这里 recVer++，会让展开中的清单整张重画 300 行 ——
             每清一条评论卡一下，正是滚动手感变涩的主因。 */
          var drop = records.splice(0, records.length - REC_CAP);
          for (var q = 0; q < drop.length; q++) {
            drop[q].__sub = null;
            drop[q].__chip = null;
            drop[q].__foot = null;
            drop[q].__n = 0;
          }
          recTrimmed = true;
          recCut += drop.length;
        }
      }
      changed = true;
    }
    if (changed) schedulePaint();
    /* 单页路由切换后评论区整块重建，banner 会被一起摘掉，这里补插回去 */
    if (config.showCount && (!bHost || !bHost.isConnected)) watchMount();
  }

  /*
   * 首屏请求来了就先按这个列表重算：换排序、换视频、刷新都会重发首屏，
   * 那时候旧数字已经不属于当前列表了。
   */
  function onFirstPage() { resetCount(); }

  /* 真的把改过的数据交给页面之后才结算 */
  function settle(r) {
    var mk = r.marks;
    if (mk) {
      for (var k = 0; k < mk.length; k++) {
        if (counted[mk[k]]) continue;
        if (countedN >= COUNT_CAP) break;
        counted[mk[k]] = 1;
        countedN++;
      }
    }
    commitCount(r.items);
  }

  /* ============ 处理接口数据 ============ */

  /* 只处理真正带评论数组的接口，避免解析 subject/description 这类无关响应 */
  function apiKind(url) {
    if (!url || url.indexOf('/x/v2/reply') === -1) return 0;
    if (url.indexOf('/x/v2/reply/reply') !== -1) return 2;      // 楼中楼
    if (url.indexOf('/x/v2/reply/wbi/main') !== -1) return 1;   // 一级（wbi）
    if (url.indexOf('/x/v2/reply/main') !== -1) return 1;       // 一级
    if (url.indexOf('/x/v2/reply?') !== -1) return 1;           // 旧版一级
    return 0;   /* add / del / action / subject / report 等一律跳过 */
  }

  /* 从评论请求 URL 里取 oid / type，拿不到就留空 */
  var RE_Q_OID = /[?&]oid=(\d+)/;
  var RE_Q_TY = /[?&]type=(\d+)/;

  function parseQ(url) {
    var out = { oid: '', ty: 0 };
    if (!url || typeof url !== 'string') return out;
    /* 只认这两个数字参数，不做整串 split —— 省一次数组分配和逐个解码 */
    var m = RE_Q_OID.exec(url);
    if (m) out.oid = m[1];
    var t = RE_Q_TY.exec(url);
    if (t) out.ty = parseInt(t[1], 10);
    return out;
  }

  function avOf(m) {
    var av = (m && m.avatar) || '';
    if (av.indexOf('//') === 0) av = 'https:' + av;
    else if (av.indexOf('http://') === 0) av = 'https://' + av.slice(7);
    else if (!/^https?:\/\//.test(av)) av = '';
    return av;
  }

  /* ---------- 清单附加信息：主页 / IP / 等级 / 时间 / 点赞 ---------- */

  /* 从接口回复里取出附加字段，pack 与 packKid 共用；脏数据一律降级成空值 */
  function metaOf(r) {
    var m = (r && r.member) || {};
    var rc = (r && r.reply_control) || {};

    var mid = m.mid == null ? '' : '' + m.mid;
    if (!/^\d+$/.test(mid)) mid = '';

    var lv = m.level_info && m.level_info.current_level;
    lv = typeof lv === 'number' ? lv : parseInt(lv, 10);
    if (!(lv >= 0 && lv <= 6)) lv = -1;

    /* 接口给的是「IP属地：广东」，只留地区 */
    var ip = rc.location || '';
    if (ip.indexOf('IP属地') === 0) {
      var c = ip.indexOf('：');
      if (c < 0) c = ip.indexOf(':');
      ip = c < 0 ? '' : ip.slice(c + 1);
    }
    ip = ip.replace(/^[\s:：]+|[\s]+$/g, '');
    if (ip.length > 20) ip = ip.slice(0, 20);

    var ct = parseInt(r && r.ctime, 10);
    if (!(ct > 0)) ct = 0;

    var lk = parseInt(r && r.like, 10);
    if (!(lk > 0)) lk = 0;

    return { mid: mid, lv: lv, ip: ip, ct: ct, td: rc.time_desc || '', lk: lk };
  }

  function p2(n) { return n < 10 ? '0' + n : '' + n; }

  /* 绝对时间：2026-10-22 09:42 */
  function fmtAbs(t) {
    if (!t) return '';
    var d = new Date(t * 1000);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
      ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  /* 相对时间：刚刚 / 3分钟前 / 2小时前 / 3天前 / 超过30天转日期 */
  function fmtRel(t) {
    if (!t) return '';
    var s = Math.floor(Date.now() / 1000) - t;
    if (s < 0) s = 0;
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + '分钟前';
    if (s < 86400) return Math.floor(s / 3600) + '小时前';
    if (s < 86400 * 30) return Math.floor(s / 86400) + '天前';
    var d = new Date(t * 1000);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  /* 点赞数：22 / 1.2万 */
  function fmtNum(n) {
    n = parseInt(n, 10) || 0;
    if (n < 10000) return '' + n;
    var v = n / 10000;
    return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + '万';
  }

  function spaceUrl(mid) {
    return /^\d+$/.test(mid || '') ? 'https://space.bilibili.com/' + mid : '';
  }

  /* 点赞图标：内联 SVG，不引外链、不拼 HTML */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function likeEl(n) {
    var w = el('span', 'blk');
    w.title = '点赞 ' + n;
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32' +
      'c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9' +
      'c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z');
    svg.appendChild(path);
    w.appendChild(svg);
    w.appendChild(el('span', '', fmtNum(n)));
    return w;
  }

  /* 把一条被清评论压成展示数据；渲染时一律走 textContent，不拼 HTML */
  function pack(r, kind, why, ctx) {
    var m = (r && r.member) || {};
    var meta = metaOf(r);
    var out = {
      id: r && r.rpid != null ? r.rpid : null,
      u: m.uname || m.name || '匿名',
      av: avOf(m),
      tx: textOf(r),
      k: kind,
      why: why || '',
      kids: 0,
      mid: meta.mid,
      lv: meta.lv,
      ip: meta.ip,
      ct: meta.ct,
      td: meta.td,
      lk: meta.lk
    };
    /* 只有一级评论会去拉楼中楼，楼中楼记录不挂这两个字段 */
    if (kind === 'r' && ctx) {
      out.oid = ctx.oid || '';
      out.ty = ctx.ty || 0;
    }
    return out;
  }

  /* 楼中楼预览 / 加载结果只留展示所需字段 */
  function packKid(r) {
    var m = (r && r.member) || {};
    var meta = metaOf(r);
    var t = textOf(r);
    if (t.length > 500) t = t.slice(0, 500) + '…';
    return {
      id: r && r.rpid != null ? r.rpid : null,
      u: m.uname || m.name || '匿名',
      av: avOf(m),
      tx: t,
      mid: meta.mid,
      lv: meta.lv,
      ip: meta.ip,
      ct: meta.ct,
      td: meta.td,
      lk: meta.lk
    };
  }

  function snapKids(kids, n) {
    var out = [], i;
    for (i = 0; i < kids.length && out.length < n; i++) {
      if (kids[i]) out.push(packKid(kids[i]));
    }
    return out.length ? out : null;
  }

  /*
   * 过滤一份接口数据，只做「改数据 + 记账单」，不碰全局计数（交给 settle）。
   * 返回 null = 这份数据不用管；否则返回 { items }，
   * items 是被删掉的评论清单（一级 / 楼中楼分开）。
   */
  function filterPayload(json, kind, url) {
    var data = json && json.data;
    if (!data) return null;

    var tier = config.tier;
    var sub = config.sub;
    var ctx = kind === 1 ? parseQ(url) : null;
    var items = [], marks = [], kept, i, j, c, kids, hit, hitKids, k, why, rec;

    /* ---- 楼中楼接口 ---- */
    if (kind === 2) {
      if (sub === 'none') return null;
      var list = data.replies;
      if (!list || !list.length) return null;
      kept = [];
      for (i = 0; i < list.length; i++) {
        why = blockReason(list[i], tier);
        if (why) {
          items.push({ id: list[i] && list[i].rpid, r: 0, s: 1, rec: pack(list[i], 's', why) });
          continue;
        }
        kept.push(list[i]);
      }
      if (!items.length) return null;
      data.replies = kept;
      return { items: items, marks: null };
    }

    /* ---- 一级评论 ---- */
    var roots = data.replies;
    if (!roots) return null;                 /* 错误响应 / 无数据：不动计数 */
    /* 首屏拿到空列表也要清零，否则会留着上一个视频的计数和清单 */
    if (!roots.length) return { items: [], marks: null };

    /* 置顶不处理 */
    var pinned = null;
    var tops = data.top_replies;
    if (tops && tops.length) {
      pinned = {};
      for (i = 0; i < tops.length; i++) {
        if (tops[i] && tops[i].rpid != null) pinned[tops[i].rpid] = 1;
      }
    }
    if (data.top && data.top.upper && data.top.upper.rpid != null) {
      pinned = pinned || {};
      pinned[data.top.upper.rpid] = 1;
    }

    kept = [];
    for (i = 0; i < roots.length; i++) {
      c = roots[i];

      if (pinned && c && pinned[c.rpid]) { kept.push(c); continue; }

      var rootWhy = blockReason(c, tier);
      kids = (c && c.replies) || [];
      var hasKids = kids.length > 0;
      /* 整楼删除时楼中楼全没：接口只给预览，rcount 才是真条数 */
      var kidTotal = Math.max((c && c.rcount) || 0, kids.length);

      if (rootWhy) {
        rec = pack(c, 'r', rootWhy, ctx);
        rec.kids = kidTotal;
        rec.kidList = snapKids(kids, 5);
        items.push({ id: c && c.rpid, r: 1, s: kidTotal, rec: rec });
        /* 预览里这几条楼中楼已经算在 rcount 里了，记个标记避免重复 */
        for (j = 0; j < kids.length; j++) {
          if (kids[j] && kids[j].rpid != null) marks.push('' + kids[j].rpid);
        }
        continue;
      }

      if (!hasKids || sub === 'none') { kept.push(c); continue; }

      /* 主楼未命中，看楼中楼（判定只跑一遍，命中的原因跟着下标存） */
      hitKids = [];
      var hitWhy = [];
      for (j = 0; j < kids.length; j++) {
        why = blockReason(kids[j], tier);
        if (why) { hitKids.push(j); hitWhy.push(why); }
      }
      hit = hitKids.length;
      if (!hit) { kept.push(c); continue; }

      if (sub === 'whole') {
        rec = pack(c, 'r', hitWhy[0], ctx);
        rec.kids = Math.max((c && c.rcount) || 0, kids.length);
        rec.kidList = snapKids(kids, 5);
        items.push({ id: c && c.rpid, r: 1, s: rec.kids, rec: rec });
        for (j = 0; j < kids.length; j++) {
          if (kids[j] && kids[j].rpid != null) marks.push('' + kids[j].rpid);
        }
        continue;
      }

      /* only：只删命中的楼中楼，主楼保留 */
      var rest = [], drop = {};
      for (k = 0; k < hitKids.length; k++) {
        j = hitKids[k];
        drop[j] = 1;
        items.push({ id: kids[j] && kids[j].rpid, r: 0, s: 1, rec: pack(kids[j], 's', hitWhy[k]) });
      }
      for (j = 0; j < kids.length; j++) {
        if (!drop[j]) rest.push(kids[j]);
      }
      c.replies = rest;
      /* 「共 N 条回复」跟着减，免得点开是空的（空楼） */
      if (c.rcount) c.rcount = Math.max(0, c.rcount - hit);
      kept.push(c);
    }

    if (items.length) data.replies = kept;

    return { items: items, marks: marks.length ? marks : null };
  }

  /*
   * 首屏请求判定：换了排序、换了视频、刷新，都会重新拉第一页。
   * wbi/main 用 pagination_str={"offset":""}，旧版用 next=0 / pn=1。
   */
  function isFirstPageReq(url) {
    if (!url) return false;
    var u = url;
    try { u = decodeURIComponent(url); } catch (e) {}
    if (u.indexOf('pagination_str') !== -1) return u.indexOf('"offset":""') !== -1;
    if (!/[?&]next=/.test(u) && !/[?&]pn=/.test(u)) return true;
    return /[?&]next=0(&|$)/.test(u) || /[?&]pn=1(&|$)/.test(u);
  }

  /* ============ 楼中楼加载 ============ */

  /*
   * 必须在 hookFetch 之前握住原生 fetch。用自己的 wrapper 请求楼中楼，
   * 会被 apiKind 判成 kind=2 二次过滤并 settle 重复计数。
   */
  var netFetch = null;
  try { if (typeof W.fetch === 'function') netFetch = W.fetch; } catch (e) {}

  var SUB_PS = 20;
  var SUB_PAGES = 5;
  var SUB_MAX = SUB_PS * SUB_PAGES;
  var SUB_TIMEOUT = 12000;
  var subGen = 0;

  function subErrText(e) {
    return '加载失败' + (e && e.msg ? '（' + e.msg + '）' : '');
  }

  function addKid(rec, k) {
    if (!k) return;
    if (k.id != null) {
      var key = '' + k.id;
      if (rec.subSeen[key]) return;
      rec.subSeen[key] = 1;
    }
    rec.kidAll.push(k);
  }

  function reqKids(rec, pn) {
    if (!netFetch) return Promise.reject({ msg: '浏览器不支持 fetch' });

    var u = 'https://api.bilibili.com/x/v2/reply/reply'
      + '?oid=' + encodeURIComponent(rec.oid)
      + '&type=' + (rec.ty || 1)
      + '&root=' + encodeURIComponent(rec.id)
      + '&ps=' + SUB_PS
      + '&pn=' + pn;
    var opt = { credentials: 'include' };
    var ctl = null;
    try {
      if (W.AbortController) {
        ctl = new W.AbortController();
        opt.signal = ctl.signal;
      }
    } catch (e) {}

    return new Promise(function (resolve, reject) {
      var done = 0;
      var timer = setTimeout(function () {
        if (done) return;
        done = 1;
        try { if (ctl) ctl.abort(); } catch (e) {}
        reject({ msg: '请求超时' });
      }, SUB_TIMEOUT);

      netFetch.call(W, u, opt).then(function (res) {
        if (done) return;
        done = 1;
        clearTimeout(timer);
        if (!res || !res.ok) {
          reject({ msg: 'HTTP ' + ((res && res.status) || '?') });
          return;
        }
        res.json().then(function (j) {
          if (!j || j.code !== 0) {
            reject({ msg: '接口 ' + ((j && j.code) || '?') });
            return;
          }
          resolve(j.data || {});
        })['catch'](function () { reject({ msg: '数据解析失败' }); });
      })['catch'](function () {
        if (done) return;
        done = 1;
        clearTimeout(timer);
        reject({ msg: '网络错误' });
      });
    });
  }

  function loadKids(rec) {
    if (rec.subLoading || rec.subDone) return;
    if (rec.id == null || !rec.oid) return;

    if (!rec.kidAll) {
      rec.kidAll = [];
      rec.subSeen = {};
      var p = rec.kidList || [], i;
      for (i = 0; i < p.length; i++) addKid(rec, p[i]);
    }
    if (!rec.subPn) rec.subPn = 1;
    if (!rec.kidTotal) rec.kidTotal = Math.max(rec.kids || 0, rec.kidAll.length);

    rec.subLoading = 1;
    rec.subErr = '';
    refreshSub(rec);

    stepKids(rec, subGen);
  }

  function stepKids(rec, gen) {
    var pn = rec.subPn;

    reqKids(rec, pn).then(function (d) {
      if (gen !== subGen) return;

      var arr = (d && d.replies) || [];
      var cnt = d && d.page && d.page.count;
      if (typeof cnt === 'number' && cnt > (rec.kidTotal || 0)) rec.kidTotal = cnt;

      for (var i = 0; i < arr.length; i++) addKid(rec, packKid(arr[i]));
      rec.subPn = pn + 1;

      var total = rec.kidTotal || rec.kids || 0;
      var reached = total > 0 && rec.kidAll.length >= total;

      if (!arr.length || arr.length < SUB_PS || reached) {
        rec.subDone = 1;
      } else if (rec.kidAll.length >= SUB_MAX) {
        rec.subDone = 1;
        rec.subTrunc = 1;
      } else if (pn >= SUB_PAGES) {
        rec.subDone = 1;
        rec.subTrunc = 1;
      }

      rec.subLoading = 0;
      refreshSub(rec);
      if (!rec.subDone) stepKids(rec, gen);
    })['catch'](function (e) {
      if (gen !== subGen) return;
      rec.subLoading = 0;
      rec.subErr = subErrText(e);
      refreshSub(rec);
    });
  }

  /* ============ 界面 ============ */

  var CSS = ":host{all:initial}\n*{box-sizing:border-box;margin:0;padding:0}\n\n/* 主题变量 */\n.t{\n  --bg:rgba(252,251,249,.94);--bd:rgba(0,0,0,.07);--tx:#1f1f23;--dim:#8b8b94;\n  --sh:0 20px 48px -18px rgba(0,0,0,.34),0 2px 6px -2px rgba(0,0,0,.06),inset 0 1px 0 rgba(255,255,255,.9);\n  --hv:rgba(0,0,0,.05);--tg:rgba(0,0,0,.1);--line:rgba(0,0,0,.07)\n}\n.t.dk{\n  --bg:rgba(38,38,44,.94);--bd:rgba(255,255,255,.1);--tx:#f0f0f4;--dim:#9a9aa6;\n  --sh:0 20px 48px -18px rgba(0,0,0,.8),0 2px 6px -2px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.07);\n  --hv:rgba(255,255,255,.09);--tg:rgba(255,255,255,.16);--line:rgba(255,255,255,.09)\n}\n\n/* 面板 */\n.p{position:fixed;top:78px;right:18px;z-index:2147483600;width:300px;\npadding:20px 20px 14px;border-radius:20px;\nbackground:var(--bg);\nbackdrop-filter:blur(40px) saturate(180%);-webkit-backdrop-filter:blur(40px) saturate(180%);\nborder:1px solid var(--bd);box-shadow:var(--sh);\nfont-family:-apple-system,BlinkMacSystemFont,\"PingFang SC\",\"HarmonyOS Sans SC\",\"Microsoft YaHei\",sans-serif;\n-webkit-font-smoothing:antialiased;\ntransform-origin:top right;animation:pop .18s cubic-bezier(.2,.9,.3,1)}\n@keyframes pop{from{opacity:0;transform:scale(.93) translateY(-6px)}to{opacity:1;transform:none}}\n\n/* 关闭 */\n.x{position:absolute;top:13px;right:14px;width:26px;height:26px;\ndisplay:flex;align-items:center;justify-content:center;\nfont-size:19px;line-height:1;color:var(--dim);cursor:pointer;border-radius:8px;\ntransition:background .14s,color .14s;user-select:none}\n.x:hover{background:var(--hv);color:var(--tx)}\n\n/* 分组标题 */\n.g{font-size:11.5px;font-weight:600;color:var(--dim);letter-spacing:.1em;\npadding:16px 8px 7px}\n.g:first-of-type{padding-top:2px}\n\n/* 选项 */\n.o{font-size:16px;line-height:1.2;color:var(--tx);padding:12px 14px;border-radius:11px;cursor:pointer;\ntransition:background .14s,color .14s,transform .1s}\n.o:hover{background:var(--hv)}\n.o:active{transform:scale(.985)}\n.o.on{background:#fb7299;color:#fff;font-weight:600;\nbox-shadow:0 4px 14px -4px rgba(251,114,153,.7)}\n\n/* 开关行 */\n.s{display:flex;align-items:center;justify-content:space-between;\nfont-size:15px;color:var(--tx);\npadding:16px 8px 8px;margin-top:10px;border-top:1px solid var(--line)}\n.sw{width:42px;height:24px;border-radius:12px;background:var(--tg);position:relative;cursor:pointer;\ntransition:background .2s;flex:none}\n.sw.on{background:#fb7299}\n.sw:after{content:\"\";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;\nbackground:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);transition:left .2s cubic-bezier(.3,1.2,.5,1)}\n.sw.on:after{left:21px}\n\n/* 评论区那行字 */\n.b{display:inline-block;padding:12px 22px;margin:6px 0 20px;border-radius:12px;\nfont-size:16px;line-height:1.4;letter-spacing:.01em;user-select:none;font-weight:600;\nfont-family:-apple-system,BlinkMacSystemFont,\"PingFang SC\",\"HarmonyOS Sans SC\",\"Microsoft YaHei\",sans-serif;\n-webkit-font-smoothing:antialiased;\ncolor:#59616d;background:rgba(0,0,0,.055);\nborder:1px solid rgba(0,0,0,.055)}\n.b.dk{color:#c5cbd5;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.13)}";

  /* 已清评论清单 + 面板补充样式（档位说明） */
  var LB_CSS = [
    '.bx{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei",sans-serif;',
    '-webkit-font-smoothing:antialiased;margin:6px 0 20px}',

    /* 折叠条：整宽一行 */
    '.b{display:flex;align-items:center;justify-content:space-between;gap:12px;',
    'width:100%;padding:12px 16px;margin:0;border-radius:12px;cursor:pointer;',
    'transition:background .14s,color .14s}',
    '.b:hover{background:rgba(0,0,0,.09)}',
    '.b.dk:hover{background:rgba(255,255,255,.14)}',
    '.cnt{font-size:15px;font-weight:600;line-height:1.3}',
    '.cv{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:500;color:var(--dim);flex:none}',
    '.cv:after{content:"";width:6px;height:6px;flex:none;margin-top:-3px;',
    'border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;',
    'transform:rotate(45deg);transition:transform .18s,margin-top .18s}',
    '.b.open .cv:after{transform:rotate(-135deg);margin-top:3px}',

    /* 展开区 */
    '.bd{margin-top:10px;border:1px solid var(--line);border-radius:14px;',
    'max-height:56vh;overflow:auto;overscroll-behavior:contain;background:rgba(0,0,0,.02)}',
    '.t.dk .bd{background:rgba(255,255,255,.03)}',
    '.bd[hidden]{display:none}',
    '.bi{display:flex;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line)}',
    '.bi:last-child{border-bottom:none}',
    '.ba{width:34px;height:34px;border-radius:50%;flex:none;object-fit:cover;background:var(--tg)}',
    '.baf{display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--dim);font-weight:600}',
    '.bm{flex:1;min-width:0}',
    '.bn{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px}',
    '.bu{font-size:13.5px;font-weight:600;color:var(--tx);line-height:1.4;text-decoration:none}',
    'a.bu{cursor:pointer;transition:color .12s}',
    'a.bu:hover{color:#fb7299}',
    '.bk{font-size:10.5px;line-height:1.4;color:var(--dim);background:var(--hv);',
    'padding:1px 6px;border-radius:5px;flex:none}',
    /* IP 属地：灰底小标签，跟 B 站一致 */
    '.bip{font-size:10.5px;line-height:1.4;color:var(--dim);background:var(--hv);',
    'padding:1px 6px;border-radius:5px;flex:none;white-space:nowrap}',
    /* 等级徽章：LV0~LV6，配色照 B 站 */
    '.blv{font-size:9.5px;line-height:1.35;font-weight:700;color:#fff;padding:1px 5px;',
    'border-radius:4px;flex:none;font-style:italic;letter-spacing:.02em;white-space:nowrap}',
    '.blv0{background:#c0c0c0}.blv1{background:#bbbbbb}.blv2{background:#95ddb2}',
    '.blv3{background:#92d1e5}.blv4{background:#ffb37c}.blv5{background:#ff6c00}',
    '.blv6{background:#ff0000}',
    /* 正文下方：时间 / 相对时间 / 点赞 */
    '.bmeta{display:flex;align-items:center;gap:10px;margin-top:5px;font-size:11.5px;',
    'line-height:1.5;color:var(--dim);flex-wrap:wrap}',
    '.btime{white-space:nowrap}',
    '.brel{opacity:.85;white-space:nowrap}',
    '.blk{display:inline-flex;align-items:center;gap:3px;flex:none;white-space:nowrap}',
    '.blk svg{width:12px;height:12px;display:block;fill:currentColor}',
    '.bw{font-size:10.5px;line-height:1.4;color:#fb7299;background:rgba(251,114,153,.12);',
    'padding:1px 6px;border-radius:5px;flex:none}',
    '.bt{font-size:14px;line-height:1.55;color:var(--tx);white-space:pre-wrap;',
    'overflow-wrap:anywhere;word-break:break-word;cursor:pointer;',
    'display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}',
    '.bt.full{display:block;-webkit-line-clamp:unset}',
    '.be{padding:22px 14px;text-align:center;font-size:13px;color:var(--dim)}',
    '.bf{padding:8px 14px 10px;text-align:center;font-size:11.5px;color:var(--dim);border-top:1px solid var(--line)}',

    /* 设置面板：档位两行说明 */
    '.o{padding:11px 14px}',
    '.ol{font-size:16px;line-height:1.25}',
    '.oh{font-size:11px;line-height:1.5;font-weight:400;color:var(--dim);margin-top:2px;letter-spacing:0}',
    '.o.on .oh{color:rgba(255,255,255,.78)}',

    /* 楼中楼 chip 与展开区 */
    '.bkc{cursor:pointer;color:#fb7299;background:rgba(251,114,153,.12);transition:background .14s}',
    '.bkc:hover{background:rgba(251,114,153,.2)}',
    '.bkc:after{content:"";display:inline-block;width:4px;height:4px;margin-left:5px;margin-top:-2px;',
    'vertical-align:middle;border-right:1.3px solid currentColor;border-bottom:1.3px solid currentColor;',
    'transform:rotate(45deg);transition:transform .18s}',
    '.bkc.on:after{margin-top:2px;transform:rotate(-135deg)}',
    '.bsub{margin-top:8px;padding-left:9px;border-left:2px solid var(--line)}',
    '.bsub[hidden]{display:none}',
    '.bsr{display:flex;gap:8px;padding:5px 0}',
    '.bsv{width:22px;height:22px;border-radius:50%;flex:none;object-fit:cover;background:var(--tg)}',
    '.bsvf{display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:var(--dim)}',
    '.bsd{flex:1;min-width:0}',
    '.bsu{font-size:11.5px;font-weight:600;line-height:1.4;color:var(--dim);text-decoration:none}',
    'a.bsu{cursor:pointer;transition:color .12s}',
    'a.bsu:hover{color:#fb7299}',
    /* 楼中楼里的附加信息比主楼小一号 */
    '.bsr .bmeta{font-size:11px;margin-top:3px;gap:8px}',
    '.bsr .bip,.bsr .blv{font-size:9.5px;padding-top:0;padding-bottom:0}',
    '.bsr .blk svg{width:10px;height:10px}',

    /* 悬停用户卡片（B 站原生浮层进不了影子树，只能自绘一套） */
    '.uc{position:fixed;z-index:2147483601;width:300px;border-radius:14px;overflow:hidden;',
    'background:var(--bg);border:1px solid var(--bd);box-shadow:var(--sh);',
    'backdrop-filter:blur(40px) saturate(180%);-webkit-backdrop-filter:blur(40px) saturate(180%);',
    'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei",sans-serif;',
    '-webkit-font-smoothing:antialiased;opacity:0;visibility:hidden;transform:translateY(4px);',
    'pointer-events:none;transition:opacity .14s ease,transform .14s ease,visibility .14s}',
    '.uc.on{opacity:1;visibility:visible;transform:none;pointer-events:auto}',
    '.uch{height:66px;background:#2f2f38 center/cover no-repeat;position:relative}',
    '.ucb{padding:0 14px 14px;position:relative}',
    '.ucav{width:56px;height:56px;border-radius:50%;margin-top:-28px;border:3px solid var(--bg);',
    'background:var(--tg);object-fit:cover;display:block;position:relative;z-index:1}',
    '.ucaf{display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;color:var(--dim)}',
    '.ucnm{display:flex;align-items:center;gap:5px;margin-top:8px;flex-wrap:wrap}',
    '.ucn{font-size:15px;font-weight:600;color:var(--tx);line-height:1.3;max-width:190px;',
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ucsx{font-size:12px;line-height:1;color:var(--dim);flex:none}',
    '.ucsx.m{color:#6db4e8}.ucsx.f{color:#f28fae}',
    '.ucst{display:flex;gap:15px;margin-top:10px}',
    '.ucsi{font-size:11.5px;color:var(--dim);line-height:1.4;white-space:nowrap}',
    '.ucsi b{font-size:12.5px;font-weight:600;color:var(--tx);margin-right:2px}',
    '.ucsg{margin-top:9px;font-size:12px;line-height:1.6;color:var(--dim);',
    'display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;',
    'overflow-wrap:anywhere;word-break:break-word}',
    '.ucgo{display:block;margin-top:12px;padding:7px 0;text-align:center;font-size:12.5px;',
    'font-weight:600;color:#fff;background:#fb7299;border-radius:8px;text-decoration:none;',
    'transition:background .14s}',
    '.ucgo:hover{background:#f05c86}',
    '.uctip{margin-top:9px;font-size:11px;line-height:1.5;color:var(--dim);text-align:center}',
    /* 签名/统计用了 flex / box 布局，会盖掉 hidden，这里强制一下 */
    '.uc[hidden],.uc [hidden]{display:none!important}',
    '.bst{font-size:13px;line-height:1.5;color:var(--tx);white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;',
    'margin-top:1px;cursor:pointer;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}',
    '.bst.full{display:block;-webkit-line-clamp:unset}',
    '.bsf{margin-top:2px;padding:5px 0;font-size:11.5px;line-height:1.5;color:#fb7299;cursor:pointer;user-select:none}',
    '.bsf.wait{color:var(--dim);cursor:default}',
    '.bsf.err{color:#e05a5a}',
    '.bsf[hidden]{display:none}',

    /* 矮窗口：压一压面板高度，避免底部开关被切掉 */
    '@media (max-height:680px){',
    '.p{padding-top:14px;padding-bottom:10px}',
    '.g{padding:12px 8px 5px}',
    '.o{padding:9px 14px}',
    '.s{padding:12px 8px 6px;margin-top:6px}',
    '}',

    '.be[hidden],.bf[hidden]{display:none}'
  ].join('\n');
  var TIERS = [
    { id: 'cup',      label: '小杯',       hint: '昵称 + 品牌词' },
    { id: 'standard', label: '标准',       hint: '＋ 含 @' },
    { id: 'kill',     label: '杀戮',       hint: '＋ 鱼鲸字 / 标点 / 破折号 / 「」' },
    { id: 'atonly',   label: '只屏蔽 @',   hint: '只按 @，不看昵称' }
  ];

  var SUBS = [
    { id: 'only',  label: '只删楼中楼' },
    { id: 'whole', label: '整楼删除' },
    { id: 'none',  label: '不管楼中楼' }
  ];

  var host = null, panel = null, swEl = null;
  var bHost = null, bBox = null, bBtn = null, bCnt = null, bCv = null;
  var bBody = null, bList = null, bEmpty = null, bFoot = null;

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  /* B站夜间模式：<html class="dark"> */
  /*
   * 结果缓存住。读 className 会让浏览器先把挂起的样式改动算完（强制同步布局），
   * 界面刷新路径上一秒要问好几次，没必要每次都去敲 DOM。
   * 真正变化时由下面的观察器重新算一遍。
   */
  var darkNow = null;

  function calcDark() {
    var de = document.documentElement;
    if (!de) return false;
    var c = de.className || '';
    if (c.indexOf('dark') !== -1) return true;
    return de.getAttribute('data-theme') === 'dark';
  }

  function isDark() {
    if (darkNow === null) darkNow = calcDark();
    return darkNow;
  }

  function applyTheme(elm) {
    if (elm) elm.classList.toggle('dk', isDark());
  }

  /* 一次算清、三处套用；原来这里会把 isDark() 调三遍 */
  function syncTheme() {
    darkNow = calcDark();
    if (panel) applyTheme(panel);
    if (bBox) applyTheme(bBox);
    if (bBtn) bBtn.classList.toggle('dk', darkNow);
  }

  /* html.dark 变的时候跟着变 */
  /*
   * 主题跟随。html 的 class 变化很少，但用全量 attributes 监听会带来额外开销，
   * 这里只监听 class / data-theme 两个属性，且回调里不读 DOM（直接 toggle）。
   */
  var tmo = null;

  function watchTheme() {
    if (tmo || !W.MutationObserver) return;
    darkNow = calcDark();        /* 先算一次，之后读缓存 */
    tmo = new W.MutationObserver(syncTheme);
    tmo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });
  }

  function pick(group, id) {
    var all = group.children;
    for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i].dataset.v === id);
  }

  function buildPanel() {
    if (panel) return;

    host = el('div');
    host.style.cssText = 'all:initial';
    var sh = host.attachShadow({ mode: 'open' });
    var st = el('style');
    st.textContent = CSS + LB_CSS;
    sh.appendChild(st);

    panel = el('div', 'p t');
    applyTheme(panel);

    /* 关闭 */
    var x = el('div', 'x', '×');
    x.title = '关闭';
    x.onclick = closePanel;
    panel.appendChild(x);

    panel.appendChild(el('div', 'g', '屏蔽强度'));
    var tg = el('div');
    TIERS.forEach(function (t) {
      var o = el('div', 'o' + (config.tier === t.id ? ' on' : ''));
      o.dataset.v = t.id;
      o.appendChild(el('div', 'ol', t.label));
      if (t.hint) o.appendChild(el('div', 'oh', t.hint));
      o.onclick = function () {
        config.tier = t.id; save(); pick(tg, t.id);
        resetCount(); drawBanner();     /* 旧数字属于旧规则，清掉 */
      };
      tg.appendChild(o);
    });
    panel.appendChild(tg);

    panel.appendChild(el('div', 'g', '楼中楼'));
    var sg = el('div');
    SUBS.forEach(function (t) {
      var o = el('div', 'o' + (config.sub === t.id ? ' on' : ''), t.label);
      o.dataset.v = t.id;
      o.onclick = function () {
        config.sub = t.id; save(); pick(sg, t.id);
        resetCount(); drawBanner();
      };
      sg.appendChild(o);
    });
    panel.appendChild(sg);

    var sr = el('div', 's');
    sr.appendChild(el('span', null, '显示已清记录'));
    swEl = el('div', 'sw' + (config.showCount ? ' on' : ''));
    swEl.onclick = function () {
      config.showCount = !config.showCount;
      save();
      swEl.classList.toggle('on', config.showCount);
      if (config.showCount) {
        drawBanner();
        startKeeper();
        if (!bHost || !bHost.isConnected) watchMount();
      } else {
        drawBanner();
        stopWatch();
        stopKeeper();
      }
    };
    sr.appendChild(swEl);
    panel.appendChild(sr);

    sh.appendChild(panel);
    (document.body || document.documentElement).appendChild(host);
  }

  function openPanel() {
    buildPanel();
    applyTheme(panel);
    host.style.display = 'block';
  }

  function closePanel() {
    if (host) host.style.display = 'none';
  }

  /* ============ 评论区顶部「已清 N 条」 ============ */

  /*
   * 定位插入点。
   * 新评论区：<bili-comments> 是自定义元素，内容在 shadowRoot 里
   *   shadowRoot > #contents > [#reply-commentbox(发评论), #feed(评论列表), ...]
   *   → 插到 #feed 之前，正好是「发评论框」和「第一条评论」中间
   * 旧评论区：兜底用 #comment .reply-warp
   */
  /*
   * 上一次找到的插入点。B 站评论区结构在同一个视频里是稳的，
   * 缓存住能把「两次全页搜索 + 一次影子树搜索」降到两次「元素还在不在」的判断。
   * B 站重建评论列表时整个容器会被换掉，那时 parent/before 会脱离文档，缓存自动失效。
   */
  var mountCache = null;

  function findMount() {
    var c = mountCache;
    if (c && c.parent && c.parent.isConnected &&
        c.before && c.before.parentNode === c.parent) return c;
    mountCache = null;

    var el2 = document.querySelector('#commentapp bili-comments');
    if (el2 && el2.shadowRoot) {
      var feed = el2.shadowRoot.querySelector('#feed');
      if (feed && feed.parentNode) {
        mountCache = { parent: feed.parentNode, before: feed };
        return mountCache;
      }
    }
    var host2 = document.querySelector('#comment .reply-warp') || document.querySelector('.reply-warp');
    if (host2) {
      var list = host2.querySelector('.reply-list') || host2.querySelector('.comment-list');
      if (list && list.parentNode) {
        mountCache = { parent: list.parentNode, before: list };
        return mountCache;
      }
      mountCache = { parent: host2, before: host2.firstChild };
      return mountCache;
    }
    return null;
  }

  /* ---------- 折叠清单 ---------- */

  var paintQ = 0;

  /*
   * 接口结算可能发生在 XHR getter 里，重绘丢到下一帧，别插队页面取值／渲染。
   * 一帧里的多次结算由 paintQ 合并成一次。
   */
  function schedulePaint() {
    if (paintQ) return;
    paintQ = 1;
    var run = function () {
      paintQ = 0;
      try { drawBanner(); } catch (e) {}
    };
    if (W.requestAnimationFrame) W.requestAnimationFrame(run);
    else if (typeof Promise === 'function') Promise.resolve().then(run);
    else setTimeout(run, 16);
  }

  function ensureUI() {
    if (bHost) return;

    bHost = el('div');
    bHost.style.cssText = 'display:block;width:100%;flex:none;pointer-events:auto';

    var sh = bHost.attachShadow({ mode: 'open' });
    var st = el('style');
    st.textContent = CSS + LB_CSS;
    sh.appendChild(st);

    bBox = el('div', 'bx t');
    applyTheme(bBox);

    bBtn = el('div', 'b');
    bBtn.setAttribute('role', 'button');
    bBtn.tabIndex = 0;
    bBtn.onclick = function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      setOpen(!recOpen);
    };
    bBtn.onkeydown = function (e) {
      var k = e.keyCode;
      if (e.key === 'Enter' || e.key === ' ' || k === 13 || k === 32) {
        if (e.preventDefault) e.preventDefault();
        setOpen(!recOpen);
      }
    };

    bCnt = el('span', 'cnt');
    bCv = el('span', 'cv');
    bBtn.appendChild(bCnt);
    bBtn.appendChild(bCv);

    bBody = el('div', 'bd');
    bBody.hidden = true;
    bList = el('div', 'bl');
    bEmpty = el('div', 'be', '本次没有清除任何评论');
    bFoot = el('div', 'bf');
    bBody.appendChild(bList);
    bBody.appendChild(bEmpty);
    bBody.appendChild(bFoot);

    bBox.appendChild(bBtn);
    bBox.appendChild(bBody);
    sh.appendChild(bBox);

    headSig = '';       /* 新 DOM，签名作废，下一次必须真写 */
    updateHead();
  }

  function destroyUI() {
    var had = !!bHost;
    if (bHost && bHost.parentNode) bHost.parentNode.removeChild(bHost);

    /* 断掉记录对旧 DOM 的引用，关掉开关后整棵影子树能回收 */
    if (had) {
      for (var i = 0; i < records.length; i++) {
        records[i].__sub = null;
        records[i].__chip = null;
        records[i].__foot = null;
        records[i].__n = 0;
      }
    }

    ucReset();
    bHost = bBox = bBtn = bCnt = bCv = bBody = bList = bEmpty = bFoot = null;
    recOpen = false;
    recTop = 0;
    renderedN = 0;
    renderedVer = -1;
    renderedCut = 0;
    mountCache = null;
    headSig = '';
  }

  /*
   * 只在位置不对时才动 DOM，避免反复触发 B 站自己的观察器。
   * 已经挂在页面上就直接认账：B 站重建评论列表时会把整个容器换掉，
   * 那时 isConnected 会变成 false，自然会走重新定位。
   * 这样绝大多数调用连一次 querySelector 都不用做。
   */
  function ensureMounted() {
    if (!bHost || bHost.isConnected) return;
    var m = findMount();
    if (!m) return;
    if (m.before) m.parent.insertBefore(bHost, m.before);
    else m.parent.appendChild(bHost);
  }

  /*
   * 界面刷新会被接口结算、兜底轮询、展开收起反复触发，而绝大多数时候
   * 数字和状态根本没变。先用一个签名比对，没变就直接返回，
   * 省掉一串 DOM 写入和随后的样式重算。
   */
  var headSig = '';

  function updateHead() {
    if (!bCnt || !bBtn || !bBody) return;

    var dk = isDark() ? 1 : 0;
    var sig = stat.r + '|' + stat.s + '|' + (recOpen ? 1 : 0) + '|' +
      records.length + '|' + (recTrimmed ? 1 : 0) + '|' + dk;
    if (sig === headSig) return;
    headSig = sig;

    bCnt.textContent = '已清 ' + statTotal() + ' 条';
    bBtn.title = '一级评论 ' + stat.r + ' 条 · 楼中楼 ' + stat.s + ' 条 · ' + (recOpen ? '点击收起清单' : '点击查看清单');
    bCv.textContent = recOpen ? '收起' : '展开';
    bBtn.classList.toggle('open', recOpen);
    bBtn.setAttribute('aria-expanded', recOpen ? 'true' : 'false');
    bBtn.classList.toggle('dk', !!dk);
    bBody.hidden = !recOpen;
    bEmpty.hidden = records.length > 0;
    bFoot.hidden = !recTrimmed;
    if (recTrimmed) bFoot.textContent = '仅显示最近 ' + REC_CAP + ' 条';
  }

  function setOpen(on) {
    recOpen = !!on;
    if (!bBody) return;

    if (!recOpen) recTop = bBody.scrollTop || 0;
    updateHead();       /* 展开状态变了，签名跟着变，这里会真的写一次 DOM */

    if (recOpen) {
      syncList();
      bBody.scrollTop = recTop;
    }
  }

  function stopEv(e) {
    if (e && e.stopPropagation) e.stopPropagation();
  }

  function avatarEl(u, av, cls, fbCls) {
    var e;
    if (av) {
      e = el('img', cls);
      e.loading = 'lazy';
      e.decoding = 'async';
      e.referrerPolicy = 'no-referrer';
      e.alt = '';
      e.src = av;
      e.onerror = function () {
        /* 头像挂了就退回首字圆底，不留空洞 */
        if (!e.parentNode) return;
        e.parentNode.replaceChild(el('div', fbCls + ' baf', (u || '?').slice(0, 1)), e);
      };
    } else {
      e = el('div', fbCls + ' baf', (u || '?').slice(0, 1));
    }
    return e;
  }

  /* ---------- 悬停用户卡片 ---------- */
  /*
   * B 站原生的用户信息浮层只认它自己 DOM 里的用户名，进不了我们的影子树，
   * 所以这里自绘一张：悬停 300ms 取资料接口，展示头图 / 头像 / 昵称 / 性别 /
   * 等级 / 关注·粉丝·获赞 / 签名，底部给一个进主页的入口。
   */

  var UC_TTL = 300000;      /* 资料缓存 5 分钟 */
  var UC_FAIL_TTL = 60000;  /* 失败只缓 1 分钟，别一直打接口 */
  var UC_DELAY = 300;       /* 悬停多久才弹 */
  var UC_LEAVE = 180;       /* 移开后多久收，留出挪到卡片上的时间 */

  var ucBox = null, ucBody = null, ucHead = null, ucAv = null, ucName = null;
  var ucSex = null, ucLv = null, ucSt = null, ucSg = null, ucGo = null, ucTip = null;
  var ucCache = {}, ucN = 0, ucTimer = 0, ucLeaveTimer = 0, ucAnchor = null, ucCur = null;

  function ucUrl(u) {
    if (!u || typeof u !== 'string') return '';
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.indexOf('http://') === 0) return 'https://' + u.slice(7);
    return u.indexOf('https://') === 0 ? u : '';
  }

  function ucCached(mid) {
    var c = ucCache[mid];
    if (!c) return null;
    if (Date.now() - c.t > (c.d ? UC_TTL : UC_FAIL_TTL)) {
      delete ucCache[mid];
      return null;
    }
    return c;
  }

  function ucReq(mid) {
    return new Promise(function (resolve) {
      if (!netFetch) { resolve(null); return; }
      var done = 0;
      var timer = setTimeout(function () {
        if (done) return;
        done = 1;
        resolve(null);
      }, 8000);
      /* photo=true 才会带上顶层的 space（空间头图） */
      var u = 'https://api.bilibili.com/x/web-interface/card?mid='
        + encodeURIComponent(mid) + '&photo=true';

      netFetch.call(W, u, { credentials: 'include' }).then(function (res) {
        if (done) return;
        if (!res || !res.ok) { done = 1; clearTimeout(timer); resolve(null); return; }
        res.json().then(function (j) {
          if (done) return;
          done = 1;
          clearTimeout(timer);
          resolve(j && j.code === 0 && j.data && j.data.card ? j.data : null);
        })['catch'](function () {
          if (done) return;
          done = 1;
          clearTimeout(timer);
          resolve(null);
        });
      })['catch'](function () {
        if (done) return;
        done = 1;
        clearTimeout(timer);
        resolve(null);
      });
    });
  }

  /* 头像单独一套：加载失败退回首字圆底，不留破图 */
  function ucSetAv(u, av) {
    var e;
    if (av) {
      e = el('img', 'ucav');
      e.alt = '';
      e.referrerPolicy = 'no-referrer';
      e.src = av;
      e.onerror = function () {
        if (!e.parentNode) return;
        e.parentNode.replaceChild(el('div', 'ucav ucaf', (u || '?').slice(0, 1)), e);
      };
    } else {
      e = el('div', 'ucav ucaf', (u || '?').slice(0, 1));
    }
    if (ucAv && ucAv.parentNode) ucAv.parentNode.replaceChild(e, ucAv);
    else if (ucBody) ucBody.insertBefore(e, ucBody.firstChild);
    ucAv = e;
  }

  function ucStat(label, n) {
    var e = el('span', 'ucsi');
    e.appendChild(el('b', '', fmtNum(n || 0)));
    e.appendChild(document.createTextNode(label));
    return e;
  }

  function ucEnsure() {
    if (ucBox) return;

    ucBox = el('div', 'uc');
    ucBox.onmouseenter = ucStay;
    ucBox.onmouseleave = ucLeave;

    ucHead = el('div', 'uch');
    ucBox.appendChild(ucHead);

    ucBody = el('div', 'ucb');
    ucBox.appendChild(ucBody);

    ucName = el('div', 'ucn');
    ucSex = el('span', 'ucsx');
    ucLv = el('span', 'blv');
    var nm = el('div', 'ucnm');
    nm.appendChild(ucName);
    nm.appendChild(ucSex);
    nm.appendChild(ucLv);
    ucBody.appendChild(nm);

    ucSt = el('div', 'ucst');
    ucBody.appendChild(ucSt);

    ucSg = el('div', 'ucsg');
    ucBody.appendChild(ucSg);

    ucGo = el('a', 'ucgo', '进入主页');
    ucGo.target = '_blank';
    ucGo.rel = 'noopener noreferrer';
    ucGo.onclick = stopEv;
    ucBody.appendChild(ucGo);

    ucTip = el('div', 'uctip');
    ucBody.appendChild(ucTip);

    if (bBox) bBox.appendChild(ucBox);
  }

  /* d 为 null 时用记录里已有的头像/昵称/等级先撑住，不至于弹个空框；
     fail 只在「确实请求失败」时传 true，加载中不要显示失败提示 */
  function ucFill(o, d, fail) {
    ucEnsure();
    var card = d && d.card ? d.card : null;
    var name = (card && card.name) || o.u || '匿名';
    var mid = (card && card.mid) || o.mid;

    ucSetAv(name, ucUrl(card && card.face ? card.face : '') || o.av || '');

    ucName.textContent = name;
    ucName.title = name;

    var sex = card && card.sex;
    if (sex === '男') {
      ucSex.textContent = '♂';
      ucSex.className = 'ucsx m';
      ucSex.hidden = false;
    } else if (sex === '女') {
      ucSex.textContent = '♀';
      ucSex.className = 'ucsx f';
      ucSex.hidden = false;
    } else {
      ucSex.hidden = true;
    }

    var lv = -1;
    if (card && card.level_info && typeof card.level_info.current_level === 'number') {
      lv = card.level_info.current_level;
    } else if (o.lv >= 0) {
      lv = o.lv;
    }
    if (lv >= 0 && lv <= 6) {
      ucLv.textContent = 'LV' + lv;
      ucLv.className = 'blv blv' + lv;
      ucLv.hidden = false;
    } else {
      ucLv.hidden = true;
    }

    /* 头图在 data.space（顶层），不在 card 里，靠 photo=true 才会返回 */
    var cover = ucUrl(d && d.space ? d.space.l_img : '');
    ucHead.style.backgroundImage = cover ? 'url("' + cover.replace(/"/g, '%22') + '")' : '';

    ucSt.textContent = '';
    if (card) {
      ucSt.appendChild(ucStat('关注', card.attention));
      ucSt.appendChild(ucStat('粉丝', card.fans));
      ucSt.appendChild(ucStat('获赞', (d && d.like_num) || card.likes));
      ucSt.hidden = false;
    } else {
      ucSt.hidden = true;
    }

    var sign = card && card.sign ? card.sign : '';
    ucSg.textContent = sign;
    ucSg.hidden = !sign;

    ucGo.href = spaceUrl(mid) || 'https://www.bilibili.com';

    if (d || !fail) {
      ucTip.hidden = true;
    } else {
      ucTip.textContent = '资料没取到，可点下面进主页看';
      ucTip.hidden = false;
    }
  }

  function ucPlace() {
    if (!ucBox || !ucAnchor) return;
    var r = ucAnchor.getBoundingClientRect();
    var w = ucBox.offsetWidth || 300;
    var h = ucBox.offsetHeight || 240;
    var vw = W.innerWidth || document.documentElement.clientWidth || 0;
    var vh = W.innerHeight || document.documentElement.clientHeight || 0;

    var left = r.left;
    if (left + w > vw - 10) left = vw - w - 10;
    if (left < 10) left = 10;

    var top = r.bottom + 8;
    if (top + h > vh - 10) {
      top = r.top - h - 8;
      if (top < 10) {
        top = vh - h - 10;
        if (top < 10) top = 10;
      }
    }

    ucBox.style.left = Math.round(left) + 'px';
    ucBox.style.top = Math.round(top) + 'px';
  }

  function ucShow() {
    ucTimer = 0;
    var o = ucCur;
    if (!o || !o.mid || !bBox) return;

    ucEnsure();

    /* 先用已知数据铺一版，接口回来再补签名和统计，避免干等 */
    ucFill(o, null);
    ucPlace();

    setTimeout(function () {
      if (!ucBox || ucCur !== o) return;
      ucBox.classList.add('on');
      ucPlace();
    }, 16);

    var mid = '' + o.mid;
    var c = ucCached(mid);
    if (c) {
      ucFill(o, c.d, !c.d);
      ucPlace();
      return;
    }

    /* 缓存别无限涨：看过的用户超过 200 个就整个清掉重来（用计数器，不再 Object.keys 建数组） */
    if (ucN > 200) { ucCache = {}; ucN = 0; }

    ucReq(mid).then(function (d) {
      if (!ucCache[mid]) ucN++;
      ucCache[mid] = { d: d, t: Date.now() };
      if (!ucBox || !ucCur || ('' + ucCur.mid) !== mid) return;
      ucFill(o, d, !d);
      ucPlace();
    });
  }

  function ucStay() {
    if (ucLeaveTimer) {
      clearTimeout(ucLeaveTimer);
      ucLeaveTimer = 0;
    }
  }

  function ucHide() {
    if (ucTimer) { clearTimeout(ucTimer); ucTimer = 0; }
    if (ucLeaveTimer) { clearTimeout(ucLeaveTimer); ucLeaveTimer = 0; }
    ucCur = null;
    ucAnchor = null;
    if (ucBox) ucBox.classList.remove('on');
  }

  function ucLeave() {
    ucStay();
    ucLeaveTimer = setTimeout(ucHide, UC_LEAVE);
  }

  function ucHover(a, o) {
    if (!o || !o.mid) return;
    ucStay();
    ucAnchor = a;
    ucCur = o;
    if (ucTimer) clearTimeout(ucTimer);
    ucTimer = setTimeout(ucShow, UC_DELAY);
  }

  /* 滚动时浏览器每帧都会回调，先看一眼卡片有没有弹着，没弹就立刻走人 */
  var ucScrollQ = 0;

  function ucOnScroll() {
    if (ucScrollQ) return;
    if (!ucBox || !ucBox.classList.contains('on')) return;
    ucScrollQ = 1;
    var run = function () {
      ucScrollQ = 0;
      if (ucBox && ucBox.classList.contains('on')) ucHide();
    };
    if (W.requestAnimationFrame) W.requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  /* 面板关掉/重建时把卡片引用一起断掉，别攥着旧影子树 */
  function ucReset() {
    ucHide();
    ucBox = ucBody = ucHead = ucAv = ucName = null;
    ucSex = ucLv = ucSt = ucSg = ucGo = ucTip = null;
  }

  try {
    /* capture 是为了听到页面内部滚动容器的滚动；passive 免得浏览器
       为了判断我们会不会 preventDefault 而多等一拍 */
    W.addEventListener('scroll', ucOnScroll, { capture: true, passive: true });
    W.addEventListener('resize', ucOnScroll, { passive: true });
  } catch (e) {
    try {
      W.addEventListener('scroll', ucOnScroll, true);
      W.addEventListener('resize', ucOnScroll, false);
    } catch (e2) {}
  }

  /* 昵称：有用户编号就做成主页链接（悬停弹资料卡），否则退回纯文本 */
  function nameEl(o, cls) {
    var name = o.u || '匿名';
    var url = spaceUrl(o.mid);
    var e;
    if (!url) return el('span', cls, name);

    e = el('a', cls, name);
    e.href = url;
    e.target = '_blank';
    e.rel = 'noopener noreferrer';
    /* 只挡冒泡，保留默认跳转：中键 / 右键复制链接 / 拖拽都正常 */
    e.onclick = stopEv;
    e.onmouseenter = function () { ucHover(e, o); };
    e.onmouseleave = ucLeave;
    return e;
  }

  /* 正文下方那行：绝对时间 + 相对时间 + 点赞；啥都没有就返回 null，不留空行 */
  function metaLine(o) {
    var box = el('div', 'bmeta');
    if (o.ct) {
      var abs = fmtAbs(o.ct);
      box.appendChild(el('span', 'btime', abs));
      var rel = o.td || fmtRel(o.ct);
      /* 超过一个月的评论，相对时间会退化成日期，和左边重复了就不显示 */
      if (rel && abs.indexOf(rel) !== 0) box.appendChild(el('span', 'brel', rel));
    }
    if (o.lk > 0) box.appendChild(likeEl(o.lk));
    return box.childNodes.length ? box : null;
  }

  function kidRow(k) {
    var it = el('div', 'bsr');
    it.appendChild(avatarEl(k.u, k.av, 'bsv', 'bsv bsvf'));

    var d = el('div', 'bsd');
    var nh = el('div', 'bn');
    nh.appendChild(nameEl(k, 'bsu'));
    if (k.ip) {
      var kip = el('span', 'bip', k.ip);
      kip.title = 'IP属地：' + k.ip;
      nh.appendChild(kip);
    }
    if (k.lv >= 0) nh.appendChild(el('span', 'blv blv' + k.lv, 'LV' + k.lv));
    d.appendChild(nh);

    var tx = el('div', 'bst', k.tx || '（该评论已不可见）');
    tx.onclick = function () { tx.classList.toggle('full'); };
    d.appendChild(tx);

    var ml = metaLine(k);
    if (ml) d.appendChild(ml);

    it.appendChild(d);
    return it;
  }

  /*
   * 增量画楼中楼：每翻一页只 append 新来的那 20 条，底部提示条文本没变就不碰。
   * 旧版每次 loading 状态变化都清空重画，翻 5 页等于把前 100 条重建 5 遍。
   */
  function renderSub(rec, box) {
    if (!rec.open) { box.hidden = true; return; }
    box.hidden = false;

    var list = rec.kidAll || rec.kidList || [], i;
    var n = rec.__n || 0;

    /* 容器换过 / 列表被重置：从头画 */
    if (n > list.length) {
      box.textContent = '';
      n = 0;
      rec.__foot = null;
    }
    if (n === 0) {
      box.textContent = '';
      rec.__foot = null;
    }

    if (list.length > n) {
      var frag = document.createDocumentFragment();
      for (i = n; i < list.length; i++) frag.appendChild(kidRow(list[i]));
      if (rec.__foot && rec.__foot.parentNode === box) box.insertBefore(frag, rec.__foot);
      else box.appendChild(frag);
      rec.__n = list.length;
      n = list.length;
    }

    var total = rec.kidTotal || rec.kids || 0;
    var shown = n;
    var canLoad = rec.id != null && !!rec.oid;
    var cls = 'bsf', txt = '';

    if (rec.subLoading) {
      txt = '加载中…';
      cls += ' wait';
    } else if (rec.subErr) {
      txt = rec.subErr + ' · 点击重试';
      cls += ' err';
    } else if (shown < total) {
      if (rec.subDone) {
        if (!shown) txt = '没有可见的回复';
        else if (rec.subTrunc) txt = '仅显示前 ' + SUB_MAX + ' 条';
        else txt = '已加载 ' + shown + ' 条，其余不可见';
        cls += ' wait';
      } else if (!canLoad) {
        txt = '缺少评论参数，无法加载全部';
        cls += ' wait';
      } else {
        txt = '加载全部 ' + total + ' 条';
      }
    }

    var foot = rec.__foot;
    if (!txt) {
      if (foot && foot.parentNode === box) box.removeChild(foot);
      rec.__foot = null;
      return;
    }

    var sig = cls + '|' + txt;
    if (foot && foot.parentNode === box && foot.__sig === sig) return;

    if (!foot || foot.parentNode !== box) {
      foot = el('div', cls, txt);
      rec.__foot = foot;
      box.appendChild(foot);
    } else {
      foot.className = cls;
      foot.textContent = txt;
    }
    foot.__sig = sig;

    if (cls.indexOf('wait') === -1) {
      foot.setAttribute('role', 'button');
      foot.tabIndex = 0;
      foot.onclick = function (e) { stopEv(e); loadKids(rec); };
      foot.onkeydown = function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
          if (e.preventDefault) e.preventDefault();
          stopEv(e); loadKids(rec);
        }
      };
    } else {
      foot.removeAttribute('role');
      foot.tabIndex = -1;
      foot.onclick = null;
      foot.onkeydown = null;
    }
  }

  function refreshSub(rec) {
    if (rec.__chip) {
      rec.__chip.classList.toggle('on', !!rec.open);
      rec.__chip.setAttribute('aria-expanded', rec.open ? 'true' : 'false');
      rec.__chip.title = rec.open ? '收起楼中楼' : '展开楼中楼';
    }
    var box = rec.__sub;
    if (!box || !box.parentNode) return;   /* 被裁头/重建：状态留着，下次 row() 再画 */
    renderSub(rec, box);
  }

  function toggleSub(rec) {
    rec.open = !rec.open;
    refreshSub(rec);
  }

  function row(rec) {
    var it = el('div', 'bi');
    it.appendChild(avatarEl(rec.u, rec.av, 'ba', 'ba'));

    var main = el('div', 'bm');
    var head = el('div', 'bn');

    /* 昵称（可点进主页）→ IP属地 → 等级 → 类型 → 屏蔽原因 */
    head.appendChild(nameEl(rec, 'bu'));

    if (rec.ip) {
      var ipe = el('span', 'bip', rec.ip);
      ipe.title = 'IP属地：' + rec.ip;
      head.appendChild(ipe);
    }
    if (rec.lv >= 0) head.appendChild(el('span', 'blv blv' + rec.lv, 'LV' + rec.lv));

    head.appendChild(el('span', 'bk', rec.k === 's' ? '楼中楼' : (rec.kids ? '整楼' : '一级')));
    if (rec.why && WHY[rec.why]) head.appendChild(el('span', 'bw', WHY[rec.why]));
    main.appendChild(head);

    var tx = el('div', 'bt', rec.tx || '（无正文）');
    tx.onclick = function () { tx.classList.toggle('full'); };
    main.appendChild(tx);

    /* 正文下方：绝对时间 + 相对时间 + 点赞 + 回复数 */
    var meta = metaLine(rec);
    if (!meta) meta = el('div', 'bmeta');

    if (rec.kids) {
      var canOpen = !!(rec.kidList || (rec.id != null && rec.oid));
      var chip = el('span', 'bk' + (canOpen ? ' bkc' : ''), '含 ' + rec.kids + ' 条回复');
      if (canOpen) {
        chip.classList.toggle('on', !!rec.open);
        chip.setAttribute('role', 'button');
        chip.tabIndex = 0;
        chip.setAttribute('aria-expanded', rec.open ? 'true' : 'false');
        chip.title = rec.open ? '收起楼中楼' : '展开楼中楼';
        chip.onclick = function (e) { stopEv(e); toggleSub(rec); };
        chip.onkeydown = function (e) {
          if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
            if (e.preventDefault) e.preventDefault();
            stopEv(e); toggleSub(rec);
          }
        };
        rec.__chip = chip;
      } else {
        chip.title = '缺少评论参数，无法展开楼中楼';
        rec.__chip = null;
      }
      meta.appendChild(chip);
    } else {
      rec.__chip = null;
    }

    if (meta.childNodes.length) main.appendChild(meta);

    if (rec.kids) {
      var box = el('div', 'bsub');
      box.onclick = stopEv;
      rec.__sub = box;
      rec.__n = 0;            /* 新容器，从零画 */
      rec.__foot = null;
      main.appendChild(box);
      renderSub(rec, box);
    } else {
      rec.__sub = null;
      rec.__foot = null;
      rec.__n = 0;
    }

    it.appendChild(main);
    return it;
  }

  /*
   * 清单刷新分三档，能少干就少干：
   *   1) 整体重建（换视频 / 换档位）—— 清空重画
   *   2) 只是裁头（超过 REC_CAP 条）—— 只摘掉头部多出来的几个节点，其余不动
   *   3) 追加新记录 —— 只创建新增的那几条
   * 旧版把 2 也当 1 处理，清单展开时每清一条评论都要重画 300 行，滚动明显发涩。
   */
  function syncList() {
    if (!recOpen || !bList) return;

    var rebuild = renderedVer !== recVer || renderedN > records.length;

    if (rebuild) {
      bList.textContent = '';
      renderedN = 0;
      renderedCut = recCut;
      renderedVer = recVer;
    } else if (renderedCut !== recCut) {
      /* 裁头：只把头部多出来的节点摘掉，并补偿滚动，视觉上不跳 */
      var cut = recCut - renderedCut;
      if (cut > renderedN) cut = renderedN;
      if (cut > 0) {
        var h0 = bBody.scrollHeight, t0 = bBody.scrollTop;
        for (var q = 0; q < cut; q++) {
          if (!bList.firstChild) break;
          bList.removeChild(bList.firstChild);
        }
        renderedN -= cut;
        var dh = h0 - bBody.scrollHeight;
        if (dh > 0 && t0 > 0) bBody.scrollTop = Math.max(0, t0 - dh);
      }
      renderedCut = recCut;
    }

    if (renderedN >= records.length) return;

    var frag = document.createDocumentFragment();
    for (var i = renderedN; i < records.length; i++) frag.appendChild(row(records[i]));
    bList.appendChild(frag);
    renderedN = records.length;
  }

  /* quiet = 定时探路用：界面已经在页面上，就不必再刷一遍表头 */
  function drawBanner(quiet) {
    if (!config.showCount) {
      destroyUI();
      return;
    }

    ensureUI();
    if (!quiet) updateHead();
    ensureMounted();

    if (recOpen) {
      syncList();
    } else if (bList && renderedVer !== recVer) {
      /* 换过列表但清单没展开：顺手把隐藏的旧节点清掉，别占着内存 */
      bList.textContent = '';
      renderedN = 0;
      renderedVer = recVer;
      renderedCut = recCut;
    }
  }

  /*
   * bili-comments 是懒加载的：DOMContentLoaded 时 shadowRoot 可能还不存在，
   * 视频页还要滚到评论区分界才建。所以不能用「试 N 次就放弃」——
   * 首页加载时 DOM 抖动能在一两秒内把那点次数烧光，于是零命中的页面永远等不到框，
   * 得等下一次真的清掉评论才补插（旧版就是这个毛病）。
   *
   * 旧版靠 MutationObserver 盯着整个 <html> 的子树来抢时间。B 站首页每秒有
   * 成百上千次 DOM 变动（弹幕、播放进度、推荐流），浏览器每次都要先攒一份
   * 「哪里变了」的清单再回调过来，光这份开销就够让人感觉到卡。
   *
   * 现在改成定时探路：
   *   1) 前 3 秒 120ms 一次，赶在评论区刚建好就插进去
   *   2) 3~15 秒放到 400ms，15 秒后 1.5 秒，两分钟后完全交给 keeper
   * 每次探路的成本只有两次「元素还在不在」的判断，不再监听任何变动。
   */
  var pollTimer = 0, pollRun = 0, pollStart = 0;
  var keeper = 0;

  function stepMount() {
    pollTimer = 0;
    if (!config.showCount) { pollRun = 0; return; }
    if (bHost && bHost.isConnected) { pollRun = 0; return; }

    try { drawBanner(true); } catch (e) {}
    if (bHost && bHost.isConnected) { pollRun = 0; return; }

    var age = Date.now() - pollStart;
    if (age > 120000) { pollRun = 0; return; }      /* 交给 keeper */

    var delay = age < 3000 ? 120 : age < 15000 ? 400 : 1500;
    pollTimer = setTimeout(stepMount, delay);
  }

  function watchMount() {
    if (pollRun || !config.showCount) return;
    pollRun = 1;
    pollStart = Date.now();
    stepMount();
  }

  /* 兜底轮询：界面已经在页面上就一行判断走人；换页 / 懒加载最多 1 秒补回 */
  function tickBanner() {
    if (!config.showCount) { stopKeeper(); return; }
    if (bHost && bHost.isConnected) return;
    try { drawBanner(true); } catch (e) {}
  }

  function startKeeper() {
    if (keeper || !config.showCount) return;
    keeper = setInterval(tickBanner, 1000);
  }

  function stopKeeper() {
    if (keeper) { clearInterval(keeper); keeper = 0; }
  }

  function stopWatch() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = 0; }
    pollRun = 0;
  }

  /* ============ 拦截 ============ */

  /*
   * 复刻一份响应。改过的数据要塞回给页面，但不复制真实 Response 会有麻烦：
   *   - 有的埋点 / 日志会读 response.type、url
   *   - 被 302 跟随过的响应，body 已消费，直接 clone 会抛
   * 复制失败就原样放行（评论没删掉，但至少不炸页面），也不记数。
   */
  var RESP_KEYS = ['type', 'url', 'redirected'];

  function cloneRes(res, text) {
    var headers = new W.Headers(res.headers);
    try { headers['delete']('content-length'); } catch (e) {}
    try { headers['delete']('content-encoding'); } catch (e) {}
    var init = { status: res.status, statusText: res.statusText, headers: headers };
    for (var i = 0; i < RESP_KEYS.length; i++) {
      try { if (res[RESP_KEYS[i]] !== undefined) init[RESP_KEYS[i]] = res[RESP_KEYS[i]]; } catch (e) {}
    }
    var out;
    try { out = new W.Response(text, init); }
    catch (e) { out = new W.Response(text); }

    for (var j = 0; j < RESP_KEYS.length; j++) {
      (function (k) {
        try {
          Object.defineProperty(out, k, { configurable: true, get: function () { return res[k]; } });
        } catch (e) {}
      })(RESP_KEYS[j]);
    }
    return out;
  }

  function hookFetch() {
    var raw = W.fetch;
    if (typeof raw !== 'function' || raw.__dfy) return;

    var wrapped = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var kind = apiKind(url);
      var promise = raw.apply(this, arguments);
      if (!kind) return promise;

      var first = kind === 1 && isFirstPageReq(url);

      return promise.then(function (res) {
        if (!res || !res.ok) return res;
        return res.clone().text().then(function (txt) {
          var json;
          try { json = JSON.parse(txt); } catch (e) { return res; }

          var r = null;
          try { r = filterPayload(json, kind, url); } catch (e) { return res; }

          /* 首屏：换成新的那个列表，数字重新算（请求失败就不动）。
             零命中也要重画一次，保证「已清 0 条」的框在数据回来时就位 */
          if (first && r) { onFirstPage(); schedulePaint(); }
          if (!r || !r.items.length) return res;

          var out;
          try { out = cloneRes(res, JSON.stringify(json)); }
          catch (e) { return res; }

          /* 真的交给页面了才记账 */
          settle(r);
          return out;
        })['catch'](function () { return res; });
      });
    };

    wrapped.__dfy = 1;
    W.fetch = wrapped;
  }

  /*
   * XHR：responseText / response 都是只读原型属性，只能在实例上挂 getter 覆盖。
   *
   * 关键是「什么时候覆盖」。如果等 readystatechange 再挂，就依赖监听器的注册顺序——
   * 页面只要比我们早注册（比如 open 之前就挂了 onloadend），它读到的就是原始数据：
   * 评论没删掉，数字却涨了。这是最难复现的那类 bug。
   *
   * 所以改成「读的时候才变」：在 send() 里就挂上 getter，
   * 不管页面从哪个回调、按什么顺序读，读到的都是过滤后的数据。
   */
  function hookXHR() {
    var XHR = W.XMLHttpRequest;
    if (!XHR || XHR.__dfy) return;

    var proto = XHR.prototype;
    var dText = null, dResp = null;
    try {
      dText = Object.getOwnPropertyDescriptor(proto, 'responseText');
      dResp = Object.getOwnPropertyDescriptor(proto, 'response');
    } catch (e) {}
    if (!dText || !dText.get || !dResp || !dResp.get) return;

    var getText = dText.get;
    var getResp = dResp.get;

    /* 一份响应只解析一次，两个属性共用结果 */
    function once(xhr) {
      if (xhr.__dfyDone) return xhr.__dfyCache;
      if (xhr.readyState !== 4) return null;          /* 还在下载，先别缓存 */
      if (!xhr.__dfyKind) return null;
      if (xhr.status < 200 || xhr.status >= 300) { xhr.__dfyDone = 1; return (xhr.__dfyCache = null); }

      xhr.__dfyDone = 1;
      var r = null;
      try {
        var rt = xhr.responseType;
        var isJson = rt === 'json';
        if (!isJson && rt !== '' && rt !== 'text') { return (xhr.__dfyCache = null); }

        var raw = isJson ? getResp.call(xhr) : getText.call(xhr);
        if (!raw) return (xhr.__dfyCache = null);

        var obj = isJson ? raw : JSON.parse(raw);
        var f = filterPayload(obj, xhr.__dfyKind, xhr.__dfyUrl);
        /* 首屏：换成新列表，重新算；零命中同样要重画，框才不会被漏掉 */
        if (xhr.__dfyFirst && f) { onFirstPage(); schedulePaint(); }
        if (!f || !f.items.length) return (xhr.__dfyCache = null);
        f.isJson = isJson;
        f.obj = obj;
        f.out = isJson ? obj : JSON.stringify(obj);
        settle(f);          /* 改过之后才记账 */
        r = f;
      } catch (err) { r = null; }
      return (xhr.__dfyCache = r);
    }

    var open = proto.open;
    proto.open = function (m, url) {
      this.__dfyKind = apiKind(url);
      this.__dfyFirst = this.__dfyKind === 1 && isFirstPageReq(url);
      this.__dfyUrl = typeof url === 'string' ? url : (url && url.href) || '';
      this.__dfyDone = 0;        /* 实例会被连接池复用，每次 open 都要重置 */
      this.__dfyCache = null;
      return open.apply(this, arguments);
    };

    var send = proto.send;
    proto.send = function () {
      var xhr = this;
      if (xhr.__dfyKind) {
        try {
          Object.defineProperty(xhr, 'responseText', {
            configurable: true,
            get: function () {
              if (xhr.responseType === 'json') return getText.call(xhr);  /* 原生就该抛 */
              var r = once(xhr);
              return (r && r.items.length) ? r.out : getText.call(xhr);
            }
          });
          Object.defineProperty(xhr, 'response', {
            configurable: true,
            get: function () {
              var r = once(xhr);
              return (r && r.items.length) ? (r.isJson ? r.obj : r.out) : getResp.call(xhr);
            }
          });
        } catch (e) {}
      }
      return send.apply(this, arguments);
    };

    XHR.__dfy = 1;
  }

  /* ============ 启动 ============ */

  hookFetch();
  hookXHR();

  function boot() {
    watchTheme();
    if (!config.showCount) return;

    startKeeper();          /* 低频兜底：换页 / 懒加载最多 1 秒补回 */
    drawBanner();
    /* 还没插上（评论区懒加载中）就密一点探路，插上即停 */
    if (!bHost || !bHost.isConnected) watchMount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  /* 从后台切回前台时立刻补一次：后台标签页的定时器会被浏览器压到 1 秒以上，
     回来时可能正好错过评论区重建那一瞬间 */
  try {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden || !config.showCount) return;
      if (bHost && bHost.isConnected) return;
      drawBanner();
      if (!bHost || !bHost.isConnected) watchMount();
    });
  } catch (e) {}

  /* Esc：先收清单，再关设置面板。事件要从页面的 window 上听 */
  try {
    (W.addEventListener ? W : document).addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (recOpen) { setOpen(false); return; }
        closePanel();
      }
    }, true);
  } catch (e) {}

  if (typeof GM_registerMenuCommand === 'function') {
    try {
      GM_registerMenuCommand('设置', openPanel);
    } catch (e) {}
  }

})();
