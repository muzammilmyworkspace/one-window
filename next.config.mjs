/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  serverExternalPackages: ['@libsql/client', 'libsql', 'nodemailer', 'imapflow', 'mailparser', 'exceljs'],
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ] }]
  },
}
