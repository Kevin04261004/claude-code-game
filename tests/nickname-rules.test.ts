/** 닉네임 검증 규칙 (src/profile/nickname-rules.ts) — 순수 로직 */
import { describe, expect, it } from 'vitest';
import { nicknameKey, validateNickname } from '../src/profile/nickname-rules';

describe('validateNickname', () => {
  it('2~9자 정상 닉네임을 통과시킨다', () => {
    for (const raw of ['가나', 'Kevin', '용사123', '가나다라마바사아자']) {
      const v = validateNickname(raw);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.value).toBe(raw);
    }
  });

  it('앞뒤 공백을 제거한 뒤 판정한다', () => {
    const v = validateNickname('  용사  ');
    expect(v).toEqual({ ok: true, value: '용사', key: '용사' });
  });

  it('1자/빈 문자열은 거부한다', () => {
    expect(validateNickname('가')).toEqual({ ok: false, reason: 'too-short' });
    expect(validateNickname('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('10자 이상은 거부한다', () => {
    expect(validateNickname('가나다라마바사아자차')).toEqual({ ok: false, reason: 'too-long' });
  });

  it('이모지는 코드포인트 1자로 센다', () => {
    expect(validateNickname('🎮').ok).toBe(false); // 1자 → too-short
    expect(validateNickname('🎮🎮').ok).toBe(true); // 2자
  });

  it('제어문자·슬래시는 거부한다', () => {
    expect(validateNickname('a/b')).toEqual({ ok: false, reason: 'invalid-char' });
    expect(validateNickname('a\tb')).toEqual({ ok: false, reason: 'invalid-char' });
    expect(validateNickname('a\nb')).toEqual({ ok: false, reason: 'invalid-char' });
  });

  it('key는 대소문자를 무시한다 (사칭 방지)', () => {
    const a = validateNickname('Kevin');
    const b = validateNickname('kevin');
    expect(a.ok && b.ok && a.key === b.key).toBe(true);
    expect(nicknameKey('KEVIN')).toBe('kevin');
  });
});
