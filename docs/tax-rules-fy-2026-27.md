# India tax rules for FY 2026-27

**Status: approved for coding by the project owner on 23 November 2026. Not yet checked by a chartered accountant, so
the calculator is switched off in production.** Researched 23 November 2026. This is not tax advice. The plan (section 18.3) requires a qualified tax
professional to validate these rules before users see any estimate.

Applies to income from 1 April 2026 to 31 March 2027. The Income-tax Act 2025 replaced the 1961 Act from
1 April 2026, so this year is called **Tax Year 2026-27** ("AY 2027-28" is no longer used).

## How sure each rule is

| Mark | Meaning |
|---|---|
| **A** | Read in a government document: the Finance Bill 2026 memorandum [1], the e-filing portal [2, 3, 4] or the GST Council release [5] |
| **B** | Read in two independent sources that agree, such as two copies of the Act's text |
| **C** | Read in one secondary source, or sources partly disagree |
| **X** | Not confirmed. Must not be coded until someone confirms it |

Two limits on this research:

- The Income Tax Department and Budget sites refuse automated reading, and I did not work around that. The
  **Act itself and the gazetted Finance Act 2026 were not read at source**.
- The memorandum [1] is a government document read from a third-party copy. It describes the Bill. A copy of the
  enacted Finance Act [6] agrees on surcharge and marginal relief, but its slab tables were not reached.

## 1. What the plan gets wrong

| Plan says | Correct | Mark |
|---|---|---|
| Surcharge 37% above ₹5 crore, in the rule data shown with new-regime slabs | New regime is capped at **25%**. 37% is old regime only | A |
| Rebate stops dead at ₹12 lakh | **Marginal relief** applies just above ₹12 lakh | B |
| No surcharge marginal relief | Marginal relief applies at every surcharge threshold | A |
| Presumptive scheme up to ₹75 lakh | **₹50 lakh**, or ₹75 lakh only if cash receipts are 5% or less | B |
| Presumptive scheme for "professionals" | Only for a **closed list** of professions (section 6 below) | B |
| Sections 87A, 44ADA, 80C, 80D, 80CCD(1B), 80TTA | Now 156, 58, 123, 126, 124, 153 | B |
| Health insurance ₹50,000 for parents | ₹25,000, or ₹50,000 if a parent is a senior citizen | C |
| SAC 998314 = IT consulting, 998313 = design/development | **Swapped.** 998313 is consulting and support, 998314 is design and development | B |
| Slabs start at 400001, 800001 … | Use continuous limits, or amounts with paise fall between slabs | — |
| No rounding rule | Drop paise, then round to the nearest ₹10 (section 516) | B |

## 2. New regime (section 202, the default)

| Income | Rate | Mark |
|---|---|---|
| Up to ₹4,00,000 | 0% | A |
| ₹4,00,000 to ₹8,00,000 | 5% | A |
| ₹8,00,000 to ₹12,00,000 | 10% | A |
| ₹12,00,000 to ₹16,00,000 | 15% | A |
| ₹16,00,000 to ₹20,00,000 | 20% | A |
| ₹20,00,000 to ₹24,00,000 | 25% | A |
| Above ₹24,00,000 | 30% | A |

**Rebate, section 156. Resident individuals only (B):**

- Income up to ₹12,00,000: the tax, up to ₹60,000.
- Above ₹12,00,000: tax is limited to the amount by which income exceeds ₹12,00,000. In practice this ends near
  ₹12,70,590.
- It only reduces tax at the slab rates, not tax on special-rate income such as capital gains.

## 3. Old regime (chosen by opting out)

| Income | Under 60 | 60 to 79, resident | 80 and over, resident | Mark |
|---|---|---|---|---|
| Up to ₹2,50,000 | 0% | 0% | 0% | A |
| ₹2,50,000 to ₹3,00,000 | 5% | 0% | 0% | A |
| ₹3,00,000 to ₹5,00,000 | 5% | 5% | 0% | A |
| ₹5,00,000 to ₹10,00,000 | 20% | 20% | 20% | A |
| Above ₹10,00,000 | 30% | 30% | 30% | A |

- Rebate, section 156: up to ₹12,500 for resident individuals with income up to ₹5,00,000. There is no marginal
  relief above it (B).
- Age matters, and the app does not ask for it yet.

## 4. Surcharge and cess

| Income above | New regime | Old regime | Mark |
|---|---|---|---|
| ₹50 lakh | 10% | 10% | A |
| ₹1 crore | 15% | 15% | A |
| ₹2 crore | 25% | 25% | A |
| ₹5 crore | 25% | 37% | A |

- **Marginal relief (A, formula B):** tax plus surcharge cannot exceed the tax plus surcharge at the threshold,
  plus the income above the threshold.
- **Cess (A):** 4% of tax plus surcharge, after marginal relief. No relief on the cess itself.
- Dividends and some capital gains have a 15% surcharge cap (A). They are out of scope for version 1.

## 5. Deductions

| Deduction | Section (old) | Limit | Regime | Mark |
|---|---|---|---|---|
| Standard deduction, **salary only** | 19 | ₹75,000 new, ₹50,000 old | Both | B |
| Employer pension contribution | 124 (80CCD(2)) | % of salary | Both | B |
| PPF, ELSS, life insurance and similar | 123 (80C) | ₹1,50,000 | Old | B |
| Extra NPS | 124 (80CCD(1B)) | ₹50,000 | Old | B |
| Health insurance, self and family | 126 (80D) | ₹25,000, or ₹50,000 for seniors | Old | C |
| Health insurance, parents | 126 (80D) | ₹25,000, or ₹50,000 for seniors | Old | C |
| Savings interest | 153 (80TTA) | ₹10,000, or ₹50,000 for seniors (80TTB) | Old | B |
| One cap across 80C, 80CCC and own NPS | 123, 124 | ₹1,50,000 in the 1961 Act | Old | X |

The limits come from the e-filing portal's page for the previous year [2]. The new section numbers come from
professional commentary [9, 10].

## 6. Presumptive taxation for professionals (section 58, was 44ADA)

- Who: a **resident individual or a firm that is not an LLP**. An HUF does not qualify (B).
- Limit: gross receipts up to ₹50 lakh, or ₹75 lakh if cash receipts do not exceed 5% (B). A cheque that is not
  account-payee counts as cash (B).
- Income: 50% of gross receipts, or the actual profit if higher (B). No other business expenses may be deducted (B).
- **Only listed professions (B for the limits, C for the list):** legal, medical, engineering, architectural,
  accountancy, technical consultancy, interior decoration, information technology, company secretary, and any
  others the Board notifies.
- **Unclear (X):** whether software developers count as "information technology", and whether designers, video
  editors, marketers and writers are covered at all. One commentator says digital professionals are "in
  classification limbo". These are this app's main users.

## 7. Advance tax

| By | Cumulative share | Presumptive | Mark |
|---|---|---|---|
| 15 June 2026 | 15% | — | A for the date, B for the share |
| 15 September 2026 | 45% | — | B |
| 15 December 2026 | 75% | — | B |
| 15 March 2027 | 100% | 100% | A |

- Due only if tax after TDS is ₹10,000 or more, section 404 (A).
- Not due from a resident aged 60 or over with no business or professional income (C).
- Section 424 interest: 1% a month if less than 90% of the tax was paid (A for 1%, B for 90%).
- Section 425 interest on a short instalment: 3%, 3%, 3% and 1% of the shortfall. None if at least 12% was paid by
  15 June, or 36% by 15 September (B).

## 8. Other dates and choices

- Return due **31 August 2027** for a business or profession without an audit, 31 October 2027 with one (A).
- Choosing the old regime with business income: on or before the return's due date. It can be reversed **only once**
  (A for the previous year, B for this one).
- Form 10-IEA appears to be replaced by a choice in the return itself, rule 136 (C).
- Audit: professional receipts above ₹50 lakh (C). Not needed under the presumptive scheme (C).

## 9. Foreign income

Professional income in foreign currency converts at **SBI's telegraphic transfer buying rate on the last day of the
tax year**. Income received in, or brought into, India before that day is excepted (C: read in the draft rules, not
the final ones).

What this means for the app: for received income, the **actual rupees credited** matter most. The app's ECB rate is
only an estimate, and that should be said next to any tax figure.

## 10. GST (information only, not part of the tax estimate)

- Registration above ₹20 lakh turnover for services (B). ₹10 lakh in some states; sources disagree on which (X).
- Whether an exporter below the limit must register (X). One source cites an exemption for inter-state services,
  notification 10/2017.
- An LUT covers one financial year, 1 April 2026 to 31 March 2027, and must be filed before exporting (B).
- The GST Council recommended **easier export-of-services rules on 8 October 2026** (A). They are not law until
  notified, so do not code them.

## 11. Worked examples

These become the tax engine's tests. Resident individual under 60, no special-rate income.

| Regime | Taxable income | Slab tax | Rebate | Surcharge | Marginal relief | Cess | **Total tax** |
|---|---|---|---|---|---|---|---|
| New | 12,00,000 | 60,000 | 60,000 | 0 | 0 | 0 | **0** |
| New | 12,10,000 | 61,500 | 51,500 | 0 | 0 | 400 | **10,400** |
| New | 12,70,000 | 70,500 | 500 | 0 | 0 | 2,800 | **72,800** |
| New | 12,80,000 | 72,000 | 0 | 0 | 0 | 2,880 | **74,880** |
| New | 15,00,000 | 1,05,000 | 0 | 0 | 0 | 4,200 | **1,09,200** |
| New | 24,00,000 | 3,00,000 | 0 | 0 | 0 | 12,000 | **3,12,000** |
| New | 50,00,000 | 10,80,000 | 0 | 0 | 0 | 43,200 | **11,23,200** |
| New | 51,00,000 | 11,10,000 | 0 | 1,11,000 | 41,000 | 47,200 | **12,27,200** |
| New | 1,01,00,000 | 26,10,000 | 0 | 3,91,500 | 63,500 | 1,17,520 | **30,55,520** |
| New | 2,01,00,000 | 56,10,000 | 0 | 14,02,500 | 4,95,500 | 2,60,680 | **67,77,680** |
| New | 6,00,00,000 | 1,75,80,000 | 0 | 43,95,000 | 0 | 8,79,000 | **2,28,54,000** |
| Old | 5,00,000 | 12,500 | 12,500 | 0 | 0 | 0 | **0** |
| Old | 5,10,000 | 14,500 | 0 | 0 | 0 | 580 | **15,080** |
| Old | 10,00,000 | 1,12,500 | 0 | 0 | 0 | 4,500 | **1,17,000** |
| Old | 51,00,000 | 13,42,500 | 0 | 1,34,250 | 64,250 | 56,500 | **14,69,000** |
| Old | 5,01,00,000 | 1,48,42,500 | 0 | 54,91,725 | 17,18,600 | 7,44,625 | **1,93,60,250** |

## 12. Decisions made

1. A and B rules are coded. C rules are coded with a note. X rules are left out.
2. The presumptive scheme needs the user to confirm their profession is on the list. Nobody is assumed to qualify.
3. Version 1 covers resident individuals with professional, salary and interest income. HUFs, non-residents, capital
   gains, crypto and farm income are out of scope.
4. Old-regime deductions: sections 123, 124 (extra NPS), 126 and 153.
5. A chartered accountant checks this sheet before the calculator is public. Until then the rule set in
   `src/server/services/tax-engine/jurisdictions/india-2026-27.ts` stays `pending_review`.

## Sources

1. [Finance Bill 2026 explanatory memorandum, third-party copy](https://www.caalley.com/budget2026/memo.pdf)
2. [e-filing portal: individuals with business or profession, AY 2026-27](https://www.incometax.gov.in/iec/foportal/help/individual-business-profession)
3. [e-filing portal: scope of the new Act](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/objective-and-scope-new-act)
4. [e-filing portal: tax payments FAQ](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/tax-payments-faq)
5. [57th GST Council press release, 8 October 2026](https://gstcouncil.gov.in/sites/default/files/2026-10/press_release_0.pdf)
6. [Finance Act 2026, TaxGuru copy](https://taxguru.in/?p=1035138) and [rates article](https://taxguru.in/?p=1022835)
7. Copies of the Act: EZTax sections [156](https://eztax.in/income-tax-act-2025/section-156),
   [202](https://eztax.in/income-tax-act-2025/section-202), [58](https://eztax.in/income-tax-act-2025/section-58),
   [62](https://eztax.in/income-tax-act-2025/section-62), [63](https://eztax.in/income-tax-act-2025/section-63),
   [403](https://eztax.in/income-tax-act-2025/section-403), [404](https://eztax.in/income-tax-act-2025/section-404),
   [408](https://eztax.in/income-tax-act-2025/section-408), [424](https://eztax.in/income-tax-act-2025/section-424),
   [425](https://eztax.in/income-tax-act-2025/section-425)
8. Second copies: [Lawspedia 156](https://www.lawspedia.in/section-156-of-income-tax-act-2025),
   [AUBSP 58](https://www.aubsp.com/income-tax-act-2025-section-58/),
   [AUBSP 425](https://www.aubsp.com/income-tax-act-2025-section-425/),
   [AAP Tax Law 408](https://www.aaptaxlaw.com/income-tax-act-2025/section-408-income-tax-act-2025-advance-tax-instalments-due-dates.html)
9. [TaxGuru: deductions in Chapter VIII](https://taxguru.in/income-tax/chapter-vi-a-deductions-reorganised-chapter-viii-income-tax-act-2025.html)
   and [CAclubindia: old and new section numbers](https://www.caclubindia.com/articles/deduction-provisions-incometax-act-1961-vs-incometax-act-2025-56035.asp)
10. [Taxmann: deductions](https://www.taxmann.com/post/blog/deductions-under-income-tax-act)
11. [TaxGuru: presumptive taxation, section 58](https://taxguru.in/income-tax/analysis-presumptive-taxation-section-58-income-tax-act-2025.html)
    and [specified professions](https://taxguru.in/?p=1050049)
12. [TaxGuru: draft rule 206, foreign currency](https://taxguru.in/?p=1029477)
13. [Rule 136, choosing a regime](https://taxclue.in/blog/rule-136-income-tax-rules-2026-new-tax-regime-option-in-return)
    and [section 516, rounding](https://www.aaptaxlaw.com/income-tax-act-2025/section-516-income-tax-act-2025-rounding-off-income-tax.html)
    (seen in search results only)
14. [TaxGuru: GST registration limits](https://www.taxguru.in/goods-and-service-tax/gst-registration-threshold-limit.html),
    [CalcGuru](https://calcguru.in/?p=4359),
    [LUT for FY 2026-27](https://www.setindiabiz.com/blog/gst-lut-filing-fy-2026-27) and SAC
    [998313](https://busy.in/sac-code-998313/), [998314](https://busy.in/sac-code-998314/) (the last three seen in
    search results only)
