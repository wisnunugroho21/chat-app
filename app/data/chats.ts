import type { Chat } from '~/types/whatsapp'

/**
 * The list is a projection of this array — no chat detail lives in the
 * markup. Point CHATS at a fetch and the UI follows.
 */
export const CHATS: Chat[] = [
  {
    name: 'Dispatch Armada',
    av: 'a1',
    initials: 'DA',
    group: true,
    sub: 'You, Pak Budi, Rina, Fajar, +6',
    time: '14:12',
    preview: 'Pak Budi: ETA Cikampek 14.30',
    icon: '',
    unread: 3,
    fav: true,
  },
  {
    name: 'Rina Prasetyo',
    av: 'a3',
    sub: 'online',
    time: '13:48',
    preview: 'Laporan stamina driver sudah aku kirim',
    icon: '',
    unread: 0,
    fav: true,
  },
  {
    name: 'Andre — QA',
    av: 'a5',
    sub: 'last seen today at 12:24',
    time: '12:20',
    preview: 'Deploy staging jam 5 ya',
    icon: 'done_all',
    status: 'read',
    unread: 0,
  },
  {
    name: 'Ibu',
    av: 'a4',
    sub: 'last seen today at 11:06',
    time: '11:05',
    preview: 'Sudah makan siang belum?',
    icon: '',
    unread: 1,
  },
  {
    name: 'Warung Bu Sri',
    av: 'a6',
    initials: 'WS',
    sub: 'last seen today at 09:31',
    time: '09:30',
    preview: '0:12',
    icon: 'call',
    unread: 0,
  },
  {
    name: 'Info Kost Melati',
    av: 'a4',
    initials: 'KI',
    group: true,
    sub: 'You, Pak Herman, Dewi, +12',
    time: 'Friday',
    preview: 'Photo',
    icon: 'photo',
    unread: 0,
  },
]
