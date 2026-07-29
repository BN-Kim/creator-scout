import { describe, expect, it } from "vitest";
import { extractVisibleEmails } from "@/server/providers/recruitment/visible-email-extractor";

describe("visible public email extraction", () => {
  it.each([
    ["문의 creator@gmail.com", "creator@gmail.com"],
    ["문의 creator @ naver.com", "creator@naver.com"],
    ["문의 creator＠daum．net", "creator@daum.net"],
    ["문의 creator(at)gmail(dot)com", "creator@gmail.com"],
    ["문의 creator [골뱅이] naver [dot] com", "creator@naver.com"],
    ["문의 cre\u200Bator@hanmail.net", "creator@hanmail.net"],
    ["문의 creator&#64;kakao&#46;com", "creator@kakao.com"],
  ])("normalizes an explicitly visible address from %s", (text, email) => {
    expect(extractVisibleEmails(text)).toEqual([
      expect.objectContaining({ email }),
    ]);
  });

  it("does not guess an address when a complete domain is not visibly published", () => {
    expect(extractVisibleEmails("문의는 creator 계정으로 보내 주세요.")).toEqual([]);
    expect(extractVisibleEmails("문의: creator(at)gmail")).toEqual([]);
  });
});
