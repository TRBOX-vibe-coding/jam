/**
 * 점주 상품 등록 — 티켓·예약형 상품을 점주가 직접 올린다 (야놀자식 셀프 입점 세팅).
 * 등록 즉시 본사 승인 대기. 예약형의 회차는 승인 후 본사와 함께 세팅한다.
 */
import { useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { C, won } from '../lib/theme';
import { Btn, Card, Screen } from '../lib/ui';

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
  else Alert.alert(title, msg);
}

const TYPES = [
  { key: 'TICKET', label: '티켓', desc: '기간 내 아무 때나 사용 (입장권·체험권)' },
  { key: 'RESERVATION', label: '예약형', desc: '날짜·시간 회차를 골라 예약 (클래스·투어)' },
] as const;

const VERIFS = [
  { key: 'QR_ONLY', label: 'QR만으로 사용' },
  { key: 'QR_PIN', label: 'QR + 직원 확인 (고가 상품)' },
] as const;

export default function MerchantProductCreate() {
  const [type, setType] = useState<'TICKET' | 'RESERVATION'>('TICKET');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [memberPrice, setMemberPrice] = useState('');
  const [verification, setVerification] = useState<'QR_ONLY' | 'QR_PIN'>('QR_ONLY');
  const [cancelPolicy, setCancelPolicy] = useState('');
  const [image, setImage] = useState<{ uri: string; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickImage() {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
    });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (!a.base64) {
      notify('사진을 불러올 수 없습니다', '다른 사진으로 시도해 주세요');
      return;
    }
    const mime = a.mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(a.mimeType)
      ? a.mimeType
      : 'image/jpeg';
    if (a.base64.length > 5 * 1024 * 1024 * 1.4) {
      notify('사진이 너무 큽니다', '5MB 이하 사진으로 올려주세요');
      return;
    }
    setImage({ uri: a.uri, dataUrl: `data:${mime};base64,${a.base64}` });
  }

  const base = Number(basePrice.replace(/\D/g, '')) || 0;
  const member = Number(memberPrice.replace(/\D/g, '')) || 0;
  const saveRate = base > 0 && member > 0 && member < base ? Math.round((1 - member / base) * 100) : null;
  const valid = name.trim().length >= 2 && base >= 1000 && (member === 0 || member < base);

  async function submit() {
    if (!valid) return;
    setBusy(true);
    try {
      const r = await api<{ message: string }>('/merchant/my/products', {
        method: 'POST',
        body: {
          type,
          name: name.trim(),
          description: description.trim() || undefined,
          basePrice: base,
          memberPrice: member > 0 ? member : undefined,
          verification,
          cancelPolicy: cancelPolicy.trim() || undefined,
          imageBase64: image?.dataUrl,
        },
      });
      notify('등록 요청 완료', r.message);
      router.back();
    } catch (e: any) {
      notify('등록할 수 없습니다', e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card style={{ backgroundColor: C.brandSoft, borderColor: C.brandSoft }}>
          <Text style={st.guide}>
            우리 가게의 정식 상품을 올려보세요.{'\n'}본사 승인 후 앱에서 판매가 시작됩니다.
          </Text>
        </Card>

        <Text style={st.label}>상품 유형</Text>
        {TYPES.map((t) => (
          <Pressable
            key={t.key}
            style={[st.typeCard, type === t.key && st.typeCardOn]}
            onPress={() => setType(t.key)}
          >
            <Text style={[st.typeLabel, type === t.key && { color: C.brand }]}>{t.label}</Text>
            <Text style={st.typeDesc}>{t.desc}</Text>
          </Pressable>
        ))}

        <Text style={st.label}>상품명</Text>
        <TextInput
          style={st.input}
          value={name}
          onChangeText={setName}
          placeholder="예) 서핑 입문 강습 90분"
          placeholderTextColor={C.ink3}
        />

        <Text style={st.label}>설명 (선택)</Text>
        <TextInput
          style={[st.input, { height: 70 }]}
          value={description}
          onChangeText={setDescription}
          placeholder="구성·포함 사항·이용 방법을 적어주세요"
          placeholderTextColor={C.ink3}
          multiline
        />

        <Text style={st.label}>상품 사진 (선택)</Text>
        {image ? (
          <View>
            <Image source={{ uri: image.uri }} style={st.photo} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Pressable style={st.photoBtn} onPress={pickImage}>
                <Text style={st.photoBtnText}>사진 바꾸기</Text>
              </Pressable>
              <Pressable style={st.photoBtn} onPress={() => setImage(null)}>
                <Text style={st.photoBtnText}>삭제</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={st.photoAdd} onPress={pickImage}>
            <Ionicons name='camera-outline' size={24} color={C.ink3} />
            <Text style={st.photoAddText}>사진 추가</Text>
            <Text style={st.photoAddHint}>사진 있는 상품이 훨씬 잘 팔려요</Text>
          </Pressable>
        )}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>정상가</Text>
            <TextInput
              style={st.input} value={basePrice} onChangeText={setBasePrice}
              placeholder="45000" placeholderTextColor={C.ink3} keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>멤버십가 (선택)</Text>
            <TextInput
              style={st.input} value={memberPrice} onChangeText={setMemberPrice}
              placeholder="38000" placeholderTextColor={C.ink3} keyboardType="number-pad"
            />
          </View>
        </View>
        {saveRate != null && (
          <Text style={st.rateLine}>
            멤버십 회원은 <Text style={{ color: C.brand, fontWeight: '700' }}>{saveRate}% 저렴하게</Text>
            <Text style={{ color: C.ink3 }}>  ·  {won(base - member)} 절약</Text>
          </Text>
        )}

        <Text style={st.label}>현장 사용 확인 방식</Text>
        <View style={st.presetRow}>
          {VERIFS.map((v) => (
            <Pressable key={v.key} style={[st.preset, verification === v.key && st.presetOn]} onPress={() => setVerification(v.key)}>
              <Text style={[st.presetText, verification === v.key && st.presetTextOn]}>{v.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={st.label}>취소·변경 정책 (선택)</Text>
        <TextInput
          style={st.input}
          value={cancelPolicy}
          onChangeText={setCancelPolicy}
          placeholder="예) 이용 1일 전까지 무료 취소"
          placeholderTextColor={C.ink3}
        />

        {type === 'RESERVATION' && (
          <Card style={{ marginTop: 14, backgroundColor: C.warnSoft, borderColor: C.warnSoft }}>
            <Text style={st.notice}>예약 날짜·시간(회차)은 승인 후 본사가 함께 세팅해 드려요.</Text>
          </Card>
        )}

        <View style={{ marginTop: 18 }}>
          <Btn
            title={busy ? '등록 중…' : '등록 요청 (본사 승인 후 판매)'}
            onPress={submit}
            disabled={!valid || busy}
          />
        </View>
        <Text style={st.foot}>승인 결과는 가맹점 모드의 내 상품에서 확인할 수 있어요.</Text>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  guide: { fontSize: 13.5, color: C.brand, fontWeight: '700', lineHeight: 20, textAlign: 'center' },
  label: { fontSize: 12.5, fontWeight: '700', color: C.ink3, marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 11,
    paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: C.ink,
  },
  typeCard: {
    backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8,
  },
  typeCardOn: { borderColor: C.brand, backgroundColor: C.brandSoft },
  typeLabel: { fontSize: 15, fontWeight: '700', color: C.ink },
  typeDesc: { fontSize: 12, color: C.ink3, marginTop: 2 },
  rateLine: { marginTop: 8, fontSize: 13.5, fontWeight: '700', color: C.ink },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
  },
  presetOn: { backgroundColor: C.brand, borderColor: C.brand },
  presetText: { fontSize: 13, fontWeight: '700', color: C.ink2 },
  presetTextOn: { color: '#fff' },
  photo: { width: '100%', height: 160, borderRadius: 12, backgroundColor: C.line },
  photoBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
  },
  photoBtnText: { fontSize: 12.5, fontWeight: '700', color: C.ink2 },
  photoAdd: {
    height: 96, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, borderStyle: 'dashed',
    backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  photoAddText: { fontSize: 13.5, fontWeight: '700', color: C.ink2 },
  photoAddHint: { fontSize: 11, color: C.ink3 },
  notice: { fontSize: 12.5, color: '#8a5600', fontWeight: '700', lineHeight: 18, textAlign: 'center' },
  foot: { fontSize: 11.5, color: C.ink3, textAlign: 'center', marginTop: 12, marginBottom: 20 },
});
