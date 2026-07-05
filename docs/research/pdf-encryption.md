# Research: Encrypted PDF on Vercel serverless

**Question:** the brief requires a password-protected PDF attachment (password =
last 4 digits of the account phone, initially `4567`) sent from the deployed
app. Producing an *encrypted* PDF in a serverless function is the riskiest
unknown, because most PDF libraries either can't encrypt or need a native
binary that is awkward to ship on Vercel.

## Decision

Use **two pure-JavaScript libraries**, both already installed:

| Concern | Library | Why |
| --- | --- | --- |
| PDF content | [`pdf-lib`](https://www.npmjs.com/package/pdf-lib) `^1.17.1` | Pure JS, no binary, builds pages/text/tables. Serverless-safe. |
| Encryption | [`@pdfsmaller/pdf-encrypt-lite`](https://www.npmjs.com/package/@pdfsmaller/pdf-encrypt-lite) `^1.0.2` | 7 KB, **zero dependencies**, pure JS RC4-128, explicitly built for edge/serverless (Cloudflare Workers, Vercel Edge, Deno). Published 2026-02. |

Exact API (verified from the installed type defs):

```ts
encryptPDF(pdfBytes: Uint8Array, userPassword: string, ownerPassword?: string | null): Promise<Uint8Array>
```

Pipeline (implemented in `src/lib/notifications/pdf/`):

```
buildAccountPdf(ctx)  ->  Uint8Array (unencrypted, pdf-lib)
encryptPdf(bytes, pwd) ->  Uint8Array (RC4-128, pdf-encrypt-lite)
Resend attachment: Buffer.from(encryptedBytes)
```

The API route sets `export const runtime = "nodejs"` so `Buffer` and Resend work.

## Alternatives considered

- **`node-qpdf2`** — wraps the `qpdf` binary; supports AES-256. Rejected as the
  default because it needs the qpdf binary bundled into the Lambda/Vercel
  function (a vendor layer), which is exactly the deployment risk we want to
  avoid. Keep as the upgrade path if AES-256 is ever required.
- **`node-forge` / `crypto-js`** — large bundles (1.7 MB / 234 KB) and no PDF
  object handling. Overkill.
- **Hosted APIs (Cloudmersive, ConvertAPI, Apryse)** — would send account data
  to a third party. Rejected on data-handling grounds.

## Honest caveat to put in the design note

RC4-128 is weak by modern standards, and the password is only 4 digits — so the
encryption is a *"can't casually open the attachment"* control, not strong
cryptography. That matches the challenge intent (the PDF is a redaction boundary
that keeps sensitive detail out of the email body), and it is worth stating the
tradeoff explicitly plus the AES-256/qpdf upgrade path.

## Spike checklist (do in a preview deploy before polishing)

- [ ] Generate + encrypt a PDF inside `/api/chat` on a Vercel preview.
- [ ] Confirm the downloaded attachment opens with `4567` and rejects a wrong password.
- [ ] Confirm cold-start time is acceptable (both libs are tiny, so it should be).
- [ ] Confirm the PDF password and bytes never appear in logs.

## Sources

- [node-qpdf2 — npm](https://www.npmjs.com/package/node-qpdf2)
- [@pdfsmaller/pdf-encrypt-lite — npm](https://www.npmjs.com/package/@pdfsmaller/pdf-encrypt-lite)
- [pdf-lib — npm](https://www.npmjs.com/package/pdf-lib)
