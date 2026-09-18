/**
 * 다국어(한/영/중/일) — 유저 여정 화면 전용.
 * 가맹점·관리자 화면은 운영자(한국인) 대상이라 한국어 고정.
 * 매장이 입력한 콘텐츠(딜 제목·가게 소개 등)는 원문 그대로 보여준다.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { track } from './analytics';
import { setApiLang } from './api';
import { C } from './theme';

export type Lang = 'ko' | 'en' | 'zh' | 'ja';
export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: 'ko', label: '한국어', short: '한' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'zh', label: '中文', short: '中' },
  { code: 'ja', label: '日本語', short: '日' },
];
const IDX: Record<Lang, number> = { ko: 0, en: 1, zh: 2, ja: 3 };

/** [ko, en, zh, ja] */
const D: Record<string, [string, string, string, string]> = {
  // ── 공통 ──
  confirm: ['확인', 'OK', '确认', '確認'],
  close: ['닫기', 'Close', '关闭', '閉じる'],
  cancel: ['취소', 'Cancel', '取消', 'キャンセル'],
  view: ['보기', 'View', '查看', '見る'],
  all: ['전체', 'All', '全部', 'すべて'],
  more: ['전체보기', 'See all', '查看全部', 'すべて見る'],
  goLogin: ['로그인하러 가기', 'Sign in', '去登录', 'ログインする'],
  memberPrice: ['멤버십가', 'Member price', '会员价', '会員価格'],
  memberOnly: ['멤버 전용', 'Members only', '会员专享', '会員限定'],
  ad: ['광고', 'Ad', '广告', '広告'],
  soldOut: ['품절', 'Sold out', '已售罄', '完売'],
  closedNow: ['마감', 'Ended', '已结束', '終了'],
  people: ['{n}명', '{n} ppl', '{n}人', '{n}名'],
  qtyLeft: ['{n}개 남음', '{n} left', '剩{n}份', '残り{n}個'],
  daysLeft: ['{d}일 남음', '{d}d left', '剩{d}天', '残り{d}日'],
  hoursLeft: ['{h}시간 남음', '{h}h left', '剩{h}小时', '残り{h}時間'],
  hoursMinLeft: ['{h}시간 {m}분 남음', '{h}h {m}m left', '剩{h}小时{m}分', '残り{h}時間{m}分'],
  minLeft: ['{m}분 남음', '{m}m left', '剩{m}分钟', '残り{m}分'],
  untilDate: ['~{date} 까지', 'Until {date}', '截至{date}', '{date}まで'],

  // ── 탭/헤더 ──
  tabHome: ['홈', 'Home', '首页', 'ホーム'],
  tabDrop: ['DROP', 'DROP', 'DROP', 'DROP'],
  tabStore: ['할인 쿠폰', 'Coupons', '优惠券', 'クーポン'],
  tabScan: ['사용', 'Use', '使用', '使う'],
  tabMy: ['MY', 'MY', 'MY', 'MY'],
  titleDrops: ['오늘의 DROP', "Today's DROP", '今日DROP', '本日のDROP'],
  titleStore: ['할인 쿠폰', 'Coupons', '优惠券', 'クーポン'],
  titleScan: ['매장에서 사용', 'Use in store', '到店使用', '店舗で使う'],
  titleBenefits: ['할인 쿠폰', 'Coupons', '优惠券', 'クーポン'],
  titleWallet: ['이용권 · 예약', 'Tickets · Bookings', '票券·预订', 'チケット・予約'],
  titleStoreDetail: ['매장', 'Store', '店铺', '店舗'],
  titleProduct: ['상품', 'Product', '商品', '商品'],
  titleDone: ['사용 완료', 'Redeemed', '使用完成', '利用完了'],

  // ── 홈 ──
  heroGuest: ['부산 놀러갈 땐,\n홀릭잼 🌊', 'Your trip to Busan,\nwith HOLIC GEM 🌊', '来釜山玩，\n就用HOLIC GEM 🌊', '釜山を遊ぶなら、\nHOLIC GEM 🌊'],
  greetHi: ['{nick}님 👋', 'Hi {nick} 👋', '{nick}，你好 👋', '{nick}さん 👋'],
  planInUse: ['{plan} 이용 중', 'On {plan}', '正在使用{plan}', '{plan}利用中'],
  startMembership: ['멤버십을 시작해 보세요', 'Start your membership', '开通会员吧', 'メンバーシップを始めよう'],
  savedThisMonth: ['이번 달 {amt} 아꼈어요', 'Saved {amt} this month', '本月已省{amt}', '今月{amt}お得'],
  recoveryRate: [' · 회수율 {r}%', ' · {r}% recovered', ' · 回本率{r}%', ' · 回収率{r}%'],
  joinCta: ['3초 간편가입하고 오늘 혜택 받기', 'Join in 3 seconds, save today', '3秒注册，立享优惠', '3秒で登録して今日からお得に'],
  start: ['시작하기', 'Start', '开始', 'はじめる'],
  couponSection: ['오늘의 무료 쿠폰 ⏰', 'Free coupons today ⏰', '今日免费优惠券 ⏰', '本日の無料クーポン ⏰'],
  couponSectionSub: ['정해진 시간에 선착순으로 열려요', 'First come, first served at set times', '定时开抢，先到先得', '決まった時間に先着順でオープン'],
  couponMeta: ['{name} · 매일 {times} · 받으면 {h}시간 유효', '{name} · Daily {times} · Valid {h}h', '{name} · 每天{times} · 领取后{h}小时有效', '{name} · 毎日{times} · 受取後{h}時間有効'],
  claim: ['받기', 'Get', '领取', 'もらう'],
  couponLeft: ['{n}장 남음', '{n} left', '剩{n}张', '残り{n}枚'],
  opensAt: ['{time} 오픈', 'Opens {time}', '{time}开抢', '{time}オープン'],
  opensInHM: ['{h}시간 {m}분 후 오픈', 'Opens in {h}h {m}m', '{h}小时{m}分后开抢', 'あと{h}時間{m}分'],
  opensInMS: ['{m}분 {s}초 후 오픈', 'Opens in {m}m {s}s', '{m}分{s}秒后开抢', 'あと{m}分{s}秒'],
  couponSoldout: ['소진 완료', 'All gone', '已抢完', '配布終了'],
  couponEnded: ['오늘 마감', 'Closed today', '今日已结束', '本日終了'],
  couponTomorrow: ['내일 {time}에 다시', 'Back at {time} tmrw', '明天{time}再来', '明日{time}にまた'],
  couponUpsell: ['멤버십은 기다림 없이 모든 혜택 상시 오픈 →', 'Members get every perk, no waiting →', '会员无需等待，全部优惠随时用 →', 'メンバーは待たずに全特典オープン →'],
  couponGot: ['쿠폰 도착 🎉', 'Coupon claimed 🎉', '优惠券到手 🎉', 'クーポンGET 🎉'],
  couponFail: ['받을 수 없어요', "Couldn't claim", '无法领取', '受け取れません'],
  dropSection: ['오늘 도착한 DROP ⚡', "Today's DROP ⚡", '今日新到DROP ⚡', '本日到着のDROP ⚡'],
  dropSectionSub: ['매일 아침 10시, 한정수량으로 열려요', 'Every day at 10 AM, limited stock', '每天上午10点限量开抢', '毎朝10時、数量限定でオープン'],
  activitySection: ['바다부터 도심까지 🏄', 'From sea to city 🏄', '从大海到市区 🏄', '海から街まで 🏄'],
  activitySectionSub: ['결제하면 예약까지 한 번에 끝나요', 'Pay once, booking included', '付款即完成预订', '決済と同時に予約完了'],
  myBenefitSection: ['지금 쓸 수 있는 할인 쿠폰 🎟️', 'Coupons ready now 🎟️', '现在可用的优惠券 🎟️', '今使えるクーポン 🎟️'],
  myBenefitSectionSub: ['{n}개 매장에서 기다리고 있어요', 'Waiting at {n} stores', '{n}家店铺等着你', '{n}店舗で待っています'],
  catMarine: ['해양레저', 'Marine', '海上活动', 'マリン'],
  catFood: ['맛집', 'Food', '美食', 'グルメ'],
  catCafe: ['카페', 'Cafe', '咖啡', 'カフェ'],
  catBar: ['펍·바', 'Pub·Bar', '酒吧', 'バー'],
  catExhibit: ['전시', 'Exhibit', '展览', '展示'],
  catKids: ['키즈', 'Kids', '亲子', 'キッズ'],

  // ── 기획전 ──
  titleCampaign: ['기획전', 'Event', '专题活动', '特集'],
  onePerPerson: ['1인 1장', '1 per person', '每人限1张', 'お一人様1枚'],
  perPersonMax: ['1인 {n}장', 'Max {n}/person', '每人限{n}张', 'お一人{n}枚'],
  subsidyNotice: ['지자체 지원 할인이 적용된 가격이에요', 'Prices include a local-government subsidy discount', '价格已含地方政府补贴优惠', '自治体の支援割引が適用された価格です'],

  // ── DROP 탭 ──
  noDropsRegion: ['이 지역에는 아직 오픈된 DROP이 없어요', 'No open DROPs in this area yet', '该地区暂无DROP', 'このエリアにはまだDROPがありません'],
  onePerN: ['1개={n}인', '1 for {n}', '1份{n}人', '1個={n}名'],
  membershipOnly: ['멤버십 전용', 'Membership only', '会员专享', 'メンバー限定'],

  // ── 혜택(스토어) 탭 ──
  bannerAll: ['멤버십 하나로 아래 모든 매장 혜택이 한 번에 열려요', 'One membership unlocks every store perk below', '一份会员，解锁下方所有店铺优惠', 'メンバーシップ1つで下の全店舗の特典が使えます'],
  bannerCta: ['{price}부터 →', 'From {price} →', '{price}起 →', '{price}から →'],
  allRegions: ['전체 지역', 'All areas', '全部地区', '全エリア'],
  noMerchants: ['조건에 맞는 제휴 매장이 없어요', 'No stores match the filters', '没有符合条件的店铺', '条件に合う店舗がありません'],
  metaDrop: ['DROP {n}', 'DROP {n}', 'DROP {n}', 'DROP {n}'],
  metaProduct: ['예약상품 {n}', 'Bookables {n}', '可预订{n}', '予約商品{n}'],
  lockedForMember: ['멤버십 시 사용 가능', 'For members', '会员可用', 'メンバーで利用可'],

  // ── 사용(스캔) 탭 ──
  scanLoginGuide: ["로그인하면 지금 매장에서 쓸 수 있는\n쿠폰과 이용권이 여기 모여요.","Sign in to see the coupons and tickets\nyou can use right now.","登录后，现在可用的\n优惠券和票券会集中显示在这里。","ログインすると今使える\nクーポンとチケットがここに集まります。"],
  howToUse: ['사용 방법', 'How it works', '使用方法', '使い方'],
  step1: ["1. 쓸 쿠폰이나 이용권의 [사용하기]를 누르세요","1. Tap [Use] on the coupon or ticket","1. 点击优惠券或票券的[使用]","1. クーポンかチケットの[使う]を押す"],
  step2: ["2. 화면을 사장님께 보여주세요","2. Show the screen to the staff","2. 向店员出示画面","2. 画面をスタッフに見せる"],
  step3: ["3. 사장님이 확인을 누르면 사용 완료","3. Staff taps confirm and you are done","3. 店员点击确认即完成","3. スタッフが確認を押せば完了"],
  scanFrameGuide: ['매장 QR을 틀 안에 비춰주세요', 'Point the frame at the store QR', '将店铺二维码对准框内', '店舗QRを枠内に映してください'],
  scanAuto: ['버튼을 누를 필요 없이 자동으로 인식됩니다', 'It scans automatically — no button needed', '无需按键，自动识别', 'ボタン不要で自動認識されます'],
  scanBtn: ['매장 QR 스캔하기', 'Scan store QR', '扫描店铺二维码', '店舗QRをスキャン'],
  scanFallback: ['QR을 스캔할 수 없나요?', "Can't scan the QR?", '无法扫码？', 'QRを読み取れない場合'],
  manualLabel: ['매장 QR 아래에 적힌 코드를 입력하세요', 'Enter the code under the store QR', '请输入二维码下方的代码', 'QR下のコードを入力してください'],
  camPerm: ['카메라 권한이 필요해요. 설정에서 카메라를 허용해 주세요.', 'Camera permission needed. Please allow it in Settings.', '需要相机权限，请在设置中允许。', 'カメラの許可が必要です。設定で許可してください。'],

  // ── MY ──
  myHero: ['3초 만에 시작하세요', 'Start in 3 seconds', '3秒即可开始', '3秒ではじめよう'],
  myHeroSub: ['아이디·비밀번호 없이 간편하게.\n나머지 정보는 필요한 순간에만 받을게요.', 'No ID or password needed.\nWe only ask for info when needed.', '无需账号密码，轻松登录。\n其他信息仅在需要时索取。', 'ID・パスワード不要でかんたん。\n必要な時だけ情報をお聞きします。'],
  socialKakao: ['카카오로 시작', 'Continue with Kakao', '用Kakao登录', 'Kakaoではじめる'],
  socialNaver: ['네이버로 시작', 'Continue with Naver', '用Naver登录', 'Naverではじめる'],
  socialGoogle: ['Google로 시작', 'Continue with Google', '用Google登录', 'Googleではじめる'],
  socialApple: ['Apple로 시작', 'Continue with Apple', '用Apple登录', 'Appleではじめる'],
  demoNote: ['데모 기간: 임시 계정으로 로그인됩니다 (소셜 연동 전)', 'Demo period: signs in with a temp account', '演示期间：使用临时账号登录', 'デモ期間：仮アカウントでログインされます'],
  loginFail: ['로그인 실패', 'Sign-in failed', '登录失败', 'ログイン失敗'],
  freeTier: ['일반회원', 'Free member', '普通会员', '一般会員'],
  cardSaved: ['이번 달 {amt} 절약', 'Saved {amt} this month', '本月已省{amt}', '今月{amt}節約'],
  cardNoPlan: ['멤버십을 시작하면 제휴 혜택이 한 번에 열려요', 'Start membership to unlock every partner perk', '开通会员，所有优惠一键解锁', 'メンバーシップで提携特典が一気にオープン'],
  startPlanSection: ['멤버십 시작하기', 'Start membership', '开通会员', 'メンバーシップを始める'],
  startShort: ['시작', 'Start', '开通', '開始'],
  buyConfirmWeb: ['{plan} ({price})을 시작할까요?\n결제는 데모(모의결제)로 처리됩니다.', 'Start {plan} ({price})?\nPayment is a demo (mock).', '开通{plan}（{price}）吗？\n付款为演示（模拟支付）。', '{plan}（{price}）を始めますか？\n決済はデモ（模擬決済）です。'],
  buyConfirmNative: ['{price} · {days}일\n결제는 데모(모의결제)로 처리됩니다.', '{price} · {days} days\nPayment is a demo (mock).', '{price} · {days}天\n付款为演示（模拟支付）。', '{price} · {days}日\n決済はデモ（模擬決済）です。'],
  memberStarted: ['멤버십 시작!', 'Membership started!', '会员开通成功！', 'メンバーシップ開始！'],
  cantBuy: ['구매할 수 없습니다', "Can't purchase", '无法购买', '購入できません'],
  loadFailed: ['불러오지 못했습니다.\n네트워크를 확인하고 다시 시도해 주세요.', 'Failed to load.\nCheck your network and try again.', '加载失败。\n请检查网络后重试。', '読み込みに失敗しました。\nネットワークを確認して再試行してください。'],
  retry: ['다시 시도', 'Try again', '重试', '再試行'],
  showStaffFirst: ['직원에게 이 화면을 보여주고\n확인 버튼을 눌러주세요', 'Show this screen to the staff,\nthen tap Confirm', '请向店员出示此画面\n然后点击确认', 'スタッフにこの画面を見せて\n確認ボタンを押してください'],
  confirmUse: ['확인 (사용 처리)', 'Confirm (mark as used)', '确认（核销）', '確認（使用処理）'],
  usedDoneTitle: ['사용 완료!', 'Done!', '使用完成！', '使用完了！'],
  usedSaved: ['{amt} 아꼈어요', 'You saved {amt}', '节省了{amt}', '{amt}お得になりました'],
  couponCat: ['할인 쿠폰', 'Coupons', '优惠券', 'クーポン'],
  couponSectionHome: ['할인 쿠폰 🎟️', 'Coupons 🎟️', '优惠券 🎟️', 'クーポン 🎟️'],
  savedTitle: ['담은 목록', 'Saved', '收藏清单', '保存リスト'],
  savedLink: ['담은 목록', 'Saved list', '收藏清单', '保存リスト'],
  savedLinkSub: ['찜해둔 쿠폰과 상품', 'Coupons & products you saved', '收藏的优惠券和商品', '保存したクーポンと商品'],
  // --- 내 쿠폰 (결제 상품에 묶여 받은 쿠폰) · 2026-09-12 대표 확정 ---
  // --- 현장 확인용 티켓 카드 (2026-09-12 대표: 직원이 한눈에) ---
  factWhen: ['사용일', 'Date', '使用日', '利用日'],
  factWho: ['인원', 'People', '人数', '人数'],
  factStatus: ['상태', 'Status', '状态', 'ステータス'],
  usableNow: ['사용 가능', 'Ready', '可使用', '利用可'],
  anytime: ['기간 내 아무때나', 'Anytime within period', '有效期内随时', '期間内いつでも'],
  // --- 아직 열리지 않은 쿠폰 (현장에서 이용권을 써야 열림) · 2026-09-12 대표 확정 ---
  pendingUse: ['이용권 쓰면', 'After using pass', '使用券使用后', '利用券の後'],
  pendingHint: ['{name} 이용권을 현장에서 사용하면 이 쿠폰이 열려요', 'Use the {name} pass at the shop to open this coupon', '在店内使用{name}使用券后开启', '店で{name}利用券を使うと開きます'],
  pendingGuide: ['현장에서 이용권을 쓰면 쿠폰이 열려요', 'Your coupons open when you use the pass', '在现场使用使用券后优惠券开启', '現場で利用券を使うとクーポンが開きます'],
  couponsOpened: ['할인 쿠폰 {n}장이 열렸어요', '{n} coupons just opened', '{n}张优惠券已开启', 'クーポン{n}枚が開きました'],
  seeMyCoupons: ["내 구매에서 보기", "See in My purchases", "在我的购买中查看", "購入したものを見る"],
  nOpenNPending: ['쓸 수 있는 {a}장 · 잠긴 {b}장', '{a} ready · {b} locked', '可用{a}张 · 未开启{b}张', '使える{a}枚 · 未開放{b}枚'],
  // --- 사용 처리: 사장님이 확인 (2026-09-15) ---
  ownerBadge: ["사장님 확인","Staff confirm","店员确认","スタッフ確認"],
  ownerShowGuide: ["이 화면을 사장님께 보여주세요.\n사장님이 아래 버튼을 누르면 사용 처리됩니다.","Show this screen to the staff.\nThe staff taps the button below to confirm.","请向店员出示此画面。\n店员点击下方按钮即完成核销。","この画面をスタッフに見せてください。\nスタッフが下のボタンを押すと使用完了です。"],
  ownerCodeGuide: ["휴대폰을 사장님께 건네주세요.\n사장님이 매장 코드를 입력하면 사용 처리됩니다.","Hand your phone to the staff.\nThe staff enters the store code to confirm.","请将手机交给店员。\n店员输入门店代码即完成核销。","スマホをスタッフに渡してください。\nスタッフが店舗コードを入力すると使用完了です。"],
  ownerConfirmBtn: ["사장님 확인 · 사용 처리","Staff: confirm use","店员确认 · 核销","スタッフ確認・使用処理"],
  storeCodePh: ["매장 코드","Store code","门店代码","店舗コード"],
  whichStore: ["어느 가게에 계세요? (가게 이름)","Which store are you at?","您在哪家店？","どのお店にいますか？"],
  noSearchHit: ["찾는 가게가 없어요. 이름을 다시 확인해 주세요","No store found. Check the name again","未找到该门店，请再确认名称","お店が見つかりません。名前をご確認ください"],
  usableCoupons: ["지금 쓸 수 있는 쿠폰","Coupons you can use now","现在可用的优惠券","今使えるクーポン"],
  nothingToUse: ["지금 쓸 수 있는 쿠폰이나 이용권이 없어요","Nothing to use right now","目前没有可用的优惠券或票券","今使えるクーポンやチケットはありません"],
  freeUseNote: ["무료 회원은 결제한 상품에 딸린 쿠폰만 쓸 수 있어요. 잼을 시작하면 부산 전체 쿠폰을 쓸 수 있어요.","Free members can use only coupons that come with a purchase. Start a JAM to use every coupon in Busan.","免费会员只能使用购买商品附带的优惠券。开通JAM即可使用釜山全部优惠券。","無料会員は購入した商品に付いたクーポンだけ使えます。JAMを始めると釜山の全クーポンが使えます。"],
  pendingNote: ["이용권을 쓰면 열리는 쿠폰이 {n}장 있어요","{n} coupons open when you use your ticket","使用票券后将开启{n}张优惠券","チケットを使うと開くクーポンが{n}枚あります"],
  onlyThisStore: ["{name}에서 쓸 수 있는 것만 보는 중","Showing only {name}","仅显示{name}可用项","{name}で使えるものだけ表示中"],
  // --- 잼 여러 개 · 단체 코드 (2026-09-18 대표 확정) ---
  myJams: ["가진 잼","My JAMs","我的JAM","マイJAM"],
  addJamSection: ["잼 더하기","Add another JAM","添加JAM","JAMを追加"],
  orgCodeTitle: ["단체 코드","Organization code","团体代码","団体コード"],
  orgCodeHint: ["회사나 기관에서 받은 코드를 넣으면 전용 잼을 살 수 있어요","Enter the code from your workplace to unlock its JAM","输入单位提供的代码即可购买专属JAM","職場で受け取ったコードを入れると専用JAMを買えます"],
  orgCodeSet: ["등록된 코드: {code}","Registered: {code}","已登记：{code}","登録済み：{code}"],
  orgCodeBtn: ["코드 넣기","Enter code","输入代码","コード入力"],
  orgCodeAsk: ["단체 코드를 입력해 주세요","Enter your organization code","请输入团体代码","団体コードを入力してください"],
  orgCodeDone: ["{name}을(를) 살 수 있어요","You can now buy {name}","现在可以购买{name}","{name}を購入できます"],
  // ── 잼 탭 (2026-09-18 하단바 개편) ──
  tabJam: ["잼","JAM","JAM","JAM"],
  titleJam: ["잼 고르기","Choose your JAM","选择JAM","JAMを選ぶ"],
  jamLead: ["잼을 시작하면 부산 곳곳의 할인 쿠폰이 열려요","Start a JAM and coupons across Busan open up","开通JAM即可使用釜山各地优惠券","JAMを始めると釜山中のクーポンが使えます"],
  jamDays: ["{n}일 동안","{n} days","{n}天","{n}日間"],
  jamScopeAll: ["부산 전체 쿠폰","All Busan coupons","釜山全部优惠券","釜山全体のクーポン"],
  jamScopePicked: ["지정한 가게 쿠폰","Selected stores only","指定门店优惠券","指定店舗のクーポン"],
  jamScopeMore: ["{name} 외 {n}곳","{name} +{n} more","{name}等{n}处","{name}ほか{n}件"],
  orgOnly: ["단체 전용","Members of your org","团体专属","団体限定"],
  jamCalcTitle: ["내 여행으로 얼마 아끼는지 보기","See how much you'd save","看看能省多少","どれだけ得するか見る"],
  jamCalcSub: ["날짜와 인원만 넣으면 예상 절약 금액이 나와요","Just dates and headcount — we do the math","只需日期和人数，自动算出节省金额","日付と人数を入れるだけで節約額が出ます"],
  jamFoot: ["잼은 겹쳐 둘 수 있어요. 5일잼을 쓰는 중에 잼마스터를 사면 둘 다 살아 있고 혜택은 합쳐집니다.","JAMs stack. Buy JAM Master while your 5-Day JAM is running and both stay active — the benefits combine.","JAM可叠加。5日JAM使用期间购买JAM大师，两者同时有效，权益合并。","JAMは重ねられます。5日JAMの利用中にJAMマスターを買うと両方有効で、特典は合算されます。"],
  jamLoginFirst: ["잼을 사려면 먼저 로그인해 주세요","Sign in to buy a JAM","购买JAM请先登录","JAMの購入にはログインが必要です"],
  jamAllOwned: ["살 수 있는 잼을 모두 가지고 계세요","You already have every JAM on sale","您已拥有全部在售JAM","販売中のJAMをすべてお持ちです"],
  // ── 잼 결제 화면 (2026-09-18) ──
  titleJamBuy: ["잼 시작하기","Start a JAM","开通JAM","JAMを始める"],
  titleJamDone: ["결제 완료","Payment complete","支付完成","決済完了"],
  jamOpensTitle: ["이 잼으로 열리는 것","What this JAM opens","此JAM可用的优惠","このJAMで開くもの"],
  jamOpensCoupons: ["할인 쿠폰","Coupons","优惠券","クーポン"],
  jamOpensMerchants: ["가게","Places","门店","お店"],
  jamOpensMore: ["그리고 {n}개가 더 있어요","and {n} more","还有{n}个","ほかに{n}件"],
  jamStartPick: ["고른 날 0시부터 시작해요. 미리 사 두셔도 괜찮아요","It starts at 00:00 on the day you pick — buying early is fine","从所选日期0点开始，可以提前购买","選んだ日の0時から始まります。前もって買っても大丈夫です"],
  jamTripDay: ["여행","Trip","行程","旅行"],
  jamPeriod: ["{from} 0시 ~ {to} 까지 쓸 수 있어요","Usable {from} 00:00 – {to}","{from}0点 ~ {to}可用","{from}0時 ~ {to}まで使えます"],
  jamPeriodLabel: ["사용 기간","Period","使用期间","利用期間"],
  payMethod: ["결제 수단","Payment","支付方式","お支払い"],
  payMock: ["PG 연동 전이라 모의결제로 진행됩니다. 실제로 돈이 빠져나가지 않아요.","Payment is simulated until the PG is connected — no real charge.","支付网关接入前为模拟支付，不会实际扣款。","PG接続前のため模擬決済です。実際の請求はありません。"],
  payAmount: ["결제 금액","Total","支付金额","お支払い金額"],
  jamBuyFoot: ["잼은 겹쳐 둘 수 있어요. 이미 쓰는 잼이 있어도 새 잼을 더하면 혜택이 합쳐집니다.","JAMs stack — add another and the benefits combine.","JAM可叠加，再买一个权益会合并。","JAMは重ねられます。追加すると特典が合算されます。"],
  nPlaces: ["{n}곳","{n} places","{n}处","{n}件"],
  orderNo: ["주문번호","Order no.","订单号","注文番号"],
  jamDoneTitle: ["{name} 시작!","{name} is on!","{name} 已开通！","{name} スタート！"],
  jamDoneNow: ["지금부터 할인 쿠폰을 쓸 수 있어요","You can use coupons right now","现在就可以使用优惠券","今すぐクーポンを使えます"],
  jamDoneUpcoming: ["고른 날 0시가 되면 자동으로 열려요","It opens automatically at 00:00 on your start date","所选日期0点自动开启","選んだ日の0時に自動で開きます"],
  jamDoneGoCoupons: ["열린 쿠폰 보러 가기","See the coupons","去看优惠券","開いたクーポンを見る"],
  jamDoneGoTrip: ["내 여행에 담으러 가기","Plan my trip","加入我的行程","旅程に入れる"],
  jamDoneNoteNow: ["매장에서 [사용하기]를 누르고 사장님이 확인하면 끝입니다. 사진 찍을 일은 없어요.","At the store, tap [Use] and the staff confirms. No photos needed.","在店内点击[使用]，由店员确认即可，无需拍照。","店で[使う]を押し、スタッフが確認すれば完了。写真は不要です。"],
  jamDoneNoteUpcoming: ["시작일이 되기 전에도 상품은 회원가로 살 수 있어요.","You can already buy products at the member price before it starts.","开始前也可以用会员价购买商品。","開始前でも商品は会員価格で買えます。"],
  tripLinkSub: ["담은 것을 날짜에 놓고 절약 금액 보기","Place saved items on days and see your savings","把收藏放到日期上，查看节省金额","保存した項目を日付に置いて節約額を見る"],
  jamScopeRegion: ["이 지역 쿠폰","Coupons in this area","该地区优惠券","この地域のクーポン"],
  jamScopeCategory: ["이 종류 쿠폰","Coupons of this kind","该类型优惠券","この種類のクーポン"],
  notInMyJam: ["내 잼에 없는 쿠폰","Not in your JAM","不在您的JAM中","マイJAMにないクーポン"],
  goOtherJam: ["이 쿠폰은 지금 가진 잼에 들어 있지 않아요.\n다른 잼을 보시겠어요?","This coupon is not in your JAM.\nWant to see other JAMs?","该优惠券不在您的JAM中。\n要看看其他JAM吗？","このクーポンはお持ちのJAMに含まれていません。\n他のJAMを見ますか？"],
  myCouponsLink: ['내 쿠폰', 'My coupons', '我的优惠券', 'マイクーポン'],
  myCouponsLinkSub: ['결제하고 받은 쿠폰', 'Coupons you got with a purchase', '购买商品获得的优惠券', '購入でもらったクーポン'],
  myCouponsLabel: ['결제하고 받은 쿠폰', 'Coupons you received', '已获得的优惠券', 'もらったクーポン'],
  nCoupons: ['{n}장', '{n} coupons', '{n}张', '{n}枚'],
  myCouponsSub: ['여기 있는 쿠폰은 지금 바로 쓸 수 있어요', 'These are ready to use right now', '这些可以立即使用', 'これらは今すぐ使えます'],
  myCouponsEmpty: ['아직 받은 쿠폰이 없어요. 상품을 예약하면 근처 할인 쿠폰을 함께 드려요', 'No coupons yet. Book a product and get nearby coupons with it', '还没有优惠券。预订商品即可获得附近优惠券', 'まだありません。商品を予約すると近くのクーポンがもらえます'],
  bundledWith: ["이 상품과 함께 받은 쿠폰 {n}장","{n} coupons that came with this","随此商品获得的优惠券{n}张","この商品と一緒にもらったクーポン{n}枚"],
  otherBundled: ["그 밖에 받은 쿠폰","Other coupons you received","其他已获得的优惠券","そのほかにもらったクーポン"],
  pendingOpensWith: ["{name} 이용권을 매장에서 쓰면 이 쿠폰이 열려요.","This coupon opens when you use the {name} ticket at the store.","在店内使用{name}票券后，此优惠券即开启。","店で{name}のチケットを使うとこのクーポンが開きます。"],
  titleMyBuys: ["내 구매","My purchases","我的购买","購入したもの"],
  myBuysSub: ["이용권·예약과 함께 받은 쿠폰","Tickets, bookings and the coupons that came with them","票券、预约及附赠优惠券","チケット・予約と付いてきたクーポン"],
  myCouponsPromo: ['잼을 시작하면 부산 전체 쿠폰을 이렇게 쓸 수 있어요', 'Start a JAM to use every coupon in Busan like this', '开通JAM即可这样使用釜山全部优惠券', 'JAMを始めると釜山全部のクーポンをこう使えます'],
  seeProducts: ['상품 보러 가기', 'See products', '查看商品', '商品を見る'],
  fromProduct: ['{name} 구매 특전', 'From {name}', '{name} 购买赠品', '{name} 購入特典'],
  perPersonOff: ['1인당', 'per person', '每人', '1人あたり'],
  bundledTitle: ['이 상품과 함께 받는 쿠폰', 'Coupons that come with this', '随此商品附赠的优惠券', 'この商品についてくるクーポン'],
  bundledSub: ['무료 회원도 이 쿠폰은 그대로 쓸 수 있어요', 'Free members can use these too', '免费会员也可直接使用', '無料会員もそのまま使えます'],
  bundledDays: ['받은 날부터 {n}일', '{n} days from purchase', '自获得日起{n}天', '受取日から{n}日'],
  bundledFromResv: ['예약한 날 0시에 열려요 · 그날부터 {n}일', 'Opens at 00:00 on your booking day · {n} days from then', '预约当天0点开启 · 自当日起{n}天', '予約日の0時に開きます · その日から{n}日'],
  opensOnDate: ['이 쿠폰은 {date} 0시부터 쓸 수 있어요. 예약한 날에 열립니다.', 'This coupon opens at 00:00 on {date}, your booking day.', '此优惠券将于{date}0点开启（预约当天）。', 'このクーポンは{date}0時から使えます。予約日に開きます。'],
  savedYearTotal: ['올해 누적 혜택 {amt}', '{amt} this year', '今年累计{amt}', '今年累計{amt}'],
  savedMultiple: ['잼 가격 대비 {x}배', '{x}x the JAM price', '相当于JAM价格{x}倍', 'JAM料金の{x}倍'],
  tripSaving: ['{amt} 절약', 'Save {amt}', '节省{amt}', '{amt}お得'],
  savedCoupons: ['담은 쿠폰', 'Saved coupons', '收藏的优惠券', '保存したクーポン'],
  savedProducts: ['담은 상품', 'Saved products', '收藏的商品', '保存した商品'],
  savedEmpty: ['아직 담은 게 없어요.\n쿠폰과 상품의 ♥를 눌러 담아보세요.', 'Nothing saved yet.\nTap ♥ on coupons and products.', '还没有收藏。\n点击优惠券和商品上的♥吧。', 'まだ保存がありません。\nクーポンや商品の♥を押してみて。'],
  savedDone: ['담았어요 ♥', 'Saved ♥', '已收藏 ♥', '保存しました ♥'],
  savedUndone: ['담기 해제', 'Removed', '已取消收藏', '保存を解除'],
  // ── 여행 일정 ──
  tabTrip: ['일정', 'Trip', '行程', '旅程'],
  titleTrip: ['내 여행', 'My trip', '我的行程', 'マイ旅程'],
  tripLoginEmpty: ['로그인하면 여행 일정을 만들 수 있어요', 'Sign in to plan your trip', '登录后即可制定行程', 'ログインすると旅程を作れます'],
  tripWhen: ['부산 여행 언제 가세요?', 'When is your Busan trip?', '什么时候来釜山？', '釜山旅行はいつですか？'],
  tripWho: ['몇 명이서 가나요?', 'How many people?', '几个人？', '何名ですか？'],
  tripRecommend: ['{days}박이면 {plan}이 딱 맞아요', '{days} nights? {plan} fits perfectly', '{days}晚的话{plan}正合适', '{days}泊なら{plan}がぴったり'],
  tripCreate: ['여행 만들기', 'Create trip', '创建行程', '旅程を作る'],
  tripFormHint: ['입력은 이 두 개가 전부예요. 담아둔 쿠폰·상품을 날짜에 놓으면\n예상 절약 금액이 자동으로 계산됩니다.', "That's all the input. Place saved coupons on days\nand we calculate your estimated savings.", '只需这两项。把收藏的优惠放到日期上，\n自动计算预计节省金额。', '入力はこれだけ。保存したクーポンを日付に置くと\n予想節約額を自動計算します。'],
  tripHeroTitle: ['부산 {nights}박 {days}일 · {n}명', 'Busan {nights}N{days}D · {n} ppl', '釜山{nights}晚{days}天 · {n}人', '釜山{nights}泊{days}日 · {n}名'],
  savedLabelTrip: ['이번 여행 예상 절약', 'Est. savings this trip', '本次行程预计节省', '今回の旅の予想節約'],
  tripMultiple: ['{plan} {price}의 {x}배를 돌려받는 여행이에요', 'You get back {x}× the {plan} ({price})', '相当于{plan}({price})的{x}倍回报', '{plan}（{price}）の{x}倍もお得な旅'],
  tripAlmost: ['조금만 더 담으면 {plan} {price} 본전!', 'A few more and {plan} ({price}) pays for itself!', '再收藏几个就回本{plan}({price})！', 'あと少しで{plan}（{price}）の元が取れる！'],
  tripStartJam: ['{plan} 시작하고 이 할인 전부 받기', 'Start {plan} and claim all these savings', '开通{plan}，全部优惠到手', '{plan}を始めて全部お得に'],
  tripEdit: ['수정', 'Edit', '修改', '編集'],
  tripEmptyDay: ['＋ 담은 목록에서 이 날에 놓기', '＋ Place from saved list', '＋ 从收藏中添加到这天', '＋ 保存リストからこの日に置く'],
  tripHint: ['담은 목록(MY > 담은 목록)에서 [Day] 버튼으로 날짜에 놓을 수 있어요.', 'Use the [Day] buttons in your saved list to place items.', '在收藏清单中用[Day]按钮放到日期上。', '保存リストの[Day]ボタンで日付に置けます。'],
  jam3Name: ['3일잼', '3-Day JAM', '3日JAM', '3日JAM'],
  jam5Name: ['5일잼', '5-Day JAM', '5日JAM', '5日JAM'],
  jamMasterName: ['잼마스터', 'JAM Master', 'JAM大师', 'JAMマスター'],
  jamStartDate: ['사용 시작일', 'Start date', '使用开始日', '利用開始日'],
  jamStartPrompt: ['사용 시작일을 입력하세요 (YYYY-MM-DD)\n미리 결제해도 이 날 00시부터 시작돼요', 'Enter start date (YYYY-MM-DD)\nEven if you pay now, it starts at 00:00 on this date', '请输入使用开始日 (YYYY-MM-DD)\n提前付款也从当天00点开始', '利用開始日を入力 (YYYY-MM-DD)\n先に決済してもこの日の0時から開始'],
  jamStartHint: ['미리 결제해도 이 날 00시부터 시작돼요 ({plan}은 {nights}박 {days}일 커버)', 'Pay now, starts at 00:00 on this date ({plan} covers {nights}N{days}D)', '提前付款也从当天00点开始（{plan}覆盖{nights}晚{days}天）', '先に決済してもこの日の0時から開始（{plan}は{nights}泊{days}日カバー）'],
  couponNeedsJam: ['할인 쿠폰은 잼 멤버십 기간에 사용할 수 있어요', 'Coupons can be used during your JAM period', '优惠券需在JAM会员期间使用', 'クーポンはJAM期間中に使えます'],
  useLocked: ['🔒 잼 시작 후 사용', '🔒 Use after starting JAM', '🔒 开通JAM后使用', '🔒 JAM開始後に使用'],
  useFrom: ['{date}부터 사용', 'From {date}', '{date}起可用', '{date}から使用'],
  goStartJam: ['잼을 시작하면 이 쿠폰을 바로 쓸 수 있어요. 지금 시작할까요?', 'Start a JAM to use this coupon right away. Start now?', '开通JAM即可立即使用此优惠券。现在开通？', 'JAMを始めればこのクーポンをすぐ使えます。今始めますか？'],
  jamStartsOn: ["{plan}은 {date} 0시부터 열려요. 그때부터 이 쿠폰을 쓸 수 있어요.","{plan} opens at 00:00 on {date}. You can use this coupon from then.","{plan}将于{date}0点开启，届时可使用此优惠券。","{plan}は{date}0時から開きます。そこからこのクーポンを使えます。"],
  cardFreeHint: ['무료 회원 · 쿠폰 사용은 잼을 시작하면 열려요', 'Free member · start a JAM to use coupons', '免费会员 · 开通JAM后可用优惠券', '無料会員 · JAMを始めるとクーポンが使えます'],
  cardUpcoming: ['{plan} · {date} 시작 예정', '{plan} · starts {date}', '{plan} · {date}开始', '{plan} · {date}開始予定'],
  noTripYet: ['여행을 만들면 담은 것을 날짜에 놓고 예상 절약을 볼 수 있어요', 'Create a trip to place saved items on days and see your savings', '创建行程后可把收藏放到日期上并查看预计节省', '旅程を作ると保存した項目を日付に置いて節約額が見られます'],
  heroSub: ['로컬처럼 즐기고, 여행비용은 똑똑하게', 'Live like a local, spend like a pro', '像本地人一样玩，聪明地花钱', 'ローカルのように楽しみ、賢く節約'],
  tripCardLine: ['부산 {nights}박{days}일 · {n}명 · {count}곳 담음 · 예상 절약 {amt}+', 'Busan {nights}N{days}D · {n} ppl · {count} saved · est. {amt}+', '釜山{nights}晚{days}天 · {n}人 · 已收藏{count}处 · 预计省{amt}+', '釜山{nights}泊{days}日 · {n}名 · {count}件 · 予想節約{amt}+'],
  couponSectionHomeSub: ['보여주고 확인 한 번이면 바로 할인돼요', 'Show it, tap confirm, get the discount', '出示并确认，立享折扣', '見せて確認するだけで割引'],
  freeLabel: ['무료', 'FREE', '免费', '無料'],
  offLabel: ['할인', 'OFF', '优惠', 'OFF'],
  regionAll: ['전체 지역', 'All areas', '全部地区', '全エリア'],
  useWithPin: ['매장에서 사용하기 (매장 코드 입력)', 'Use at store (enter store code)', '到店使用（输入门店代码）', '店舗で使用（店舗コード入力）'],
  askStaffPin: ['직원에게 매장 코드를 물어보고 입력해 주세요', 'Ask the staff for the store code and enter it', '请向店员询问门店代码并输入', 'スタッフに店舗コードを聞いて入力してください'],
  shortcuts: ['바로가기', 'Shortcuts', '快捷入口', 'ショートカット'],
  myBenefitsAll: ['할인 쿠폰 전체 보기', 'See all coupons', '查看全部优惠券', 'クーポンをすべて見る'],
  myBenefitsAllSub: ['매장별로 열려 있는 혜택 · 절약 내역', 'Perks by store · savings history', '各店铺可用优惠·省钱记录', '店舗別の特典・節約履歴'],
  walletSub: ['구매한 티켓과 확정된 예약', 'Purchased tickets & confirmed bookings', '已购票券和已确认预订', '購入チケットと確定予約'],
  myStore: ['내 가게', 'My store', '我的店铺', 'マイ店舗'],
  logout: ['로그아웃', 'Sign out', '退出登录', 'ログアウト'],
  footNote: ['결제는 PG 연동 전까지 모의결제로 동작합니다', 'Payments are mock until PG integration', 'PG接入前均为模拟支付', 'PG連携までは模擬決済です'],
  build: ['빌드', 'Build', '构建', 'ビルド'],
  language: ['언어', 'Language', '语言', '言語'],

  // ── 내 혜택 ──
  benefitsLoginEmpty: ['로그인하면 할인 쿠폰이 여기에 모여요', 'Sign in to collect your perks here', '登录后你的优惠都在这里', 'ログインすると特典がここに集まります'],
  savedLabel: ['이번 달 아낀 금액', 'Saved this month', '本月节省金额', '今月の節約額'],
  savedTotal: ['누적 {amt}', 'Total {amt}', '累计{amt}', '累計{amt}'],
  savedRecovery: ['멤버십 비용 회수 {r}%', '{r}% of fee recovered', '会员费回本{r}%', '会費回収{r}%'],
  noBenefitsYet: ['아직 열린 혜택이 없어요. 멤버십을 시작하면 제휴 혜택이 한 번에 열립니다.', 'No perks yet. Start membership to unlock them all at once.', '暂无可用优惠。开通会员即可一键解锁。', 'まだ特典がありません。メンバーシップで一気にオープンします。'],
  seePlans: ['멤버십 보러 가기', 'See membership', '查看会员', 'メンバーシップを見る'],
  srcMembership: ['멤버십', 'Membership', '会员', 'メンバー'],
  srcProduct: ['상품구매', 'Purchase', '购买', '購入'],
  srcRegionPass: ['지역패스', 'Area pass', '区域通票', 'エリアパス'],
  srcManual: ['지급', 'Granted', '发放', '付与'],
  benefitsHint: ['매장에서 [사용하기]를 누르고 직원에게 화면을 보여주세요.', 'At the shop, tap [Use] and show the screen to staff.', '在店内点击[使用]并向店员出示画面。', '店で[使う]を押してスタッフに画面を見せてください。'],

  // ── 이용권·예약 ──
  stIssued: ['사용 가능', 'Ready', '可使用', '利用可能'],
  stReserved: ['예약됨', 'Booked', '已预订', '予約済み'],
  stPaid: ['결제됨', 'Paid', '已付款', '支払済み'],
  stUsed: ['사용 완료', 'Used', '已使用', '使用済み'],
  stExpired: ['기간 만료', 'Expired', '已过期', '期限切れ'],
  stCancelled: ['취소됨', 'Cancelled', '已取消', 'キャンセル'],
  stRefunded: ['환불됨', 'Refunded', '已退款', '返金済み'],
  noVouchers: ['구매한 이용권이 없어요', 'No tickets yet', '暂无已购票券', 'チケットはまだありません'],
  bookedAt: ['📅 {date} 예약 확정', '📅 Booked for {date}', '📅 已预订{date}', '📅 {date} 予約確定'],
  codeAndDate: ['코드 {code} · ~{date}', 'Code {code} · until {date}', '代码{code} · 截至{date}', 'コード{code} · {date}まで'],
  claimedDeals: ['받은 DROP 딜', 'Claimed DROP deals', '已领DROP优惠', '受け取ったDROP'],
  noDeals: ['받아둔 딜이 없어요. 오늘 탭에서 확인해 보세요.', 'No deals claimed. Check the DROP tab.', '暂无已领优惠，去DROP看看吧。', 'まだありません。DROPタブへ。'],
  useUntil: ['~{date} 까지 사용', 'Use by {date}', '{date}前使用', '{date}まで利用可'],

  // ── 사용 완료 ──
  doneBadge: ['사용 완료', 'REDEEMED', '使用完成', '利用完了'],
  doneExpired: ['표시 만료', 'Display expired', '显示已过期', '表示期限切れ'],
  doneNick: ['{nick} 님', '{nick}', '{nick}', '{nick} 様'],
  liveSec: ['실시간 화면 · {n}초', 'Live screen · {n}s', '实时画面 · {n}秒', 'リアルタイム画面 · {n}秒'],
  staffCode: ['직원 확인 코드', 'Staff code', '店员确认码', 'スタッフ確認コード'],
  doneSaved: ['이번에 {amt} 아꼈어요 🎉', 'You saved {amt} 🎉', '这次省了{amt} 🎉', '今回{amt}お得 🎉'],
  staffNote: ['이 상품은 직원이 코드를 확인한 후 이용할 수 있어요.', 'Staff will verify the code before use.', '店员核对代码后方可使用。', 'スタッフがコードを確認後にご利用いただけます。'],

  // ── DROP 상세 ──
  payInApp: ['앱에서 결제', 'Pay in app', 'APP内付款', 'アプリ決済'],
  payOnSite: ['현장 결제 딜', 'Pay on-site deal', '到店付款优惠', '現地決済ディール'],
  stockLine: ['· 남은 수량 {a} / {b}', '· Stock {a} / {b}', '· 剩余 {a} / {b}', '· 残り {a} / {b}'],
  perUnitLine: ['· 1개 = {n}인 기준', '· 1 unit = {n} people', '· 1份供{n}人', '· 1個={n}名分'],
  closeLine: ['· 마감 {date}', '· Ends {date}', '· 截止{date}', '· 締切 {date}'],
  usableTime: ['· 사용 가능 시간 {a}~{b}', '· Usable {a}–{b}', '· 可用时段 {a}~{b}', '· 利用時間 {a}~{b}'],
  maxPerUser: ['· 1인당 최대 {n}개', '· Max {n} per person', '· 每人限{n}份', '· お一人{n}個まで'],
  memberOnlyDrop: ['멤버십 회원 전용 DROP입니다', 'This DROP is for members only', '此DROP为会员专享', 'このDROPは会員限定です'],
  seeMembership: ['멤버십 알아보기', 'About membership', '了解会员', 'メンバーシップを見る'],
  payAndGet: ['{price} 결제하고 받기', 'Pay {price} & get it', '支付{price}并领取', '{price}で購入する'],
  getFree: ['이 딜 받기 (무료)', 'Claim this deal (free)', '领取优惠（免费）', 'このディールをもらう（無料）'],
  paidDone: ['결제 완료', 'Payment complete', '付款完成', '決済完了'],
  claimed: ['받았습니다!', 'Claimed!', '领取成功！', '受け取りました！'],
  cantClaim: ['받을 수 없습니다', "Can't claim", '无法领取', '受け取れません'],
  ticketNote: ["결제하면 이용권이 바로 발급됩니다. 매장에서 [사용] 탭의 사용하기를 누르세요.","Your ticket is issued instantly. At the shop, tap Use in the [Use] tab.","付款后立即发放票券。到店后在[使用]页点击使用。","決済するとチケットがすぐ発行されます。店舗で[使う]タブの使うを押してください。"],
  dealNote: ["받아두면 매장에서 [사용] 탭의 사용하기로 할인받을 수 있어요.","Claim now, then tap Use in the [Use] tab at the shop.","领取后到店在[使用]页点击使用即可优惠。","受け取っておけば店舗で[使う]タブから割引を受けられます。"],

  // ── 매장 상세 ──
  storeBenefitSection: ['멤버십 상시 혜택', 'Always-on member perks', '会员常驻优惠', 'メンバー常時特典'],
  noStoreBenefits: ['등록된 상시 혜택이 없습니다', 'No always-on perks yet', '暂无常驻优惠', '常時特典はまだありません'],
  noCompanionLimit: ['동반 인원 제한 없음', 'No companion limit', '同行人数不限', '同伴人数制限なし'],
  companionUpTo: ['동반 {n}인까지', 'Up to {n} companions', '最多同行{n}人', '同伴{n}名まで'],
  perDay: [' · 하루 {n}회', ' · {n}/day', ' · 每天{n}次', ' · 1日{n}回'],
  useAtStore: ['매장에서 사용하기', 'Use at store', '到店使用', '店舗で使う'],
  lockStart: ['🔒 멤버십을 시작하면 바로 사용할 수 있어요 →', '🔒 Start membership to use this right away →', '🔒 开通会员即可立即使用 →', '🔒 メンバーになるとすぐ使えます →'],
  ongoingDrops: ['진행 중 DROP', 'Live DROPs', '进行中DROP', '開催中DROP'],
  bookAndTickets: ['예약 · 이용권', 'Bookings · Tickets', '预订·票券', '予約・チケット'],

  // ── 상품 상세 ──
  typeReservation: ['예약형', 'Booking', '预订型', '予約制'],
  typeTicket: ['티켓', 'Ticket', '票券', 'チケット'],
  weather: ['기상 영향', 'Weather dependent', '受天气影响', '天候の影響あり'],
  staffVerify: ['직원 확인', 'Staff verify', '店员确认', 'スタッフ確認'],
  memberPriceHint: ['잼 회원은 {price}', 'JAM members pay {price}', 'JAM会员{price}', 'JAM会員は{price}'],
  memberPriceShort: ['잼 {price}', 'JAM {price}', 'JAM {price}', 'JAM {price}'],
  pickTime: ['시간 선택', 'Pick a time', '选择时间', '時間を選ぶ'],
  noSlots: ['예약 가능한 시간이 없습니다', 'No times available', '暂无可预订时间', '予約可能な時間がありません'],
  seatsLeft: ['{n}자리', '{n} seats', '{n}个名额', '残り{n}席'],
  headcount: ['인원', 'People', '人数', '人数'],
  payTotal: ['{price} 결제하기', 'Pay {price}', '支付{price}', '{price}を支払う'],
  payTotalReserve: ['{price} 결제하기 · 예약 확정', 'Pay {price} · booking confirmed', '支付{price}·确认预订', '{price}を支払う・予約確定'],
  pickTimeFirst: ['이용할 시간을 선택해 주세요', 'Please pick a time first', '请先选择时间', '時間を選択してください'],
  resvTimeTitle: ['예약 시간', 'Booking time', '预订时间', '予約時間'],
  doneTitle: ['완료', 'Done', '完成', '完了'],
  resvNote: ['결제와 동시에 예약이 확정됩니다. 전화 예약이 필요 없어요.', 'Booking is confirmed the moment you pay. No phone call needed.', '付款即确认预订，无需电话。', '決済と同時に予約確定。電話不要です。'],
  passNote: ['결제하면 이용권과 함께 지역 로컬 혜택이 자동으로 열립니다.', 'Payment unlocks your pass plus local area perks.', '付款后票券与当地优惠自动开通。', '決済でパスと地域特典が自動オープン。'],

  // ── 스캔 결과(use) ──
  rescan: ['다시 스캔', 'Scan again', '重新扫码', '再スキャン'],
  nothingHere: ['이 매장에서 지금 쓸 수 있는 혜택이 없어요.\n멤버십을 시작하거나 DROP을 받아보세요.', 'Nothing to use at this store right now.\nStart membership or claim a DROP.', '此店暂无可用优惠。\n开通会员或领取DROP吧。', 'この店舗で今使える特典はありません。\nメンバーシップかDROPをどうぞ。'],
  myVouchers: ['구매한 이용권', 'My tickets', '已购票券', '購入済みチケット'],
  alwaysBenefits: ['상시 혜택', 'Always-on perks', '常驻优惠', '常時特典'],
  useNow: ['사용하기', 'Use now', '立即使用', '使う'],
  staffItem: ['직원 확인 상품', 'Staff-verified item', '需店员确认', 'スタッフ確認商品'],
  voucherMeta: ['{n}명 · 코드 {code}', '{n} ppl · code {code}', '{n}人 · 代码{code}', '{n}名 · コード{code}'],
  reservedMeta: [' · 예약 {date}', ' · booked {date}', ' · 预订{date}', ' · 予約{date}'],
  useConfirmWeb: ['"{title}"을(를) 지금 사용할까요?\n직원 앞에서 눌러주세요.', 'Use "{title}" now?\nPlease tap in front of the staff.', '现在使用"{title}"吗？\n请在店员面前点击。', '「{title}」を今使いますか？\nスタッフの前で押してください。'],
  useConfirmTitle: ['지금 사용할까요?', 'Use it now?', '现在使用吗？', '今使いますか？'],
  pressBeforeStaff: ['직원 앞에서 눌러주세요.', 'Please tap in front of the staff.', '请在店员面前点击。', 'スタッフの前で押してください。'],
  cantUse: ['사용할 수 없습니다', "Can't use this", '无法使用', '使用できません'],
};

/** 인사말 풀 — 시간대·요일별 */
const GREETS: Record<Lang, { m: string[]; d: string[]; e: string[]; fri: string; n: string[]; we: string }> = {
  ko: {
    m: ['오늘 부산 날씨 최고예요 ☀️', '아침 10시, 새 DROP 도착했어요 ⚡', '오늘 부산은 어때요?'],
    d: ['오후엔 바다 어때요? 🌊', '지금 마감 임박 딜이 있어요 ⏰', '오늘 부산은 어때요?'],
    e: ['오늘 밤, 한 잔 어때요? 🍹', '저녁 한정 딜이 열렸어요 🌙'],
    fri: '불금이에요! 🔥 오늘 밤 딜 놓치지 마요',
    n: ['내일의 부산을 미리 찜해요 🌙', '못 자는 밤엔 딜 구경 어때요? ✨'],
    we: '주말의 부산, 놓치지 마요 🏖️',
  },
  en: {
    m: ['Perfect Busan weather today ☀️', 'New DROPs landed at 10 AM ⚡', 'How about Busan today?'],
    d: ['Beach this afternoon? 🌊', 'Deals closing soon ⏰', 'How about Busan today?'],
    e: ['A drink tonight? 🍹', 'Evening-only deals are open 🌙'],
    fri: "It's Friday! 🔥 Don't miss tonight's deals",
    n: ['Save tomorrow\'s Busan now 🌙', 'Browse deals on a sleepless night ✨'],
    we: 'Weekend in Busan — don\'t miss it 🏖️',
  },
  zh: {
    m: ['今天釜山天气超棒 ☀️', '上午10点新DROP已到 ⚡', '今天的釜山怎么样？'],
    d: ['下午去海边吧？🌊', '有即将截止的优惠 ⏰', '今天的釜山怎么样？'],
    e: ['今晚来一杯？🍹', '晚间限定优惠开抢了 🌙'],
    fri: '周五啦！🔥 别错过今晚的优惠',
    n: ['提前收藏明天的釜山 🌙', '睡不着就逛逛优惠吧 ✨'],
    we: '釜山的周末，不容错过 🏖️',
  },
  ja: {
    m: ['今日の釜山は最高の天気 ☀️', '朝10時、新しいDROPが到着 ⚡', '今日の釜山はどう？'],
    d: ['午後は海はどう？🌊', 'まもなく終了のディールあり ⏰', '今日の釜山はどう？'],
    e: ['今夜一杯どう？🍹', '夜限定ディールがオープン 🌙'],
    fri: '花金だ！🔥 今夜のディールをお見逃しなく',
    n: ['明日の釜山を先取り 🌙', '眠れない夜はディール巡り ✨'],
    we: '週末の釜山、お見逃しなく 🏖️',
  },
};

export function pickGreeting(lang: Lang): string {
  const now = new Date();
  const h = now.getHours();
  const day = now.getDay();
  const g = GREETS[lang];
  const pool: string[] = [];
  if (h >= 5 && h < 11) pool.push(...g.m);
  else if (h >= 11 && h < 17) pool.push(...g.d);
  else if (h >= 17 && h < 23) { pool.push(...g.e); if (day === 5) pool.push(g.fri); }
  else pool.push(...g.n);
  if ((day === 6 || day === 0) && h >= 8 && h < 20) pool.push(g.we);
  return pool[Math.floor(Math.random() * pool.length)];
}

const LOCALE: Record<Lang, string> = { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' };

function loadLang(): Lang {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('hg_lang') : null;
    if (v === 'ko' || v === 'en' || v === 'zh' || v === 'ja') {
      setApiLang(v);
      return v;
    }
  } catch { /* storage 불가 환경 */ }
  return 'ko';
}

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  won: (n: number) => string;
  locale: string;
};
const I18nCtx = createContext<Ctx>({
  lang: 'ko', setLang: () => {}, t: (k) => k,
  won: (n) => `${(n ?? 0).toLocaleString('ko-KR')}원`, locale: 'ko-KR',
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(loadLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    setApiLang(l);
    track('lang_change', undefined, { to: l });
    try { localStorage.setItem('hg_lang', l); } catch { /* 무시 */ }
  }, []);

  const value = useMemo<Ctx>(() => {
    const idx = IDX[lang];
    const t = (key: string, vars?: Record<string, string | number>) => {
      let s = D[key]?.[idx] ?? D[key]?.[0] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    };
    const won = (n: number) =>
      lang === 'ko' ? `${(n ?? 0).toLocaleString('ko-KR')}원` : `₩${(n ?? 0).toLocaleString('en-US')}`;
    return { lang, setLang, t, won, locale: LOCALE[lang] };
  }, [lang, setLang]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);

/** 🌐 언어 선택 버튼 — 누르면 가운데 모달로 4개 언어 선택 */
export function LangButton({ light }: { light?: boolean }) {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const cur = LANGS.find((l) => l.code === lang)!;
  return (
    <>
      <Pressable style={[ls.pill, light && ls.pillLight]} onPress={() => setOpen(true)} hitSlop={8}>
        <Text style={[ls.pillText, light && { color: C.brand }]}>🌐 {cur.short}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={ls.backdrop} onPress={() => setOpen(false)}>
          <View style={ls.sheet}>
            {LANGS.map((l) => (
              <Pressable
                key={l.code}
                style={[ls.row, lang === l.code && ls.rowActive]}
                onPress={() => {
                  // 모달을 먼저 닫아 화면이 즉시 반응하게 하고, 언어 전환(전체 리렌더)은 다음 틱에
                  setOpen(false);
                  setTimeout(() => setLang(l.code), 60);
                }}
              >
                <Text style={[ls.rowText, lang === l.code && { color: C.brand }]}>{l.label}</Text>
                {lang === l.code && <Text style={{ color: C.brand, fontWeight: '700' }}>✓</Text>}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/** MY 탭용 — 4개 언어 가로 칩 */
export function LangChips() {
  const { lang, setLang } = useI18n();
  return (
    <View style={ls.chips}>
      {LANGS.map((l) => (
        <Pressable
          key={l.code}
          style={[ls.chip, lang === l.code && ls.chipActive]}
          onPress={() => setLang(l.code)}
        >
          <Text style={[ls.chipText, lang === l.code && { color: '#fff' }]}>{l.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const ls = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  pillLight: {
    // 파란 히어로 위에서 묻히지 않게 — 불투명 흰 배경 + 브랜드색 글자 + 그림자
    backgroundColor: '#fff', borderColor: '#fff',
    shadowColor: '#003B5C', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pillText: { fontSize: 12, fontWeight: '700', color: C.ink2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(18,24,31,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  sheet: { backgroundColor: C.white, borderRadius: 16, width: '100%', maxWidth: 300, overflow: 'hidden', paddingVertical: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 13,
  },
  rowActive: { backgroundColor: C.brandSoft },
  rowText: { fontSize: 15, fontWeight: '600', color: C.ink },
  chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1, borderColor: C.line, borderRadius: 999,
    paddingHorizontal: 13, paddingVertical: 7, backgroundColor: C.white,
  },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipText: { fontSize: 12.5, fontWeight: '700', color: C.ink2 },
});
