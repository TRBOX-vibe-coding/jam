/**
 * HOLIC GEM 로고.
 * 보석(젬) 마크 = 45° 회전한 그라데이션 다이아 + 상단 하이라이트 면 + 코랄 스파클.
 * 워드마크 = HOLIC(자간 넓게) + GEM(그라데이션 칩). 어두운 배경에서는 골드 칩으로 반전.
 */
import { Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from './theme';

export function GemMark({ size = 30 }: { size?: number }) {
  const box = size * 1.3;
  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size, height: size,
          transform: [{ rotate: '45deg' }],
          borderRadius: size * 0.26,
          overflow: 'hidden',
        }}
      >
        <LinearGradient
          colors={['#7DD3FC', '#38BDF8', '#0369A1']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={{ flex: 1 }}
        />
      </View>
      {/* 빛 받는 면 */}
      <View
        style={{
          position: 'absolute',
          top: box * 0.22, left: box * 0.3,
          width: size * 0.32, height: size * 0.32,
          transform: [{ rotate: '45deg' }],
          borderRadius: size * 0.09,
          backgroundColor: 'rgba(255,255,255,0.38)',
        }}
      />
      <Text
        style={{
          position: 'absolute', top: -size * 0.06, right: -size * 0.02,
          fontSize: size * 0.44, color: '#FF6B4A', fontWeight: '700',
        }}
      >
        ✦
      </Text>
    </View>
  );
}

export function Wordmark({ light = false, size = 14 }: { light?: boolean; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text
        style={{
          fontSize: size, fontWeight: '700', letterSpacing: 3,
          color: light ? '#FFFFFF' : C.ink,
        }}
      >
        HOLIC
      </Text>
      <View style={{ borderRadius: 6, overflow: 'hidden' }}>
        <LinearGradient
          colors={light ? ['#FFD983', '#F0A32B'] : ['#38BDF8', '#0284C7']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text
            style={{
              fontSize: size - 0.5, fontWeight: '700', letterSpacing: 2,
              color: light ? '#4A2E00' : '#FFFFFF',
              paddingHorizontal: 7, paddingVertical: 2.5,
            }}
          >
            GEM
          </Text>
        </LinearGradient>
      </View>
    </View>
  );
}

/** 마크 + 워드마크 가로 조합 */
export function Logo({ light = false, size = 26, style }: { light?: boolean; size?: number; style?: ViewStyle }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>
      <GemMark size={size} />
      <Wordmark light={light} size={size * 0.54} />
    </View>
  );
}
