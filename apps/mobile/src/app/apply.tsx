/**
 * 입점 신청 — 사장님 온보딩.
 * 사장님도 손님과 똑같이 카카오로 로그인한 뒤, 여기서 가게 정보만 제출하면 된다.
 * 제출 → 본사 승인 → 같은 계정 MY에 가맹점 모드가 자동으로 열린다.
 * 필수: 가게 이름 / 주소 / 사업자등록번호 / 대표 이름 / 연락처 / 이메일 (+ 지역·업종 선택)
 */
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { C } from '../lib/theme';
import { Btn, Card, Screen } from '../lib/ui';

type Opt = { id: string; name: string; emoji?: string };

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
  else Alert.alert(title, msg);
}

/** 숫자만 남기고 000-00-00000 형태로 표시 */
function fmtBizNo(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** 숫자만 남기고 010-0000-0000 형태로 표시 */
function fmtPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
}

export default function ApplyScreen() {
  const { refresh } = useAuth();
  const [regions, setRegions] = useState<Opt[]>([]);
  const [categories, setCategories] = useState<Opt[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [regionId, setRegionId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [bizRegNo, setBizRegNo] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [intro, setIntro] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Opt[]>('/regions').then(setRegions).catch(() => {});
    api<Opt[]>('/categories').then(setCategories).catch(() => {});
  }, []);

  const valid =
    name.trim().length >= 2 &&
    address.trim().length >= 5 &&
    !!regionId &&
    !!categoryId &&
    ownerName.trim().length >= 2 &&
    bizRegNo.replace(/\D/g, '').length === 10 &&
    contactPhone.replace(/\D/g, '').length >= 10 &&
    /^\S+@\S+\.\S+$/.test(contactEmail.trim());

  async function submit() {
    if (!valid) return;
    setBusy(true);
    try {
      const r = await api<{ message: string }>('/merchant/apply', {
        method: 'POST',
        body: {
          name: name.trim(),
          regionId,
          categoryId,
          address: address.trim(),
          bizRegNo: bizRegNo.replace(/\D/g, ''),
          ownerName: ownerName.trim(),
          contactPhone: contactPhone.trim(),
          contactEmail: contactEmail.trim(),
          intro: intro.trim() || undefined,
        },
      });
      await refresh();
      notify('신청 완료', r.message);
      router.back();
    } catch (e: any) {
      notify('신청할 수 없습니다', e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card style={{ backgroundColor: C.brandSoft, borderColor: C.brandSoft }}>
          <Text style={st.guide}>
            가게 정보를 남겨주시면 본사 확인 후 연락드려요.{'\n'}
            승인되면 이 계정에 바로 <Text style={{ fontWeight: '900' }}>가맹점 모드</Text>가 열립니다.
          </Text>
        </Card>

        <Text style={st.section}>가게 정보</Text>

        <Text style={st.label}>가게 이름 *</Text>
        <TextInput
          style={st.input}
          value={name}
          onChangeText={setName}
          placeholder="예) 까사부사노"
          placeholderTextColor={C.ink3}
        />

        <Text style={st.label}>주소 *</Text>
        <TextInput
          style={st.input}
          value={address}
          onChangeText={setAddress}
          placeholder="예) 부산 해운대구 구남로 1길 2, 1층"
          placeholderTextColor={C.ink3}
        />

        <Text style={st.label}>지역 *</Text>
        <View style={st.chips}>
          {regions.map((r) => (
            <Pressable
              key={r.id}
              style={[st.chip, regionId === r.id && st.chipOn]}
              onPress={() => setRegionId(r.id)}
            >
              <Text style={[st.chipText, regionId === r.id && st.chipTextOn]}>{r.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={st.label}>업종 *</Text>
        <View style={st.chips}>
          {categories.map((c) => (
            <Pressable
              key={c.id}
              style={[st.chip, categoryId === c.id && st.chipOn]}
              onPress={() => setCategoryId(c.id)}
            >
              <Text style={[st.chipText, categoryId === c.id && st.chipTextOn]}>
                {c.emoji} {c.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={st.section}>사업자 정보</Text>

        <Text style={st.label}>사업자등록번호 *</Text>
        <TextInput
          style={st.input}
          value={bizRegNo}
          onChangeText={(v) => setBizRegNo(fmtBizNo(v))}
          placeholder="000-00-00000"
          placeholderTextColor={C.ink3}
          keyboardType="number-pad"
        />

        <Text style={st.label}>대표 이름 *</Text>
        <TextInput
          style={st.input}
          value={ownerName}
          onChangeText={setOwnerName}
          placeholder="사업자등록증의 대표자명"
          placeholderTextColor={C.ink3}
        />

        <Text style={st.label}>연락처 *</Text>
        <TextInput
          style={st.input}
          value={contactPhone}
          onChangeText={(v) => setContactPhone(fmtPhone(v))}
          placeholder="010-0000-0000"
          placeholderTextColor={C.ink3}
          keyboardType="phone-pad"
        />

        <Text style={st.label}>이메일 *</Text>
        <TextInput
          style={st.input}
          value={contactEmail}
          onChangeText={setContactEmail}
          placeholder="owner@example.com"
          placeholderTextColor={C.ink3}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={st.label}>가게 한 줄 소개 (선택)</Text>
        <TextInput
          style={st.input}
          value={intro}
          onChangeText={setIntro}
          placeholder="예) 낮에는 카페, 밤에는 위스키"
          placeholderTextColor={C.ink3}
        />

        <View style={{ marginTop: 18 }}>
          <Btn title={busy ? '접수 중…' : '입점 신청하기'} onPress={submit} disabled={!valid || busy} />
        </View>
        <Text style={st.foot}>사업자등록증 사본은 본사 승인 과정에서 확인합니다.</Text>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  guide: { fontSize: 13.5, color: C.brand, fontWeight: '700', lineHeight: 20, textAlign: 'center' },
  section: { fontSize: 14.5, fontWeight: '900', color: C.ink, marginTop: 22, marginBottom: 2 },
  label: { fontSize: 12.5, fontWeight: '800', color: C.ink3, marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 11,
    paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: C.ink,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
  },
  chipOn: { backgroundColor: C.brand, borderColor: C.brand },
  chipText: { fontSize: 13, fontWeight: '700', color: C.ink2 },
  chipTextOn: { color: '#fff' },
  foot: { fontSize: 11.5, color: C.ink3, textAlign: 'center', marginTop: 12, marginBottom: 20 },
});
