# Project Rules

- The product uses only `recommended`, `hold`, and `excluded` creator decisions.
- All user-facing decision labels are `추천`, `보류`, and `제외`.
- Confirmed company, agency, management, MCN, or label email always means excluded.
- Missing or unchecked email may mean hold.
- Only a confirmed personal-looking email can satisfy recommendation.
- Hard exclusion conditions override all positive signals.
- History duplicate checks happen before recommendation.
- Same-run duplicate checks happen before visible results.
- User corrections override automatic decisions.
- Search-result URLs are not creator identities.
- Never invent creator identity, URLs, emails, views, or evidence. Clearly fictional phase fixtures must be labeled as mock data and must never be presented as real findings.
- Business decision logic must remain outside React components.
- External integrations require a separate later-phase instruction.
- The project uses TypeScript only; Python must not be used.
- User-facing UI text must be written in Korean.
- Do not add unnecessary dependencies.
- Run lint, tests, type checking, and build after relevant changes.
- Preserve backward compatibility for the three-field history export format: `channel_name`, `url`, and `status`.
