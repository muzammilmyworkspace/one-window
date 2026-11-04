// The two starting emails. Footer and layout are added when the email is built.
const p = (t: string) => `<p style="margin:0 0 16px;">${t}</p>`
const btn = (label: string, utm: string) =>
  `<p style="margin:0 0 20px;"><a href="https://www.thesupportlife.com/?utm_source=email&amp;utm_medium=email&amp;utm_campaign=${utm}" style="display:inline-block;padding:14px 26px;background:#0E9F6E;border-radius:8px;color:#ffffff;text-decoration:none;font-weight:bold;">${label}</a></p>`
const phone = '<a href="tel:+18722171852" style="color:#0E9F6E;">(872) 217-1852</a>'

export const TEMPLATES = [
  {
    key: 'email1',
    label: 'Email 1: 2027 costs',
    name: 'Open Enrollment, Email 1',
    subject: '{{first_name}}, your 2027 health plan may cost more. Check before it renews',
    preheader: "Open Enrollment runs until January 15. Here's what changed for 2027.",
    html: [
      p('Hi {{first_name}},'),
      p('Open Enrollment for 2027 health coverage is open now and runs until <strong>January 15, 2027</strong>. If you do nothing, your plan may simply renew, and this is a year where that could cost you.'),
      '<p style="margin:0 0 8px;"><strong>Three things that changed:</strong></p>',
      `<ul style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:8px;"><strong>Premiums are going up.</strong> KFF's review of 276 insurers found a median proposed increase of about 15% for 2027.</li>
<li style="margin-bottom:8px;"><strong>The extra tax credits ended.</strong> If your household income is above 400% of the poverty level, you may no longer qualify for help, so a small raise can cost you thousands a year.</li>
<li style="margin-bottom:8px;"><strong>A $0 premium isn't free care.</strong> Deductibles, copays and which doctors are covered matter as much as the monthly price.</li>
</ul>`,
      p("We can connect you with a licensed agent who will compare your 2027 options with you. It's free, and there's no obligation to enroll."),
      btn('Check my 2027 options', 'oe2027_email1'),
      p(`Prefer to talk? Call ${phone} or just reply to this email.`),
      p('Thanks,<br>The Support Life team'),
    ].join('\n'),
  },
  {
    key: 'email2',
    label: 'Email 2: Follow-up',
    name: 'Open Enrollment, Email 2 (follow-up)',
    subject: '{{first_name}}, want coverage from January 1? Enroll by December 15',
    preheader: 'A 15-minute call with a licensed agent. Free, no obligation.',
    html: [
      p('Hi {{first_name}},'),
      p('A quick follow-up on my last note. If you want new coverage to start on <strong>January 1</strong>, the Marketplace deadline is <strong>December 15</strong>. Open Enrollment closes completely on January 15.'),
      '<p style="margin:0 0 8px;">Before you renew, it\'s worth checking:</p>',
      `<ul style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:6px;">What your plan will cost each month in 2027</li>
<li style="margin-bottom:6px;">Your deductible and out-of-pocket maximum</li>
<li style="margin-bottom:6px;">Whether your doctors and prescriptions are still covered</li>
<li style="margin-bottom:6px;">Whether your income still qualifies you for savings</li>
</ul>`,
      p('A licensed agent can go through all of this with you in about 15 minutes. Free, and no obligation to enroll.'),
      btn('Get my free plan review', 'oe2027_email2'),
      p(`Or call ${phone}.`),
      p('Thanks,<br>The Support Life team'),
    ].join('\n'),
  },
]
