import type { Message } from '~/types/whatsapp'

/** Seed bubbles. Ids are handed out by the store when the threads are built. */
export type SeedMessage = Omit<Message, 'id'>

export const MESSAGES: Record<string, SeedMessage[]> = {
  'Dispatch Armada': [
    { kind: 'day', label: 'Today' },
    {
      from: 'Pak Budi',
      text: 'Unit B 9021 FF selesai loading di gudang Marunda. Segel sudah dipasang.',
      time: '14:02',
    },
    {
      from: 'Pak Budi',
      text: 'Surat jalan sudah discan, tolong dicek di sistem ya.',
      time: '14:03',
    },
    {
      out: true,
      text: 'Sudah masuk, Pak. Statusnya otomatis pindah ke **IN TRANSIT** begitu surat jalan tervalidasi.',
      time: '14:05',
      status: 'read',
    },
    {
      from: 'Rina Prasetyo',
      quote: {
        author: 'You',
        text: 'Statusnya otomatis pindah ke IN TRANSIT…',
      },
      text: 'Drivernya siapa? Perlu aku update di dashboard stamina.',
      time: '14:08',
    },
    {
      out: true,
      text: 'Pak Slamet. Istirahat terakhir 11:40, jadi jam kerjanya masih aman sampai sore.',
      time: '14:09',
      status: 'read',
    },
    {
      from: 'Fajar',
      text: 'Noted. Aku pantau dari panel dispatch.',
      time: '14:11',
    },
    {
      from: 'Pak Budi',
      text: 'Siap. ETA Cikampek 14:30, nanti saya kabari lagi kalau sudah lewat tol.',
      time: '14:12',
    },
    { kind: 'typing', from: 'Rina Prasetyo' },
  ],
  'Rina Prasetyo': [
    { kind: 'day', label: 'Today' },
    {
      out: true,
      text: 'Rin, rekap stamina driver minggu ini sudah ada?',
      time: '13:41',
      status: 'read',
    },
    { text: 'Laporan stamina driver sudah aku kirim', time: '13:48' },
  ],
  'Andre — QA': [
    { kind: 'day', label: 'Today' },
    { text: 'Regression build TMS sudah hijau semua.', time: '12:14' },
    {
      out: true,
      text: 'Deploy staging jam 5 ya',
      time: '12:20',
      status: 'delivered',
    },
  ],
  'Ibu': [
    { kind: 'day', label: 'Today' },
    { text: 'Sudah makan siang belum?', time: '11:05' },
  ],
  'Warung Bu Sri': [
    { kind: 'day', label: 'Today' },
    { kind: 'call', text: 'Voice call · 0:12', icon: 'call', time: '09:30' },
  ],
  'Info Kost Melati': [
    { kind: 'day', label: 'Friday' },
    {
      from: 'Pak Herman',
      photo: true,
      text: 'Kamar 3B kosong mulai minggu depan, monggo kalau ada yang cari.',
      time: '20:14',
    },
  ],
}
