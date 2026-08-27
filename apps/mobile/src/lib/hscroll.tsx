/**
 * 가로 스크롤 공용 컴포넌트.
 * 네이티브: 일반 가로 ScrollView(스와이프).
 * 웹: 마우스 드래그로도 밀리게 처리한다 — 데스크톱 미리보기에서 트랙패드 없이도 슬라이드.
 *     드래그 후 손을 떼는 순간의 클릭은 무시해 카드가 잘못 열리는 것을 막는다.
 */
import React, { useRef } from 'react';
import { Platform, ScrollView, ScrollViewProps } from 'react-native';

export function HScroll({ children, ...props }: ScrollViewProps & { children: React.ReactNode }) {
  const ref = useRef<ScrollView>(null);
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false });

  const webProps =
    Platform.OS === 'web'
      ? {
          onMouseDown: (e: { clientX: number }) => {
            const node: HTMLElement | undefined = (ref.current as any)?.getScrollableNode?.();
            if (!node) return;
            drag.current = { down: true, startX: e.clientX, startLeft: node.scrollLeft, moved: false };

            const onMove = (ev: MouseEvent) => {
              if (!drag.current.down) return;
              const dx = ev.clientX - drag.current.startX;
              if (Math.abs(dx) > 4) drag.current.moved = true;
              node.scrollLeft = drag.current.startLeft - dx;
            };
            const onUp = () => {
              drag.current.down = false;
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
              if (drag.current.moved) {
                // 드래그로 끝난 클릭 1회는 무시 (카드 오작동 방지)
                node.addEventListener(
                  'click',
                  (ce) => {
                    ce.stopPropagation();
                    ce.preventDefault();
                  },
                  { capture: true, once: true },
                );
              }
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          },
        }
      : {};

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      {...(webProps as object)}
      {...props}
    >
      {children}
    </ScrollView>
  );
}
