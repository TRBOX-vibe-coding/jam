/**
 * 에이젠테이션 도구 막대 — 이 PC에서 띄운 개발 화면(npm run web)에서만 나타난다.
 * 메모는 이 PC의 에이젠테이션 서버(localhost:4747)로 가고, 클로드가 거기서 읽어 고친다.
 * 배포본(expo export)에서는 NODE_ENV가 production이라 이 줄 전체가 번들에서 빠진다.
 */
export default function AgentationDev() {
  if (process.env.NODE_ENV !== 'development') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Agentation } = require('agentation');
  return <Agentation endpoint="http://localhost:4747" />;
}
