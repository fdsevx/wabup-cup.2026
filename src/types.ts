export type TournamentCategory = 'SD' | 'SMP' | 'SMA' | 'INSTANSI' | 'UMUM' | 'DESA' | string;

export type RegistrationStatus = 'PENDING_PAYMENT' | 'APPROVED' | 'REJECTED';

export type PaymentStatus = 'UNPAID' | 'VERIFYING' | 'PAID';

export interface UploadedDoc {
  name: string;
  size: string; // e.g. "1.2 MB"
  uploadDate: string;
  type: string; // "application/pdf"
  previewUrl?: string;
  fileData?: string; // base64 or blob url
  url?: string; // Cloud storage URL (e.g. Vercel Blob CDN)
}

export interface RegistrationDocuments {
  suratKeterangan?: UploadedDoc; // Sekolah / Instansi / Desa / Rekomendasi
  suratPernyataan?: UploadedDoc; // Bermaterai
  formulirPemain?: UploadedDoc; // Daftar Pemain & Official
  aktaKelahiran?: UploadedDoc; // Max 2014 (Khusus SD)
  raportKartuPelajar?: UploadedDoc; // Raport / Kartu Pelajar
  ktpGabungan?: UploadedDoc; // File KTP Pemain & Official digabung 1 PDF (Khusus Desa/Kelurahan & Umum)
  bpjsKetenagakerjaan?: UploadedDoc; // File BPJS Ketenagakerjaan digabung 1 PDF (Khusus Instansi)
  buktiPembayaran?: UploadedDoc; // Bukti Transfer
  logoTim?: UploadedDoc; // Logo Tim / Klub
}

export interface RegistrationItem {
  id: string;
  regCode: string; // e.g. WABUP-SD-001
  category: TournamentCategory;
  teamName: string;
  teamLogo?: string; // Base64 data or Image URL
  institutionName: string; // Nama Sekolah / Instansi / Desa
  coachName: string;
  coachPhone: string; // WhatsApp Aktif
  coachEmail: string;
  playerCount: number;
  officialCount: number;
  registrationDate: string;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  paymentAmount: number;
  rejectionReason?: string;
  adminNotes?: string;
  documents: RegistrationDocuments;
  lastUpdated: string;
}

export interface CategoryPrizeItem {
  rank: string; // Juara 1, Juara 2, Juara 3 Bersama / Juara 3, Top Scorer, Pemain Terbaik, Kiper Terbaik, Best Supporter
  prizeMoney: number;
  trophyText?: string;
  trophy?: string;
}

export interface CategoryDetail {
  id: TournamentCategory;
  name: string;
  badgeTitle?: string;
  ageRestriction: string;
  maxTeams: number;
  registeredTeamsCount: number;
  registrationFee: number;
  totalPrize: number;
  description?: string;
  prizes: CategoryPrizeItem[];
  rules: string[];
}

export type MatchStatus = 'UPCOMING' | 'LIVE' | 'FINISHED';

export interface MatchEvent {
  id: string;
  minute: string;
  team: 'A' | 'B';
  type: 'GOAL' | 'YELLOW' | 'RED' | 'OWN_GOAL';
  playerName: string;
}

export interface MatchItem {
  id: string;
  matchNumber: number;
  category: TournamentCategory;
  round: string; // "Babak Penyisihan", "Babak 16 Besar", "Perempat Final", "Semifinal", "Perebutan Juara 3", "Final"
  roundIndex: number; // 1 to 5
  group?: string; // Group A, B, C, D if applicable
  teamA: {
    id?: string;
    name: string;
    score?: number;
    penalties?: number;
    logo?: string;
    institution?: string;
  };
  teamB: {
    id?: string;
    name: string;
    score?: number;
    penalties?: number;
    logo?: string;
    institution?: string;
  };
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  pitch: string; // "Lapangan 1 - Utama", "Lapangan 2 - Futsal A", "Lapangan 3 - Futsal B"
  status: MatchStatus;
  liveMinute?: string; // e.g. "34'" or "HT" or "FT"
  events?: MatchEvent[];
  winnerId?: 'A' | 'B' | 'DRAW';
  nextMatchId?: string;
  nextMatchSlot?: 'A' | 'B';
}

export interface BracketMatch {
  id: string;
  roundName: string;
  matchNumber: number;
  teamA: { name: string; score?: number; isWinner?: boolean };
  teamB: { name: string; score?: number; isWinner?: boolean };
  date: string;
  time: string;
  pitch: string;
  status: MatchStatus;
  nextMatchId?: string;
}

export type SponsorTier = 'PLATINUM' | 'GOLD' | 'SILVER' | 'OFFICIAL_PARTNER';

export interface SponsorItem {
  id: string;
  name: string;
  tier: SponsorTier;
  logoText: string;
  logoUrl?: string;
  websiteUrl?: string;
  description?: string;
}

export type AdminRole = 'SUPERADMIN' | 'PANITIA_INTI' | 'PANITIA_UMUM' | 'PANITIA' | 'WASIT' | 'OPERATOR';

export interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  role: AdminRole;
  email: string;
  phone: string;
  createdAt: string;
  avatarColor: string;
  password?: string;
}

export interface DownloadableDoc {
  id: string;
  title: string;
  category: string; // e.g. "Formulir Pendaftaran", "Template Surat", "Regulasi & Juknis", "Jadwal & Bagan", "Lainnya"
  description?: string;
  fileName: string;
  fileSize?: string;
  fileUrl: string;
  fileType: 'PDF' | 'DOCX' | 'XLSX' | 'ZIP' | 'IMAGE' | 'OTHER';
  isPrimary?: boolean;
  updatedAt: string;
}

export interface CommitteeContact {
  id: string;
  name: string;
  phone: string; // e.g. "6281234567890" or "081234567890"
  role: string; // e.g. "Sekretariat & Pendaftaran", "Technical Delegate", "Sponsorship & Media"
  isPrimary: boolean;
}

export interface CommitteeEmail {
  id: string;
  title: string; // e.g. "Email Resmi Panitia", "Sekretariat Pendaftaran"
  email: string;
  isPrimary: boolean;
}

export interface CommitteeBankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isPrimary: boolean;
  branchName?: string;
  instructions?: string;
  qrisImageUrl?: string;
}

export interface TournamentConfig {
  name: string;
  edition: string;
  tagline: string;
  wabupLogoUrl?: string;
  panitiaLogoUrl?: string;
  registrationDeadline: string;
  tournamentStartDate: string;
  tournamentEndDate: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  googleMapsEmbedUrl: string;
  totalPrizePool: number;
  adminContactPhone: string;
  adminContactEmail: string;
  bankAccount?: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
  formulirTemplateUrl?: string;
  suratPernyataanTemplateUrl?: string;
  regulasiPdfUrl?: string;
  downloadableDocs?: DownloadableDoc[];
  committeeContacts?: CommitteeContact[];
  committeeEmails?: CommitteeEmail[];
  bankAccounts?: CommitteeBankAccount[];
  sectionsVisibility?: PageSectionsVisibility;
  sectionsBackgrounds?: SectionsBackgrounds;
  committeeChairmanName?: string;
  committeeChairmanTitle?: string;
  committeeChairmanSignature?: string;
  tournamentStampImage?: string;
  // Mode Tombol Pendaftaran & Tombol Samaran (Link Kustom)
  registrationButtonMode?: RegistrationButtonMode;
  registrationCustomLink?: string;
  registrationCustomButtonText?: string;
  registrationCustomLinkNewTab?: boolean;
  // Pengaman Tombol Manajemen Grup & Jadwal (Acak, Perbarui Jadwal, Kosongkan)
  lockGroupStageActions?: boolean;
}

export type RegistrationButtonMode = 'INTERNAL_FORM' | 'CUSTOM_LINK' | 'HIDDEN';

export interface PageSectionsVisibility {
  hero: boolean;
  liveScore: boolean;
  categories: boolean;
  bracket: boolean;
  venue: boolean;
  sponsors: boolean;
  klasemenLanding?: boolean;
  standaloneKlasemen?: boolean;
  // Modul Pertandingan di Landing Page
  landingKlasemen?: boolean;
  landingSchedule?: boolean;
  landingBracket?: boolean;
  landingTopScorer?: boolean;
  // Tab Navigasi di Halaman Standalone
  standaloneTabKlasemen?: boolean;
  standaloneTabJadwal?: boolean;
  standaloneTabKnockout?: boolean;
  standaloneTabTopScore?: boolean;
  // Tombol Pendaftaran Tim di Landing Page / Navbar / Hero
  registrationButton?: boolean;
}

export interface PlayerItem {
  id: string;
  teamId?: string;
  teamName: string;
  category: TournamentCategory;
  name: string;
  jerseyNumber: number;
  position: 'Kiper' | 'Anchor' | 'Flank' | 'Pivot' | string;
  goals: number;
  yellowCards: number;
  redCards: number;
  photoUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TeamStandingItem {
  position: number;
  teamName: string;
  institution?: string;
  teamLogo?: string;
  groupName: string; // e.g. "Grup A", "Grup B"
  category: TournamentCategory;
  played: number; // M (Main)
  won: number;    // W (Menang)
  drawn: number;  // S (Seri)
  lost: number;   // K (Kalah)
  goalsFor: number; // GM (Gol Masuk)
  goalsAgainst: number; // GK (Gol Kemasukan)
  goalDifference: number; // SG (Selisih Gol = GM - GK)
  points: number; // Poin = (W * 3) + (S * 1)
}

export interface GroupTeamItem {
  id?: string;
  name: string;
  institution?: string;
  logo?: string;
  seed?: number;
}

export interface GroupStageItem {
  id: string;
  category: TournamentCategory;
  groupName: string; // "Grup A", "Grup B", etc.
  teams: GroupTeamItem[];
}

export type SectionKey =
  | 'hero'
  | 'liveScore'
  | 'categories'
  | 'bracket'
  | 'venue'
  | 'sponsors'
  | 'footer';

export interface SectionBackgroundConfig {
  mode: 'DEFAULT' | 'COLOR' | 'IMAGE';
  bgColor?: string;
  desktopImage?: string;
  mobileImage?: string;
  overlayColor?: string;
  overlayOpacity?: number; // 0 to 100
  overlayBlur?: boolean;
  textColorMode?: 'AUTO' | 'LIGHT' | 'DARK';
}

export type SectionsBackgrounds = Partial<Record<SectionKey, SectionBackgroundConfig>>;
