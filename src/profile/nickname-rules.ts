/**
 * 닉네임 규칙 — 순수 로직 (네트워크/firebase 무관, 유닛 테스트 대상).
 * 랭킹 식별자로 쓰이므로 여기서 검증·정규화를 한 곳에 모은다.
 *
 * - 길이: 코드포인트 기준 2~9자 (이모지/서러게이트 1자로 안전하게 셈).
 * - 유일성 key: 앞뒤 공백 제거 + 소문자화 — "Kevin"과 "kevin"을 같은 것으로 본다
 *   (대소문자만 다른 사칭 방지). 표시용 원문(value)은 입력 그대로 보존.
 * - 금지문자: 제어문자와 '/'(Firestore 문서 ID 금지문자이자 key로 그대로 쓰인다).
 */
import type { NicknameInvalidReason } from '../app/ports';

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 9;

/** 제어문자(줄바꿈·탭 등) + Firestore 문서 ID로 못 쓰는 '/' */
const FORBIDDEN = new RegExp('[\\u0000-\\u001f\\u007f/]');

export type NicknameValidation =
  | { ok: true; value: string; key: string }
  | { ok: false; reason: NicknameInvalidReason };

/** 유일성 비교에 쓰는 정규화 key — 표시용이 아니다 */
export function nicknameKey(value: string): string {
  return value.trim().toLowerCase();
}

export function validateNickname(raw: string): NicknameValidation {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, reason: 'empty' };
  if (FORBIDDEN.test(value)) return { ok: false, reason: 'invalid-char' };
  const len = [...value].length; // 코드포인트 수 (한글/영문/숫자/이모지 모두 1자)
  if (len < NICKNAME_MIN) return { ok: false, reason: 'too-short' };
  if (len > NICKNAME_MAX) return { ok: false, reason: 'too-long' };
  return { ok: true, value, key: nicknameKey(value) };
}
