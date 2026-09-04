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
  tabStore: ['혜택', 'Perks', '优惠', '特典'],
  tabScan: ['사용', 'Use', '使用', '使う'],
  tabMy: ['MY', 'MY', 'MY', 'MY'],
  titleDrops: ['오늘의 DROP', "Today's DROP", '今日DROP', '本日のDROP'],
  titleStore: ['제휴 혜택', 'Partner perks', '合作优惠', '提携特典'],
  titleScan: ['매장에서 사용', 'Use in store', '到店使用', '店舗で使う'],
  titleBenefits: ['내 혜택', 'My perks', '我的优惠', 'マイ特典'],
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
  myBenefitSection: ['지금 쓸 수 있는 내 혜택 🎁', 'My perks ready now 🎁', '我的可用优惠 🎁', '今使えるマイ特典 🎁'],
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
  bannerCta: ['4,900원부터 →', 'From ₩4,900 →', '₩4,900起 →', '₩4,900から →'],
  allRegions: ['전체 지역', 'All areas', '全部地区', '全エリア'],
  noMerchants: ['조건에 맞는 제휴 매장이 없어요', 'No stores match the filters', '没有符合条件的店铺', '条件に合う店舗がありません'],
  metaDrop: ['DROP {n}', 'DROP {n}', 'DROP {n}', 'DROP {n}'],
  metaProduct: ['예약상품 {n}', 'Bookables {n}', '可预订{n}', '予約商品{n}'],
  lockedForMember: ['멤버십 시 사용 가능', 'For members', '会员可用', 'メンバーで利用可'],

  // ── 사용(스캔) 탭 ──
  scanLoginGuide: ['로그인 후 매장 QR을 스캔하면\n그 매장에서 쓸 수 있는 혜택이 바로 나옵니다.', 'Sign in and scan the store QR\nto see every perk you can use there.', '登录后扫描店铺二维码\n立即显示该店可用优惠。', 'ログインして店舗QRをスキャンすると\nその店で使える特典がすぐ表示されます。'],
  howToUse: ['사용 방법', 'How it works', '使用方法', '使い方'],
  step1: ['1. 매장 카운터의 홀릭잼 QR을 찾으세요', '1. Find the HOLIC GEM QR at the counter', '1. 在店铺收银台找到HOLIC GEM二维码', '1. レジのHOLIC GEM QRを探す'],
  step2: ['2. 아래 버튼으로 스캔하세요', '2. Scan it with the button below', '2. 点击下方按钮扫码', '2. 下のボタンでスキャン'],
  step3: ['3. 쓸 혜택을 고르고 직원에게 완료화면을 보여주세요', '3. Pick a perk and show staff the done screen', '3. 选择优惠并向店员出示完成页面', '3. 特典を選び完了画面をスタッフに提示'],
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
  shortcuts: ['바로가기', 'Shortcuts', '快捷入口', 'ショートカット'],
  myBenefitsAll: ['내 혜택 전체 보기', 'See all my perks', '查看我的全部优惠', 'マイ特典をすべて見る'],
  myBenefitsAllSub: ['매장별로 열려 있는 혜택 · 절약 내역', 'Perks by store · savings history', '各店铺可用优惠·省钱记录', '店舗別の特典・節約履歴'],
  walletSub: ['구매한 티켓과 확정된 예약', 'Purchased tickets & confirmed bookings', '已购票券和已确认预订', '購入チケットと確定予約'],
  myStore: ['내 가게', 'My store', '我的店铺', 'マイ店舗'],
  logout: ['로그아웃', 'Sign out', '退出登录', 'ログアウト'],
  footNote: ['결제는 PG 연동 전까지 모의결제로 동작합니다', 'Payments are mock until PG integration', 'PG接入前均为模拟支付', 'PG連携までは模擬決済です'],
  build: ['빌드', 'Build', '构建', 'ビルド'],
  language: ['언어', 'Language', '语言', '言語'],

  // ── 내 혜택 ──
  benefitsLoginEmpty: ['로그인하면 내 혜택이 여기에 모여요', 'Sign in to collect your perks here', '登录后你的优惠都在这里', 'ログインすると特典がここに集まります'],
  savedLabel: ['이번 달 아낀 금액', 'Saved this month', '本月节省金额', '今月の節約額'],
  savedTotal: ['누적 {amt}', 'Total {amt}', '累计{amt}', '累計{amt}'],
  savedRecovery: ['멤버십 비용 회수 {r}%', '{r}% of fee recovered', '会员费回本{r}%', '会費回収{r}%'],
  noBenefitsYet: ['아직 열린 혜택이 없어요. 멤버십을 시작하면 제휴 혜택이 한 번에 열립니다.', 'No perks yet. Start membership to unlock them all at once.', '暂无可用优惠。开通会员即可一键解锁。', 'まだ特典がありません。メンバーシップで一気にオープンします。'],
  seePlans: ['멤버십 보러 가기', 'See membership', '查看会员', 'メンバーシップを見る'],
  srcMembership: ['멤버십', 'Membership', '会员', 'メンバー'],
  srcProduct: ['상품구매', 'Purchase', '购买', '購入'],
  srcRegionPass: ['지역패스', 'Area pass', '区域通票', 'エリアパス'],
  srcManual: ['지급', 'Granted', '发放', '付与'],
  benefitsHint: ['매장에 가면 [사용] 탭에서 매장 QR을 스캔하세요.', 'At the store, scan its QR from the [Use] tab.', '到店后请在[使用]标签扫描店铺二维码。', '店舗では[使う]タブでQRをスキャン。'],

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
  ticketNote: ['결제하면 이용권이 바로 발급됩니다. 매장에서 QR 스캔으로 사용하세요.', 'Your ticket is issued instantly. Use it by scanning the store QR.', '付款后立即出票，到店扫码使用。', '決済後すぐ発券。店舗でQRスキャンで利用。'],
  dealNote: ['받아두면 [사용] 탭에서 매장 QR을 스캔해 할인받을 수 있어요.', 'Claim now, then scan the store QR in the [Use] tab for the discount.', '领取后在[使用]标签扫码即可享折扣。', '受け取り後、[使う]タブでQRスキャンして割引。'],

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
  memberPriceHint: ['멤버십 회원은 {price}', 'Members pay {price}', '会员价{price}', '会員は{price}'],
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
