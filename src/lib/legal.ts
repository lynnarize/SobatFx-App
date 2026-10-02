import type { Lang } from "./i18n";

// Privacy policy and terms of use, one copy per language (Bahasa Indonesia is the default, like the rest of the UI).
// Privacy: when the code starts storing or sharing something new (see src/lib/users.ts, sync-store.ts, payments.ts,
// ai/providers.ts), update both copies and bump PRIVACY_UPDATED.
// Terms: keep them in step with the plans, limits and payment methods (tiers.ts, payments.ts) and bump TERMS_UPDATED.

export const PRIVACY_UPDATED = "2026-10-02";
export const TERMS_UPDATED = "2026-10-01";

export interface LegalSection {
  h: string;
  p?: string[];
  ul?: string[];
}

export interface LegalDoc {
  title: string;
  updatedLabel: string;
  intro: string[];
  sections: LegalSection[];
  contactH: string;
  contactWith: string;
  contactWithout: string;
}

const en: LegalDoc = {
  title: "Privacy Policy",
  updatedLabel: "Last updated",
  intro: [
    "SobatFX AI (“SobatFX”, “we”) is a web app with live forex, gold and Bitcoin charts, an AI advisor, a news calendar and a risk calculator. This policy explains what we collect, why, who it is shared with and what choices you have.",
    "SobatFX is an analysis and education tool. It does not execute real trades, and the demo trading feature uses virtual money only.",
  ],
  sections: [
    {
      h: "1. Sign in with Google",
      p: [
        "You sign in with your Google account. We request only the basic sign-in scopes (openid, email and profile). From Google we receive your email address, your name and your profile picture URL.",
        "We use them to create and recognise your account, show your name and picture in the app, and to attach your plan and saved data to the right account. We do not request access to your Gmail, Google Drive, Calendar, Contacts or any other Google service, and we never see your Google password.",
        "SobatFX's use of information received from Google is limited to providing and improving the features described here. We do not sell it, use it for advertising, or transfer it to others except as described in this policy.",
        "You can withdraw access at any time at myaccount.google.com/permissions.",
      ],
    },
    {
      h: "2. What we collect",
      ul: [
        "Account: email, name, profile picture URL, the date the account was created, and the expiry date of any paid plan.",
        "Synced data: chart drawings and your demo trade history, saved against your account so they follow you across devices.",
        "AI chat: the messages you send, the chart context (symbol, timeframe, recent candles, indicators) and any chart image or screenshot you attach are sent to our AI providers to produce a reply. Your conversations are kept as chat history in your own browser only. Each one is deleted automatically 7 days after its last message, and all of them when you sign out. You can also delete them yourself in the chat history or in Settings. We do not keep them in your account.",
        "Orders and payments: order id, plan, amount, status and timestamps, linked to your email. We never receive or store card numbers or e-wallet credentials; payments are processed by our payment provider.",
        "Bank transfer proof: if you pay by bank transfer and send a photo of the receipt through our Telegram bot, the photo and your Telegram chat id are used by us to confirm the payment.",
        "AI trade plans: when the AI draws a trade plan, we record the instrument, levels, market state and the AI's reply, then score it against later prices to measure accuracy. These records are not linked to your email or name.",
        "Technical data: your IP address is used for rate limiting and abuse prevention. The short-lived counters it feeds (per minute, per day) are not used to profile you.",
      ],
    },
    {
      h: "3. Cookies and browser storage",
      ul: [
        "Sign-in session cookie (set by NextAuth) keeps you signed in. It is strictly necessary.",
        "Language cookie (sfx_lang) remembers Bahasa Indonesia or English, and the theme cookie (sfx_theme) remembers dark, light or system mode.",
        "Local storage in your browser holds your watchlist, settings (such as currency), drawings, demo trades and your AI chat history (deleted automatically after 7 days). You can clear it from your browser settings.",
        "We do not use advertising or cross-site tracking cookies.",
      ],
    },
    {
      h: "4. Who we share data with",
      p: ["We use service providers that process data for us only to run SobatFX:"],
      ul: [
        "Google: sign-in.",
        "Hosting and bot protection: our hosting provider (Vercel), including its bot-detection service, which runs on costly requests such as AI chat, payments and sync.",
        "Database: Upstash Redis stores accounts, synced data, orders and counters.",
        "AI providers: your chat messages and context are sent to the model provider that serves your plan (an OpenAI-compatible provider for Free and Pro, Anthropic for Ultra). Do not put passwords, ID numbers or other sensitive data in the chat.",
        "Payments: Midtrans processes QRIS payments. Bank transfers are confirmed manually by our team through Telegram.",
        "Market data and news: requests for prices, candles and news are made by our servers to public data sources and do not include your personal data.",
        "Legal requirements: we may disclose your information, records and related system data to courts, regulators or law-enforcement authorities when the law requires it or when needed to protect rights, safety or the service. Where permitted, we will tell you first.",
      ],
    },
    {
      h: "5. How long we keep data",
      ul: [
        "Account and synced data: until you ask us to delete them.",
        "Orders: up to 90 days if unpaid and up to 1 year once paid, for accounting and support.",
        "Telegram payment-proof links: up to 30 days.",
        "AI trade plan records: up to 90 days.",
        "Rate-limit and usage counters: from seconds to a day.",
        "We may keep limited records longer when the law requires it.",
      ],
    },
    {
      h: "6. Your choices and rights",
      p: [
        "You may ask us to access, correct, export or delete your data, and to close your account. Deleting an account also removes your synced drawings and trade history. Some order records may be retained where we have a legal duty to.",
        "You can sign out at any time, which clears the AI chat history stored in your browser, and revoke Google access from your Google account.",
      ],
    },
    {
      h: "7. Security",
      p: [
        "Data is transmitted over HTTPS. Access to the database and to payment approvals is restricted to our team. No system is perfectly secure, so please keep your Google account protected.",
      ],
    },
    {
      h: "8. Children",
      p: ["SobatFX is not intended for people under 17, and we do not knowingly collect data from them."],
    },
    {
      h: "9. Changes to this policy",
      p: ["If we change this policy we will update the date at the top. For significant changes we will also notify you in the app."],
    },
  ],
  contactH: "10. Contact",
  contactWith: "For privacy questions or to exercise your rights, email",
  contactWithout: "For privacy questions or to exercise your rights, contact us through the support channel shown on our website.",
};

const id: LegalDoc = {
  title: "Kebijakan Privasi",
  updatedLabel: "Terakhir diperbarui",
  intro: [
    "SobatFX AI (“SobatFX”, “kami”) adalah aplikasi web dengan chart forex, emas dan Bitcoin secara live, penasihat AI, kalender berita, dan kalkulator risiko. Kebijakan ini menjelaskan data apa yang kami kumpulkan, untuk apa, dengan siapa dibagikan, dan pilihan yang Anda miliki.",
    "SobatFX adalah alat analisis dan edukasi. Kami tidak mengeksekusi transaksi sungguhan, dan fitur demo trading hanya memakai uang virtual.",
  ],
  sections: [
    {
      h: "1. Masuk dengan Google",
      p: [
        "Anda masuk dengan akun Google. Kami hanya meminta izin dasar untuk masuk (openid, email, dan profil). Dari Google kami menerima alamat email, nama, dan URL foto profil Anda.",
        "Data ini kami gunakan untuk membuat dan mengenali akun Anda, menampilkan nama dan foto di aplikasi, serta mengaitkan paket dan data tersimpan ke akun yang tepat. Kami tidak meminta akses ke Gmail, Google Drive, Kalender, Kontak, atau layanan Google lain, dan kami tidak pernah melihat kata sandi Google Anda.",
        "Penggunaan informasi yang diterima dari Google oleh SobatFX terbatas pada penyediaan dan peningkatan fitur yang dijelaskan di sini. Kami tidak menjualnya, tidak memakainya untuk iklan, dan tidak memberikannya kepada pihak lain kecuali seperti yang dijelaskan dalam kebijakan ini.",
        "Anda dapat mencabut akses kapan saja di myaccount.google.com/permissions.",
      ],
    },
    {
      h: "2. Data yang kami kumpulkan",
      ul: [
        "Akun: email, nama, URL foto profil, tanggal akun dibuat, dan tanggal berakhirnya paket berbayar.",
        "Data sinkronisasi: gambar di chart dan riwayat demo trade, disimpan pada akun Anda agar ikut ke perangkat lain.",
        "Chat AI: pesan yang Anda kirim, konteks chart (simbol, timeframe, candle terbaru, indikator), dan gambar chart atau screenshot yang Anda lampirkan dikirim ke penyedia AI kami untuk menghasilkan jawaban. Percakapan disimpan sebagai riwayat chat hanya di browser Anda sendiri. Setiap percakapan dihapus otomatis 7 hari setelah pesan terakhirnya, dan semuanya dihapus saat Anda keluar. Anda juga dapat menghapusnya sendiri di riwayat chat atau di Pengaturan. Kami tidak menyimpannya di akun Anda.",
        "Pesanan dan pembayaran: id pesanan, paket, nominal, status, dan waktu, terkait dengan email Anda. Kami tidak pernah menerima atau menyimpan nomor kartu maupun kredensial dompet digital; pembayaran diproses oleh penyedia pembayaran kami.",
        "Bukti transfer bank: jika Anda membayar lewat transfer bank dan mengirim foto bukti melalui bot Telegram kami, foto dan id chat Telegram Anda kami gunakan untuk memastikan pembayaran.",
        "Rencana trade AI: saat AI menggambar rencana trade, kami mencatat instrumen, level, kondisi pasar, dan jawaban AI, lalu menilainya terhadap harga berikutnya untuk mengukur akurasi. Catatan ini tidak terhubung ke email atau nama Anda.",
        "Data teknis: alamat IP dipakai untuk pembatasan laju dan pencegahan penyalahgunaan. Penghitung jangka pendek yang dihasilkannya (per menit, per hari) tidak dipakai untuk membuat profil Anda.",
      ],
    },
    {
      h: "3. Cookie dan penyimpanan browser",
      ul: [
        "Cookie sesi login (diatur oleh NextAuth) menjaga Anda tetap masuk. Ini mutlak diperlukan.",
        "Cookie bahasa (sfx_lang) mengingat pilihan Bahasa Indonesia atau English, dan cookie tema (sfx_theme) mengingat mode gelap, terang, atau sistem.",
        "Penyimpanan lokal di browser berisi watchlist, pengaturan (seperti mata uang), gambar chart, demo trade, dan riwayat chat AI (dihapus otomatis setelah 7 hari). Anda dapat menghapusnya lewat pengaturan browser.",
        "Kami tidak memakai cookie iklan atau pelacakan lintas situs.",
      ],
    },
    {
      h: "4. Dengan siapa data dibagikan",
      p: ["Kami memakai penyedia layanan yang memproses data atas nama kami hanya untuk menjalankan SobatFX:"],
      ul: [
        "Google: proses masuk.",
        "Hosting dan perlindungan bot: penyedia hosting kami (Vercel), termasuk layanan deteksi bot yang berjalan pada permintaan berbiaya tinggi seperti chat AI, pembayaran, dan sinkronisasi.",
        "Basis data: Upstash Redis menyimpan akun, data sinkronisasi, pesanan, dan penghitung.",
        "Penyedia AI: pesan chat dan konteks Anda dikirim ke penyedia model yang melayani paket Anda (penyedia kompatibel OpenAI untuk Free dan Pro, Anthropic untuk Ultra). Jangan memasukkan kata sandi, nomor identitas, atau data sensitif lain ke chat.",
        "Pembayaran: Midtrans memproses pembayaran QRIS. Transfer bank dikonfirmasi manual oleh tim kami lewat Telegram.",
        "Data pasar dan berita: permintaan harga, candle, dan berita dilakukan oleh server kami ke sumber data publik dan tidak menyertakan data pribadi Anda.",
        "Kewajiban hukum: kami dapat mengungkapkan informasi, catatan, dan data sistem terkait Anda kepada pengadilan, regulator, atau aparat penegak hukum bila diwajibkan oleh hukum atau bila diperlukan untuk melindungi hak, keselamatan, atau layanan. Bila diizinkan, kami akan memberi tahu Anda lebih dulu.",
      ],
    },
    {
      h: "5. Berapa lama data disimpan",
      ul: [
        "Akun dan data sinkronisasi: sampai Anda meminta kami menghapusnya.",
        "Pesanan: hingga 90 hari bila belum dibayar dan hingga 1 tahun setelah dibayar, untuk pembukuan dan dukungan.",
        "Tautan bukti pembayaran Telegram: hingga 30 hari.",
        "Catatan rencana trade AI: hingga 90 hari.",
        "Penghitung batas dan pemakaian: dari beberapa detik hingga satu hari.",
        "Kami dapat menyimpan catatan terbatas lebih lama bila diwajibkan oleh hukum.",
      ],
    },
    {
      h: "6. Pilihan dan hak Anda",
      p: [
        "Anda dapat meminta akses, koreksi, ekspor, atau penghapusan data Anda, serta penutupan akun. Menghapus akun juga menghapus gambar chart dan riwayat trade yang tersinkron. Sebagian catatan pesanan dapat tetap disimpan bila kami berkewajiban secara hukum.",
        "Anda dapat keluar kapan saja, yang akan menghapus riwayat chat AI di browser Anda, dan mencabut akses Google dari akun Google Anda.",
      ],
    },
    {
      h: "7. Keamanan",
      p: [
        "Data dikirim melalui HTTPS. Akses ke basis data dan persetujuan pembayaran dibatasi untuk tim kami. Tidak ada sistem yang sepenuhnya aman, jadi mohon jaga keamanan akun Google Anda.",
      ],
    },
    {
      h: "8. Anak-anak",
      p: ["SobatFX tidak ditujukan untuk orang di bawah 17 tahun, dan kami tidak dengan sengaja mengumpulkan data mereka."],
    },
    {
      h: "9. Perubahan kebijakan",
      p: ["Jika kebijakan ini berubah, kami akan memperbarui tanggal di bagian atas. Untuk perubahan penting kami juga akan memberi tahu Anda di aplikasi."],
    },
  ],
  contactH: "10. Kontak",
  contactWith: "Untuk pertanyaan privasi atau menggunakan hak Anda, kirim email ke",
  contactWithout: "Untuk pertanyaan privasi atau menggunakan hak Anda, hubungi kami melalui kanal dukungan yang tertera di situs kami.",
};


const termsEn: LegalDoc = {
  title: "Terms and Conditions",
  updatedLabel: "Last updated",
  intro: [
    "These terms govern your use of SobatFX AI (“SobatFX”, “we”). By signing in or using the app you accept them. If you do not accept them, please do not use SobatFX.",
    "In short: SobatFX is an analysis and practice tool. It is not a financial advisor, it does not place real trades, and every decision and every loss is yours.",
  ],
  sections: [
    {
      h: "1. What SobatFX is, and is not",
      ul: [
        "SobatFX provides charts, market news, a risk calculator, an AI assistant and a demo trading simulator for learning and analysis.",
        "SobatFX is not a broker, exchange, bank or fund. We do not hold your money, execute trades or connect to your trading account.",
        "SobatFX is not a licensed investment or financial advisor. Nothing in the app, including AI replies, trade plans, levels, signals, scores, news summaries or calculator results, is investment, financial, legal or tax advice, or a recommendation or offer to buy or sell anything.",
      ],
    },
    {
      h: "2. Demo trading is a simulation",
      p: [
        "The trading journal and demo tickets use virtual money only. No real orders are placed. Demo fills use the live price without spread, commission, swap, slippage or rejected orders, so real trading results will differ, usually for the worse. Good demo results do not predict real results, and a virtual balance has no cash value.",
      ],
    },
    {
      h: "3. The AI assistant can be wrong",
      ul: [
        "AI replies are generated automatically. They may be inaccurate, incomplete, out of date or simply wrong, and they can state wrong things with confidence.",
        "Entry, stop-loss and take-profit levels, scenarios and any recorded “track record” of AI plans are illustrations for study. Past results do not guarantee future results.",
        "Do not rely on the AI as your only source. Check the chart, the news and your own plan before you act.",
      ],
    },
    {
      h: "4. Trading is risky, and the decision is yours",
      ul: [
        "Forex, gold, crypto, CFDs and leveraged products carry a high risk of loss, and you can lose all of the money you put in, sometimes more.",
        "You alone decide whether, when and how to trade, and you alone are responsible for the result. Use your own judgment, trade only with money you can afford to lose, and speak to a licensed financial advisor if you need advice for your situation.",
        "The risk calculator is simple arithmetic based on the numbers you enter and assumed pip values. Check it against your broker's real contract specifications before using it.",
      ],
    },
    {
      h: "5. Data and availability",
      p: [
        "Prices, candles, the economic calendar and news come from third-party sources and may be delayed, incomplete, revised or wrong. We do not guarantee that SobatFX will be available, uninterrupted or error-free, and features, limits or models may change at any time.",
      ],
    },
    {
      h: "6. No responsibility for losses",
      p: [
        "SobatFX is provided “as is” and “as available”, without warranties of any kind. To the fullest extent permitted by law, we and the people who run SobatFX are not liable for any loss or damage arising from your use of, or inability to use, the app. This includes trading or investment losses, lost profits, decisions made from AI output, data, news or calculators, errors, delays, outages, or loss of synced data.",
        "Where the law does not allow us to exclude liability, our total liability to you is limited to the amount you paid us for your plan in the 3 months before the claim.",
      ],
    },
    {
      h: "7. Your account and acceptable use",
      ul: [
        "You must be at least 17 and able to enter into a binding agreement. You sign in with your own Google account and are responsible for what happens under it. Do not share it.",
        "Do not misuse the service: no scraping or copying data in bulk, no bypassing limits or bot protection, no attacking or overloading the app, no reselling access, and no unlawful use.",
        "Do not put passwords, ID numbers or other sensitive personal data into the AI chat.",
      ],
    },
    {
      h: "8. Plans and payments",
      ul: [
        "SobatFX has a Free plan and paid Pro and Ultra plans with different daily limits and features, shown on the Plans page. Prices are in Indonesian rupiah.",
        "Paid plans are prepaid for a fixed period and do not renew automatically. Payment is by QRIS (processed by Midtrans) or by bank transfer, which our team confirms manually. The plan starts once payment is confirmed.",
        "Refunds are not guaranteed. If you think you were charged by mistake, contact us and we will review it, except where the law requires otherwise.",
      ],
    },
    {
      h: "9. Our content",
      p: ["SobatFX, its design, text and software belong to us or our licensors. You get a personal, non-transferable right to use the app. Third-party components are used under their own licenses."],
    },
    {
      h: "10. Suspension and ending",
      p: ["You can stop using SobatFX at any time. We may limit, suspend or end access if you break these terms or put the service or other users at risk. Sections that by their nature should survive, including the disclaimers and limits of liability, continue after that."],
    },
    {
      h: "11. Changes to these terms",
      p: ["We may update these terms. The date at the top shows the latest version. If you keep using SobatFX after a change, you accept the new terms. Our Privacy Policy explains how we handle your data."],
    },
    {
      h: "12. Legal requests and disclosure",
      p: ["If the law requires it, or a court, regulator or other competent authority lawfully orders it, we may make the SobatFX source code, systems, records and your account data available to that authority, including by sharing them through a code-hosting service such as GitHub. We will disclose only what is required, and will tell you first where we are allowed to."],
    },
    {
      h: "13. Governing law",
      p: ["These terms are governed by the laws of the Republic of Indonesia. Disputes are first handled in good faith between us, and otherwise by the competent courts in Indonesia."],
    },
  ],
  contactH: "14. Contact",
  contactWith: "For questions about these terms, email",
  contactWithout: "For questions about these terms, contact us through the support channel shown on our website.",
};

const termsId: LegalDoc = {
  title: "Syarat dan Ketentuan",
  updatedLabel: "Terakhir diperbarui",
  intro: [
    "Syarat ini mengatur penggunaan SobatFX AI (“SobatFX”, “kami”) oleh Anda. Dengan masuk atau memakai aplikasi, Anda menyetujuinya. Jika tidak setuju, mohon jangan memakai SobatFX.",
    "Singkatnya: SobatFX adalah alat analisis dan latihan. Bukan penasihat keuangan, tidak menempatkan order sungguhan, dan setiap keputusan serta kerugian sepenuhnya menjadi tanggung jawab Anda.",
  ],
  sections: [
    {
      h: "1. SobatFX itu apa, dan bukan apa",
      ul: [
        "SobatFX menyediakan chart, berita pasar, kalkulator risiko, asisten AI, dan simulator demo trading untuk belajar dan analisis.",
        "SobatFX bukan broker, bursa, bank, atau dana investasi. Kami tidak memegang uang Anda, tidak mengeksekusi transaksi, dan tidak terhubung ke akun trading Anda.",
        "SobatFX bukan penasihat investasi atau keuangan berlisensi. Tidak ada isi aplikasi, termasuk jawaban AI, rencana trade, level, sinyal, skor, ringkasan berita, atau hasil kalkulator, yang merupakan nasihat investasi, keuangan, hukum, atau pajak, maupun rekomendasi atau penawaran untuk membeli atau menjual apa pun.",
      ],
    },
    {
      h: "2. Demo trading hanyalah simulasi",
      p: [
        "Jurnal trading dan tiket demo hanya memakai uang virtual. Tidak ada order sungguhan yang ditempatkan. Eksekusi demo memakai harga live tanpa spread, komisi, swap, slippage, atau order yang ditolak, sehingga hasil trading sungguhan akan berbeda, biasanya lebih buruk. Hasil demo yang bagus tidak memprediksi hasil nyata, dan saldo virtual tidak memiliki nilai uang.",
      ],
    },
    {
      h: "3. Asisten AI bisa salah",
      ul: [
        "Jawaban AI dihasilkan secara otomatis. Jawaban bisa tidak akurat, tidak lengkap, usang, atau keliru, dan bisa menyampaikan hal yang salah dengan nada yakin.",
        "Level entry, stop-loss, take-profit, skenario, dan “rekam jejak” rencana AI yang tercatat adalah ilustrasi untuk belajar. Hasil masa lalu tidak menjamin hasil di masa depan.",
        "Jangan menjadikan AI sebagai satu-satunya sumber. Periksa chart, berita, dan rencana Anda sendiri sebelum bertindak.",
      ],
    },
    {
      h: "4. Trading berisiko, dan keputusan ada di tangan Anda",
      ul: [
        "Forex, emas, kripto, CFD, dan produk berleverage berisiko tinggi merugi, dan Anda dapat kehilangan seluruh uang yang ditanam, bahkan lebih.",
        "Hanya Anda yang memutuskan apakah, kapan, dan bagaimana bertransaksi, dan hanya Anda yang bertanggung jawab atas hasilnya. Gunakan penilaian Anda sendiri, bertransaksilah hanya dengan uang yang siap Anda relakan, dan bicaralah dengan penasihat keuangan berlisensi bila butuh saran untuk kondisi Anda.",
        "Kalkulator risiko adalah hitungan sederhana berdasarkan angka yang Anda masukkan dan asumsi nilai pip. Cocokkan dengan spesifikasi kontrak broker Anda sebelum memakainya.",
      ],
    },
    {
      h: "5. Data dan ketersediaan",
      p: [
        "Harga, candle, kalender ekonomi, dan berita berasal dari sumber pihak ketiga dan bisa tertunda, tidak lengkap, direvisi, atau salah. Kami tidak menjamin SobatFX selalu tersedia, tanpa gangguan, atau bebas kesalahan, dan fitur, batas, atau model dapat berubah kapan saja.",
      ],
    },
    {
      h: "6. Tidak bertanggung jawab atas kerugian",
      p: [
        "SobatFX disediakan “apa adanya” dan “sebagaimana tersedia”, tanpa jaminan apa pun. Sejauh diizinkan hukum, kami dan pihak yang menjalankan SobatFX tidak bertanggung jawab atas kerugian atau kerusakan apa pun yang timbul dari penggunaan atau ketidakmampuan memakai aplikasi. Ini termasuk kerugian trading atau investasi, hilangnya keuntungan, keputusan yang diambil dari output AI, data, berita, atau kalkulator, kesalahan, keterlambatan, gangguan layanan, atau hilangnya data sinkronisasi.",
        "Bila hukum tidak mengizinkan kami mengecualikan tanggung jawab, total tanggung jawab kami kepada Anda dibatasi sebesar jumlah yang Anda bayarkan untuk paket Anda dalam 3 bulan sebelum klaim.",
      ],
    },
    {
      h: "7. Akun dan penggunaan yang wajar",
      ul: [
        "Anda harus berusia minimal 17 tahun dan cakap membuat perjanjian yang mengikat. Anda masuk dengan akun Google Anda sendiri dan bertanggung jawab atas semua yang terjadi di akun itu. Jangan dibagikan.",
        "Jangan menyalahgunakan layanan: tidak boleh scraping atau menyalin data secara massal, menghindari batas atau perlindungan bot, menyerang atau membebani aplikasi, menjual kembali akses, maupun penggunaan yang melanggar hukum.",
        "Jangan memasukkan kata sandi, nomor identitas, atau data pribadi sensitif lain ke chat AI.",
      ],
    },
    {
      h: "8. Paket dan pembayaran",
      ul: [
        "SobatFX memiliki paket Free serta paket berbayar Pro dan Ultra dengan batas harian dan fitur berbeda, seperti tertera di halaman Paket. Harga dalam rupiah.",
        "Paket berbayar dibayar di muka untuk periode tertentu dan tidak diperpanjang otomatis. Pembayaran lewat QRIS (diproses Midtrans) atau transfer bank yang dikonfirmasi manual oleh tim kami. Paket aktif setelah pembayaran dikonfirmasi.",
        "Pengembalian dana tidak dijamin. Jika Anda merasa tertagih karena kesalahan, hubungi kami dan kami akan meninjaunya, kecuali hukum menentukan lain.",
      ],
    },
    {
      h: "9. Konten kami",
      p: ["SobatFX, desain, teks, dan perangkat lunaknya adalah milik kami atau pemberi lisensi kami. Anda mendapat hak pribadi yang tidak dapat dialihkan untuk memakai aplikasi. Komponen pihak ketiga dipakai sesuai lisensinya masing-masing."],
    },
    {
      h: "10. Penangguhan dan pengakhiran",
      p: ["Anda dapat berhenti memakai SobatFX kapan saja. Kami dapat membatasi, menangguhkan, atau mengakhiri akses bila Anda melanggar syarat ini atau membahayakan layanan atau pengguna lain. Bagian yang menurut sifatnya tetap berlaku, termasuk penafian dan batasan tanggung jawab, tetap berlaku setelahnya."],
    },
    {
      h: "11. Perubahan syarat",
      p: ["Kami dapat memperbarui syarat ini. Tanggal di bagian atas menunjukkan versi terbaru. Jika Anda tetap memakai SobatFX setelah perubahan, Anda menerima syarat yang baru. Kebijakan Privasi kami menjelaskan cara kami menangani data Anda."],
    },
    {
      h: "12. Permintaan hukum dan pengungkapan",
      p: ["Jika diwajibkan oleh hukum, atau diperintahkan secara sah oleh pengadilan, regulator, atau otoritas berwenang lainnya, kami dapat menyerahkan kode sumber, sistem, catatan, dan data akun Anda kepada otoritas tersebut, termasuk melalui layanan hosting kode seperti GitHub. Kami hanya akan mengungkapkan yang diperlukan, dan akan memberi tahu Anda lebih dulu bila diizinkan."],
    },
    {
      h: "13. Hukum yang berlaku",
      p: ["Syarat ini tunduk pada hukum Republik Indonesia. Sengketa pertama-tama diselesaikan secara itikad baik antara kami dan Anda, dan bila tidak berhasil, melalui pengadilan yang berwenang di Indonesia."],
    },
  ],
  contactH: "14. Kontak",
  contactWith: "Untuk pertanyaan tentang syarat ini, kirim email ke",
  contactWithout: "Untuk pertanyaan tentang syarat ini, hubungi kami melalui kanal dukungan yang tertera di situs kami.",
};

export const PRIVACY: Record<Lang, LegalDoc> = { en, id };
export const TERMS: Record<Lang, LegalDoc> = { en: termsEn, id: termsId };
