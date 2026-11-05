import { BUSINESS_REASON } from './lists'

// The two starting emails. Header, footer and layout are added when the email is built.
const G = '#0E9F6E', DEEP = '#0C3A2C', INK = '#17302A', SOFT = '#F1F8F5', SUN = '#FFB020'

const p = (t: string) => `<p style="margin:0 0 16px;">${t}</p>`
const h1 = (t: string) => `<h1 style="margin:0 0 12px;font-size:31px;line-height:1.14;font-weight:bold;letter-spacing:-0.5px;text-align:center;color:${DEEP};">${t}</h1>`
const lead = (t: string) => `<p style="margin:0 0 18px;font-size:17px;line-height:1.45;text-align:center;">${t}</p>`
const ASSETS = 'https://www.thesupportlife.com/email'
const SITE = 'https://www.thesupportlife.com/?utm_source=email&amp;utm_medium=email&amp;utm_campaign='
const split = (utm = 'split') => `<a href="${SITE}${utm}"><img src="${ASSETS}/alone-vs-friend.jpg" width="552" alt="Doing it alone: stress, guesswork, surprise bills. With a friend who speaks insurance: plain English, free, no pressure." style="display:block;width:100%;max-width:552px;height:auto;margin:0 0 18px;border:0;border-radius:14px;font-size:15px;color:${DEEP};"></a>`
const chart = () => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;"><tr><td bgcolor="${DEEP}" style="background:${DEEP};border-radius:16px;padding:20px;">
<p style="margin:0;font-size:23px;line-height:1.15;font-weight:bold;color:#ffffff;">Your plan renews. Your price <span style="color:#FF8A5C;">may not stay put.</span></p>
<p style="margin:8px 0 12px;font-size:15px;line-height:1.45;color:#D6E4DD;">Insurers proposed a median increase of about 15% for 2027. What it means for you depends on your plan and state.</p>
<img src="${ASSETS}/price-chart.png" width="512" alt="2027 proposed premiums: about 15 percent higher than 2026, median." style="display:block;width:100%;max-width:512px;height:auto;border:0;font-size:14px;color:#ffffff;">
<p style="margin:10px 0 0;font-size:11px;line-height:1.4;color:#9DB6AB;">Source: KFF review of 276 insurers' proposed 2027 rates. Illustration only, not your price. Final rates vary.</p>
</td></tr></table>`
const friend = () => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;"><tr><td bgcolor="${DEEP}" style="background:${DEEP};border-radius:16px;overflow:hidden;">
<img src="${ASSETS}/two-friends.jpg" width="552" alt="Two friends sitting together, talking it through" style="display:block;width:100%;max-width:552px;height:auto;border:0;border-radius:16px 16px 0 0;font-size:14px;color:#ffffff;">
<div style="padding:18px 22px 20px;">
<p style="margin:0;font-size:14px;font-weight:bold;color:${SUN};">Pull up a chair</p>
<p style="margin:2px 0 0;font-size:24px;line-height:1.15;font-weight:bold;color:#ffffff;">Think of us as your friend who speaks insurance</p>
<p style="margin:8px 0 0;font-size:15px;line-height:1.45;color:#E5F3EC;">We connect you with a licensed agent who walks through your options with you, one question at a time. Nothing is bought without your OK.</p>
</div></td></tr></table>`
const box = (label: string, value: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 24px;"><tr><td align="center" bgcolor="${DEEP}" style="background:${DEEP};border-radius:14px;padding:18px 20px;">
<p style="margin:0;font-size:12px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:${SUN};">${label}</p>
<p style="margin:4px 0 0;font-size:25px;line-height:1.2;font-weight:bold;color:#ffffff;">${value}</p>
</td></tr></table>`
const btn = (label: string, utm: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 24px;"><tr><td align="center" bgcolor="${SUN}" style="background:${SUN};border-radius:12px;">
<a href="https://www.thesupportlife.com/?utm_source=email&amp;utm_medium=email&amp;utm_campaign=${utm}" style="display:block;padding:18px 24px;color:${DEEP};text-decoration:none;font-size:18px;font-weight:bold;">${label} &rarr;</a>
</td></tr></table>`
const row = (mark: string, title: string, text: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr><td bgcolor="${SOFT}" style="background:${SOFT};border-radius:12px;padding:14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="46" valign="top"><div style="width:34px;height:34px;line-height:34px;text-align:center;background:${G};border-radius:17px;color:#ffffff;font-size:15px;font-weight:bold;">${mark}</div></td>
<td valign="top" style="font-size:15px;line-height:1.5;">${title ? `<strong style="font-size:16px;color:${DEEP};">${title}</strong><br>` : ''}${text}</td></tr></table>
</td></tr></table>`
const heading = (t: string) => `<p style="margin:10px 0 12px;font-size:19px;font-weight:bold;color:${DEEP};">${t}</p>`
const rows = (inner: string) => `<div style="margin:0 0 18px;">${inner}</div>`
const stats = (items: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;"><tr>${items.map(([v, l], i) =>
    `<td width="33%" valign="top" style="padding:${i ? '0 0 0 8px' : '0'};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${SOFT}" style="background:${SOFT};border-radius:12px;padding:14px 6px;">
<p style="margin:0;font-size:22px;line-height:1.1;font-weight:bold;color:${G};">${v}</p>
<p style="margin:5px 0 0;font-size:12px;line-height:1.3;color:#4A6A60;">${l}</p>
</td></tr></table></td>`).join('')}</tr></table>`

export const emailBlocks = { p, h1, box, btn, row, rows, heading, stats, split, friend }

export const TEMPLATES = [
  {
    key: 'email1',
    list: 'clients',
    reason: '',
    followup: 'email2',
    label: 'Email 1: 2027 costs',
    name: 'Open Enrollment, Email 1',
    subject: '{{first_name}}, your 2027 health plan may cost more. Check before it renews',
    preheader: "Open Enrollment runs until January 15. Here's what changed for 2027.",
    html: [
      h1(`Health insurance shouldn't feel like <span style="color:#D9472F;">this.</span>`),
      lead("Prices may go up, the rules changed, and nobody talks in plain English. You don't have to figure it out alone."),
      split('oe2027_email1'),
      btn('Show me my 2027 options', 'oe2027_email1'),
      p('Hi {{first_name}}, if you do nothing, your plan may simply renew, and this is a year where that could cost you.'),
      chart(),
      friend(),
      `<p style="margin:0 0 12px;font-size:21px;line-height:1.2;font-weight:bold;text-align:center;color:${DEEP};">Grab a coffee. Enrollment ends January 15.</p>`,
      btn('Get my free plan review', 'oe2027_email1'),
      p('Thanks,<br><strong>The Support Life team</strong>'),
    ].join('\n'),
  },
  {
    key: 'email2',
    list: 'clients',
    reason: '',
    label: 'Email 2: Follow-up',
    name: 'Open Enrollment, Email 2 (follow-up)',
    subject: '{{first_name}}, want coverage from January 1? Enroll by December 15',
    preheader: 'A 15-minute call with a licensed agent. Free, no obligation.',
    html: [
      h1('Want coverage from January 1?'),
      p('Hi {{first_name}},'),
      p('A quick follow-up on my last note. If you want new coverage to start on January 1, there is one date to remember.'),
      box('Marketplace deadline for January 1 coverage', 'December 15'),
      p('Open Enrollment closes completely on January 15.'),
      heading("Before you renew, it's worth checking"),
      rows([
        row('&#10003;', 'Monthly cost', 'What your plan will cost each month in 2027.'),
        row('&#10003;', 'Out-of-pocket costs', 'Your deductible and out-of-pocket maximum.'),
        row('&#10003;', 'Doctors and prescriptions', 'Whether they are still covered.'),
        row('&#10003;', 'Savings', 'Whether your income still qualifies you.'),
      ].join('\n')),
      p('A licensed agent can go through all of this with you in about 15 minutes. Free, and no obligation to enroll.'),
      btn('Get my free plan review', 'oe2027_email2'),
      p('Thanks,<br><strong>The Support Life team</strong>'),
    ].join('\n'),
  },
  {
    key: 'b1',
    list: 'business',
    reason: BUSINESS_REASON,
    followup: 'b2',
    label: 'Business 1: Owners',
    name: 'Business owners, Email 1',
    subject: '{{first_name}}, is your 2027 health coverage sorted?',
    preheader: 'If you buy your own coverage, Open Enrollment runs until January 15.',
    html: [
      h1('Health coverage when you work for yourself'),
      p('Hi {{first_name}},'),
      p('If you run {{company}} and buy your own health insurance, Open Enrollment for 2027 is open now. It is worth a look before your plan renews.'),
      stats([['Jan 15', 'Last day to enroll'], ['15 min', 'With a licensed agent'], ['Free', 'No obligation to enroll']]),
      heading('Why it matters for owners'),
      rows([
        row('1', 'Your income drives your savings.', 'Savings depend on your household and your expected yearly income, so owners with uneven income should estimate carefully.'),
        row('2', 'Prices are moving.', "KFF's review of 276 insurers found a median proposed increase of about 15% for 2027."),
        row('3', 'The monthly price is only part of it.', 'Deductibles, copays and which doctors are covered matter just as much.'),
      ].join('\n')),
      p("We can connect you with a licensed agent who will compare your options with you. It's free, and there's no obligation to enroll."),
      btn('Check my 2027 options', 'oe2027_business1'),
      p('Thanks,<br><strong>The Support Life team</strong>'),
    ].join('\n'),
  },
  {
    key: 'b2',
    list: 'business',
    reason: BUSINESS_REASON,
    label: 'Business 2: Follow-up',
    name: 'Business owners, Email 2 (follow-up)',
    subject: '{{first_name}}, quick follow-up on your 2027 coverage',
    preheader: 'A 15-minute call with a licensed agent. Free, no obligation.',
    html: [
      h1('Still comparing 2027 coverage?'),
      p('Hi {{first_name}},'),
      p('A quick follow-up on my last note. If you buy your own coverage and want it to start on January 1, there is one date to remember.'),
      box('Marketplace deadline for January 1 coverage', 'December 15'),
      p('A licensed agent can go through your options with you in about 15 minutes. Free, and no obligation to enroll. Not relevant for you? Just reply "no thanks" and we will stop.'),
      btn('Get my free plan review', 'oe2027_business2'),
      p('Thanks,<br><strong>The Support Life team</strong>'),
    ].join('\n'),
  },
]
