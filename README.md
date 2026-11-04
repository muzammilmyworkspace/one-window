# Outreach

The Support Life ka email campaign tool. Contacts, campaigns, Brevo + Resend se sending, aur replies ka dashboard ek hi jagah.

Replies seedha `info@` (Hostinger) par aati hain. Tool us inbox ko sirf parhta hai (read-only), wahan kuch badalta nahi.
Sirf un logon ki emails dashboard mein aati hain jinko tool ne email bheji ho. Baqi inbox private rehta hai.

## Localhost par chalana

`Start Outreach.bat` par double-click. Browser mein http://localhost:3200 khulega.
Password `.env.local` mein `ADMIN_PASSWORD` hai. Chahein to badal dein, phir tool dobara start karein.

## Connections (`.env.local`)

| Field | Kahan se milega |
|---|---|
| `BREVO_SMTP_LOGIN` | Brevo > Settings > SMTP & API > SMTP tab > Login |
| `BREVO_SMTP_KEY` | Isi jagah, SMTP key |
| `RESEND_API_KEY` | Resend > API Keys |
| `IMAP_PASS` | info@ ka Hostinger password |

`.env.local` kisi ko na bhejein. Git mein bhi nahi jati.

Domain ke DNS records (Brevo aur Resend dono ke) Hostinger > Domains > DNS mein daalein. Settings page par dikhta hai ke kaun se mil gaye.

## Practice aur live

- `SEND_MODE=dry`: practice, kuch nahi jata. Yeh default hai.
- `SEND_MODE=live`: asli emails. Test email localhost se ja sakti hai, lekin poori campaign sirf https (Vercel) se start hoti hai, kyunke unsubscribe link public hona zaroori hai.

## Vercel par live karna

1. **Database:** turso.tech par free account, ek database banayein, URL aur token lein. Vercel par `local.db` nahi chalti.
2. **GitHub:** is folder ko private repo mein push karein, Vercel mein import karein.
3. **Environment Variables:** `.env.example` ki sab cheezein Vercel mein daalein (secrets ko Sensitive mark karein):
   - `SEND_MODE=dry` pehle
   - `APP_URL=https://aapka-address`
   - `DATABASE_URL` aur `DATABASE_AUTH_TOKEN` Turso wale
4. **Contacts:** Contacts page se Excel dobara import karein.
5. **Scheduler:** Settings > Live setup links se scheduler link copy karein, cron-job.org par har 1 minute ke liye lagayein. Is se tab band hone par bhi sending chalti hai. Vercel ka free cron din mein sirf ek baar chalta hai, is liye yeh zaroori hai.
6. **Webhooks:** Settings se Brevo aur Resend ke links un ki webhook settings mein daalein. Is se Delivered aur Opened ke numbers aate hain.
7. Test email check karein, phir `SEND_MODE=live` karke redeploy karein.

## Numbers ka matlab

- **Sent / Replies / Bounced / Unsubscribed:** tool khud ginta hai, webhooks ke baghair bhi.
- **Delivered / Opened:** sirf webhooks se aate hain. Opened andaza hota hai, Apple Mail wagairah khud bhi open kar dete hain.
- **Daily limit:** har sender ki rolling 24 ghante ki limit. Brevo 280, Resend 95, yani ~375 emails roz. 1,825 contacts ~5 din.

Kisi sender se 3 errors lagataar aayen to woh 1 ghanta rest karta hai aur doosra chalta rehta hai.
